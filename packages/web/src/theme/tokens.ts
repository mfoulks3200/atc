export const STATUS_COLORS: Record<string, string> = {
  Taxiing: "var(--text-dim)",
  InFlight: "var(--accent-green)",
  LandingChecklist: "var(--accent-yellow)",
  ClearedToLand: "var(--accent-green)",
  GoAround: "var(--accent-yellow)",
  Emergency: "var(--accent-red)",
  Landed: "var(--text-muted)",
  ReturnToOrigin: "var(--text-muted)",
};

export const EVENT_COLORS: Record<string, string> = {
  craft: "var(--accent-green)",
  tower: "var(--accent-yellow)",
  agent: "var(--accent-purple)",
  controls: "var(--accent-blue)",
};

export const SEAT_COLORS: Record<string, string> = {
  captain: "var(--accent-green)",
  firstOfficer: "var(--accent-blue)",
  jumpseat: "var(--text-dim)",
};

export const AGENT_STATUS_COLORS: Record<string, string> = {
  running: "var(--accent-green)",
  paused: "var(--accent-yellow)",
  suspended: "var(--accent-red)",
  terminated: "var(--text-muted)",
};

export const VECTOR_STATUS_COLORS: Record<string, string> = {
  Pending: "var(--text-dim)",
  Passed: "var(--accent-green)",
  Failed: "var(--accent-red)",
};
