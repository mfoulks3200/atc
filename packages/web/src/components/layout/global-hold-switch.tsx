import { useEffect, useRef, useState, useCallback, useId } from "react";
import { useGlobalTfr } from "@/hooks/use-global-tfr";
import { cn } from "@/lib/utils";
import styles from "./global-hold-switch.module.css";

const GRACE_PERIOD_MS = 150;
const INACTIVITY_TIMEOUT_MS = 6000;
const POST_COMMIT_CLOSE_MS = 400;
const ERROR_FLASH_MS = 600;

export function GlobalHoldSwitch() {
  const tfr = useGlobalTfr();
  const [coverOpen, setCoverOpen] = useState(false);
  const [errorFlash, setErrorFlash] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");

  const frameRef = useRef<HTMLDivElement | null>(null);
  const coverRef = useRef<HTMLButtonElement | null>(null);
  const switchRef = useRef<HTMLButtonElement | null>(null);

  const inactivityTimerRef = useRef<number | null>(null);
  const mouseleaveTimerRef = useRef<number | null>(null);
  const commitCloseTimerRef = useRef<number | null>(null);
  const errorFlashTimerRef = useRef<number | null>(null);

  const switchId = useId();

  const isActive = tfr.state === "active";

  const clearTimer = (ref: React.MutableRefObject<number | null>) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const openCover = useCallback(() => {
    if (tfr.state === "loading" || tfr.state === "unknown") return;
    setCoverOpen(true);
    clearTimer(inactivityTimerRef);
    inactivityTimerRef.current = window.setTimeout(() => {
      setCoverOpen(false);
    }, INACTIVITY_TIMEOUT_MS);
  }, [tfr.state]);

  // Focus switch when cover opens
  useEffect(() => {
    if (coverOpen) {
      switchRef.current?.focus();
    }
  }, [coverOpen]);

  // Click-outside and Escape handlers (only while open)
  useEffect(() => {
    if (!coverOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (frameRef.current && !frameRef.current.contains(e.target as Node)) {
        setCoverOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCoverOpen(false);
        // Return focus to the cover button so keyboard users don't get stranded
        // on the disabled switch (which has tabIndex=-1 when closed).
        coverRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [coverOpen]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTimer(inactivityTimerRef);
      clearTimer(mouseleaveTimerRef);
      clearTimer(commitCloseTimerRef);
      clearTimer(errorFlashTimerRef);
    };
  }, []);

  const handleCoverClick = () => {
    if (!coverOpen) openCover();
  };

  const handleSwitchClick = async () => {
    if (!coverOpen || tfr.pending) return;
    try {
      if (isActive) {
        await tfr.lift();
        setLiveMessage("Global flight hold lifted");
      } else {
        await tfr.issue();
        setLiveMessage("Global flight hold issued");
      }
      clearTimer(commitCloseTimerRef);
      commitCloseTimerRef.current = window.setTimeout(() => {
        setCoverOpen(false);
      }, POST_COMMIT_CLOSE_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      setLiveMessage(`Global flight hold failed: ${message}`);
      setErrorFlash(true);
      clearTimer(errorFlashTimerRef);
      errorFlashTimerRef.current = window.setTimeout(() => {
        setErrorFlash(false);
      }, ERROR_FLASH_MS);
    }
  };

  const handleMouseLeave = () => {
    if (!coverOpen) return;
    clearTimer(mouseleaveTimerRef);
    mouseleaveTimerRef.current = window.setTimeout(() => {
      setCoverOpen(false);
    }, GRACE_PERIOD_MS);
  };

  const handleMouseEnter = () => {
    clearTimer(mouseleaveTimerRef);
  };

  const headerLabel = isActive ? (
    <>
      <span className={styles.labelTopPrefix}>● HOLD ACTIVE —</span> GLOBAL HOLD
    </>
  ) : (
    "GLOBAL HOLD"
  );

  const hintText = (() => {
    if (tfr.error) return tfr.error.message;
    if (tfr.state === "loading") return "Loading hold status...";
    if (tfr.state === "unknown") return "TFR status unavailable";
    if (tfr.pending) return isActive ? "Lifting hold..." : "Issuing hold...";
    if (coverOpen) return isActive ? "Click switch to lift TFR" : "Click switch to issue TFR";
    if (isActive) return "Hold active — click glass to lift";
    return "Click the glass to open";
  })();

  return (
    <div className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
      <div
        ref={frameRef}
        data-testid="global-hold-frame"
        className={cn(
          styles.frame,
          coverOpen && styles.open,
          isActive && styles.active,
          errorFlash && styles.error,
        )}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={handleMouseEnter}
      >
        <div className={styles.labelTop}>{headerLabel}</div>
        <div className={styles.switchArea}>
          <span className={styles.switchLabel}>HOLD</span>
          <button
            ref={switchRef}
            id={switchId}
            type="button"
            role="switch"
            aria-checked={isActive}
            aria-label="Global flight hold"
            aria-busy={tfr.pending}
            tabIndex={coverOpen ? 0 : -1}
            disabled={!coverOpen || tfr.pending}
            className={styles.switch}
            onClick={(e) => {
              e.stopPropagation();
              void handleSwitchClick();
            }}
          />
        </div>
        <button
          ref={coverRef}
          type="button"
          aria-label="Global flight hold safety cover"
          aria-expanded={coverOpen}
          aria-controls={switchId}
          className={styles.glass}
          onClick={(e) => {
            e.stopPropagation();
            handleCoverClick();
          }}
        >
          <span className={styles.glassLabel}>LIFT</span>
          <span className={styles.grip} />
        </button>
      </div>
      <div className={styles.hint}>{hintText}</div>
      <div role="status" aria-live="polite" className={styles.srOnly}>
        {liveMessage}
      </div>
    </div>
  );
}
