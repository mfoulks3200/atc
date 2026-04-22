import { useState, useEffect } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { useCraftDiff, useCraftDiffFile } from "@/hooks/use-api.js";
import type { DiffFile } from "@/types/api.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXT_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  md: "markdown",
  css: "css",
  scss: "scss",
  html: "html",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  rb: "ruby",
  sh: "shell",
  bash: "shell",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  xml: "xml",
  proto: "proto",
  swift: "swift",
  kt: "kotlin",
  cs: "csharp",
  cpp: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
};

/** Infer Monaco language identifier from a file path. */
export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANGUAGE[ext] ?? "plaintext";
}

/** Badge colors and labels for each diff status. */
export const DIFF_STATUS_META: Record<
  DiffFile["status"],
  { label: string; color: string }
> = {
  added: { label: "A", color: "var(--accent-green)" },
  modified: { label: "M", color: "var(--accent-yellow)" },
  deleted: { label: "D", color: "var(--accent-red)" },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatusPillProps {
  status: DiffFile["status"];
}

function StatusPill({ status }: StatusPillProps) {
  const { label, color } = DIFF_STATUS_META[status];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-sm text-[9px] font-bold leading-none"
      style={{
        width: 14,
        height: 14,
        color,
        backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

interface FileRowProps {
  file: DiffFile;
  selected: boolean;
  onClick: () => void;
}

function FileRow({ file, selected, onClick }: FileRowProps) {
  const basename = file.path.split("/").pop() ?? file.path;
  const dir = file.path.includes("/")
    ? file.path.slice(0, file.path.lastIndexOf("/") + 1)
    : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left"
      style={{
        backgroundColor: selected
          ? "color-mix(in srgb, var(--accent-blue) 12%, transparent)"
          : "transparent",
        border: selected
          ? "1px solid color-mix(in srgb, var(--accent-blue) 25%, transparent)"
          : "1px solid transparent",
        outline: "none",
      }}
    >
      <StatusPill status={file.status} />
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {dir && (
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            {dir}
          </span>
        )}
        <span
          className="text-[11px]"
          style={{ color: selected ? "var(--text-primary)" : "var(--text-secondary)" }}
        >
          {basename}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface CraftDiffViewProps {
  /** Project name (used for API calls). */
  projectName: string;
  /** Craft callsign (used for API calls). */
  callsign: string;
}

/**
 * Renders a side-by-side Monaco diff editor with an integrated file sidebar.
 * Fetches the changed-file list via `useCraftDiff` and individual file content
 * via `useCraftDiffFile`.
 *
 * @see AIR-40
 */
export function CraftDiffView({ projectName, callsign }: CraftDiffViewProps) {
  const { data: diff, isLoading: diffLoading, error: diffError } = useCraftDiff(projectName, callsign);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Auto-select the first file when the list loads.
  useEffect(() => {
    if (diff && diff.files.length > 0 && selectedPath === null) {
      setSelectedPath(diff.files[0]!.path);
    }
  }, [diff, selectedPath]);

  const { data: fileContent, isLoading: fileLoading } = useCraftDiffFile(
    projectName,
    callsign,
    selectedPath,
  );

  // ----- Loading state -----
  if (diffLoading) {
    return (
      <div
        className="flex h-full items-center justify-center"
        data-testid="diff-loading"
      >
        <div className="space-y-1.5">
          {[100, 80, 90, 70].map((w, i) => (
            <div
              key={i}
              className="h-2 animate-pulse rounded"
              style={{
                width: `${w}%`,
                backgroundColor: "var(--bg-elevated)",
                opacity: 0.6,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ----- Error state -----
  if (diffError) {
    return (
      <div
        className="flex h-full items-center justify-center text-center"
        data-testid="diff-error"
      >
        <div>
          <div
            className="mb-1 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--accent-red)" }}
          >
            diff unavailable
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
            {diffError instanceof Error ? diffError.message : "Failed to load diff"}
          </div>
        </div>
      </div>
    );
  }

  // ----- Empty state -----
  if (!diff || diff.files.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center text-center"
        data-testid="diff-empty"
      >
        <div>
          <div
            className="mb-1 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            no changes
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-dim)", opacity: 0.6 }}>
            This craft has no file differences from{" "}
            {diff?.baseBranch ?? "the base branch"}.
          </div>
        </div>
      </div>
    );
  }

  const selectedFile = diff.files.find((f) => f.path === selectedPath) ?? null;

  return (
    <div
      className="flex overflow-hidden rounded-md border"
      style={{
        height: 480,
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border)",
      }}
      data-testid="diff-view"
    >
      {/* ---- File sidebar ---- */}
      <div
        className="flex shrink-0 flex-col overflow-hidden border-r"
        style={{
          width: 220,
          borderColor: "var(--border)",
          backgroundColor: "var(--bg-base)",
        }}
      >
        {/* Sidebar header */}
        <div
          className="flex items-center justify-between border-b px-3 py-2"
          style={{ borderColor: "var(--border)" }}
        >
          <span
            className="text-[9px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            changed files
          </span>
          <span
            className="text-[9px] tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            {diff.files.length}
          </span>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto p-1">
          {diff.files.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              selected={file.path === selectedPath}
              onClick={() => setSelectedPath(file.path)}
            />
          ))}
        </div>

        {/* Branch context footer */}
        <div
          className="border-t px-3 py-2"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="truncate text-[9px]" style={{ color: "var(--text-dim)" }}>
            <span style={{ color: "var(--accent-red)", opacity: 0.8 }}>−</span>{" "}
            {diff.baseBranch}
          </div>
          <div className="truncate text-[9px]" style={{ color: "var(--text-dim)" }}>
            <span style={{ color: "var(--accent-green)" }}>+</span>{" "}
            {diff.craftBranch}
          </div>
        </div>
      </div>

      {/* ---- Editor area ---- */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Editor header */}
        {selectedFile && (
          <div
            className="flex shrink-0 items-center gap-2 border-b px-3 py-2"
            style={{ borderColor: "var(--border)" }}
          >
            <StatusPill status={selectedFile.status} />
            <span
              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px]"
              style={{ color: "var(--text-secondary)" }}
            >
              {selectedFile.path}
            </span>
            {fileLoading && (
              <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
                loading…
              </span>
            )}
          </div>
        )}

        {/* Monaco DiffEditor / placeholder */}
        <div className="min-h-0 flex-1" data-testid="diff-editor-area">
          {!selectedFile ? (
            <div
              className="flex h-full items-center justify-center text-[11px]"
              style={{ color: "var(--text-dim)" }}
            >
              Select a file to view its diff
            </div>
          ) : fileContent?.binary ? (
            <div
              className="flex h-full items-center justify-center text-center"
              data-testid="diff-binary"
            >
              <div>
                <div
                  className="mb-1 text-xs font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-dim)" }}
                >
                  binary file
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: "var(--text-dim)", opacity: 0.6 }}
                >
                  {selectedFile.path}
                </div>
              </div>
            </div>
          ) : (
            <DiffEditor
              height="100%"
              language={getLanguageFromPath(selectedFile.path)}
              original={fileContent?.original ?? ""}
              modified={fileContent?.modified ?? ""}
              theme="vs-dark"
              options={{
                readOnly: true,
                renderSideBySide: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 12,
                lineHeight: 18,
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                renderLineHighlight: "none",
                overviewRulerBorder: false,
                scrollbar: {
                  vertical: "auto",
                  horizontal: "auto",
                  verticalScrollbarSize: 6,
                  horizontalScrollbarSize: 6,
                },
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
