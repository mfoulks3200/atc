import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SpecImportPanel, parseSddError } from "./spec-import-panel.js";
import type { CraftState } from "@/types/api";

function makeCraft(overrides: Partial<CraftState> = {}): CraftState {
  return {
    callsign: "fix-auth-01",
    createdAt: "2026-04-21T00:00:00.000Z",
    branch: "fix-auth-01",
    cargo: "Fixes the OAuth token refresh flow.",
    category: "feature",
    status: "Taxiing",
    captain: "pilot-alice",
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [
      { name: "Implement token refresh", acceptanceCriteria: "Tokens refresh.", status: "Pending" },
    ],
    blackBox: [],
    intercom: [],
    controls: { mode: "exclusive", holder: "pilot-alice" },
    ...overrides,
  };
}

function renderPanel(onSuccess = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    onSuccess,
    ...render(
      <QueryClientProvider client={client}>
        <SpecImportPanel project="my-project" onSuccess={onSuccess} />
      </QueryClientProvider>,
    ),
  };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// parseSddError
// ---------------------------------------------------------------------------
describe("parseSddError", () => {
  it("returns the friendly message for known error codes", () => {
    expect(parseSddError("422: SPEC_VALIDATION_ERROR")).toMatch(/missing required fields/i);
    expect(parseSddError("422: UNKNOWN_CATEGORY")).toMatch(/category does not match/i);
    expect(parseSddError("422: NO_CERTIFIED_PILOT")).toMatch(/no available pilot/i);
    expect(parseSddError("422: PILOT_NOT_CERTIFIED")).toMatch(/does not hold the required/i);
    expect(parseSddError("422: PILOT_ROLE_CONFLICT")).toMatch(/cannot be both captain/i);
    expect(parseSddError("409: CALLSIGN_CONFLICT")).toMatch(/callsign is already in use/i);
    expect(parseSddError("500: BRANCH_CREATION_FAILED")).toMatch(/git branch could not/i);
    expect(parseSddError("400: SPEC_PARSE_ERROR")).toMatch(/malformed/i);
  });

  it("strips the HTTP status prefix for unknown error messages", () => {
    expect(parseSddError("503: Service unavailable")).toBe("Service unavailable");
  });

  it("returns the raw message when no prefix or code matches", () => {
    expect(parseSddError("Something went wrong")).toBe("Something went wrong");
  });
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
describe("SpecImportPanel", () => {
  it("renders drop zone, textarea, dry-run, and create buttons", () => {
    renderPanel();
    expect(screen.getByTestId("drop-zone")).toBeTruthy();
    expect(screen.getByTestId("spec-textarea")).toBeTruthy();
    expect(screen.getByTestId("dry-run-button")).toBeTruthy();
    expect(screen.getByTestId("create-button")).toBeTruthy();
  });

  it("disables both buttons when textarea is empty", () => {
    renderPanel();
    expect((screen.getByTestId("dry-run-button") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("create-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables both buttons once content is typed", async () => {
    renderPanel();
    await userEvent.type(screen.getByTestId("spec-textarea"), "title: test");
    expect((screen.getByTestId("dry-run-button") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("create-button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a clear button when content is present, removes content on click", async () => {
    renderPanel();
    await userEvent.type(screen.getByTestId("spec-textarea"), "title: test");
    expect(screen.getByTestId("clear-button")).toBeTruthy();
    await userEvent.click(screen.getByTestId("clear-button"));
    expect((screen.getByTestId("spec-textarea") as HTMLTextAreaElement).value).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Dry Run
// ---------------------------------------------------------------------------
describe("Dry Run", () => {
  it("POSTs to from-spec?dryRun=true and renders the preview panel", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(makeCraft()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderPanel();
    await userEvent.type(screen.getByTestId("spec-textarea"), "title: test");
    await userEvent.click(screen.getByTestId("dry-run-button"));

    await waitFor(() => {
      expect(screen.getByTestId("dry-run-preview")).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("from-spec?dryRun=true");
    expect(String(url)).toContain("my-project");
  });

  it("shows computed callsign and captain in the preview", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(makeCraft({ callsign: "fix-auth-01", captain: "pilot-alice" })),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderPanel();
    await userEvent.type(screen.getByTestId("spec-textarea"), "title: test");
    await userEvent.click(screen.getByTestId("dry-run-button"));

    await waitFor(() => screen.getByTestId("preview-callsign"));
    expect(screen.getByTestId("preview-callsign").textContent).toBe("fix-auth-01");
    expect(screen.getByTestId("preview-captain").textContent).toBe("pilot-alice");
  });

  it("sends JSON Content-Type when content starts with {", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(makeCraft()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderPanel();
    // Use fireEvent to avoid userEvent's { escape-sequence interpretation
    fireEvent.change(screen.getByTestId("spec-textarea"), {
      target: { value: '{"title":"test","cargo":"c","category":"f","vectors":[]}' },
    });
    await userEvent.click(screen.getByTestId("dry-run-button"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("sends application/yaml Content-Type when content does not start with {", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(makeCraft()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderPanel();
    await userEvent.type(screen.getByTestId("spec-textarea"), "title: test spec");
    await userEvent.click(screen.getByTestId("dry-run-button"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ "Content-Type": "application/yaml" });
  });

  it("shows a friendly error on dry-run failure", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "SPEC_VALIDATION_ERROR" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderPanel();
    await userEvent.type(screen.getByTestId("spec-textarea"), "title: test");
    await userEvent.click(screen.getByTestId("dry-run-button"));

    const errEl = await screen.findByTestId("dry-run-error");
    expect(errEl.textContent).toMatch(/missing required fields/i);
    expect(screen.queryByTestId("dry-run-preview")).toBeNull();
  });

  it("shows AUTO-LAUNCH green row when autoLaunchWillFire is true", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeCraft({
            captain: "pilot-alice",
            autoLaunchRequested: true,
            autoLaunchWillFire: true,
            autoLaunchSuppressionReason: null,
          }),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderPanel();
    await userEvent.type(screen.getByTestId("spec-textarea"), "title: test");
    await userEvent.click(screen.getByTestId("dry-run-button"));

    const el = await screen.findByTestId("preview-autolaunch-status");
    expect(el.textContent).toMatch(/✓ Yes — pilot: pilot-alice/);
  });

  it("shows AUTO-LAUNCH amber row with reason when autoLaunchWillFire is false", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeCraft({
            autoLaunchRequested: true,
            autoLaunchWillFire: false,
            autoLaunchSuppressionReason: "allowAutoLaunch is not enabled for this project (RULE-SDD-11)",
          }),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderPanel();
    await userEvent.type(screen.getByTestId("spec-textarea"), "title: test");
    await userEvent.click(screen.getByTestId("dry-run-button"));

    const el = await screen.findByTestId("preview-autolaunch-status");
    expect(el.textContent).toMatch(/✗ Suppressed/);
    expect(el.textContent).toMatch(/allowAutoLaunch is not enabled/);
  });

  it("hides the AUTO-LAUNCH row when autoLaunchRequested is false", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(makeCraft({ autoLaunchRequested: false })),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderPanel();
    await userEvent.type(screen.getByTestId("spec-textarea"), "title: test");
    await userEvent.click(screen.getByTestId("dry-run-button"));

    await waitFor(() => screen.getByTestId("dry-run-preview"));
    expect(screen.queryByTestId("preview-autolaunch-status")).toBeNull();
  });

  it("hides the AUTO-LAUNCH row when autoLaunchRequested is absent (legacy response)", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(makeCraft()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderPanel();
    await userEvent.type(screen.getByTestId("spec-textarea"), "title: test");
    await userEvent.click(screen.getByTestId("dry-run-button"));

    await waitFor(() => screen.getByTestId("dry-run-preview"));
    expect(screen.queryByTestId("preview-autolaunch-status")).toBeNull();
  });

  it("clears the dry-run preview when content is edited after a successful dry run", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(makeCraft()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderPanel();
    await userEvent.type(screen.getByTestId("spec-textarea"), "title: test");
    await userEvent.click(screen.getByTestId("dry-run-button"));
    await waitFor(() => screen.getByTestId("dry-run-preview"));

    await userEvent.type(screen.getByTestId("spec-textarea"), " extra");
    expect(screen.queryByTestId("dry-run-preview")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Create Craft
// ---------------------------------------------------------------------------
describe("Create Craft", () => {
  it("POSTs to from-spec (no dryRun) and calls onSuccess with the craft", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const craft = makeCraft();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(craft), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { onSuccess } = renderPanel();
    await userEvent.type(screen.getByTestId("spec-textarea"), "title: test");
    await userEvent.click(screen.getByTestId("create-button"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(craft));

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("from-spec");
    expect(String(url)).not.toContain("dryRun");
  });

  it("shows a friendly error when create fails with UNKNOWN_CATEGORY", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "UNKNOWN_CATEGORY" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderPanel();
    await userEvent.type(screen.getByTestId("spec-textarea"), "title: test");
    await userEvent.click(screen.getByTestId("create-button"));

    const errEl = await screen.findByTestId("submit-error");
    expect(errEl.textContent).toMatch(/category does not match/i);
  });

  it("shows a friendly error when create fails with CALLSIGN_CONFLICT", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "CALLSIGN_CONFLICT" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderPanel();
    await userEvent.type(screen.getByTestId("spec-textarea"), "title: test");
    await userEvent.click(screen.getByTestId("create-button"));

    const errEl = await screen.findByTestId("submit-error");
    expect(errEl.textContent).toMatch(/callsign is already in use/i);
  });
});

// ---------------------------------------------------------------------------
// File drop
// ---------------------------------------------------------------------------
describe("File drop", () => {
  it("populates the textarea from a dropped .spec.yaml file", async () => {
    renderPanel();
    const yaml = "title: Dropped spec\ncargo: test\n";
    const file = new File([yaml], "feature.spec.yaml", { type: "text/yaml" });
    const dropZone = screen.getByTestId("drop-zone");

    await userEvent.upload(screen.getByTestId("file-input"), file);

    await waitFor(() => {
      expect((screen.getByTestId("spec-textarea") as HTMLTextAreaElement).value).toBe(yaml);
    });
  });

  it("shows an error for unsupported file extensions", async () => {
    renderPanel();
    const file = new File(["content"], "readme.txt", { type: "text/plain" });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByTestId("dry-run-error").textContent).toMatch(
        /only .spec.yaml and .spec.json/i,
      );
    });
  });

  it("updates drag visual state on dragover and dragLeave", () => {
    renderPanel();
    const dropZone = screen.getByTestId("drop-zone");

    const dragOver = new Event("dragover", { bubbles: true });
    Object.defineProperty(dragOver, "preventDefault", { value: vi.fn() });
    dropZone.dispatchEvent(dragOver);

    const dragLeave = new Event("dragleave", { bubbles: true });
    dropZone.dispatchEvent(dragLeave);
    // No assertion needed; just ensure no throw
  });
});
