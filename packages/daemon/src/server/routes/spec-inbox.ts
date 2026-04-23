/**
 * Spec-inbox file watcher for Spec-Driven Development (SDD).
 *
 * Monitors a project's `specInbox` directory for `.spec.yaml` and `.spec.json`
 * files and submits them through the 12-step SDD creation procedure via
 * {@link processSpec}. Successfully processed files are moved to `.processed/`;
 * failed files are moved to `.failed/` with a `.error` JSON sidecar.
 *
 * @see §4.6.5 — File Watcher
 * @see RULE-SDD-17 — dedup by inode+mtime
 */

import { readdir, readFile, rename, writeFile, mkdir, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { join, basename } from "node:path";
import { load as yamlLoad } from "js-yaml";
import type { SpecDocument } from "@airtrafficcontrol/types";

/** Dedup key — inode + mtime milliseconds, stringified. */
type DedupKey = string;

/** Callback shape matching {@link processSpec} in crafts-from-spec.ts. */
export type ProcessSpecFn = (
  projectName: string,
  spec: SpecDocument,
  source: "file-watch",
) => Promise<unknown>;

/**
 * Watches a `specInbox` directory and submits spec files through the SDD
 * creation procedure.
 *
 * Deduplication is performed using inode + mtime so that a file that fails
 * and is moved to `.failed/` is not re-processed if the OS reuses the path.
 *
 * @see §4.6.5
 * @see RULE-SDD-17
 */
export class SpecInboxWatcher {
  private readonly processed = new Set<DedupKey>();
  private fsWatcher: ReturnType<typeof watch> | null = null;

  /**
   * @param inboxDir - Absolute path to the specInbox directory.
   * @param processSpec - Bound call to the SDD creation procedure.
   * @param projectName - Project the specs will be created under.
   */
  constructor(
    private readonly inboxDir: string,
    private readonly processSpec: ProcessSpecFn,
    private readonly projectName: string = "",
  ) {}

  /**
   * Scans the inbox directory for unprocessed spec files and submits each one.
   *
   * Intended for both the startup reconciliation scan and as the handler
   * triggered by the fs.watch event.
   *
   * @see RULE-SDD-17
   */
  async processExisting(): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(this.inboxDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".spec.yaml") && !entry.endsWith(".spec.json")) continue;

      const filePath = join(this.inboxDir, entry);

      // Dedup check: skip if inode+mtime matches a previously processed file
      let fileStat: Awaited<ReturnType<typeof stat>>;
      try {
        fileStat = await stat(filePath);
      } catch {
        continue;
      }
      const key: DedupKey = `${fileStat.ino}:${fileStat.mtimeMs}`;
      if (this.processed.has(key)) continue;

      await this._processFile(filePath, entry, key);
    }
  }

  /**
   * Starts the fs.watch listener that triggers processing on file creation
   * and rename events.
   */
  start(): void {
    this.fsWatcher = watch(this.inboxDir, { persistent: false }, (_event, filename) => {
      if (!filename) return;
      if (!filename.endsWith(".spec.yaml") && !filename.endsWith(".spec.json")) return;
      void this.processExisting();
    });
    (this.fsWatcher as unknown as NodeJS.EventEmitter).on("error", () => undefined);
  }

  /** Stops the fs.watch listener. */
  stop(): void {
    this.fsWatcher?.close();
    this.fsWatcher = null;
  }

  private async _processFile(
    filePath: string,
    filename: string,
    dedupKey: DedupKey,
  ): Promise<void> {
    // Mark immediately to prevent double-processing during concurrent scans
    this.processed.add(dedupKey);

    const processedDir = join(this.inboxDir, ".processed");
    const failedDir = join(this.inboxDir, ".failed");
    const destBase = basename(filename);

    let spec: SpecDocument;
    try {
      const raw = await readFile(filePath, "utf8");
      if (filename.endsWith(".spec.yaml")) {
        spec = yamlLoad(raw) as SpecDocument;
      } else {
        spec = JSON.parse(raw) as SpecDocument;
      }
    } catch (parseErr) {
      await this._moveToFailed(filePath, failedDir, destBase, {
        code: "SPEC_PARSE_ERROR",
        message: parseErr instanceof Error ? parseErr.message : String(parseErr),
        timestamp: new Date().toISOString(),
        sourceFile: destBase,
      });
      return;
    }

    try {
      await this.processSpec(this.projectName, spec, "file-watch");
      await mkdir(processedDir, { recursive: true });
      await rename(filePath, join(processedDir, destBase));
    } catch (err) {
      const code =
        err != null && typeof (err as { code?: unknown }).code === "string"
          ? (err as { code: string }).code
          : "PROCESSING_ERROR";
      await this._moveToFailed(filePath, failedDir, destBase, {
        code,
        message: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
        sourceFile: destBase,
      });
    }
  }

  private async _moveToFailed(
    srcPath: string,
    failedDir: string,
    filename: string,
    errorPayload: { code: string; message: string; timestamp: string; sourceFile: string },
  ): Promise<void> {
    await mkdir(failedDir, { recursive: true });
    const dest = join(failedDir, filename);
    await rename(srcPath, dest);
    await writeFile(`${dest}.error`, JSON.stringify(errorPayload, null, 2), "utf8");
  }
}
