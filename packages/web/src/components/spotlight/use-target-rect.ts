import { useEffect, useState } from "react";

function escapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function findTarget(id: string): Element | null {
  const matches = document.querySelectorAll(`[data-spotlight="${escapeAttr(id)}"]`);
  if (matches.length > 1) {
    console.warn(`[spotlight] multiple targets with id "${id}" — using the first match`);
  }
  return matches[0] ?? null;
}

export function useTargetRect(targetId: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (targetId === null) {
      setRect(null);
      return;
    }

    let frame = 0;
    let currentEl: Element | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const applyRect = () => {
      const el = currentEl;
      if (!el || !el.isConnected) {
        setRect(null);
        return;
      }
      setRect(el.getBoundingClientRect());
    };

    const update = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(applyRect);
    };

    const bind = () => {
      const el = findTarget(targetId);
      if (el === currentEl) return;
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      currentEl = el;
      if (!el) {
        setRect(null);
        return;
      }
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(el);
      applyRect();
    };

    bind();

    const mutationObserver = new MutationObserver(() => {
      const el = findTarget(targetId);
      if (el !== currentEl) bind();
      else if (el) update();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    const onScroll = () => update();
    const onResize = () => update();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onResize);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (resizeObserver) resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", onResize);
    };
  }, [targetId]);

  return rect;
}
