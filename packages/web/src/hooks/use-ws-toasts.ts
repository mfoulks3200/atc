import { useEffect } from "react";
import type { WsEvent } from "@/types/api.js";
import { useToast } from "@/hooks/use-toast.js";

/**
 * Subscribes to the global `atc-ws-event` window event and maps safety-critical
 * WebSocket events to toast notifications. Mount once inside <ToastProvider>.
 *
 * Mapped events: @see AIR-101 UX design spec §7
 */
export function WsToastBridge() {
  const { addToast } = useToast();

  useEffect(() => {
    const handler = (e: Event) => {
      const ws = (e as CustomEvent<WsEvent>).detail;

      switch (ws.event) {
        case "craft.emergency.declared": {
          const callsign = String(ws.data.callsign ?? "");
          const reason = String((ws.data.entry as Record<string, unknown>)?.reason ?? "");
          addToast({
            severity: "error",
            title: "Emergency Declared",
            message: reason ? `${callsign}: ${reason}` : callsign,
          });
          break;
        }

        case "craft.checklist.failed": {
          addToast({
            severity: "warning",
            title: "Checklist Failed",
            message: String(ws.data.callsign ?? ""),
          });
          break;
        }

        case "tfr.issued": {
          addToast({
            severity: "warning",
            title: "TFR Active",
            message: String(ws.data.reason ?? ""),
          });
          break;
        }

        case "tfr.lifted": {
          addToast({ severity: "info", title: "TFR Lifted" });
          break;
        }

        // NOTE: tower.merge.rejected is a planned event not yet emitted by the daemon.
        // This branch is a forward-compatibility hook point. @see AIR-101 §7 note.
        case "tower.merge.rejected": {
          addToast({
            severity: "error",
            title: "Merge Rejected",
            message: String(ws.data.callsign ?? ""),
          });
          break;
        }

        case "craft.clearance.granted": {
          addToast({
            severity: "success",
            title: "Clearance Granted",
            message: String(ws.data.callsign ?? ""),
          });
          break;
        }
      }
    };

    window.addEventListener("atc-ws-event", handler);
    return () => window.removeEventListener("atc-ws-event", handler);
  }, [addToast]);

  return null;
}
