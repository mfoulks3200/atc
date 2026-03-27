# @atc/web — ATC Dashboard Design Spec

## Overview

A React-based dashboard for monitoring and inspecting the ATC daemon. Aimed at developers and operators — focused on observability, not agent interaction. Aviation-themed dark UI with radar-green accents, monospace typography, and flight-strip-inspired data displays.

## Tech Stack

- **Vite** — build tool and dev server
- **React 19** + **React Router v7** — SPA with nested layouts
- **TanStack Query** — REST data fetching, caching, cache invalidation
- **shadcn/ui** + **Tailwind CSS** — component primitives and utility styling
- **Native WebSocket** — real-time updates via daemon WS protocol

The package lives at `packages/web/` in the monorepo. It has no dependency on `@atc/types` — it defines its own API response types to stay decoupled.

## Visual Direction

### Theme

Dark aviation-inspired palette with data-dense, monospace layouts.

**Color tokens (CSS custom properties in `theme/variables.css`):**

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#0a0f1a` | Page background |
| `--bg-surface` | `#0d1424` | Cards, sidebar, header |
| `--bg-elevated` | `#162033` | Nested elements, hover states |
| `--border` | `#1a2744` | All borders |
| `--text-primary` | `#e0e8f0` | Headings, callsigns |
| `--text-secondary` | `#c8d6e5` | Body text |
| `--text-muted` | `#7a8ba8` | Supporting text |
| `--text-dim` | `#4a6fa5` | Labels, timestamps |
| `--accent-green` | `#00ff88` | Active, healthy, passed |
| `--accent-yellow` | `#ffd866` | Warning, in-progress, checking |
| `--accent-red` | `#ff5555` | Emergency, failed |
| `--accent-blue` | `#78b4ff` | Info, first officer |
| `--accent-purple` | `#b48eff` | Agent-related |

**Typography:** `JetBrains Mono` → `Fira Code` → system monospace fallback. Uppercase letter-spaced labels for section headers.

### Semantic Token Mappings (`theme/tokens.ts`)

Status-to-color mappings exported for JS usage:

- `STATUS_COLORS` — maps `CraftStatus` values to accent colors (e.g., `InFlight → accent-green`, `LandingChecklist → accent-yellow`, `Emergency → accent-red`)
- `EVENT_COLORS` — maps event categories to colors (e.g., `craft → green`, `tower → yellow`, `agent → purple`, `controls → blue`)
- `SEAT_COLORS` — maps seat types to colors (e.g., `Captain → green`, `FirstOfficer → blue`, `Jumpseat → dim`)

### Design Elements

- Flight-strip cards with left-border color indicating status
- Segmented vector progress bars
- Timestamps in `HH:MM:SS` format
- Compact stat cards with label/value/subtitle
- Color-coded badges for all status enums
- Chat-style intercom messages

## Architecture

### Package Structure

```
packages/web/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── components.json           # shadcn config
└── src/
    ├── main.tsx              # providers, router mount
    ├── theme/
    │   ├── variables.css     # CSS custom properties
    │   ├── globals.css       # tailwind imports, base resets, font
    │   └── tokens.ts         # semantic status→color maps
    ├── components/
    │   ├── ui/               # shadcn primitives
    │   ├── base/             # themed building blocks
    │   └── layout/           # Shell, Sidebar, Header
    ├── hooks/
    │   ├── use-api.ts        # typed TanStack Query hooks
    │   ├── use-websocket.ts  # WS connection manager
    │   └── use-subscription.ts # channel sub → cache update
    ├── lib/
    │   ├── api-client.ts     # fetch wrapper, base URL config
    │   └── query-keys.ts     # TanStack Query key factory
    ├── routes/
    │   ├── root.tsx          # Root layout
    │   ├── dashboard.tsx
    │   ├── projects/
    │   │   ├── list.tsx
    │   │   └── detail.tsx
    │   ├── crafts/
    │   │   └── detail.tsx
    │   ├── agents/
    │   │   ├── list.tsx
    │   │   └── detail.tsx
    │   ├── tower.tsx
    │   └── events.tsx
    └── types/
        └── api.ts            # response types for daemon API
```

### Base Components

All base components read colors from CSS variables or `tokens.ts` — never hardcoded values. Changing the theme means updating `variables.css` and `tokens.ts`.

| Component | Purpose |
|-----------|---------|
| `StatusBadge` | Colored pill for any status enum (craft, vector, agent) |
| `StatCard` | Metric card: label, value, subtitle |
| `FlightStrip` | Craft summary: status border, callsign, crew, vector progress |
| `VectorProgress` | Segmented bar for flight plan completion |
| `EventRow` | Event line: timestamp, category badge, event name, details |
| `BlackBoxEntry` | Log entry: timestamp, type badge, author, content |
| `IntercomMessage` | Chat-style message with pilot seat-color |
| `CrewMember` | Pilot row: seat type indicator, name, certifications |
| `QueueCard` | Tower queue position: checklist status, vector status, branch freshness |
| `PageHeader` | Title + breadcrumbs + optional right-side slot |
| `ConnectionIndicator` | WebSocket status pill (connected/disconnected/reconnecting) |
| `FilterPills` | Toggleable category filters |

## Routing & Navigation

### Routes

```
/                                          → Dashboard
/projects                                  → Projects list
/projects/:name                            → Project detail
/projects/:name/crafts/:callsign           → Craft detail
/projects/:name/tower                      → Tower queue
/agents                                    → Agents list
/agents/:id                                → Agent detail
/events                                    → Event firehose
```

### Layout Nesting

```
<RootLayout>                  ← Shell: Header + Sidebar + Outlet
  <DashboardPage />
  <ProjectsListPage />
  <ProjectLayout>             ← Swaps sidebar to project-scoped nav
    <ProjectDetailPage />
    <CraftDetailPage />
    <TowerPage />
  </ProjectLayout>
  <AgentsListPage />
  <AgentDetailPage />
  <EventsPage />
</RootLayout>
```

### Sidebar Behavior

**System context** (default — outside `/projects/:name`):
- Dashboard
- Projects
- Agents
- Event Stream

**Project context** (inside `/projects/:name/*`):
- ← Back to Projects
- Section header showing project name
- Overview
- Crafts (with count badge)
- Tower Queue (with count badge)

Transition is route-driven: `ProjectLayout` renders the project sidebar variant. No global state needed.

### Header

- **Left:** Breadcrumb trail (e.g., `Projects / acme-app / Crafts / fix-auth`)
- **Right:** WebSocket connection indicator + daemon URL

## Data Flow

### REST Layer (TanStack Query)

**`lib/api-client.ts`** — configured fetch wrapper with base URL, error handling, typed responses. Base URL is read from `VITE_DAEMON_URL` environment variable, defaulting to `http://localhost:3100`. WebSocket URL is derived from the same base (replacing `http` with `ws`).

**`lib/query-keys.ts`** — key factory for cache management:
```
queryKeys.projects.list()
queryKeys.projects.detail(name)
queryKeys.crafts.list(projectName)
queryKeys.crafts.detail(projectName, callsign)
queryKeys.agents.list()
queryKeys.agents.detail(id)
queryKeys.tower.queue(projectName)
queryKeys.health()
queryKeys.status()
```

**`hooks/use-api.ts`** — typed hooks wrapping TanStack Query:
- `useProjects()`, `useProject(name)`
- `useCrafts(project)`, `useCraft(project, callsign)`
- `useAgents()`, `useAgent(id)`
- `useTowerQueue(project)`
- `useCraftBlackBox(project, callsign)`
- `useCraftIntercom(project, callsign)`
- `useCraftVectors(project, callsign)`
- `useHealth()`, `useStatus()`

### WebSocket Layer

**`hooks/use-websocket.ts`** — singleton connection manager:
- Connects on app mount
- Auto-reconnect with exponential backoff
- Responds to server pings with pongs
- Exposes connection status (`connected`, `disconnected`, `reconnecting`) for the header indicator

**`hooks/use-subscription.ts`** — per-component channel subscriptions:
- Subscribes on mount, unsubscribes on unmount
- On event received: if payload contains full entity → `queryClient.setQueryData()` (direct cache write, no network request). If partial/notification-only → `queryClient.invalidateQueries()` (triggers refetch).

### Channel Subscriptions by Page

| Page | Channel |
|------|---------|
| Dashboard | `*` (firehose, buffered to recent N) |
| Project detail | `project:<name>` |
| Craft detail | `craft:<callsign>` |
| Tower queue | `tower` |
| Agents list | `agent:*` |
| Agent detail | `agent:<id>` |
| Event firehose | `*` |

### Event-Only Pages

The **Dashboard recent events** list and **Event firehose** page are built entirely from the WebSocket stream — events accumulate into a local buffer with no REST backing.

## Page Designs

### Dashboard (`/`)

- **Top row:** 4 stat cards — Active Crafts, Tower Queue depth, Agents count, Emergencies count
- **Bottom row (2 columns):**
  - Recent Events — last N events from WebSocket firehose, each as an EventRow
  - Active Crafts — FlightStrip cards for all non-terminal crafts across all projects

### Projects List (`/projects`)

- Table of registered projects: name, remote URL, active craft count, categories
- Click row to navigate to project detail

### Project Detail (`/projects/:name`)

- Project header: name, remote URL, categories
- Crafts table: all crafts for this project as FlightStrip cards, grouped by status
- Tower queue summary: count + link to full tower page
- Project config display: checklist items, MCP servers

### Craft Detail (`/projects/:name/crafts/:callsign`)

- **Header:** Callsign, status badge, branch, category, cargo, controls state + holder
- **Two-column layout:**
  - Crew panel: captain, first officers, jumpseaters with seat-type color coding
  - Flight plan: VectorProgress bar + ordered vector list with status
- **Black box:** Timestamped, type-badged log (scrollable, newest first)
- **Intercom:** Chat-style message display (read-only)

### Tower Queue (`/projects/:name/tower`)

- Horizontal pipeline visualization: QueueCards flowing left-to-right toward "runway" (main branch)
- Each card shows: craft name, cargo, captain, vector completion, checklist status, branch freshness
- Color-coded borders: green = cleared, yellow = checking

### Agents List (`/agents`)

- Table: agent ID, status (active/paused), assigned crafts, usage summary
- Click row to navigate to agent detail

### Agent Detail (`/agents/:id`)

- Agent header: ID, status badge, pause/resume state
- Assigned crafts list (as FlightStrip cards)
- Usage report display

### Event Firehose (`/events`)

- FilterPills bar: ALL, craft, tower, agent, controls (toggleable)
- Streaming indicator + event count
- Scrolling list of EventRows: timestamp, category badge, event name, details, channel
- Auto-scrolls to newest, pauses on user scroll-up
- Built entirely from WebSocket `*` subscription, no REST
