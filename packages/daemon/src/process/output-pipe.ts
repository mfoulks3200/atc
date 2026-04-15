/**
 * Capture stdout/stderr from agent subprocesses, ring-buffer it, append each
 * line to the craft's black box as an `AgentOutput` entry, and broadcast it
 * on the per-craft WebSocket channel.
 *
 * The pipe is designed to be cheap and bounded: a chatty agent cannot blow up
 * daemon memory because both the in-memory ring buffer and the persisted
 * black box receive lines through the same code path. The pipe truncates each
 * line at {@link OutputPipeOptions.maxLineLength} characters and keeps only the
 * last {@link OutputPipeOptions.bufferSize} lines in memory.
 *
 * @see RULE-BBOX-1 — the black box persists for the craft's lifecycle.
 * @see RULE-BBOX-2 — entries are append-only (we use the standard appender).
 */

import type { Readable } from "node:stream";

/**
 * Options used to build an {@link AgentOutputPipe}.
 */
export interface OutputPipeOptions {
  /** Maximum number of lines kept in the in-memory ring buffer. */
  bufferSize: number;
  /** Hard cap on a single captured line. Overflow is truncated with a marker. */
  maxLineLength?: number;
}

/**
 * A captured agent output line, tagged by source stream.
 */
export interface CapturedLine {
  /** Which subprocess stream the line came from. */
  stream: "stdout" | "stderr";
  /** Line text, with trailing newline removed and overflow truncated. */
  text: string;
  /** ISO-8601 timestamp when the line was captured. */
  timestamp: string;
}

/**
 * Receiver for captured lines. Implementors typically append to the black box
 * and broadcast on the craft channel — see {@link AgentOutputPipe} construction
 * in `agent-manager.ts` for the production wiring.
 */
export type LineSink = (line: CapturedLine) => void;

const DEFAULT_MAX_LINE_LENGTH = 4096;
const TRUNCATION_MARKER = "…[truncated]";

/**
 * Captures lines from one or more readable streams, splitting on `\n`,
 * truncating overlong lines, and forwarding each completed line to a sink.
 *
 * Holds an in-memory ring buffer of the most recent N lines so a UI client
 * connecting mid-flight can replay recent context without re-reading the full
 * black box.
 *
 * The pipe owns no streams it didn't create — callers attach via
 * {@link attach} and detach via {@link close} (typically on subprocess exit).
 */
export class AgentOutputPipe {
  private readonly _bufferSize: number;
  private readonly _maxLineLength: number;
  private readonly _sink: LineSink;
  private readonly _ring: CapturedLine[] = [];
  private readonly _partial: Map<"stdout" | "stderr", string> = new Map();
  private readonly _detachers: Array<() => void> = [];
  private _closed = false;

  /**
   * @param sink - Callback invoked once per captured line.
   * @param options - Ring buffer size and per-line cap.
   */
  constructor(sink: LineSink, options: OutputPipeOptions) {
    this._sink = sink;
    this._bufferSize = Math.max(1, Math.floor(options.bufferSize));
    this._maxLineLength = Math.max(1, Math.floor(options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH));
  }

  /**
   * Attach a readable stream to the pipe, tagging its output as either stdout
   * or stderr. Subsequent `data` chunks are split on newlines and forwarded
   * through the sink. The trailing partial line (if any) is emitted on
   * `end`/`close`.
   *
   * Multiple streams may be attached. Each is independently buffered.
   */
  attach(stream: Readable, kind: "stdout" | "stderr"): void {
    if (this._closed) {
      return;
    }

    const onData = (chunk: Buffer | string): void => {
      this._ingest(kind, typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    };
    const onEnd = (): void => {
      this._flushPartial(kind);
    };

    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("close", onEnd);

    this._detachers.push(() => {
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("close", onEnd);
    });
  }

  /**
   * Drain any buffered partial lines and stop accepting input. Idempotent.
   *
   * Called by the agent manager when the subprocess exits.
   */
  close(): void {
    if (this._closed) {
      return;
    }
    this._closed = true;
    this._flushPartial("stdout");
    this._flushPartial("stderr");
    for (const detach of this._detachers) {
      detach();
    }
    this._detachers.length = 0;
  }

  /**
   * Snapshot of the lines currently held in the ring buffer, oldest first.
   * Used by tests and by the future activity view's initial replay.
   */
  snapshot(): CapturedLine[] {
    return [...this._ring];
  }

  /**
   * Number of lines currently buffered. Always `<= bufferSize`.
   */
  get size(): number {
    return this._ring.length;
  }

  private _ingest(kind: "stdout" | "stderr", chunk: string): void {
    if (this._closed) {
      return;
    }
    const carry = this._partial.get(kind) ?? "";
    const combined = carry + chunk;
    const parts = combined.split("\n");
    // The last segment is the new partial (no trailing newline yet).
    const tail = parts.pop() ?? "";
    this._partial.set(kind, tail);
    for (const part of parts) {
      this._emit(kind, part.replace(/\r$/, ""));
    }
  }

  private _flushPartial(kind: "stdout" | "stderr"): void {
    const carry = this._partial.get(kind);
    if (carry !== undefined && carry.length > 0) {
      this._emit(kind, carry.replace(/\r$/, ""));
    }
    this._partial.set(kind, "");
  }

  private _emit(kind: "stdout" | "stderr", rawText: string): void {
    const text =
      rawText.length > this._maxLineLength
        ? rawText.slice(0, this._maxLineLength) + TRUNCATION_MARKER
        : rawText;
    const line: CapturedLine = {
      stream: kind,
      text,
      timestamp: new Date().toISOString(),
    };
    this._ring.push(line);
    if (this._ring.length > this._bufferSize) {
      this._ring.shift();
    }
    try {
      this._sink(line);
    } catch {
      // Sinks must not crash the pipe; capture failures are silently swallowed
      // because a misbehaving sink should never take down the agent runtime.
    }
  }
}
