import { useCallback, useRef, useState } from "react";
import { useSubmitSpec } from "@/hooks/use-api.js";
import { SDD_ERROR_MESSAGES, type CraftState, type SddErrorCode } from "@/types/api.js";

interface SpecImportPanelProps {
  project: string;
  onSuccess: (craft: CraftState) => void;
}

const PLACEHOLDER = `title: Fix auth token refresh
cargo: >
  Fixes the OAuth token refresh flow so that expired access tokens
  are silently refreshed before API calls fail.
category: feature
vectors:
  - name: Implement token refresh
    criteria:
      - Auth tokens refresh automatically before expiry
      - Failed refresh triggers sign-out, not a 401 loop
  - name: Error handling
    criteria:
      - Network errors during refresh show a user-facing toast
      - Refresh errors are logged to the black box`;

/** Extract a friendly message from an SDD API error string. */
export function parseSddError(raw: string): string {
  for (const code of Object.keys(SDD_ERROR_MESSAGES) as SddErrorCode[]) {
    if (raw.includes(code)) {
      return SDD_ERROR_MESSAGES[code];
    }
  }
  return raw.replace(/^\d+:\s*/, "");
}

/**
 * Spec import panel — accepts YAML/JSON spec documents via paste or file drop,
 * supports dry-run preview, and submits to POST /api/v1/projects/:name/crafts/from-spec.
 * @see RULE-SDD-1 through RULE-SDD-15
 */
export function SpecImportPanel({ project, onSuccess }: SpecImportPanelProps) {
  const [content, setContent] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<CraftState | null>(null);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitSpec = useSubmitSpec(project);

  const handleFileRead = useCallback((file: File) => {
    if (!file.name.endsWith(".spec.yaml") && !file.name.endsWith(".spec.json")) {
      setDryRunError("Only .spec.yaml and .spec.json files are accepted.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") {
        setContent(text);
        setDryRunResult(null);
        setDryRunError(null);
        setSubmitError(null);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileRead(file);
    },
    [handleFileRead],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  function handleDryRun() {
    if (!content.trim()) return;
    setDryRunError(null);
    setSubmitError(null);
    submitSpec.mutate(
      { content, dryRun: true },
      {
        onSuccess: (result) => setDryRunResult(result),
        onError: (err) => {
          setDryRunResult(null);
          setDryRunError(parseSddError(err.message));
        },
      },
    );
  }

  function handleCreate() {
    if (!content.trim()) return;
    setSubmitError(null);
    submitSpec.mutate(
      { content, dryRun: false },
      {
        onSuccess: (craft) => onSuccess(craft),
        onError: (err) => setSubmitError(parseSddError(err.message)),
      },
    );
  }

  const hasContent = content.trim().length > 0;
  const isPending = submitSpec.isPending;

  return (
    <div data-testid="spec-import-panel">
      {/* Drop zone */}
      <div
        data-testid="drop-zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className="mb-3 flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed py-4 transition-colors"
        style={{
          borderColor: isDragOver ? "var(--accent-blue)" : "var(--border)",
          backgroundColor: isDragOver ? "rgba(120, 180, 255, 0.06)" : "var(--bg-elevated)",
          color: isDragOver ? "var(--accent-blue)" : "var(--text-dim)",
        }}
      >
        <div className="mb-0.5 text-[10px] uppercase tracking-widest">
          {isDragOver ? "Release to load" : "Drop .spec.yaml or .spec.json"}
        </div>
        <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>
          or click to browse
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".spec.yaml,.spec.json,.yaml,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileRead(file);
            e.target.value = "";
          }}
          data-testid="file-input"
        />
      </div>

      {/* Textarea */}
      <div className="mb-3">
        <div
          className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          <span>YAML / JSON</span>
          {content && (
            <button
              type="button"
              onClick={() => {
                setContent("");
                setDryRunResult(null);
                setDryRunError(null);
                setSubmitError(null);
              }}
              className="text-[9px] lowercase"
              style={{ color: "var(--text-dim)" }}
              data-testid="clear-button"
            >
              clear
            </button>
          )}
        </div>
        <textarea
          data-testid="spec-textarea"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setDryRunResult(null);
            setDryRunError(null);
            setSubmitError(null);
          }}
          placeholder={PLACEHOLDER}
          rows={14}
          spellCheck={false}
          className="w-full resize-none rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed outline-none"
          style={{
            backgroundColor: "var(--bg-base)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* Dry run error */}
      {dryRunError && (
        <div
          data-testid="dry-run-error"
          className="mb-3 rounded-md px-3 py-2 text-xs"
          style={{ backgroundColor: "rgba(255, 85, 85, 0.1)", color: "var(--accent-red)" }}
        >
          {dryRunError}
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <div
          data-testid="submit-error"
          className="mb-3 rounded-md px-3 py-2 text-xs"
          style={{ backgroundColor: "rgba(255, 85, 85, 0.1)", color: "var(--accent-red)" }}
        >
          {submitError}
        </div>
      )}

      {/* Dry run preview */}
      {dryRunResult && (
        <div
          data-testid="dry-run-preview"
          className="mb-3 rounded-md border p-3"
          style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border)" }}
        >
          <div
            className="mb-2.5 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            DRY RUN — COMPUTED CRAFT
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
            <div>
              <span style={{ color: "var(--text-dim)" }}>CALLSIGN </span>
              <span
                className="font-mono font-semibold"
                style={{ color: "var(--accent-blue)" }}
                data-testid="preview-callsign"
              >
                {dryRunResult.callsign}
              </span>
            </div>
            <div>
              <span style={{ color: "var(--text-dim)" }}>CATEGORY </span>
              <span style={{ color: "var(--text-primary)" }}>{dryRunResult.category}</span>
            </div>
            <div>
              <span style={{ color: "var(--text-dim)" }}>CAPTAIN </span>
              <span style={{ color: "var(--accent-green)" }} data-testid="preview-captain">
                {dryRunResult.captain}
              </span>
            </div>
            {dryRunResult.firstOfficers.length > 0 && (
              <div>
                <span style={{ color: "var(--text-dim)" }}>FIRST OFFICERS </span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {dryRunResult.firstOfficers.join(", ")}
                </span>
              </div>
            )}
            {dryRunResult.autoLaunchRequested === true && (
              <div className="col-span-2">
                <span style={{ color: "var(--text-dim)" }}>AUTO-LAUNCH </span>
                {dryRunResult.autoLaunchWillFire ? (
                  <span
                    style={{ color: "var(--accent-green)" }}
                    data-testid="preview-autolaunch-status"
                  >
                    ✓ Yes — pilot: {dryRunResult.captain}
                  </span>
                ) : (
                  <span
                    style={{ color: "var(--accent-yellow)" }}
                    data-testid="preview-autolaunch-status"
                  >
                    ✗ Suppressed — {dryRunResult.autoLaunchSuppressionReason}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="mt-2.5">
            <div
              className="mb-1 text-[9px] uppercase tracking-widest"
              style={{ color: "var(--text-dim)" }}
            >
              FLIGHT PLAN — {dryRunResult.flightPlan.length} VECTOR
              {dryRunResult.flightPlan.length !== 1 ? "S" : ""}
            </div>
            <div className="space-y-1">
              {dryRunResult.flightPlan.map((v, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span
                    className="mt-px shrink-0 font-mono text-[9px]"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-primary)" }}>
                    {v.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid="dry-run-button"
          onClick={handleDryRun}
          disabled={!hasContent || isPending}
          className="rounded-md border px-3 py-1.5 text-xs transition-colors"
          style={{
            borderColor: hasContent && !isPending ? "var(--accent-blue)" : "var(--border)",
            color: hasContent && !isPending ? "var(--accent-blue)" : "var(--text-dim)",
            backgroundColor: "transparent",
          }}
        >
          {isPending && !submitSpec.variables?.dryRun === false ? "Running..." : "Dry Run ▶"}
        </button>

        <button
          type="button"
          data-testid="create-button"
          onClick={handleCreate}
          disabled={!hasContent || isPending}
          className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
          style={{
            backgroundColor:
              hasContent && !isPending ? "var(--accent-green)" : "var(--bg-elevated)",
            color: hasContent && !isPending ? "var(--bg-base)" : "var(--text-dim)",
          }}
        >
          {isPending && submitSpec.variables?.dryRun === false ? "Creating..." : "Create Craft"}
        </button>
      </div>
    </div>
  );
}
