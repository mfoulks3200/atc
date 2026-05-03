import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { VerificationDetailModal } from "./verification-detail-modal.js";
import type { VerifiedBlackBoxEntry, PilotRecord } from "@/types/api";

function makeEntry(overrides: Partial<VerifiedBlackBoxEntry> = {}): VerifiedBlackBoxEntry {
  return {
    timestamp: "2026-05-01T10:00:00.000Z",
    author: "pilot-a",
    type: "Decision",
    content: "some content",
    verificationState: "unsigned",
    ...overrides,
  };
}

function makePilot(overrides: Partial<PilotRecord> = {}): PilotRecord {
  return {
    identifier: "pilot-a",
    certifications: [],
    mcpServers: {},
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof VerificationDetailModal>> = {}) {
  const triggerRef = createRef<HTMLButtonElement>();
  const onClose = vi.fn();
  render(
    <VerificationDetailModal
      entries={[]}
      pilots={[]}
      onClose={onClose}
      triggerRef={triggerRef}
      {...props}
    />,
  );
  return { onClose, triggerRef };
}

describe("VerificationDetailModal", () => {
  it("renders with role=dialog and aria-modal=true", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("has aria-labelledby pointing to the title", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    const title = document.getElementById(labelId!);
    expect(title).toBeTruthy();
    expect(title!.textContent).toMatch(/Verification Details/i);
  });

  it("shows all-clear state when no anomalies exist", () => {
    renderModal({ entries: [makeEntry()] });
    expect(screen.getByTestId("vdm-all-clear")).toBeTruthy();
  });

  it("calls onClose when Escape is pressed", async () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the footer Close button is clicked", async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", async () => {
    const { onClose } = renderModal();
    const dialog = screen.getByRole("dialog");
    // Click the backdrop (parent of the dialog)
    fireEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("Signature Mismatches section", () => {
    it("renders section when signed-invalid entries exist", () => {
      const entry = makeEntry({ verificationState: "signed-invalid", author: "bad-actor" });
      renderModal({ entries: [entry] });
      expect(screen.getByText(/Signature Mismatches/i)).toBeTruthy();
      expect(screen.getByText(/bad-actor/)).toBeTruthy();
    });

    it("omits section when no signed-invalid entries", () => {
      renderModal({ entries: [makeEntry({ verificationState: "unsigned" })] });
      expect(screen.queryByText(/Signature Mismatches/i)).toBeNull();
    });

    it("shows View entry button and fires onViewEntry callback", async () => {
      const entry = makeEntry({ verificationState: "signed-invalid" });
      const onViewEntry = vi.fn();
      renderModal({ entries: [entry], onViewEntry });
      await userEvent.click(screen.getByText("View entry ↗"));
      expect(onViewEntry).toHaveBeenCalledWith(0);
    });
  });

  describe("Unresolvable Authors section", () => {
    it("renders section when author-not-found entries exist", () => {
      const entry = makeEntry({
        verificationState: "author-not-found",
        author: "ghost-pilot",
      });
      renderModal({ entries: [entry] });
      expect(screen.getByText(/Unresolvable Authors/i)).toBeTruthy();
      expect(screen.getByText(/ghost-pilot/)).toBeTruthy();
    });

    it("omits section when no author-not-found entries", () => {
      renderModal({ entries: [] });
      expect(screen.queryByText(/Unresolvable Authors/i)).toBeNull();
    });

    it("uses correct copy: 'author not found'", () => {
      const entry = makeEntry({ verificationState: "author-not-found", author: "ghost" });
      renderModal({ entries: [entry] });
      expect(screen.getByText(/Author not found:/i)).toBeTruthy();
      expect(screen.getByText(/could not be resolved/i)).toBeTruthy();
    });
  });

  describe("Unsigned from Keyed Pilots section", () => {
    it("renders section when unsigned entry's author has a public key", () => {
      const entry = makeEntry({ verificationState: "unsigned", author: "keyed-pilot" });
      const pilot = makePilot({ identifier: "keyed-pilot", publicKey: "abc123" });
      renderModal({ entries: [entry], pilots: [pilot] });
      expect(screen.getByText(/Unsigned from Keyed Pilots/i)).toBeTruthy();
      expect(screen.getByText(/keyed-pilot/)).toBeTruthy();
    });

    it("omits section when all unsigned entries are from keyless pilots", () => {
      const entry = makeEntry({ verificationState: "unsigned", author: "keyless-pilot" });
      const pilot = makePilot({ identifier: "keyless-pilot" }); // no publicKey
      renderModal({ entries: [entry], pilots: [pilot] });
      expect(screen.queryByText(/Unsigned from Keyed Pilots/i)).toBeNull();
    });
  });

  describe("Focus trap", () => {
    it("traps Tab key within the dialog", async () => {
      renderModal({ entries: [makeEntry({ verificationState: "signed-invalid" })] });
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
      // Tabbing past last button should cycle back to first
      buttons[buttons.length - 1].focus();
      await userEvent.tab();
      expect(document.activeElement).toBe(buttons[0]);
    });

    it("traps Shift+Tab to wrap to last element", async () => {
      renderModal({ entries: [makeEntry({ verificationState: "signed-invalid" })] });
      const buttons = screen.getAllByRole("button");
      buttons[0].focus();
      await userEvent.tab({ shift: true });
      expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    });
  });

  describe("Multiple anomaly types together", () => {
    it("shows all three sections when all anomaly types are present", () => {
      const entries: VerifiedBlackBoxEntry[] = [
        makeEntry({ verificationState: "signed-invalid", author: "bad" }),
        makeEntry({ verificationState: "author-not-found", author: "ghost" }),
        makeEntry({ verificationState: "unsigned", author: "keyed" }),
      ];
      const pilot = makePilot({ identifier: "keyed", publicKey: "xyz" });
      renderModal({ entries, pilots: [pilot] });
      expect(screen.getByText(/Signature Mismatches/i)).toBeTruthy();
      expect(screen.getByText(/Unresolvable Authors/i)).toBeTruthy();
      expect(screen.getByText(/Unsigned from Keyed Pilots/i)).toBeTruthy();
    });
  });
});
