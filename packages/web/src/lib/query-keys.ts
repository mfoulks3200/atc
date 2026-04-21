export const queryKeys = {
  health: () => ["health"] as const,
  status: () => ["status"] as const,
  projects: {
    list: () => ["projects"] as const,
    detail: (name: string) => ["projects", name] as const,
  },
  pilots: {
    list: (project: string) => ["pilots", project] as const,
    detail: (project: string, id: string) => ["pilots", project, id] as const,
    all: () => ["pilots"] as const,
  },
  crafts: {
    list: (project: string) => ["crafts", project] as const,
    detail: (project: string, callsign: string) => ["crafts", project, callsign] as const,
    blackBox: (project: string, callsign: string) =>
      ["crafts", project, callsign, "blackbox"] as const,
    intercom: (project: string, callsign: string) =>
      ["crafts", project, callsign, "intercom"] as const,
    vectors: (project: string, callsign: string) =>
      ["crafts", project, callsign, "vectors"] as const,
    diff: (project: string, callsign: string) => ["crafts", project, callsign, "diff"] as const,
    diffFile: (project: string, callsign: string, filePath: string) =>
      ["crafts", project, callsign, "diff", filePath] as const,
  },
  agents: {
    list: () => ["agents"] as const,
    detail: (id: string) => ["agents", id] as const,
    usage: (id: string) => ["agents", id, "usage"] as const,
  },
  tower: {
    queue: (project: string) => ["tower", project] as const,
  },
  checklists: {
    templates: () => ["checklists", "templates"] as const,
    template: (id: string) => ["checklists", "templates", id] as const,
    bindings: () => ["checklists", "bindings"] as const,
    runs: (project: string, callsign: string) => ["checklists", "runs", project, callsign] as const,
  },
  config: {
    global: () => ["config", "global"] as const,
    project: (name: string) => ["config", "project", name] as const,
    pilot: (id: string) => ["config", "pilot", id] as const,
  },
};
