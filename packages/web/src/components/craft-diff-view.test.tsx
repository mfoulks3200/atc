import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CraftDiffView, getLanguageFromPath, DIFF_STATUS_META } from "./craft-diff-view.js";
import type { CraftDiffResponse, CraftDiffFileResponse } from "@/types/api";

// ---------------------------------------------------------------------------
// Monaco Editor mock — the real editor requires a DOM + workers not available in jsdom.
// ---------------------------------------------------------------------------
vi.mock("@monaco-editor/react", () => ({
  DiffEditor: ({ original, modified, language }: { original: string; modified: string; language: string }) => (
    <div
      data-testid="monaco-diff-editor"
      data-original={original}
      data-modified={modified}
      data-language={language}
    />
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithClient(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeClient()}>{ui}</QueryClientProvider>,
  );
}

const DIFF_RESPONSE: CraftDiffResponse = {
  baseBranch: "main",
  craftBranch: "craft/fix-auth",
  files: [
    { path: "src/index.ts", status: "modified" },
    { path: "src/new-file.ts", status: "added" },
    { path: "src/old-file.ts", status: "deleted" },
  ],
};

const FILE_RESPONSE: CraftDiffFileResponse = {
  path: "src/index.ts",
  original: "// original",
  modified: "// modified",
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  vi.mocked(globalThis.fetch).mockImplementation(() => {
    const { status, body } = responses[call++] ?? { status: 200, body: {} };
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
}

// ---------------------------------------------------------------------------
// getLanguageFromPath
// ---------------------------------------------------------------------------

describe("getLanguageFromPath", () => {
  it("maps TypeScript extensions", () => {
    expect(getLanguageFromPath("foo.ts")).toBe("typescript");
    expect(getLanguageFromPath("bar.tsx")).toBe("typescript");
  });

  it("maps JavaScript extensions", () => {
    expect(getLanguageFromPath("foo.js")).toBe("javascript");
    expect(getLanguageFromPath("bar.jsx")).toBe("javascript");
  });

  it("maps known extensions", () => {
    expect(getLanguageFromPath("styles.css")).toBe("css");
    expect(getLanguageFromPath("data.json")).toBe("json");
    expect(getLanguageFromPath("README.md")).toBe("markdown");
    expect(getLanguageFromPath("schema.graphql")).toBe("graphql");
    expect(getLanguageFromPath("config.yml")).toBe("yaml");
    expect(getLanguageFromPath("main.go")).toBe("go");
    expect(getLanguageFromPath("lib.rs")).toBe("rust");
    expect(getLanguageFromPath("main.py")).toBe("python");
  });

  it("falls back to plaintext for unknown extensions", () => {
    expect(getLanguageFromPath("binary.bin")).toBe("plaintext");
    expect(getLanguageFromPath("noext")).toBe("plaintext");
  });

  it("handles paths with multiple dots", () => {
    expect(getLanguageFromPath("src/foo.test.ts")).toBe("typescript");
    expect(getLanguageFromPath("config.local.json")).toBe("json");
  });
});

// ---------------------------------------------------------------------------
// DIFF_STATUS_META
// ---------------------------------------------------------------------------

describe("DIFF_STATUS_META", () => {
  it("has entries for all three statuses", () => {
    expect(DIFF_STATUS_META.added.label).toBe("A");
    expect(DIFF_STATUS_META.modified.label).toBe("M");
    expect(DIFF_STATUS_META.deleted.label).toBe("D");
  });

  it("uses distinct colors", () => {
    const colors = Object.values(DIFF_STATUS_META).map((m) => m.color);
    const unique = new Set(colors);
    expect(unique.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// CraftDiffView — loading state
// ---------------------------------------------------------------------------

describe("CraftDiffView loading state", () => {
  it("shows a loading skeleton while the diff list loads", () => {
    vi.mocked(globalThis.fetch).mockImplementation(() => new Promise(() => {}));
    renderWithClient(<CraftDiffView projectName="acme" callsign="fix-auth" />);
    expect(screen.getByTestId("diff-loading")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// CraftDiffView — error state
// ---------------------------------------------------------------------------

describe("CraftDiffView error state", () => {
  it("shows an error message when the diff fetch fails", async () => {
    mockFetch([{ status: 500, body: { error: "server exploded" } }]);
    renderWithClient(<CraftDiffView projectName="acme" callsign="fix-auth" />);
    const el = await screen.findByTestId("diff-error");
    expect(el.textContent).toMatch(/500|server exploded/i);
  });
});

// ---------------------------------------------------------------------------
// CraftDiffView — empty state
// ---------------------------------------------------------------------------

describe("CraftDiffView empty state", () => {
  it("shows a 'no changes' message when the files array is empty", async () => {
    mockFetch([
      { status: 200, body: { baseBranch: "main", craftBranch: "craft/x", files: [] } },
    ]);
    renderWithClient(<CraftDiffView projectName="acme" callsign="fix-auth" />);
    const el = await screen.findByTestId("diff-empty");
    expect(el.textContent).toMatch(/no changes/i);
  });
});

// ---------------------------------------------------------------------------
// CraftDiffView — happy path
// ---------------------------------------------------------------------------

describe("CraftDiffView happy path", () => {
  it("renders the file list and auto-selects the first file", async () => {
    mockFetch([
      { status: 200, body: DIFF_RESPONSE },
      { status: 200, body: FILE_RESPONSE },
    ]);
    renderWithClient(<CraftDiffView projectName="acme" callsign="fix-auth" />);

    const view = await screen.findByTestId("diff-view");
    expect(view).toBeTruthy();

    // All three file paths must appear somewhere in the sidebar.
    expect(screen.getByText("index.ts")).toBeTruthy();
    expect(screen.getByText("new-file.ts")).toBeTruthy();
    expect(screen.getByText("old-file.ts")).toBeTruthy();
  });

  it("shows the Monaco editor once file content loads", async () => {
    mockFetch([
      { status: 200, body: DIFF_RESPONSE },
      { status: 200, body: FILE_RESPONSE },
    ]);
    renderWithClient(<CraftDiffView projectName="acme" callsign="fix-auth" />);

    // Wait until the editor has the loaded content (it renders with "" until the
    // file-content query resolves, so we poll until the attribute matches).
    await waitFor(() => {
      const editor = screen.queryByTestId("monaco-diff-editor");
      expect(editor).not.toBeNull();
      expect(editor!.getAttribute("data-original")).toBe("// original");
      expect(editor!.getAttribute("data-modified")).toBe("// modified");
      expect(editor!.getAttribute("data-language")).toBe("typescript");
    });
  });

  it("passes branch names to the footer", async () => {
    mockFetch([
      { status: 200, body: DIFF_RESPONSE },
      { status: 200, body: FILE_RESPONSE },
    ]);
    renderWithClient(<CraftDiffView projectName="acme" callsign="fix-auth" />);

    await screen.findByTestId("diff-view");
    expect(screen.getByText("main")).toBeTruthy();
    expect(screen.getByText("craft/fix-auth")).toBeTruthy();
  });

  it("switches file content when user clicks a different file", async () => {
    const secondFileResponse: CraftDiffFileResponse = {
      path: "src/new-file.ts",
      original: null,
      modified: "// brand new",
    };
    mockFetch([
      { status: 200, body: DIFF_RESPONSE },
      { status: 200, body: FILE_RESPONSE },
      { status: 200, body: secondFileResponse },
    ]);
    renderWithClient(<CraftDiffView projectName="acme" callsign="fix-auth" />);

    await screen.findByTestId("diff-view");
    const newFileBtn = screen.getByText("new-file.ts");
    await userEvent.click(newFileBtn);

    await waitFor(() => {
      const editor = screen.getByTestId("monaco-diff-editor");
      expect(editor.getAttribute("data-modified")).toBe("// brand new");
    });
  });
});

// ---------------------------------------------------------------------------
// CraftDiffView — binary file placeholder
// ---------------------------------------------------------------------------

describe("CraftDiffView binary file", () => {
  it("shows a binary placeholder instead of the editor for binary files", async () => {
    const binaryDiff: CraftDiffResponse = {
      baseBranch: "main",
      craftBranch: "craft/images",
      files: [{ path: "assets/logo.png", status: "modified" }],
    };
    const binaryFile: CraftDiffFileResponse = {
      path: "assets/logo.png",
      original: null,
      modified: null,
      binary: true,
    };
    mockFetch([
      { status: 200, body: binaryDiff },
      { status: 200, body: binaryFile },
    ]);
    renderWithClient(<CraftDiffView projectName="acme" callsign="images" />);

    const placeholder = await screen.findByTestId("diff-binary");
    expect(placeholder.textContent).toMatch(/binary file/i);
    expect(screen.queryByTestId("monaco-diff-editor")).toBeNull();
  });
});
