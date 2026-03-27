# @atc/web Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an aviation-themed React dashboard for monitoring and inspecting the ATC daemon via its REST API and WebSocket event stream.

**Architecture:** Vite-powered React SPA with React Router for nested layouts, TanStack Query for REST data management, and a custom WebSocket hook layer that writes directly to the query cache. Aviation-themed dark UI built on shadcn/ui primitives with a CSS custom property theming system.

**Tech Stack:** Vite, React 19, React Router v7, TanStack Query v5, shadcn/ui, Tailwind CSS v4, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-26-web-dashboard-design.md`

---

## File Structure

```
packages/web/
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── vite.config.ts
├── index.html
├── components.json
├── postcss.config.js
├── src/
│   ├── main.tsx
│   ├── theme/
│   │   ├── variables.css
│   │   ├── globals.css
│   │   └── tokens.ts
│   ├── lib/
│   │   ├── api-client.ts
│   │   ├── api-client.test.ts
│   │   ├── query-keys.ts
│   │   └── query-keys.test.ts
│   ├── hooks/
│   │   ├── use-api.ts
│   │   ├── use-websocket.ts
│   │   ├── use-websocket.test.ts
│   │   ├── use-subscription.ts
│   │   └── use-subscription.test.ts
│   ├── components/
│   │   ├── ui/                    # shadcn primitives (added via CLI)
│   │   ├── base/
│   │   │   ├── status-badge.tsx
│   │   │   ├── stat-card.tsx
│   │   │   ├── flight-strip.tsx
│   │   │   ├── vector-progress.tsx
│   │   │   ├── event-row.tsx
│   │   │   ├── black-box-entry.tsx
│   │   │   ├── intercom-message.tsx
│   │   │   ├── crew-member.tsx
│   │   │   ├── queue-card.tsx
│   │   │   ├── page-header.tsx
│   │   │   ├── connection-indicator.tsx
│   │   │   └── filter-pills.tsx
│   │   └── layout/
│   │       ├── shell.tsx
│   │       ├── sidebar.tsx
│   │       ├── project-sidebar.tsx
│   │       └── header.tsx
│   ├── routes/
│   │   ├── root.tsx
│   │   ├── dashboard.tsx
│   │   ├── projects/
│   │   │   ├── list.tsx
│   │   │   └── detail.tsx
│   │   ├── crafts/
│   │   │   └── detail.tsx
│   │   ├── agents/
│   │   │   ├── list.tsx
│   │   │   └── detail.tsx
│   │   ├── tower.tsx
│   │   └── events.tsx
│   └── types/
│       └── api.ts
```

---

### Task 1: Scaffold Package and Vite Config

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/tsconfig.app.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/postcss.config.js`
- Modify: `tsconfig.json` (root — add reference)

- [ ] **Step 1: Create `packages/web/package.json`**

```json
{
  "name": "@atc/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.75.5",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router": "^7.6.1"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.7",
    "@types/react": "^19.1.4",
    "@types/react-dom": "^19.1.5",
    "@vitejs/plugin-react": "^4.5.2",
    "tailwindcss": "^4.1.7",
    "typescript": "^5.8.2",
    "vite": "^6.3.5"
  }
}
```

- [ ] **Step 2: Create `packages/web/tsconfig.json`**

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }]
}
```

- [ ] **Step 3: Create `packages/web/tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `packages/web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3100",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3100",
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 5: Create `packages/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ATC Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `packages/web/postcss.config.js`**

```js
export default {};
```

- [ ] **Step 7: Add web package reference to root `tsconfig.json`**

Add `{ "path": "packages/web" }` to the `references` array in the root `tsconfig.json`.

- [ ] **Step 8: Install dependencies**

Run: `cd packages/web && pnpm install`

- [ ] **Step 9: Verify Vite starts**

Run: `cd packages/web && pnpm dev`
Expected: Vite dev server starts without errors on a local port.
Kill the server after verifying.

- [ ] **Step 10: Commit**

```bash
git add packages/web tsconfig.json
git commit -m "feat(web): scaffold @atc/web package with Vite, React, Tailwind"
```

---

### Task 2: Theme System and Global Styles

**Files:**
- Create: `packages/web/src/theme/variables.css`
- Create: `packages/web/src/theme/globals.css`
- Create: `packages/web/src/theme/tokens.ts`
- Create: `packages/web/src/main.tsx`

- [ ] **Step 1: Create `packages/web/src/theme/variables.css`**

```css
:root {
  --bg-base: #0a0f1a;
  --bg-surface: #0d1424;
  --bg-elevated: #162033;
  --border: #1a2744;
  --text-primary: #e0e8f0;
  --text-secondary: #c8d6e5;
  --text-muted: #7a8ba8;
  --text-dim: #4a6fa5;
  --accent-green: #00ff88;
  --accent-yellow: #ffd866;
  --accent-red: #ff5555;
  --accent-blue: #78b4ff;
  --accent-purple: #b48eff;
  --font-mono: "JetBrains Mono", "Fira Code", "Consolas", monospace;
  --radius-sm: 3px;
  --radius-md: 6px;

  /* Derived tokens for shadcn compatibility */
  --background: var(--bg-base);
  --foreground: var(--text-primary);
  --card: var(--bg-surface);
  --card-foreground: var(--text-secondary);
  --muted: var(--bg-elevated);
  --muted-foreground: var(--text-muted);
  --border-color: var(--border);
  --ring: var(--accent-green);
}
```

- [ ] **Step 2: Create `packages/web/src/theme/globals.css`**

```css
@import "tailwindcss";
@import "./variables.css";

@theme {
  --font-mono: "JetBrains Mono", "Fira Code", "Consolas", monospace;
}

* {
  border-color: var(--border);
}

body {
  margin: 0;
  background-color: var(--bg-base);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 3: Create `packages/web/src/theme/tokens.ts`**

```ts
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
```

- [ ] **Step 4: Create `packages/web/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ padding: "2rem", color: "var(--text-primary)" }}>
      <h1>ATC Dashboard</h1>
      <p style={{ color: "var(--text-muted)" }}>Theme loaded successfully.</p>
    </div>
  </StrictMode>,
);
```

- [ ] **Step 5: Verify theme renders**

Run: `cd packages/web && pnpm dev`
Expected: Dark page with "ATC Dashboard" heading in light text, muted subtitle. Monospace font applied.
Kill server after verifying.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/theme packages/web/src/main.tsx
git commit -m "feat(web): add aviation theme system with CSS variables and semantic tokens"
```

---

### Task 3: shadcn/ui Setup and Base Primitives

**Files:**
- Create: `packages/web/components.json`
- Create: `packages/web/src/lib/utils.ts`
- Create: shadcn components in `packages/web/src/components/ui/`

- [ ] **Step 1: Create `packages/web/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 2: Create `packages/web/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Install shadcn dependencies**

Run: `cd packages/web && pnpm add clsx tailwind-merge`

- [ ] **Step 4: Add shadcn components**

Run the following from `packages/web/`:

```bash
pnpm dlx shadcn@latest add badge card table scroll-area separator tooltip
```

If the shadcn CLI doesn't work with this config, manually create the components. The key primitives needed are Badge, Card, Table, ScrollArea, Separator, and Tooltip.

- [ ] **Step 5: Verify components installed**

Run: `ls packages/web/src/components/ui/`
Expected: Files for each added component (badge.tsx, card.tsx, table.tsx, etc.)

- [ ] **Step 6: Commit**

```bash
git add packages/web/components.json packages/web/src/lib/utils.ts packages/web/src/components/ui
git commit -m "feat(web): add shadcn/ui primitives and utility setup"
```

---

### Task 4: API Types

**Files:**
- Create: `packages/web/src/types/api.ts`

- [ ] **Step 1: Create `packages/web/src/types/api.ts`**

These types mirror the daemon's REST API response shapes. They are defined independently to keep the web package decoupled from backend TypeScript internals.

```ts
/** Craft lifecycle status values. */
export type CraftStatus =
  | "Taxiing"
  | "InFlight"
  | "LandingChecklist"
  | "ClearedToLand"
  | "GoAround"
  | "Emergency"
  | "Landed"
  | "ReturnToOrigin";

/** Vector status within a flight plan. */
export type VectorStatus = "Pending" | "Passed" | "Failed";

/** Agent lifecycle status. */
export type AgentStatus = "running" | "paused" | "suspended" | "terminated";

/** Black box entry type. */
export type BlackBoxEntryType =
  | "Decision"
  | "VectorPassed"
  | "GoAround"
  | "Conflict"
  | "Observation"
  | "EmergencyDeclaration";

// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

export interface VectorState {
  name: string;
  acceptanceCriteria: string;
  status: VectorStatus;
  evidence?: string;
  reportedAt?: string;
}

export interface BlackBoxEntry {
  timestamp: string;
  author: string;
  type: BlackBoxEntryType;
  content: string;
}

export interface ControlState {
  mode: "exclusive" | "shared";
  holder?: string;
  sharedAreas?: { pilotId: string; area: string }[];
}

export interface IntercomMessage {
  from: string;
  seat: string;
  content: string;
  timestamp: string;
}

export interface CraftState {
  callsign: string;
  branch: string;
  cargo: string;
  category: string;
  status: CraftStatus;
  captain: string;
  firstOfficers: string[];
  jumpseaters: string[];
  flightPlan: VectorState[];
  blackBox: BlackBoxEntry[];
  intercom: IntercomMessage[];
  controls: ControlState;
}

export interface ProjectMetadata {
  name: string;
  remoteUrl: string;
  categories: string[];
  checklist: { name: string; command: string; timeout?: number }[];
  mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
}

export interface AgentRecord {
  id: string;
  adapterType: string;
  pid?: number;
  projectName: string;
  callsign: string;
  status: AgentStatus;
  adapterMeta: Record<string, unknown>;
}

export interface PilotRecord {
  identifier: string;
  certifications: string[];
}

export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
}

export interface StatusResponse {
  profile: string;
  projects: number;
  crafts: number;
  agents: number;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface AgentUsageReport {
  agentId: string;
  callsign: string;
  timestamp: string;
  tokens: TokenUsage;
  tools: { name: string; calls: number; failures: number }[];
  skills: { name: string; invocations: number }[];
  duration: number;
}

// ---------------------------------------------------------------------------
// WebSocket types
// ---------------------------------------------------------------------------

export interface WsEvent {
  type: "event";
  channel: string;
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export type WsServerMessage =
  | { type: "connected"; sessionId: string }
  | WsEvent
  | { type: "ping" }
  | { type: "pong"; timestamp: string };

export type WsClientMessage =
  | { type: "subscribe"; channel: string }
  | { type: "unsubscribe"; channel: string }
  | { type: "ping" }
  | { type: "pong" };
```

- [ ] **Step 2: Verify types compile**

Run: `cd packages/web && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/types/api.ts
git commit -m "feat(web): add API response types mirroring daemon REST shapes"
```

---

### Task 5: API Client and Query Keys

**Files:**
- Create: `packages/web/src/lib/api-client.ts`
- Create: `packages/web/src/lib/api-client.test.ts`
- Create: `packages/web/src/lib/query-keys.ts`
- Create: `packages/web/src/lib/query-keys.test.ts`

- [ ] **Step 1: Write the test for query keys**

Create `packages/web/src/lib/query-keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { queryKeys } from "./query-keys";

describe("queryKeys", () => {
  it("generates health key", () => {
    expect(queryKeys.health()).toEqual(["health"]);
  });

  it("generates status key", () => {
    expect(queryKeys.status()).toEqual(["status"]);
  });

  it("generates project keys", () => {
    expect(queryKeys.projects.list()).toEqual(["projects"]);
    expect(queryKeys.projects.detail("acme")).toEqual(["projects", "acme"]);
  });

  it("generates craft keys", () => {
    expect(queryKeys.crafts.list("acme")).toEqual(["crafts", "acme"]);
    expect(queryKeys.crafts.detail("acme", "fix-auth")).toEqual(["crafts", "acme", "fix-auth"]);
  });

  it("generates craft sub-resource keys", () => {
    expect(queryKeys.crafts.blackBox("acme", "fix-auth")).toEqual([
      "crafts", "acme", "fix-auth", "blackbox",
    ]);
    expect(queryKeys.crafts.intercom("acme", "fix-auth")).toEqual([
      "crafts", "acme", "fix-auth", "intercom",
    ]);
    expect(queryKeys.crafts.vectors("acme", "fix-auth")).toEqual([
      "crafts", "acme", "fix-auth", "vectors",
    ]);
  });

  it("generates agent keys", () => {
    expect(queryKeys.agents.list()).toEqual(["agents"]);
    expect(queryKeys.agents.detail("a-1")).toEqual(["agents", "a-1"]);
    expect(queryKeys.agents.usage("a-1")).toEqual(["agents", "a-1", "usage"]);
  });

  it("generates tower key", () => {
    expect(queryKeys.tower.queue("acme")).toEqual(["tower", "acme"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/web/src/lib/query-keys.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement query keys**

Create `packages/web/src/lib/query-keys.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/web/src/lib/query-keys.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Write the test for api-client**

Create `packages/web/src/lib/api-client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "./api-client";

describe("apiClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches from the correct URL", async () => {
    const mockResponse = { status: "ok" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await apiClient.get("/api/v1/health");

    expect(fetch).toHaveBeenCalledWith("/api/v1/health", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    expect(result).toEqual(mockResponse);
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
    );

    await expect(apiClient.get("/api/v1/projects/nope")).rejects.toThrow("404");
  });

  it("returns empty for 204 responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    const result = await apiClient.get("/api/v1/something");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm run test -- packages/web/src/lib/api-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement api-client**

Create `packages/web/src/lib/api-client.ts`:

```ts
const BASE_URL = import.meta.env.VITE_DAEMON_URL ?? "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (response.status === 204) {
    return null as T;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, string>).error ?? `HTTP ${response.status}`;
    throw new Error(`${response.status}: ${message}`);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Build the WebSocket URL from the daemon base URL. */
export function getWsUrl(): string {
  if (BASE_URL) {
    return BASE_URL.replace(/^http/, "ws") + "/ws";
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm run test -- packages/web/src/lib/api-client.test.ts`
Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/lib
git commit -m "feat(web): add API client and query key factory with tests"
```

---

### Task 6: WebSocket Hook

**Files:**
- Create: `packages/web/src/hooks/use-websocket.ts`
- Create: `packages/web/src/hooks/use-websocket.test.ts`

- [ ] **Step 1: Write the test**

Create `packages/web/src/hooks/use-websocket.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  simulateOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe("WebSocketManager", () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it("connects and sends subscribe messages", async () => {
    const { WebSocketManager } = await import("./use-websocket");
    const manager = new WebSocketManager("ws://localhost:3100/ws");
    manager.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    manager.subscribe("craft:fix-auth");
    expect(JSON.parse(ws.sent[0])).toEqual({
      type: "subscribe",
      channel: "craft:fix-auth",
    });
  });

  it("responds to server pings with pongs", async () => {
    const { WebSocketManager } = await import("./use-websocket");
    const manager = new WebSocketManager("ws://localhost:3100/ws");
    manager.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ type: "ping" });

    expect(JSON.parse(ws.sent[0])).toEqual({ type: "pong" });
  });

  it("dispatches events to listeners", async () => {
    const { WebSocketManager } = await import("./use-websocket");
    const manager = new WebSocketManager("ws://localhost:3100/ws");
    manager.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const listener = vi.fn();
    manager.onEvent(listener);

    const event = {
      type: "event",
      channel: "craft:fix-auth",
      event: "craft.status.changed",
      timestamp: "2026-03-26T14:32:01.000Z",
      data: { status: "InFlight" },
    };
    ws.simulateMessage(event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it("tracks connection status", async () => {
    const { WebSocketManager } = await import("./use-websocket");
    const manager = new WebSocketManager("ws://localhost:3100/ws");

    expect(manager.status).toBe("disconnected");

    manager.connect();
    expect(manager.status).toBe("connecting");

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    expect(manager.status).toBe("connected");

    manager.disconnect();
    expect(manager.status).toBe("disconnected");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/web/src/hooks/use-websocket.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement WebSocketManager**

Create `packages/web/src/hooks/use-websocket.ts`:

```ts
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { WsClientMessage, WsServerMessage, WsEvent } from "@/types/api";

export type ConnectionStatus = "connected" | "disconnected" | "connecting" | "reconnecting";

type EventListener = (event: WsEvent) => void;
type StatusListener = (status: ConnectionStatus) => void;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private eventListeners = new Set<EventListener>();
  private statusListeners = new Set<StatusListener>();
  private subscriptions = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private _status: ConnectionStatus = "disconnected";

  constructor(url: string) {
    this.url = url;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  connect(): void {
    if (this.ws) return;
    this.setStatus(this._status === "disconnected" ? "connecting" : "reconnecting");

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.setStatus("connected");
      this.reconnectDelay = 1000;
      // Re-subscribe to any channels
      for (const channel of this.subscriptions) {
        this.send({ type: "subscribe", channel });
      }
    };

    this.ws.onmessage = (e) => {
      const message = JSON.parse(e.data as string) as WsServerMessage;
      this.handleMessage(message);
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this._status !== "disconnected") {
        this.setStatus("reconnecting");
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  disconnect(): void {
    this.setStatus("disconnected");
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  subscribe(channel: string): void {
    this.subscriptions.add(channel);
    if (this._status === "connected") {
      this.send({ type: "subscribe", channel });
    }
  }

  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);
    if (this._status === "connected") {
      this.send({ type: "unsubscribe", channel });
    }
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private send(message: WsClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(message: WsServerMessage): void {
    switch (message.type) {
      case "ping":
        this.send({ type: "pong" });
        break;
      case "event":
        for (const listener of this.eventListeners) {
          listener(message);
        }
        break;
      case "connected":
      case "pong":
        // Acknowledged, no action needed
        break;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }
}

// ---------------------------------------------------------------------------
// Singleton + React hooks
// ---------------------------------------------------------------------------

let manager: WebSocketManager | null = null;

export function getWebSocketManager(url: string): WebSocketManager {
  if (!manager) {
    manager = new WebSocketManager(url);
  }
  return manager;
}

export function useConnectionStatus(wsManager: WebSocketManager): ConnectionStatus {
  const statusRef = useRef(wsManager.status);

  return useSyncExternalStore(
    (callback) => {
      return wsManager.onStatusChange((status) => {
        statusRef.current = status;
        callback();
      });
    },
    () => statusRef.current,
  );
}

export function useWebSocket(url: string): WebSocketManager {
  const managerRef = useRef<WebSocketManager | null>(null);

  if (!managerRef.current) {
    managerRef.current = getWebSocketManager(url);
  }

  useEffect(() => {
    const m = managerRef.current!;
    m.connect();
    return () => m.disconnect();
  }, [url]);

  return managerRef.current;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/web/src/hooks/use-websocket.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/use-websocket.ts packages/web/src/hooks/use-websocket.test.ts
git commit -m "feat(web): add WebSocket manager with auto-reconnect and React hooks"
```

---

### Task 7: Subscription Hook (WS → Query Cache Bridge)

**Files:**
- Create: `packages/web/src/hooks/use-subscription.ts`
- Create: `packages/web/src/hooks/use-subscription.test.ts`

- [ ] **Step 1: Write the test**

Create `packages/web/src/hooks/use-subscription.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { mapEventToQueryUpdate } from "./use-subscription";

describe("mapEventToQueryUpdate", () => {
  it("maps craft status change to direct cache write", () => {
    const result = mapEventToQueryUpdate({
      type: "event",
      channel: "craft:fix-auth",
      event: "craft.status.changed",
      timestamp: "2026-03-26T14:32:01.000Z",
      data: { project: "acme", callsign: "fix-auth", craft: { callsign: "fix-auth", status: "InFlight" } },
    });

    expect(result).toEqual({
      strategy: "setData",
      keys: [["crafts", "acme", "fix-auth"]],
      data: { callsign: "fix-auth", status: "InFlight" },
    });
  });

  it("maps craft event without full entity to invalidation", () => {
    const result = mapEventToQueryUpdate({
      type: "event",
      channel: "craft:fix-auth",
      event: "craft.status.changed",
      timestamp: "2026-03-26T14:32:01.000Z",
      data: { project: "acme", callsign: "fix-auth" },
    });

    expect(result).toEqual({
      strategy: "invalidate",
      keys: [["crafts", "acme", "fix-auth"], ["crafts", "acme"]],
    });
  });

  it("maps agent event to agent key invalidation", () => {
    const result = mapEventToQueryUpdate({
      type: "event",
      channel: "agent:a-1",
      event: "agent.status.changed",
      timestamp: "2026-03-26T14:32:01.000Z",
      data: { agentId: "a-1" },
    });

    expect(result).toEqual({
      strategy: "invalidate",
      keys: [["agents", "a-1"], ["agents"]],
    });
  });

  it("maps tower event to tower key invalidation", () => {
    const result = mapEventToQueryUpdate({
      type: "event",
      channel: "tower",
      event: "tower.clearance.granted",
      timestamp: "2026-03-26T14:32:01.000Z",
      data: { project: "acme" },
    });

    expect(result).toEqual({
      strategy: "invalidate",
      keys: [["tower", "acme"]],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/web/src/hooks/use-subscription.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement use-subscription**

Create `packages/web/src/hooks/use-subscription.ts`:

```ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WsEvent } from "@/types/api";
import type { WebSocketManager } from "./use-websocket";

interface SetDataUpdate {
  strategy: "setData";
  keys: readonly (readonly string[])[];
  data: unknown;
}

interface InvalidateUpdate {
  strategy: "invalidate";
  keys: readonly (readonly string[])[];
}

type QueryUpdate = SetDataUpdate | InvalidateUpdate;

/**
 * Maps a WebSocket event to a query cache update strategy.
 * If the event payload contains a full entity (`craft`, `agent`), use setData.
 * Otherwise, invalidate the relevant keys to trigger a refetch.
 */
export function mapEventToQueryUpdate(event: WsEvent): QueryUpdate {
  const { channel, data } = event;
  const project = data.project as string | undefined;
  const callsign = data.callsign as string | undefined;

  // Craft events
  if (channel.startsWith("craft:") && project && callsign) {
    if (data.craft) {
      return {
        strategy: "setData",
        keys: [["crafts", project, callsign]],
        data: data.craft,
      };
    }
    return {
      strategy: "invalidate",
      keys: [
        ["crafts", project, callsign],
        ["crafts", project],
      ],
    };
  }

  // Agent events
  if (channel.startsWith("agent:")) {
    const agentId = data.agentId as string | undefined;
    if (agentId && data.agent) {
      return {
        strategy: "setData",
        keys: [["agents", agentId]],
        data: data.agent,
      };
    }
    if (agentId) {
      return {
        strategy: "invalidate",
        keys: [["agents", agentId], ["agents"]],
      };
    }
    return { strategy: "invalidate", keys: [["agents"]] };
  }

  // Tower events
  if (channel === "tower" || channel.startsWith("tower:")) {
    if (project) {
      return { strategy: "invalidate", keys: [["tower", project]] };
    }
    return { strategy: "invalidate", keys: [["tower"]] };
  }

  // Project events
  if (channel.startsWith("project:") && project) {
    return {
      strategy: "invalidate",
      keys: [["projects", project], ["projects"]],
    };
  }

  // Fallback — invalidate everything
  return { strategy: "invalidate", keys: [] };
}

/**
 * Subscribe to a WebSocket channel and automatically update the
 * TanStack Query cache when events arrive.
 */
export function useSubscription(
  wsManager: WebSocketManager,
  channel: string | null,
): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!channel) return;

    wsManager.subscribe(channel);

    const unsubscribe = wsManager.onEvent((event) => {
      // Only process events for our channel (or if we subscribed to *)
      if (channel !== "*" && event.channel !== channel) return;

      const update = mapEventToQueryUpdate(event);

      if (update.strategy === "setData") {
        for (const key of update.keys) {
          queryClient.setQueryData([...key], update.data);
        }
      } else {
        for (const key of update.keys) {
          queryClient.invalidateQueries({ queryKey: [...key] });
        }
      }
    });

    return () => {
      wsManager.unsubscribe(channel);
      unsubscribe();
    };
  }, [wsManager, channel, queryClient]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/web/src/hooks/use-subscription.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/use-subscription.ts packages/web/src/hooks/use-subscription.test.ts
git commit -m "feat(web): add subscription hook bridging WebSocket events to query cache"
```

---

### Task 8: TanStack Query API Hooks

**Files:**
- Create: `packages/web/src/hooks/use-api.ts`

- [ ] **Step 1: Create `packages/web/src/hooks/use-api.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type {
  HealthResponse,
  StatusResponse,
  ProjectMetadata,
  CraftState,
  AgentRecord,
  AgentUsageReport,
  BlackBoxEntry,
  IntercomMessage,
  VectorState,
} from "@/types/api";

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: () => apiClient.get<HealthResponse>("/api/v1/health"),
    refetchInterval: 30_000,
  });
}

export function useStatus() {
  return useQuery({
    queryKey: queryKeys.status(),
    queryFn: () => apiClient.get<StatusResponse>("/api/v1/status"),
  });
}

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: () => apiClient.get<ProjectMetadata[]>("/api/v1/projects"),
  });
}

export function useProject(name: string) {
  return useQuery({
    queryKey: queryKeys.projects.detail(name),
    queryFn: () => apiClient.get<ProjectMetadata>(`/api/v1/projects/${name}`),
  });
}

export function useCrafts(project: string) {
  return useQuery({
    queryKey: queryKeys.crafts.list(project),
    queryFn: () =>
      apiClient.get<CraftState[]>(`/api/v1/projects/${project}/crafts`),
  });
}

export function useCraft(project: string, callsign: string) {
  return useQuery({
    queryKey: queryKeys.crafts.detail(project, callsign),
    queryFn: () =>
      apiClient.get<CraftState>(
        `/api/v1/projects/${project}/crafts/${callsign}`,
      ),
  });
}

export function useCraftBlackBox(project: string, callsign: string) {
  return useQuery({
    queryKey: queryKeys.crafts.blackBox(project, callsign),
    queryFn: () =>
      apiClient.get<BlackBoxEntry[]>(
        `/api/v1/projects/${project}/crafts/${callsign}/blackbox`,
      ),
  });
}

export function useCraftIntercom(project: string, callsign: string) {
  return useQuery({
    queryKey: queryKeys.crafts.intercom(project, callsign),
    queryFn: () =>
      apiClient.get<IntercomMessage[]>(
        `/api/v1/projects/${project}/crafts/${callsign}/intercom`,
      ),
  });
}

export function useCraftVectors(project: string, callsign: string) {
  return useQuery({
    queryKey: queryKeys.crafts.vectors(project, callsign),
    queryFn: () =>
      apiClient.get<VectorState[]>(
        `/api/v1/projects/${project}/crafts/${callsign}/vectors`,
      ),
  });
}

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents.list(),
    queryFn: () => apiClient.get<AgentRecord[]>("/api/v1/agents"),
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: queryKeys.agents.detail(id),
    queryFn: () => apiClient.get<AgentRecord>(`/api/v1/agents/${id}`),
  });
}

export function useAgentUsage(id: string) {
  return useQuery({
    queryKey: queryKeys.agents.usage(id),
    queryFn: () =>
      apiClient.get<AgentUsageReport[]>(`/api/v1/agents/${id}/usage`),
  });
}

export function useTowerQueue(project: string) {
  return useQuery({
    queryKey: queryKeys.tower.queue(project),
    queryFn: () =>
      apiClient.get<string[]>(`/api/v1/projects/${project}/tower`),
  });
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd packages/web && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/hooks/use-api.ts
git commit -m "feat(web): add typed TanStack Query hooks for all daemon endpoints"
```

---

### Task 9: Base Components

**Files:**
- Create: `packages/web/src/components/base/status-badge.tsx`
- Create: `packages/web/src/components/base/stat-card.tsx`
- Create: `packages/web/src/components/base/flight-strip.tsx`
- Create: `packages/web/src/components/base/vector-progress.tsx`
- Create: `packages/web/src/components/base/event-row.tsx`
- Create: `packages/web/src/components/base/black-box-entry.tsx`
- Create: `packages/web/src/components/base/intercom-message.tsx`
- Create: `packages/web/src/components/base/crew-member.tsx`
- Create: `packages/web/src/components/base/queue-card.tsx`
- Create: `packages/web/src/components/base/page-header.tsx`
- Create: `packages/web/src/components/base/connection-indicator.tsx`
- Create: `packages/web/src/components/base/filter-pills.tsx`

- [ ] **Step 1: Create `status-badge.tsx`**

```tsx
import { STATUS_COLORS, AGENT_STATUS_COLORS, VECTOR_STATUS_COLORS } from "@/theme/tokens";

interface StatusBadgeProps {
  status: string;
  variant?: "craft" | "agent" | "vector";
}

const COLOR_MAPS: Record<string, Record<string, string>> = {
  craft: STATUS_COLORS,
  agent: AGENT_STATUS_COLORS,
  vector: VECTOR_STATUS_COLORS,
};

export function StatusBadge({ status, variant = "craft" }: StatusBadgeProps) {
  const colorMap = COLOR_MAPS[variant] ?? STATUS_COLORS;
  const color = colorMap[status] ?? "var(--text-muted)";

  return (
    <span
      className="inline-block rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      {status}
    </span>
  );
}
```

- [ ] **Step 2: Create `stat-card.tsx`**

```tsx
interface StatCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
  color?: string;
}

export function StatCard({ label, value, subtitle, color = "var(--accent-green)" }: StatCardProps) {
  return (
    <div
      className="rounded-md border p-3.5"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
        {label}
      </div>
      <div className="mt-1 text-[28px] font-bold leading-none" style={{ color }}>
        {value}
      </div>
      {subtitle && (
        <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `flight-strip.tsx`**

```tsx
import { Link } from "react-router";
import { StatusBadge } from "./status-badge";
import { VectorProgress } from "./vector-progress";
import { STATUS_COLORS } from "@/theme/tokens";
import type { CraftState } from "@/types/api";

interface FlightStripProps {
  craft: CraftState;
  project: string;
}

export function FlightStrip({ craft, project }: FlightStripProps) {
  const borderColor = STATUS_COLORS[craft.status] ?? "var(--border)";
  const passedCount = craft.flightPlan.filter((v) => v.status === "Passed").length;

  return (
    <Link
      to={`/projects/${project}/crafts/${craft.callsign}`}
      className="block rounded-md p-2.5 no-underline"
      style={{
        backgroundColor: "var(--bg-elevated)",
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
            {craft.callsign}
          </span>
          <StatusBadge status={craft.status} />
        </div>
        <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
          {passedCount}/{craft.flightPlan.length} vectors
        </span>
      </div>
      <VectorProgress vectors={craft.flightPlan} className="mt-2" />
      <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
        CPT: {craft.captain}
        {craft.firstOfficers.length > 0 && ` · FO: ${craft.firstOfficers.join(", ")}`}
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Create `vector-progress.tsx`**

```tsx
import type { VectorState } from "@/types/api";
import { VECTOR_STATUS_COLORS } from "@/theme/tokens";

interface VectorProgressProps {
  vectors: VectorState[];
  className?: string;
}

export function VectorProgress({ vectors, className = "" }: VectorProgressProps) {
  return (
    <div className={`flex gap-1 ${className}`}>
      {vectors.map((v) => (
        <div
          key={v.name}
          className="h-1 flex-1 rounded-sm"
          style={{ backgroundColor: VECTOR_STATUS_COLORS[v.status] ?? "var(--border)" }}
          title={`${v.name}: ${v.status}`}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create `event-row.tsx`**

```tsx
import { EVENT_COLORS } from "@/theme/tokens";
import type { WsEvent } from "@/types/api";

interface EventRowProps {
  event: WsEvent;
}

function getCategory(channel: string): string {
  const prefix = channel.split(":")[0];
  return prefix ?? "unknown";
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

export function EventRow({ event }: EventRowProps) {
  const category = getCategory(event.channel);
  const color = EVENT_COLORS[category] ?? "var(--text-muted)";

  return (
    <div
      className="grid items-center gap-3 border-b py-1.5 text-[11px]"
      style={{
        gridTemplateColumns: "70px 60px 180px 1fr",
        borderColor: "var(--bg-surface)",
      }}
    >
      <span style={{ color: "var(--text-dim)" }}>{formatTime(event.timestamp)}</span>
      <span
        className="rounded-sm px-1.5 py-px text-center text-[9px]"
        style={{
          color,
          backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        }}
      >
        {category}
      </span>
      <span style={{ color: "var(--accent-yellow)" }}>{event.event}</span>
      <span className="truncate" style={{ color: "var(--text-muted)" }}>
        {JSON.stringify(event.data)}
      </span>
    </div>
  );
}
```

- [ ] **Step 6: Create `black-box-entry.tsx`**

```tsx
import type { BlackBoxEntry as BlackBoxEntryType } from "@/types/api";

const TYPE_COLORS: Record<string, string> = {
  Decision: "var(--accent-blue)",
  VectorPassed: "var(--accent-green)",
  GoAround: "var(--accent-yellow)",
  Conflict: "var(--accent-red)",
  Observation: "var(--text-dim)",
  EmergencyDeclaration: "var(--accent-red)",
};

const TYPE_LABELS: Record<string, string> = {
  Decision: "DECISION",
  VectorPassed: "VECTOR",
  GoAround: "GO-AROUND",
  Conflict: "CONFLICT",
  Observation: "OBS",
  EmergencyDeclaration: "EMERGENCY",
};

interface BlackBoxEntryProps {
  entry: BlackBoxEntryType;
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

export function BlackBoxEntryRow({ entry }: BlackBoxEntryProps) {
  const color = TYPE_COLORS[entry.type] ?? "var(--text-muted)";
  const label = TYPE_LABELS[entry.type] ?? entry.type;

  return (
    <div className="border-b py-1.5 text-[11px]" style={{ borderColor: "var(--border)" }}>
      <span style={{ color: "var(--text-dim)" }}>{formatTime(entry.timestamp)}</span>
      <span
        className="mx-2 inline-block rounded-sm px-1.5 py-px text-[9px]"
        style={{
          color,
          backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        }}
      >
        {label}
      </span>
      <span style={{ color: "var(--text-muted)" }}>{entry.author}:</span>
      <span style={{ color: "var(--text-secondary)" }}> {entry.content}</span>
    </div>
  );
}
```

- [ ] **Step 7: Create `intercom-message.tsx`**

```tsx
import { SEAT_COLORS } from "@/theme/tokens";
import type { IntercomMessage as IntercomMessageType } from "@/types/api";

interface IntercomMessageProps {
  message: IntercomMessageType;
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

export function IntercomMessage({ message }: IntercomMessageProps) {
  const color = SEAT_COLORS[message.seat] ?? "var(--text-muted)";

  return (
    <div
      className="rounded-md p-2 text-[11px]"
      style={{ backgroundColor: "var(--bg-elevated)" }}
    >
      <span style={{ color }}>{message.from}</span>
      <span className="mx-1.5" style={{ color: "var(--text-dim)" }}>
        {formatTime(message.timestamp)}
      </span>
      <div className="mt-1" style={{ color: "var(--text-secondary)" }}>
        {message.content}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create `crew-member.tsx`**

```tsx
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
```

- [ ] **Step 9: Create `queue-card.tsx`**

```tsx
import { StatusBadge } from "./status-badge";
import type { CraftState } from "@/types/api";

interface QueueCardProps {
  position: number;
  craft: CraftState;
  label: string;
}

export function QueueCard({ position, craft, label }: QueueCardProps) {
  const allPassed = craft.flightPlan.every((v) => v.status === "Passed");
  const isCleared = craft.status === "ClearedToLand";
  const borderColor = isCleared ? "var(--accent-green)" : "var(--accent-yellow)";

  return (
    <div
      className="flex-1 rounded-md border p-3.5"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: `color-mix(in srgb, ${borderColor} 30%, transparent)`,
      }}
    >
      <div
        className="mb-2 text-[9px] uppercase tracking-widest"
        style={{ color: borderColor }}
      >
        POSITION {position} — {label}
      </div>
      <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {craft.callsign}
      </div>
      <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
        {craft.cargo}
      </div>
      <div className="mt-2 space-y-0.5 text-[10px]">
        <div style={{ color: "var(--text-dim)" }}>
          CPT: <span style={{ color: "var(--text-secondary)" }}>{craft.captain}</span>
        </div>
        <div style={{ color: "var(--text-dim)" }}>
          Vectors:{" "}
          <span style={{ color: allPassed ? "var(--accent-green)" : "var(--text-secondary)" }}>
            {craft.flightPlan.filter((v) => v.status === "Passed").length}/{craft.flightPlan.length}
            {allPassed && " ✓"}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Create `page-header.tsx`**

```tsx
import { Link } from "react-router";

interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  crumbs: Crumb[];
  right?: React.ReactNode;
}

export function PageHeader({ crumbs, right }: PageHeaderProps) {
  return (
    <div
      className="flex h-12 items-center justify-between border-b px-5"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-1 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span className="mx-1" style={{ color: "var(--text-dim)" }}>
                /
              </span>
            )}
            {crumb.to ? (
              <Link
                to={crumb.to}
                className="no-underline hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                {crumb.label}
              </Link>
            ) : (
              <span style={{ color: "var(--text-primary)" }}>{crumb.label}</span>
            )}
          </span>
        ))}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}
```

- [ ] **Step 11: Create `connection-indicator.tsx`**

```tsx
import type { ConnectionStatus } from "@/hooks/use-websocket";

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
  url?: string;
}

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; color: string; dot: string }> = {
  connected: { label: "CONNECTED", color: "var(--accent-green)", dot: "●" },
  connecting: { label: "CONNECTING", color: "var(--accent-yellow)", dot: "○" },
  reconnecting: { label: "RECONNECTING", color: "var(--accent-yellow)", dot: "○" },
  disconnected: { label: "DISCONNECTED", color: "var(--accent-red)", dot: "○" },
};

export function ConnectionIndicator({ status, url }: ConnectionIndicatorProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-3">
      <span
        className="rounded-sm border px-2 py-0.5 text-[10px]"
        style={{
          color: config.color,
          backgroundColor: `color-mix(in srgb, ${config.color} 10%, transparent)`,
          borderColor: `color-mix(in srgb, ${config.color} 20%, transparent)`,
        }}
      >
        {config.dot} {config.label}
      </span>
      {url && (
        <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
          {url}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 12: Create `filter-pills.tsx`**

```tsx
import { EVENT_COLORS } from "@/theme/tokens";

interface FilterPillsProps {
  categories: string[];
  active: Set<string>;
  onChange: (active: Set<string>) => void;
}

export function FilterPills({ categories, active, onChange }: FilterPillsProps) {
  function toggle(cat: string) {
    const next = new Set(active);
    if (next.has(cat)) {
      next.delete(cat);
    } else {
      next.add(cat);
    }
    onChange(next);
  }

  return (
    <div className="flex gap-2">
      {categories.map((cat) => {
        const isActive = active.has(cat);
        const color = EVENT_COLORS[cat] ?? "var(--text-secondary)";

        return (
          <button
            key={cat}
            onClick={() => toggle(cat)}
            className="cursor-pointer rounded-sm border px-2 py-0.5 text-[10px] uppercase"
            style={{
              color: isActive ? color : "var(--text-muted)",
              backgroundColor: isActive
                ? `color-mix(in srgb, ${color} 15%, transparent)`
                : "var(--bg-elevated)",
              borderColor: isActive
                ? `color-mix(in srgb, ${color} 25%, transparent)`
                : "var(--border)",
            }}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 13: Verify types compile**

Run: `cd packages/web && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 14: Commit**

```bash
git add packages/web/src/components/base
git commit -m "feat(web): add themed base components — StatusBadge, FlightStrip, EventRow, etc."
```

---

### Task 10: Layout Components (Shell, Sidebar, Header)

**Files:**
- Create: `packages/web/src/components/layout/sidebar.tsx`
- Create: `packages/web/src/components/layout/project-sidebar.tsx`
- Create: `packages/web/src/components/layout/header.tsx`
- Create: `packages/web/src/components/layout/shell.tsx`

- [ ] **Step 1: Create `sidebar.tsx`**

```tsx
import { NavLink } from "react-router";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "◈" },
  { to: "/projects", label: "Projects", icon: "⊡" },
  { to: "/agents", label: "Agents", icon: "◇" },
  { to: "/events", label: "Event Stream", icon: "≋" },
];

export function Sidebar() {
  return (
    <aside
      className="flex w-[220px] shrink-0 flex-col border-r"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      {/* Logo */}
      <div className="border-b px-4 py-4" style={{ borderColor: "var(--border)" }}>
        <div
          className="text-lg font-bold tracking-[2px]"
          style={{ color: "var(--accent-green)" }}
        >
          ATC
        </div>
        <div className="mt-0.5 text-[10px] tracking-widest" style={{ color: "var(--text-dim)" }}>
          AIR TRAFFIC CONTROL
        </div>
      </div>

      {/* Nav */}
      <nav className="px-4 py-3">
        <div
          className="mb-2 text-[9px] uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          SYSTEM
        </div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
            style={({ isActive }) => ({
              color: isActive ? "var(--accent-green)" : "var(--text-muted)",
              backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
              borderLeft: isActive ? "2px solid var(--accent-green)" : "2px solid transparent",
            })}
          >
            {item.icon} {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Create `project-sidebar.tsx`**

```tsx
import { NavLink, useParams } from "react-router";
import { useCrafts, useTowerQueue } from "@/hooks/use-api";

export function ProjectSidebar() {
  const { name } = useParams<{ name: string }>();
  const { data: crafts } = useCrafts(name!);
  const { data: queue } = useTowerQueue(name!);

  const craftCount = crafts?.length ?? 0;
  const queueCount = queue?.length ?? 0;

  return (
    <aside
      className="flex w-[220px] shrink-0 flex-col border-r"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      {/* Logo */}
      <div className="border-b px-4 py-4" style={{ borderColor: "var(--border)" }}>
        <div
          className="text-lg font-bold tracking-[2px]"
          style={{ color: "var(--accent-green)" }}
        >
          ATC
        </div>
        <div className="mt-0.5 text-[10px] tracking-widest" style={{ color: "var(--text-dim)" }}>
          AIR TRAFFIC CONTROL
        </div>
      </div>

      {/* System nav */}
      <nav className="px-4 py-3">
        <div
          className="mb-2 text-[9px] uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          SYSTEM
        </div>
        <NavLink
          to="/"
          className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
          style={{ color: "var(--text-muted)" }}
        >
          ◈ Dashboard
        </NavLink>
        <NavLink
          to="/projects"
          className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
          style={{ color: "var(--text-muted)" }}
        >
          ⊡ Projects
        </NavLink>
        <NavLink
          to="/agents"
          className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
          style={{ color: "var(--text-muted)" }}
        >
          ◇ Agents
        </NavLink>
        <NavLink
          to="/events"
          className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
          style={{ color: "var(--text-muted)" }}
        >
          ≋ Event Stream
        </NavLink>
      </nav>

      {/* Project nav */}
      <nav className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div
          className="mb-2 text-[9px] uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          PROJECT: {name?.toUpperCase()}
        </div>
        <NavLink
          to="/projects"
          className="mb-2 block px-2 py-1 text-xs no-underline opacity-50"
          style={{ color: "var(--text-muted)" }}
        >
          ← Back to Projects
        </NavLink>
        <NavLink
          to={`/projects/${name}`}
          end
          className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
          style={({ isActive }) => ({
            color: isActive ? "var(--accent-green)" : "var(--text-muted)",
            backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
          })}
        >
          ⊡ Overview
        </NavLink>
        <NavLink
          to={`/projects/${name}/crafts`}
          className="mb-1 flex items-center justify-between rounded-md px-2 py-1.5 text-xs no-underline"
          style={({ isActive }) => ({
            color: isActive ? "var(--accent-green)" : "var(--text-muted)",
            backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
          })}
        >
          <span>✈ Crafts</span>
          {craftCount > 0 && (
            <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
              {craftCount}
            </span>
          )}
        </NavLink>
        <NavLink
          to={`/projects/${name}/tower`}
          className="mb-1 flex items-center justify-between rounded-md px-2 py-1.5 text-xs no-underline"
          style={({ isActive }) => ({
            color: isActive ? "var(--accent-green)" : "var(--text-muted)",
            backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
          })}
        >
          <span>⊘ Tower Queue</span>
          {queueCount > 0 && (
            <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
              {queueCount}
            </span>
          )}
        </NavLink>
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: Create `header.tsx`**

```tsx
import { ConnectionIndicator } from "@/components/base/connection-indicator";
import { useConnectionStatus } from "@/hooks/use-websocket";
import type { WebSocketManager } from "@/hooks/use-websocket";

interface HeaderProps {
  wsManager: WebSocketManager;
  wsUrl: string;
  children?: React.ReactNode;
}

export function Header({ wsManager, wsUrl, children }: HeaderProps) {
  const connectionStatus = useConnectionStatus(wsManager);

  return (
    <header
      className="flex h-12 items-center justify-between border-b px-5"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div>{children}</div>
      <ConnectionIndicator status={connectionStatus} url={wsUrl} />
    </header>
  );
}
```

- [ ] **Step 4: Create `shell.tsx`**

```tsx
import { Outlet } from "react-router";

interface ShellProps {
  sidebar: React.ReactNode;
  header: React.ReactNode;
}

export function Shell({ sidebar, header }: ShellProps) {
  return (
    <div className="flex h-screen" style={{ backgroundColor: "var(--bg-base)" }}>
      {sidebar}
      <div className="flex flex-1 flex-col overflow-hidden">
        {header}
        <main className="flex-1 overflow-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify types compile**

Run: `cd packages/web && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/layout
git commit -m "feat(web): add layout components — Shell, Sidebar, ProjectSidebar, Header"
```

---

### Task 11: Router and Root Layout

**Files:**
- Create: `packages/web/src/routes/root.tsx`
- Modify: `packages/web/src/main.tsx`

- [ ] **Step 1: Create `packages/web/src/routes/root.tsx`**

```tsx
import { Outlet } from "react-router";
import { Shell } from "@/components/layout/shell";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import type { WebSocketManager } from "@/hooks/use-websocket";

interface RootLayoutProps {
  wsManager: WebSocketManager;
  wsUrl: string;
}

export function RootLayout({ wsManager, wsUrl }: RootLayoutProps) {
  return (
    <Shell
      sidebar={<Sidebar />}
      header={<Header wsManager={wsManager} wsUrl={wsUrl} />}
    />
  );
}
```

- [ ] **Step 2: Update `packages/web/src/main.tsx`**

Replace the placeholder with the full app setup:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getWsUrl } from "@/lib/api-client";
import { useWebSocket } from "@/hooks/use-websocket";
import { RootLayout } from "@/routes/root";
import { ProjectLayout } from "@/routes/project-layout";
import "./theme/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
    },
  },
});

function App() {
  const wsUrl = getWsUrl();
  const wsManager = useWebSocket(wsUrl);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout wsManager={wsManager} wsUrl={wsUrl} />}>
          <Route index lazy={() => import("@/routes/dashboard")} />
          <Route path="projects" lazy={() => import("@/routes/projects/list")} />
          <Route path="agents" lazy={() => import("@/routes/agents/list")} />
          <Route path="agents/:id" lazy={() => import("@/routes/agents/detail")} />
          <Route path="events" lazy={() => import("@/routes/events")} />
        </Route>
        <Route
          path="projects/:name"
          element={<ProjectLayout wsManager={wsManager} wsUrl={wsUrl} />}
        >
          <Route index lazy={() => import("@/routes/projects/detail")} />
          <Route path="crafts/:callsign" lazy={() => import("@/routes/crafts/detail")} />
          <Route path="tower" lazy={() => import("@/routes/tower")} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 3: Create `packages/web/src/routes/project-layout.tsx`**

```tsx
import { Shell } from "@/components/layout/shell";
import { ProjectSidebar } from "@/components/layout/project-sidebar";
import { Header } from "@/components/layout/header";
import type { WebSocketManager } from "@/hooks/use-websocket";

interface ProjectLayoutProps {
  wsManager: WebSocketManager;
  wsUrl: string;
}

export function ProjectLayout({ wsManager, wsUrl }: ProjectLayoutProps) {
  return (
    <Shell
      sidebar={<ProjectSidebar />}
      header={<Header wsManager={wsManager} wsUrl={wsUrl} />}
    />
  );
}
```

- [ ] **Step 4: Create placeholder route files**

Create minimal placeholder exports for each route so the lazy imports resolve. Each file exports a `Component` function:

`packages/web/src/routes/dashboard.tsx`:
```tsx
export function Component() {
  return <div style={{ color: "var(--text-primary)" }}>Dashboard</div>;
}
```

`packages/web/src/routes/projects/list.tsx`:
```tsx
export function Component() {
  return <div style={{ color: "var(--text-primary)" }}>Projects</div>;
}
```

`packages/web/src/routes/projects/detail.tsx`:
```tsx
export function Component() {
  return <div style={{ color: "var(--text-primary)" }}>Project Detail</div>;
}
```

`packages/web/src/routes/crafts/detail.tsx`:
```tsx
export function Component() {
  return <div style={{ color: "var(--text-primary)" }}>Craft Detail</div>;
}
```

`packages/web/src/routes/agents/list.tsx`:
```tsx
export function Component() {
  return <div style={{ color: "var(--text-primary)" }}>Agents</div>;
}
```

`packages/web/src/routes/agents/detail.tsx`:
```tsx
export function Component() {
  return <div style={{ color: "var(--text-primary)" }}>Agent Detail</div>;
}
```

`packages/web/src/routes/tower.tsx`:
```tsx
export function Component() {
  return <div style={{ color: "var(--text-primary)" }}>Tower Queue</div>;
}
```

`packages/web/src/routes/events.tsx`:
```tsx
export function Component() {
  return <div style={{ color: "var(--text-primary)" }}>Event Stream</div>;
}
```

- [ ] **Step 5: Verify the app starts and sidebar navigation works**

Run: `cd packages/web && pnpm dev`
Expected: App loads with sidebar, header, and placeholder content. Clicking sidebar links navigates between routes.
Kill server after verifying.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/routes packages/web/src/main.tsx
git commit -m "feat(web): add router, root layout, project layout, and placeholder routes"
```

---

### Task 12: Dashboard Page

**Files:**
- Modify: `packages/web/src/routes/dashboard.tsx`

- [ ] **Step 1: Implement dashboard page**

Replace `packages/web/src/routes/dashboard.tsx`:

```tsx
import { useRef, useEffect, useState } from "react";
import { useStatus, useHealth } from "@/hooks/use-api";
import { StatCard } from "@/components/base/stat-card";
import { EventRow } from "@/components/base/event-row";
import { PageHeader } from "@/components/base/page-header";
import type { WsEvent } from "@/types/api";

const MAX_EVENTS = 50;

export function Component() {
  const { data: status } = useStatus();
  const { data: health } = useHealth();
  const [events, setEvents] = useState<WsEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Subscribe to firehose for recent events
  useEffect(() => {
    // Access the global WS manager to listen for events
    // For the dashboard, we collect events into a local buffer
    const handler = (e: CustomEvent<WsEvent>) => {
      setEvents((prev) => [e.detail, ...prev].slice(0, MAX_EVENTS));
    };
    window.addEventListener("atc-ws-event", handler as EventListener);
    return () => window.removeEventListener("atc-ws-event", handler as EventListener);
  }, []);

  return (
    <div>
      <PageHeader crumbs={[{ label: "Dashboard" }]} />
      <div className="mt-5 grid grid-cols-4 gap-3">
        <StatCard
          label="PROJECTS"
          value={status?.projects ?? 0}
          color="var(--accent-blue)"
        />
        <StatCard
          label="ACTIVE CRAFTS"
          value={status?.crafts ?? 0}
          color="var(--accent-green)"
        />
        <StatCard
          label="AGENTS"
          value={status?.agents ?? 0}
          color="var(--accent-purple)"
        />
        <StatCard
          label="UPTIME"
          value={health ? `${Math.floor(health.uptime / 60)}m` : "—"}
          subtitle={health?.version ? `v${health.version}` : undefined}
          color="var(--text-secondary)"
        />
      </div>

      <div
        className="mt-5 rounded-md border p-3.5"
        style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <div
          className="mb-3 text-[9px] uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          RECENT EVENTS
        </div>
        {events.length === 0 ? (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            No events yet. Events will appear here when the daemon pushes updates.
          </div>
        ) : (
          events.map((event, i) => <EventRow key={`${event.timestamp}-${i}`} event={event} />)
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify dashboard renders**

Run: `cd packages/web && pnpm dev`
Expected: Dashboard shows stat cards (with 0 values when daemon not running) and empty events panel.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/dashboard.tsx
git commit -m "feat(web): implement dashboard page with stat cards and event stream"
```

---

### Task 13: Projects List and Detail Pages

**Files:**
- Modify: `packages/web/src/routes/projects/list.tsx`
- Modify: `packages/web/src/routes/projects/detail.tsx`

- [ ] **Step 1: Implement projects list**

Replace `packages/web/src/routes/projects/list.tsx`:

```tsx
import { Link } from "react-router";
import { useProjects } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";

export function Component() {
  const { data: projects, isLoading } = useProjects();

  return (
    <div>
      <PageHeader crumbs={[{ label: "Projects" }]} />
      <div className="mt-5">
        {isLoading && (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            Loading...
          </div>
        )}
        {projects && projects.length === 0 && (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            No projects registered.
          </div>
        )}
        <div className="space-y-2">
          {projects?.map((project) => (
            <Link
              key={project.name}
              to={`/projects/${project.name}`}
              className="block rounded-md border p-3.5 no-underline"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {project.name}
                  </span>
                  <div className="mt-1 text-[10px]" style={{ color: "var(--text-dim)" }}>
                    {project.remoteUrl}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {project.categories.map((cat) => (
                    <span
                      key={cat}
                      className="rounded-sm px-1.5 py-0.5 text-[10px]"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement project detail**

Replace `packages/web/src/routes/projects/detail.tsx`:

```tsx
import { useParams, Link } from "react-router";
import { useProject, useCrafts, useTowerQueue } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import { FlightStrip } from "@/components/base/flight-strip";
import { StatCard } from "@/components/base/stat-card";

export function Component() {
  const { name } = useParams<{ name: string }>();
  const { data: project } = useProject(name!);
  const { data: crafts } = useCrafts(name!);
  const { data: queue } = useTowerQueue(name!);

  const activeCrafts = crafts?.filter(
    (c) => c.status !== "Landed" && c.status !== "ReturnToOrigin",
  );

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Projects", to: "/projects" }, { label: name! }]}
      />
      <div className="mt-5">
        {/* Project info */}
        {project && (
          <div
            className="mb-5 rounded-md border p-3.5"
            style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
          >
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {project.name}
            </div>
            <div className="mt-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
              {project.remoteUrl}
            </div>
            <div className="mt-2 flex gap-1.5">
              {project.categories.map((cat) => (
                <span
                  key={cat}
                  className="rounded-sm px-1.5 py-0.5 text-[10px]"
                  style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }}
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="mb-5 grid grid-cols-3 gap-3">
          <StatCard label="CRAFTS" value={crafts?.length ?? 0} color="var(--accent-green)" />
          <StatCard
            label="ACTIVE"
            value={activeCrafts?.length ?? 0}
            color="var(--accent-blue)"
          />
          <StatCard
            label="TOWER QUEUE"
            value={queue?.length ?? 0}
            color="var(--accent-yellow)"
          />
        </div>

        {/* Crafts */}
        <div
          className="rounded-md border p-3.5"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div
            className="mb-3 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            CRAFTS
          </div>
          {crafts && crafts.length === 0 && (
            <div className="py-4 text-center text-xs" style={{ color: "var(--text-dim)" }}>
              No crafts in this project.
            </div>
          )}
          <div className="space-y-2">
            {crafts?.map((craft) => (
              <FlightStrip key={craft.callsign} craft={craft} project={name!} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify pages render**

Run: `cd packages/web && pnpm dev`
Expected: Projects list and detail pages render with proper layout.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/routes/projects
git commit -m "feat(web): implement projects list and project detail pages"
```

---

### Task 14: Craft Detail Page

**Files:**
- Modify: `packages/web/src/routes/crafts/detail.tsx`

- [ ] **Step 1: Implement craft detail**

Replace `packages/web/src/routes/crafts/detail.tsx`:

```tsx
import { useParams } from "react-router";
import { useCraft, useCraftBlackBox, useCraftIntercom, useCraftVectors } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import { StatusBadge } from "@/components/base/status-badge";
import { VectorProgress } from "@/components/base/vector-progress";
import { CrewMember } from "@/components/base/crew-member";
import { BlackBoxEntryRow } from "@/components/base/black-box-entry";
import { IntercomMessage } from "@/components/base/intercom-message";

export function Component() {
  const { name, callsign } = useParams<{ name: string; callsign: string }>();
  const { data: craft } = useCraft(name!, callsign!);
  const { data: blackBox } = useCraftBlackBox(name!, callsign!);
  const { data: intercom } = useCraftIntercom(name!, callsign!);
  const { data: vectors } = useCraftVectors(name!, callsign!);

  if (!craft) {
    return (
      <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
        Loading...
      </div>
    );
  }

  const passedCount = craft.flightPlan.filter((v) => v.status === "Passed").length;

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: "Projects", to: "/projects" },
          { label: name!, to: `/projects/${name}` },
          { label: "Crafts", to: `/projects/${name}` },
          { label: callsign! },
        ]}
      />

      {/* Craft header */}
      <div
        className="mt-5 flex items-start justify-between border-b pb-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              {craft.callsign}
            </span>
            <StatusBadge status={craft.status} />
          </div>
          <div className="mt-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
            branch: {craft.branch} · category: {craft.category}
          </div>
          <div className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {craft.cargo}
          </div>
        </div>
        <div className="text-right text-[11px]" style={{ color: "var(--text-dim)" }}>
          <div>
            Controls:{" "}
            <span style={{ color: "var(--accent-green)" }}>
              {craft.controls.mode.toUpperCase()}
            </span>
          </div>
          {craft.controls.holder && (
            <div className="mt-0.5">
              Holder:{" "}
              <span style={{ color: "var(--text-secondary)" }}>{craft.controls.holder}</span>
            </div>
          )}
        </div>
      </div>

      {/* Two-column: Crew + Flight Plan */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        {/* Crew */}
        <div
          className="rounded-md border p-3.5"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div
            className="mb-2.5 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            CREW
          </div>
          <div className="space-y-2">
            <CrewMember identifier={craft.captain} seat="captain" />
            {craft.firstOfficers.map((fo) => (
              <CrewMember key={fo} identifier={fo} seat="firstOfficer" />
            ))}
            {craft.jumpseaters.map((js) => (
              <CrewMember key={js} identifier={js} seat="jumpseat" />
            ))}
          </div>
        </div>

        {/* Flight Plan */}
        <div
          className="rounded-md border p-3.5"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div
            className="mb-2.5 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            FLIGHT PLAN
          </div>
          <VectorProgress vectors={craft.flightPlan} />
          <div className="mb-3 mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            {passedCount} of {craft.flightPlan.length} vectors passed
          </div>
          <div className="space-y-1.5">
            {(vectors ?? craft.flightPlan).map((v) => (
              <div
                key={v.name}
                className="flex items-center justify-between rounded-md p-2"
                style={{ backgroundColor: "var(--bg-elevated)" }}
              >
                <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  {v.name}
                </span>
                <StatusBadge status={v.status} variant="vector" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Black Box */}
      <div
        className="mt-4 rounded-md border p-3.5"
        style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <div
          className="mb-2.5 text-[9px] uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          BLACK BOX
        </div>
        {(!blackBox || blackBox.length === 0) ? (
          <div className="py-4 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            No black box entries.
          </div>
        ) : (
          [...blackBox].reverse().map((entry, i) => (
            <BlackBoxEntryRow key={`${entry.timestamp}-${i}`} entry={entry} />
          ))
        )}
      </div>

      {/* Intercom */}
      <div
        className="mt-4 rounded-md border p-3.5"
        style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <div
          className="mb-2.5 text-[9px] uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          INTERCOM
        </div>
        {(!intercom || intercom.length === 0) ? (
          <div className="py-4 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            No intercom messages.
          </div>
        ) : (
          <div className="space-y-2">
            {intercom.map((msg, i) => (
              <IntercomMessage key={`${msg.timestamp}-${i}`} message={msg} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify page renders**

Run: `cd packages/web && pnpm dev`
Navigate to a craft detail URL. Expected: loading state renders, all sections present.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/crafts/detail.tsx
git commit -m "feat(web): implement craft detail page with crew, vectors, black box, intercom"
```

---

### Task 15: Agents List and Detail Pages

**Files:**
- Modify: `packages/web/src/routes/agents/list.tsx`
- Modify: `packages/web/src/routes/agents/detail.tsx`

- [ ] **Step 1: Implement agents list**

Replace `packages/web/src/routes/agents/list.tsx`:

```tsx
import { Link } from "react-router";
import { useAgents } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import { StatusBadge } from "@/components/base/status-badge";

export function Component() {
  const { data: agents, isLoading } = useAgents();

  return (
    <div>
      <PageHeader crumbs={[{ label: "Agents" }]} />
      <div className="mt-5">
        {isLoading && (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            Loading...
          </div>
        )}
        {agents && agents.length === 0 && (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            No agents registered.
          </div>
        )}
        <div className="space-y-2">
          {agents?.map((agent) => (
            <Link
              key={agent.id}
              to={`/agents/${agent.id}`}
              className="block rounded-md border p-3.5 no-underline"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {agent.id}
                  </span>
                  <StatusBadge status={agent.status} variant="agent" />
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                  {agent.adapterType}
                </div>
              </div>
              <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                project: {agent.projectName} · craft: {agent.callsign}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement agent detail**

Replace `packages/web/src/routes/agents/detail.tsx`:

```tsx
import { useParams } from "react-router";
import { useAgent, useAgentUsage } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import { StatusBadge } from "@/components/base/status-badge";
import { StatCard } from "@/components/base/stat-card";

export function Component() {
  const { id } = useParams<{ id: string }>();
  const { data: agent } = useAgent(id!);
  const { data: usage } = useAgentUsage(id!);

  if (!agent) {
    return (
      <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
        Loading...
      </div>
    );
  }

  const latestUsage = usage && usage.length > 0 ? usage[usage.length - 1] : null;

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Agents", to: "/agents" }, { label: id! }]}
      />

      {/* Agent header */}
      <div
        className="mt-5 flex items-start justify-between border-b pb-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              {agent.id}
            </span>
            <StatusBadge status={agent.status} variant="agent" />
          </div>
          <div className="mt-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
            adapter: {agent.adapterType} · project: {agent.projectName} · craft:{" "}
            {agent.callsign}
          </div>
          {agent.pid && (
            <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-dim)" }}>
              PID: {agent.pid}
            </div>
          )}
        </div>
      </div>

      {/* Usage stats */}
      {latestUsage && (
        <div className="mt-4">
          <div
            className="mb-3 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            LATEST USAGE
          </div>
          <div className="grid grid-cols-4 gap-3">
            <StatCard
              label="INPUT TOKENS"
              value={latestUsage.tokens.input.toLocaleString()}
              color="var(--accent-blue)"
            />
            <StatCard
              label="OUTPUT TOKENS"
              value={latestUsage.tokens.output.toLocaleString()}
              color="var(--accent-green)"
            />
            <StatCard
              label="TOOL CALLS"
              value={latestUsage.tools.reduce((sum, t) => sum + t.calls, 0)}
              color="var(--accent-yellow)"
            />
            <StatCard
              label="DURATION"
              value={`${Math.floor(latestUsage.duration / 1000)}s`}
              color="var(--text-secondary)"
            />
          </div>
        </div>
      )}

      {/* Usage history */}
      {usage && usage.length > 0 && (
        <div
          className="mt-4 rounded-md border p-3.5"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div
            className="mb-2.5 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            USAGE HISTORY
          </div>
          <div className="space-y-1">
            {[...usage].reverse().map((report, i) => (
              <div
                key={`${report.timestamp}-${i}`}
                className="flex items-center justify-between rounded-md p-2 text-[11px]"
                style={{ backgroundColor: "var(--bg-elevated)" }}
              >
                <span style={{ color: "var(--text-dim)" }}>
                  {new Date(report.timestamp).toLocaleString()}
                </span>
                <span style={{ color: "var(--text-muted)" }}>
                  {report.tokens.input + report.tokens.output} tokens ·{" "}
                  {Math.floor(report.duration / 1000)}s
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/agents
git commit -m "feat(web): implement agents list and agent detail pages"
```

---

### Task 16: Tower Queue Page

**Files:**
- Modify: `packages/web/src/routes/tower.tsx`

- [ ] **Step 1: Implement tower page**

Replace `packages/web/src/routes/tower.tsx`:

```tsx
import { useParams } from "react-router";
import { useTowerQueue, useCrafts } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import { QueueCard } from "@/components/base/queue-card";

export function Component() {
  const { name } = useParams<{ name: string }>();
  const { data: queue } = useTowerQueue(name!);
  const { data: crafts } = useCrafts(name!);

  const craftMap = new Map(crafts?.map((c) => [c.callsign, c]) ?? []);

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: "Projects", to: "/projects" },
          { label: name!, to: `/projects/${name}` },
          { label: "Tower Queue" },
        ]}
      />

      <div className="mt-5">
        <div
          className="mb-3 text-[9px] uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          MERGE QUEUE — {name?.toUpperCase()}
        </div>

        {(!queue || queue.length === 0) ? (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            Queue is empty. No crafts awaiting clearance.
          </div>
        ) : (
          <div className="flex items-start gap-3">
            {queue.map((callsign, i) => {
              const craft = craftMap.get(callsign);
              if (!craft) return null;

              const isCleared = craft.status === "ClearedToLand";
              const label = isCleared ? "CLEARED" : "CHECKING";

              return (
                <div key={callsign} className="flex items-start gap-3">
                  {i > 0 && (
                    <div
                      className="pt-10 text-xl"
                      style={{ color: "var(--text-dim)" }}
                    >
                      →
                    </div>
                  )}
                  <QueueCard position={i + 1} craft={craft} label={label} />
                </div>
              );
            })}

            {/* Runway */}
            <div className="flex items-start gap-3">
              <div className="pt-10 text-xl" style={{ color: "var(--text-dim)" }}>
                →
              </div>
              <div
                className="flex min-h-[120px] flex-[0.6] flex-col items-center justify-center rounded-md border p-3.5"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border)",
                }}
              >
                <div
                  className="text-[9px] uppercase tracking-widest"
                  style={{ color: "var(--text-dim)" }}
                >
                  RUNWAY
                </div>
                <div className="mt-2 text-2xl" style={{ color: "var(--border)" }}>
                  ⊘
                </div>
                <div className="mt-1 text-[10px]" style={{ color: "var(--text-dim)" }}>
                  main branch
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/routes/tower.tsx
git commit -m "feat(web): implement tower queue page with pipeline visualization"
```

---

### Task 17: Event Firehose Page

**Files:**
- Modify: `packages/web/src/routes/events.tsx`

- [ ] **Step 1: Implement events page**

Replace `packages/web/src/routes/events.tsx`:

```tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/base/page-header";
import { EventRow } from "@/components/base/event-row";
import { FilterPills } from "@/components/base/filter-pills";
import { StatusBadge } from "@/components/base/status-badge";
import type { WsEvent } from "@/types/api";

const MAX_EVENTS = 500;
const CATEGORIES = ["craft", "tower", "agent", "controls"];

export function Component() {
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(CATEGORIES));
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen for WS events
  useEffect(() => {
    const handler = (e: CustomEvent<WsEvent>) => {
      setEvents((prev) => [e.detail, ...prev].slice(0, MAX_EVENTS));
    };
    window.addEventListener("atc-ws-event", handler as EventListener);
    return () => window.removeEventListener("atc-ws-event", handler as EventListener);
  }, []);

  const filteredEvents = events.filter((event) => {
    const category = event.channel.split(":")[0];
    return activeFilters.has(category);
  });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        crumbs={[{ label: "Event Stream" }]}
        right={
          <div className="flex items-center gap-3">
            <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
              {events.length} events
            </span>
            <span
              className="rounded-sm border px-2 py-0.5 text-[10px]"
              style={{
                color: "var(--accent-green)",
                backgroundColor: "color-mix(in srgb, var(--accent-green) 10%, transparent)",
                borderColor: "color-mix(in srgb, var(--accent-green) 20%, transparent)",
              }}
            >
              ● STREAMING
            </span>
          </div>
        }
      />

      {/* Filters */}
      <div
        className="flex items-center justify-between border-b px-5 py-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <FilterPills
          categories={CATEGORIES}
          active={activeFilters}
          onChange={setActiveFilters}
        />
      </div>

      {/* Event list */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-5 py-2">
        {filteredEvents.length === 0 ? (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            No events yet. Events will stream here in real time.
          </div>
        ) : (
          filteredEvents.map((event, i) => (
            <EventRow key={`${event.timestamp}-${i}`} event={event} />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/routes/events.tsx
git commit -m "feat(web): implement event firehose page with category filtering"
```

---

### Task 18: Wire WebSocket Events to Dashboard and Events Pages

**Files:**
- Modify: `packages/web/src/main.tsx`

The dashboard and events pages currently listen for `atc-ws-event` custom DOM events. We need to dispatch those from the WebSocket manager.

- [ ] **Step 1: Update `main.tsx` to bridge WS events to DOM events**

Add the event bridge after `useWebSocket`:

```tsx
// In the App function, after useWebSocket:
import { useEffect } from "react";

function App() {
  const wsUrl = getWsUrl();
  const wsManager = useWebSocket(wsUrl);

  // Bridge WS events to DOM CustomEvents for event-driven pages
  useEffect(() => {
    return wsManager.onEvent((event) => {
      window.dispatchEvent(new CustomEvent("atc-ws-event", { detail: event }));
    });
  }, [wsManager]);

  // ... rest of router
}
```

Update the existing `main.tsx` to include this `useEffect` inside the `App` function, between the `useWebSocket` call and the `return` statement with `<BrowserRouter>`.

- [ ] **Step 2: Add WS subscriptions to pages that need live updates**

Add `useSubscription` calls to the pages that should receive live updates. In each route component that fetches data, import and call `useSubscription` with the appropriate channel.

For example, in `packages/web/src/routes/projects/detail.tsx`, add:

```tsx
import { useSubscription } from "@/hooks/use-subscription";
// Inside Component(), after getting wsManager from context or props:
useSubscription(wsManager, `project:${name}`);
```

Since the `wsManager` is not directly available in route components (it lives in `main.tsx`), create a simple React context to share it.

Create `packages/web/src/hooks/ws-context.tsx`:

```tsx
import { createContext, useContext } from "react";
import type { WebSocketManager } from "./use-websocket";

const WsContext = createContext<WebSocketManager | null>(null);

export const WsProvider = WsContext.Provider;

export function useWsManager(): WebSocketManager {
  const manager = useContext(WsContext);
  if (!manager) throw new Error("useWsManager must be used within WsProvider");
  return manager;
}
```

Then wrap the router in `main.tsx` with `<WsProvider value={wsManager}>`.

- [ ] **Step 3: Update `main.tsx` with WsProvider**

The full updated `App` function:

```tsx
import { WsProvider } from "@/hooks/ws-context";

function App() {
  const wsUrl = getWsUrl();
  const wsManager = useWebSocket(wsUrl);

  useEffect(() => {
    return wsManager.onEvent((event) => {
      window.dispatchEvent(new CustomEvent("atc-ws-event", { detail: event }));
    });
  }, [wsManager]);

  return (
    <WsProvider value={wsManager}>
      <BrowserRouter>
        <Routes>
          <Route element={<RootLayout wsManager={wsManager} wsUrl={wsUrl} />}>
            <Route index lazy={() => import("@/routes/dashboard")} />
            <Route path="projects" lazy={() => import("@/routes/projects/list")} />
            <Route path="agents" lazy={() => import("@/routes/agents/list")} />
            <Route path="agents/:id" lazy={() => import("@/routes/agents/detail")} />
            <Route path="events" lazy={() => import("@/routes/events")} />
          </Route>
          <Route
            path="projects/:name"
            element={<ProjectLayout wsManager={wsManager} wsUrl={wsUrl} />}
          >
            <Route index lazy={() => import("@/routes/projects/detail")} />
            <Route path="crafts/:callsign" lazy={() => import("@/routes/crafts/detail")} />
            <Route path="tower" lazy={() => import("@/routes/tower")} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WsProvider>
  );
}
```

- [ ] **Step 4: Add useSubscription to project detail, craft detail, and tower pages**

In each route component, add the appropriate subscription. Example for craft detail:

```tsx
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";

export function Component() {
  const { name, callsign } = useParams<{ name: string; callsign: string }>();
  const wsManager = useWsManager();
  useSubscription(wsManager, `craft:${callsign}`);
  // ... rest of component
}
```

Similarly for project detail (`project:${name}`) and tower (`tower`).

- [ ] **Step 5: Verify live updates work end-to-end**

Run: `cd packages/web && pnpm dev`
Expected: App loads, WS connects (or shows reconnecting if daemon isn't running).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src
git commit -m "feat(web): wire WebSocket events to pages via context and subscriptions"
```

---

### Task 19: Final Verification and Cleanup

**Files:**
- Various (lint, format, type-check)

- [ ] **Step 1: Type-check the entire web package**

Run: `cd packages/web && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 2: Run all web tests**

Run: `pnpm run test -- packages/web`
Expected: All tests pass.

- [ ] **Step 3: Run lint**

Run: `pnpm run lint`
Expected: No errors (or fix any that appear).

- [ ] **Step 4: Run format**

Run: `pnpm run format`
Expected: Files formatted.

- [ ] **Step 5: Verify dev server starts clean**

Run: `cd packages/web && pnpm dev`
Expected: App starts with no console errors. All routes navigable. Sidebar context-switching works.

- [ ] **Step 6: Verify production build**

Run: `cd packages/web && pnpm build`
Expected: Vite build completes with no errors.

- [ ] **Step 7: Commit any final fixes**

```bash
git add -A
git commit -m "chore(web): final cleanup — lint, format, type-check all green"
```
