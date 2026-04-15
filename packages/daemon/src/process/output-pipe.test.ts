import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { AgentOutputPipe, type CapturedLine } from "./output-pipe.js";

function makeStream(): Readable {
  return new Readable({ read() {} });
}

describe("AgentOutputPipe", () => {
  it("captures complete lines from stdout and forwards them to the sink", async () => {
    const lines: CapturedLine[] = [];
    const pipe = new AgentOutputPipe((l) => lines.push(l), { bufferSize: 100 });
    const stream = makeStream();
    pipe.attach(stream, "stdout");

    stream.push("hello\nworld\n");
    await new Promise((r) => setImmediate(r));

    expect(lines.map((l) => l.text)).toEqual(["hello", "world"]);
    expect(lines.every((l) => l.stream === "stdout")).toBe(true);
  });

  it("buffers partial lines across chunks", async () => {
    const lines: CapturedLine[] = [];
    const pipe = new AgentOutputPipe((l) => lines.push(l), { bufferSize: 10 });
    const stream = makeStream();
    pipe.attach(stream, "stdout");

    stream.push("hel");
    stream.push("lo\nwor");
    stream.push("ld\n");
    await new Promise((r) => setImmediate(r));

    expect(lines.map((l) => l.text)).toEqual(["hello", "world"]);
  });

  it("strips trailing carriage returns from CRLF input", async () => {
    const lines: CapturedLine[] = [];
    const pipe = new AgentOutputPipe((l) => lines.push(l), { bufferSize: 10 });
    const stream = makeStream();
    pipe.attach(stream, "stdout");

    stream.push("a\r\nb\r\n");
    await new Promise((r) => setImmediate(r));

    expect(lines.map((l) => l.text)).toEqual(["a", "b"]);
  });

  it("tags stderr lines distinctly from stdout", async () => {
    const lines: CapturedLine[] = [];
    const pipe = new AgentOutputPipe((l) => lines.push(l), { bufferSize: 10 });
    const out = makeStream();
    const err = makeStream();
    pipe.attach(out, "stdout");
    pipe.attach(err, "stderr");

    out.push("info\n");
    err.push("oops\n");
    await new Promise((r) => setImmediate(r));

    expect(lines).toEqual([
      expect.objectContaining({ stream: "stdout", text: "info" }),
      expect.objectContaining({ stream: "stderr", text: "oops" }),
    ]);
  });

  it("ring-buffers at the configured cap so chatty agents cannot grow memory unbounded", async () => {
    const lines: CapturedLine[] = [];
    const pipe = new AgentOutputPipe((l) => lines.push(l), { bufferSize: 5 });
    const stream = makeStream();
    pipe.attach(stream, "stdout");

    for (let i = 0; i < 1000; i++) {
      stream.push(`line-${i}\n`);
    }
    await new Promise((r) => setImmediate(r));

    expect(lines).toHaveLength(1000);
    const snapshot = pipe.snapshot();
    expect(snapshot).toHaveLength(5);
    expect(pipe.size).toBe(5);
    expect(snapshot.map((l) => l.text)).toEqual([
      "line-995",
      "line-996",
      "line-997",
      "line-998",
      "line-999",
    ]);
  });

  it("truncates lines longer than maxLineLength", async () => {
    const lines: CapturedLine[] = [];
    const pipe = new AgentOutputPipe((l) => lines.push(l), {
      bufferSize: 10,
      maxLineLength: 5,
    });
    const stream = makeStream();
    pipe.attach(stream, "stdout");

    stream.push("abcdefghijklm\n");
    await new Promise((r) => setImmediate(r));

    expect(lines[0].text).toBe("abcde…[truncated]");
  });

  it("flushes a partial trailing line on stream end", async () => {
    const lines: CapturedLine[] = [];
    const pipe = new AgentOutputPipe((l) => lines.push(l), { bufferSize: 10 });
    const stream = makeStream();
    pipe.attach(stream, "stdout");

    stream.push("trailing-no-newline");
    stream.push(null);
    await new Promise((r) => setImmediate(r));

    expect(lines.map((l) => l.text)).toEqual(["trailing-no-newline"]);
  });

  it("close() drains both partial buffers and detaches listeners", async () => {
    const lines: CapturedLine[] = [];
    const pipe = new AgentOutputPipe((l) => lines.push(l), { bufferSize: 10 });
    const out = makeStream();
    const err = makeStream();
    pipe.attach(out, "stdout");
    pipe.attach(err, "stderr");

    out.push("partial-out");
    err.push("partial-err");
    await new Promise((r) => setImmediate(r));
    pipe.close();

    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.text).sort()).toEqual(["partial-err", "partial-out"]);

    // Subsequent writes after close are silently dropped.
    out.push("after-close\n");
    await new Promise((r) => setImmediate(r));
    expect(lines).toHaveLength(2);
  });

  it("close() is idempotent", () => {
    const pipe = new AgentOutputPipe(() => {}, { bufferSize: 10 });
    expect(() => {
      pipe.close();
      pipe.close();
    }).not.toThrow();
  });

  it("ignores attach() after close", async () => {
    const lines: CapturedLine[] = [];
    const pipe = new AgentOutputPipe((l) => lines.push(l), { bufferSize: 10 });
    pipe.close();
    const stream = makeStream();
    pipe.attach(stream, "stdout");
    stream.push("late\n");
    await new Promise((r) => setImmediate(r));
    expect(lines).toEqual([]);
  });

  it("swallows sink errors so a misbehaving sink cannot kill the pipe", async () => {
    const sink = vi.fn(() => {
      throw new Error("boom");
    });
    const pipe = new AgentOutputPipe(sink, { bufferSize: 10 });
    const stream = makeStream();
    pipe.attach(stream, "stdout");

    stream.push("a\nb\n");
    await new Promise((r) => setImmediate(r));

    expect(sink).toHaveBeenCalledTimes(2);
    expect(pipe.snapshot().map((l) => l.text)).toEqual(["a", "b"]);
  });
});
