import { SEAT_COLORS } from "@/theme/tokens";

interface CrewMemberProps {
  identifier: string;
  seat: "captain" | "firstOfficer" | "jumpseat";
  certifications?: string[];
}

const SEAT_LABELS: Record<string, string> = {
  captain: "CPT",
  firstOfficer: "F/O",
  jumpseat: "J/S",
};

export function CrewMember({ identifier, seat, certifications }: CrewMemberProps) {
  const color = SEAT_COLORS[seat] ?? "var(--text-muted)";
  const label = SEAT_LABELS[seat] ?? seat;

  return (
    <div
      className="rounded-md p-2"
      style={{
        backgroundColor: "var(--bg-elevated)",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="text-[11px]">
        <span style={{ color }}>{label}</span>{" "}
        <span style={{ color: "var(--text-primary)" }}>{identifier}</span>
      </div>
      {certifications && certifications.length > 0 && (
        <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-dim)" }}>
          certs: {certifications.join(", ")}
        </div>
      )}
    </div>
  );
}
