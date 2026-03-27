export const queryKeys = {
  health: () => ["health"] as const,
  status: () => ["status"] as const,
  projects: {
    list: () => ["projects"] as const,
    detail: (name: string) => ["projects", name] as const,
  },
  crafts: {
    list: (project: string) => ["crafts", project] as const,
    detail: (project: string, callsign: string) =>
      ["crafts", project, callsign] as const,
    blackBox: (project: string, callsign: string) =>
      ["crafts", project, callsign, "blackbox"] as const,
    intercom: (project: string, callsign: string) =>
      ["crafts", project, callsign, "intercom"] as const,
    vectors: (project: string, callsign: string) =>
      ["crafts", project, callsign, "vectors"] as const,
  },
  agents: {
    list: () => ["agents"] as const,
    detail: (id: string) => ["agents", id] as const,
    usage: (id: string) => ["agents", id, "usage"] as const,
  },
  tower: {
    queue: (project: string) => ["tower", project] as const,
  },
};
