# Web Creation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add creation interfaces (projects, pilots, crafts) and craft category management to the web dashboard.

**Architecture:** Mutation hooks in `use-api.ts` using TanStack Query's `useMutation`, a shared `FormModal` component for simple forms, modal-based creation for projects and pilots, dedicated page for craft creation with crew assignment and flight plan builder.

**Tech Stack:** React, TanStack Query, React Router, Tailwind CSS, CSS custom properties (existing stack, no new dependencies)

---

## File Structure

**New files:**
- `packages/web/src/components/ui/form-modal.tsx` — Shared modal dialog shell
- `packages/web/src/components/forms/create-project-modal.tsx` — Project creation form
- `packages/web/src/components/forms/create-pilot-modal.tsx` — Pilot creation form
- `packages/web/src/routes/crafts/create.tsx` — Craft creation page

**Modified files:**
- `packages/web/src/hooks/use-api.ts` — Add mutation hooks + `usePilots` query
- `packages/web/src/lib/query-keys.ts` — Add `pilots` query key
- `packages/web/src/routes/projects/list.tsx` — Add "+ New Project" button + wire modal
- `packages/web/src/routes/projects/detail.tsx` — Add "+ New Pilot" and "+ New Craft" buttons + wire modal
- `packages/web/src/main.tsx` — Register `crafts/create` route

---

### Task 1: Add Query Keys and Mutation Hooks

**Files:**
- Modify: `packages/web/src/lib/query-keys.ts`
- Modify: `packages/web/src/hooks/use-api.ts`

- [ ] **Step 1: Add pilots query key to query-keys.ts**

Add a `pilots` entry to the `queryKeys` object:

```typescript
pilots: {
  list: (project: string) => ["pilots", project] as const,
},
```

Place it after the `projects` block and before the `crafts` block.

- [ ] **Step 2: Add usePilots query hook and mutation hooks to use-api.ts**

Add the following imports at the top of `use-api.ts` alongside the existing ones:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
```

(Replace the existing `import { useQuery }` line.)

Add `PilotRecord` to the existing type import from `@/types/api`.

Add these hooks after the existing `useTowerQueue` hook and before the checklist imports:

```typescript
export function usePilots(project: string) {
  return useQuery({
    queryKey: queryKeys.pilots.list(project),
    queryFn: () => apiClient.get<PilotRecord[]>(`/api/v1/projects/${project}/pilots`),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      remoteUrl: string;
      categories: string[];
      checklist: Array<{ name: string; command: string; timeout?: number }>;
      mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
    }) => apiClient.post<ProjectMetadata>("/api/v1/projects", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
    },
  });
}

export function useCreatePilot(project: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { identifier: string; certifications: string[] }) =>
      apiClient.post<PilotRecord>(`/api/v1/projects/${project}/pilots`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pilots.list(project) });
    },
  });
}

export function useCreateCraft(project: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      callsign: string;
      branch: string;
      cargo: string;
      category: string;
      captain: string;
      firstOfficers?: string[];
      jumpseaters?: string[];
      flightPlan: Array<{ name: string; acceptanceCriteria: string }>;
    }) => apiClient.post<CraftState>(`/api/v1/projects/${project}/crafts`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crafts.list(project) });
    },
  });
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/query-keys.ts packages/web/src/hooks/use-api.ts
git commit -m "feat(web): add mutation hooks for project, pilot, and craft creation"
```

---

### Task 2: FormModal Component

**Files:**
- Create: `packages/web/src/components/ui/form-modal.tsx`

- [ ] **Step 1: Create the FormModal component**

```tsx
import { useEffect, useRef, type ReactNode } from "react";

interface FormModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  onSubmit: () => void;
  isPending: boolean;
  error: string | null;
  children: ReactNode;
}

export function FormModal({ open, onClose, title, onSubmit, isPending, error, children }: FormModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-md border p-0"
        style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </span>
          <button
            onClick={onClose}
            className="text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3">
          {children}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-3 rounded-md px-3 py-2 text-xs" style={{ backgroundColor: "rgba(255, 85, 85, 0.1)", color: "var(--accent-red)" }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div
          className="flex justify-end gap-2 border-t px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-xs"
            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
            style={{
              backgroundColor: isPending ? "var(--bg-elevated)" : "var(--accent-green)",
              color: isPending ? "var(--text-muted)" : "var(--bg-base)",
            }}
          >
            {isPending ? "Saving..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/ui/form-modal.tsx
git commit -m "feat(web): add FormModal shared component"
```

---

### Task 3: Create Project Modal

**Files:**
- Create: `packages/web/src/components/forms/create-project-modal.tsx`
- Modify: `packages/web/src/routes/projects/list.tsx`

- [ ] **Step 1: Create the CreateProjectModal component**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { useCreateProject } from "@/hooks/use-api";
import { FormModal } from "@/components/ui/form-modal";

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
}

const inputStyle = {
  backgroundColor: "var(--bg-elevated)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

const labelStyle = { color: "var(--text-muted)" };

export function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const [name, setName] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryInput, setCategoryInput] = useState("");

  function reset() {
    setName("");
    setRemoteUrl("");
    setCategories([]);
    setCategoryInput("");
    createProject.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  function addCategory() {
    const trimmed = categoryInput.trim();
    if (trimmed && !categories.includes(trimmed)) {
      setCategories([...categories, trimmed]);
    }
    setCategoryInput("");
  }

  function removeCategory(cat: string) {
    setCategories(categories.filter((c) => c !== cat));
  }

  function handleSubmit() {
    if (!name.trim() || !remoteUrl.trim()) return;
    createProject.mutate(
      {
        name: name.trim(),
        remoteUrl: remoteUrl.trim(),
        categories,
        checklist: [],
      },
      {
        onSuccess: () => {
          const projectName = name.trim();
          reset();
          onClose();
          navigate(`/projects/${projectName}`);
        },
      },
    );
  }

  return (
    <FormModal
      open={open}
      onClose={handleClose}
      title="New Project"
      onSubmit={handleSubmit}
      isPending={createProject.isPending}
      error={createProject.error?.message ?? null}
    >
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-project"
          className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
          Remote URL
        </label>
        <input
          type="text"
          value={remoteUrl}
          onChange={(e) => setRemoteUrl(e.target.value)}
          placeholder="https://github.com/org/repo.git"
          className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
          Categories
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCategory();
              }
            }}
            placeholder="e.g. feature, bugfix"
            className="flex-1 rounded-md border px-3 py-1.5 text-xs outline-none"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={addCategory}
            className="rounded-md px-2.5 py-1.5 text-xs"
            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}
          >
            Add
          </button>
        </div>
        {categories.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <span
                key={cat}
                className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px]"
                style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }}
              >
                {cat}
                <button
                  type="button"
                  onClick={() => removeCategory(cat)}
                  className="text-[10px]"
                  style={{ color: "var(--text-dim)" }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </FormModal>
  );
}
```

- [ ] **Step 2: Add the "+ New Project" button and modal to the projects list page**

Replace the full content of `packages/web/src/routes/projects/list.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { useProjects } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import { CreateProjectModal } from "@/components/forms/create-project-modal";

export function Component() {
  const { data: projects, isLoading } = useProjects();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Projects" }]}
        right={
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
          >
            + New Project
          </button>
        }
      />
      <div className="mt-5">
        {isLoading && (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>Loading...</div>
        )}
        {projects && projects.length === 0 && (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>No projects registered.</div>
        )}
        <div className="space-y-2">
          {projects?.map((project) => (
            <Link
              key={project.name}
              to={`/projects/${project.name}`}
              className="block rounded-md border p-3.5 no-underline"
              style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{project.name}</span>
                  <div className="mt-1 text-[10px]" style={{ color: "var(--text-dim)" }}>{project.remoteUrl}</div>
                </div>
                <div className="flex gap-1.5">
                  {project.categories.map((cat) => (
                    <span key={cat} className="rounded-sm px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <CreateProjectModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/forms/create-project-modal.tsx packages/web/src/routes/projects/list.tsx
git commit -m "feat(web): add create project modal with category management"
```

---

### Task 4: Create Pilot Modal

**Files:**
- Create: `packages/web/src/components/forms/create-pilot-modal.tsx`
- Modify: `packages/web/src/routes/projects/detail.tsx`

- [ ] **Step 1: Create the CreatePilotModal component**

```tsx
import { useState } from "react";
import { useCreatePilot } from "@/hooks/use-api";
import { FormModal } from "@/components/ui/form-modal";

interface CreatePilotModalProps {
  open: boolean;
  onClose: () => void;
  project: string;
  categories: string[];
}

const inputStyle = {
  backgroundColor: "var(--bg-elevated)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

const labelStyle = { color: "var(--text-muted)" };

export function CreatePilotModal({ open, onClose, project, categories }: CreatePilotModalProps) {
  const createPilot = useCreatePilot(project);
  const [identifier, setIdentifier] = useState("");
  const [certifications, setCertifications] = useState<string[]>([]);

  function reset() {
    setIdentifier("");
    setCertifications([]);
    createPilot.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  function toggleCertification(cat: string) {
    setCertifications((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function handleSubmit() {
    if (!identifier.trim()) return;
    createPilot.mutate(
      { identifier: identifier.trim(), certifications },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  }

  return (
    <FormModal
      open={open}
      onClose={handleClose}
      title="New Pilot"
      onSubmit={handleSubmit}
      isPending={createPilot.isPending}
      error={createPilot.error?.message ?? null}
    >
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
          Identifier
        </label>
        <input
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="pilot-name"
          className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
          Certifications
        </label>
        {categories.length === 0 && (
          <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            No categories configured for this project.
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => {
            const selected = certifications.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCertification(cat)}
                className="rounded-sm px-2 py-1 text-[10px] transition-colors"
                style={{
                  backgroundColor: selected ? "rgba(0, 255, 136, 0.15)" : "var(--bg-elevated)",
                  color: selected ? "var(--accent-green)" : "var(--text-muted)",
                  border: selected ? "1px solid var(--accent-green)" : "1px solid transparent",
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>
    </FormModal>
  );
}
```

- [ ] **Step 2: Add "+ New Pilot" and "+ New Craft" buttons to the project detail page**

Replace the full content of `packages/web/src/routes/projects/detail.tsx`:

```tsx
import { useState } from "react";
import { useParams, Link } from "react-router";
import { useProject, useCrafts, useTowerQueue, usePilots } from "@/hooks/use-api";
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";
import { PageHeader } from "@/components/base/page-header";
import { FlightStrip } from "@/components/base/flight-strip";
import { StatCard } from "@/components/base/stat-card";
import { CreatePilotModal } from "@/components/forms/create-pilot-modal";

export function Component() {
  const { name } = useParams<{ name: string }>();
  const wsManager = useWsManager();
  useSubscription(wsManager, `project:${name}`);
  const { data: project } = useProject(name!);
  const { data: crafts } = useCrafts(name!);
  const { data: queue } = useTowerQueue(name!);
  const { data: pilots } = usePilots(name!);
  const [showCreatePilot, setShowCreatePilot] = useState(false);

  const activeCrafts = crafts?.filter(
    (c) => c.status !== "Landed" && c.status !== "ReturnToOrigin",
  );

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Projects", to: "/projects" }, { label: name! }]}
        right={
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreatePilot(true)}
              className="rounded-md px-3 py-1.5 text-xs"
              style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              + New Pilot
            </button>
            <Link
              to={`/projects/${name}/crafts/new`}
              className="rounded-md px-3 py-1.5 text-xs font-semibold no-underline"
              style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
            >
              + New Craft
            </Link>
          </div>
        }
      />
      <div className="mt-5">
        {project && (
          <div className="mb-5 rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{project.name}</div>
            <div className="mt-1 text-[11px]" style={{ color: "var(--text-dim)" }}>{project.remoteUrl}</div>
            <div className="mt-2 flex gap-1.5">
              {project.categories.map((cat) => (
                <span key={cat} className="rounded-sm px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }}>{cat}</span>
              ))}
            </div>
          </div>
        )}
        <div className="mb-5 grid grid-cols-3 gap-3">
          <StatCard label="CRAFTS" value={crafts?.length ?? 0} color="var(--accent-green)" />
          <StatCard label="ACTIVE" value={activeCrafts?.length ?? 0} color="var(--accent-blue)" />
          <StatCard label="TOWER QUEUE" value={queue?.length ?? 0} color="var(--accent-yellow)" />
        </div>

        {/* Pilots section */}
        {pilots && pilots.length > 0 && (
          <div className="mb-5 rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>PILOTS</div>
            <div className="space-y-1.5">
              {pilots.map((pilot) => (
                <div
                  key={pilot.identifier}
                  className="flex items-center justify-between rounded-md p-2 text-[11px]"
                  style={{ backgroundColor: "var(--bg-elevated)" }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>{pilot.identifier}</span>
                  <div className="flex gap-1">
                    {pilot.certifications.map((cert) => (
                      <span
                        key={cert}
                        className="rounded-sm px-1.5 py-0.5 text-[10px]"
                        style={{ backgroundColor: "rgba(0, 255, 136, 0.1)", color: "var(--accent-green)" }}
                      >
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>CRAFTS</div>
          {crafts && crafts.length === 0 && (
            <div className="py-4 text-center text-xs" style={{ color: "var(--text-dim)" }}>No crafts in this project.</div>
          )}
          <div className="space-y-2">
            {crafts?.map((craft) => <FlightStrip key={craft.callsign} craft={craft} project={name!} />)}
          </div>
        </div>
        {/* Config */}
        {project &&
          (project.checklist.length > 0 || Object.keys(project.mcpServers).length > 0) && (
            <div
              className="mt-4 rounded-md border p-3.5"
              style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
            >
              <div
                className="mb-3 text-[9px] uppercase tracking-widest"
                style={{ color: "var(--text-dim)" }}
              >
                CONFIGURATION
              </div>
              {project.checklist.length > 0 && (
                <div className="mb-3">
                  <div
                    className="mb-1.5 text-[10px] uppercase"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Checklist
                  </div>
                  <div className="space-y-1">
                    {project.checklist.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between rounded-md p-2 text-[11px]"
                        style={{ backgroundColor: "var(--bg-elevated)" }}
                      >
                        <span style={{ color: "var(--text-secondary)" }}>{item.name}</span>
                        <span
                          className="font-mono text-[10px]"
                          style={{ color: "var(--text-dim)" }}
                        >
                          {item.command}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Object.keys(project.mcpServers).length > 0 && (
                <div>
                  <div
                    className="mb-1.5 text-[10px] uppercase"
                    style={{ color: "var(--text-muted)" }}
                  >
                    MCP Servers
                  </div>
                  <div className="space-y-1">
                    {Object.entries(project.mcpServers).map(([serverName, config]) => (
                      <div
                        key={serverName}
                        className="flex items-center justify-between rounded-md p-2 text-[11px]"
                        style={{ backgroundColor: "var(--bg-elevated)" }}
                      >
                        <span style={{ color: "var(--text-secondary)" }}>{serverName}</span>
                        <span
                          className="font-mono text-[10px]"
                          style={{ color: "var(--text-dim)" }}
                        >
                          {config.command} {config.args.join(" ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
      </div>
      <CreatePilotModal
        open={showCreatePilot}
        onClose={() => setShowCreatePilot(false)}
        project={name!}
        categories={project?.categories ?? []}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/forms/create-pilot-modal.tsx packages/web/src/routes/projects/detail.tsx
git commit -m "feat(web): add create pilot modal and pilots section on project detail"
```

---

### Task 5: Create Craft Page

**Files:**
- Create: `packages/web/src/routes/crafts/create.tsx`
- Modify: `packages/web/src/main.tsx`

- [ ] **Step 1: Create the craft creation page**

```tsx
import { useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useProject, usePilots, useCreateCraft } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";

const inputStyle = {
  backgroundColor: "var(--bg-elevated)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

const labelStyle = { color: "var(--text-muted)" };

interface VectorRow {
  id: number;
  name: string;
  acceptanceCriteria: string;
}

let nextVectorId = 1;

export function Component() {
  const { name: project } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { data: projectData } = useProject(project!);
  const { data: pilots } = usePilots(project!);
  const createCraft = useCreateCraft(project!);

  const [callsign, setCallsign] = useState("");
  const [branch, setBranch] = useState("");
  const [branchManuallyEdited, setBranchManuallyEdited] = useState(false);
  const [cargo, setCargo] = useState("");
  const [category, setCategory] = useState("");
  const [captain, setCaptain] = useState("");
  const [firstOfficers, setFirstOfficers] = useState<string[]>([]);
  const [jumpseaters, setJumpseaters] = useState<string[]>([]);
  const [vectors, setVectors] = useState<VectorRow[]>([
    { id: nextVectorId++, name: "", acceptanceCriteria: "" },
  ]);

  const certifiedPilots = pilots?.filter((p) => p.certifications.includes(category)) ?? [];
  const allPilots = pilots ?? [];

  // Auto-sync branch from callsign unless user manually edited branch
  const handleCallsignChange = useCallback(
    (value: string) => {
      setCallsign(value);
      if (!branchManuallyEdited) {
        setBranch(value);
      }
    },
    [branchManuallyEdited],
  );

  function handleCategoryChange(newCategory: string) {
    setCategory(newCategory);
    setCaptain("");
    setFirstOfficers([]);
    setJumpseaters([]);
  }

  function toggleFirstOfficer(id: string) {
    setFirstOfficers((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function toggleJumpseat(id: string) {
    setJumpseaters((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function addVector() {
    setVectors([...vectors, { id: nextVectorId++, name: "", acceptanceCriteria: "" }]);
  }

  function removeVector(id: number) {
    if (vectors.length <= 1) return;
    setVectors(vectors.filter((v) => v.id !== id));
  }

  function updateVector(id: number, field: "name" | "acceptanceCriteria", value: string) {
    setVectors(vectors.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
  }

  function moveVector(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= vectors.length) return;
    const updated = [...vectors];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setVectors(updated);
  }

  function handleSubmit() {
    if (!callsign.trim() || !branch.trim() || !cargo.trim() || !category || !captain) return;
    const validVectors = vectors.filter((v) => v.name.trim() && v.acceptanceCriteria.trim());
    if (validVectors.length === 0) return;

    createCraft.mutate(
      {
        callsign: callsign.trim(),
        branch: branch.trim(),
        cargo: cargo.trim(),
        category,
        captain,
        firstOfficers: firstOfficers.length > 0 ? firstOfficers : undefined,
        jumpseaters: jumpseaters.length > 0 ? jumpseaters : undefined,
        flightPlan: validVectors.map((v) => ({
          name: v.name.trim(),
          acceptanceCriteria: v.acceptanceCriteria.trim(),
        })),
      },
      {
        onSuccess: (craft) => {
          navigate(`/projects/${project}/crafts/${craft.callsign}`);
        },
      },
    );
  }

  const categories = projectData?.categories ?? [];

  // Pilots not selected as captain, available for FO (must be certified)
  const availableFOs = certifiedPilots.filter((p) => p.identifier !== captain);
  // Pilots not selected as captain or FO, available for jumpseat (any pilot)
  const selectedCrew = [captain, ...firstOfficers];
  const availableJumpseaters = allPilots.filter((p) => !selectedCrew.includes(p.identifier));

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: "Projects", to: "/projects" },
          { label: project!, to: `/projects/${project}` },
          { label: "New Craft" },
        ]}
      />
      <div className="mx-auto mt-5 max-w-2xl">
        <div
          className="rounded-md border p-5"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          {/* Basic Info */}
          <div className="mb-5 space-y-3">
            <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
              BASIC INFO
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
                  Callsign
                </label>
                <input
                  type="text"
                  value={callsign}
                  onChange={(e) => handleCallsignChange(e.target.value)}
                  placeholder="fix-auth-bug"
                  className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
                  Branch
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => {
                    setBranch(e.target.value);
                    setBranchManuallyEdited(true);
                  }}
                  placeholder="fix-auth-bug"
                  className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
                Cargo
              </label>
              <textarea
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                placeholder="Description of the change and its scope..."
                rows={3}
                className="w-full rounded-md border px-3 py-1.5 text-xs outline-none resize-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
                Category
              </label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
                style={inputStyle}
              >
                <option value="">Select a category...</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Crew Assignment */}
          <div className="mb-5">
            <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
              CREW ASSIGNMENT
            </div>
            {!category && (
              <div className="py-3 text-center text-[10px]" style={{ color: "var(--text-dim)" }}>
                Select a category first to assign crew.
              </div>
            )}
            {category && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
                    Captain (required)
                  </label>
                  {certifiedPilots.length === 0 ? (
                    <div className="text-[10px]" style={{ color: "var(--accent-yellow)" }}>
                      No pilots certified for "{category}".
                    </div>
                  ) : (
                    <select
                      value={captain}
                      onChange={(e) => setCaptain(e.target.value)}
                      className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
                      style={inputStyle}
                    >
                      <option value="">Select captain...</option>
                      {certifiedPilots.map((p) => (
                        <option key={p.identifier} value={p.identifier}>
                          {p.identifier}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
                    First Officers (optional)
                  </label>
                  {availableFOs.length === 0 ? (
                    <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                      No other certified pilots available.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {availableFOs.map((p) => {
                        const selected = firstOfficers.includes(p.identifier);
                        return (
                          <button
                            key={p.identifier}
                            type="button"
                            onClick={() => toggleFirstOfficer(p.identifier)}
                            className="rounded-sm px-2 py-1 text-[10px] transition-colors"
                            style={{
                              backgroundColor: selected ? "rgba(120, 180, 255, 0.15)" : "var(--bg-elevated)",
                              color: selected ? "var(--accent-blue)" : "var(--text-muted)",
                              border: selected ? "1px solid var(--accent-blue)" : "1px solid transparent",
                            }}
                          >
                            {p.identifier}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
                    Jumpseaters (optional)
                  </label>
                  {availableJumpseaters.length === 0 ? (
                    <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                      No other pilots available.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {availableJumpseaters.map((p) => {
                        const selected = jumpseaters.includes(p.identifier);
                        return (
                          <button
                            key={p.identifier}
                            type="button"
                            onClick={() => toggleJumpseat(p.identifier)}
                            className="rounded-sm px-2 py-1 text-[10px] transition-colors"
                            style={{
                              backgroundColor: selected ? "rgba(180, 142, 255, 0.15)" : "var(--bg-elevated)",
                              color: selected ? "var(--accent-purple)" : "var(--text-muted)",
                              border: selected ? "1px solid var(--accent-purple)" : "1px solid transparent",
                            }}
                          >
                            {p.identifier}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Flight Plan */}
          <div className="mb-5">
            <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
              FLIGHT PLAN
            </div>
            <div className="space-y-2">
              {vectors.map((vector, index) => (
                <div
                  key={vector.id}
                  className="flex items-start gap-2 rounded-md p-2.5"
                  style={{ backgroundColor: "var(--bg-elevated)" }}
                >
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5 pt-1">
                    <button
                      type="button"
                      onClick={() => moveVector(index, -1)}
                      disabled={index === 0}
                      className="text-[10px] leading-none"
                      style={{ color: index === 0 ? "var(--text-dim)" : "var(--text-muted)" }}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveVector(index, 1)}
                      disabled={index === vectors.length - 1}
                      className="text-[10px] leading-none"
                      style={{ color: index === vectors.length - 1 ? "var(--text-dim)" : "var(--text-muted)" }}
                    >
                      ▼
                    </button>
                  </div>
                  {/* Vector number */}
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-[10px] font-semibold"
                    style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-muted)" }}
                  >
                    {index + 1}
                  </div>
                  {/* Fields */}
                  <div className="flex-1 space-y-1.5">
                    <input
                      type="text"
                      value={vector.name}
                      onChange={(e) => updateVector(vector.id, "name", e.target.value)}
                      placeholder="Vector name"
                      className="w-full rounded-md border px-2.5 py-1 text-xs outline-none"
                      style={inputStyle}
                    />
                    <textarea
                      value={vector.acceptanceCriteria}
                      onChange={(e) => updateVector(vector.id, "acceptanceCriteria", e.target.value)}
                      placeholder="Acceptance criteria..."
                      rows={2}
                      className="w-full rounded-md border px-2.5 py-1 text-xs outline-none resize-none"
                      style={inputStyle}
                    />
                  </div>
                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeVector(vector.id)}
                    disabled={vectors.length <= 1}
                    className="pt-1 text-xs"
                    style={{ color: vectors.length <= 1 ? "var(--text-dim)" : "var(--accent-red)" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addVector}
              className="mt-2 w-full rounded-md border border-dashed py-2 text-xs"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              + Add Vector
            </button>
          </div>

          {/* Error */}
          {createCraft.error && (
            <div className="mb-4 rounded-md px-3 py-2 text-xs" style={{ backgroundColor: "rgba(255, 85, 85, 0.1)", color: "var(--accent-red)" }}>
              {createCraft.error.message}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2">
            <Link
              to={`/projects/${project}`}
              className="rounded-md px-3 py-1.5 text-xs no-underline"
              style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={createCraft.isPending}
              className="rounded-md px-3 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: createCraft.isPending ? "var(--bg-elevated)" : "var(--accent-green)",
                color: createCraft.isPending ? "var(--text-muted)" : "var(--bg-base)",
              }}
            >
              {createCraft.isPending ? "Creating..." : "Create Craft"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the craft creation route in main.tsx**

In `packages/web/src/main.tsx`, add the new route inside the `projects/:name` children array, **before** the `crafts/:callsign` route (so it matches first):

Add this entry as the second child (after `index: true`):

```typescript
{ path: "crafts/new", lazy: () => import("@/routes/crafts/create") },
```

The project route children should become:

```typescript
children: [
  { index: true, lazy: () => import("@/routes/projects/detail") },
  { path: "crafts/new", lazy: () => import("@/routes/crafts/create") },
  { path: "crafts/:callsign", lazy: () => import("@/routes/crafts/detail") },
  { path: "tower", lazy: () => import("@/routes/tower") },
],
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/routes/crafts/create.tsx packages/web/src/main.tsx
git commit -m "feat(web): add craft creation page with crew assignment and flight plan builder"
```

---

### Task 6: Lint, Format, and Final Verification

**Files:** All modified/created files

- [ ] **Step 1: Run the linter**

Run: `cd packages/web && pnpm run lint`
Expected: No errors. If there are warnings or errors, fix them.

- [ ] **Step 2: Run the formatter**

Run: `cd packages/web && pnpm run format`
Expected: Files formatted successfully.

- [ ] **Step 3: Run the full build**

Run: `cd packages/web && pnpm run build`
Expected: Build completes with no errors.

- [ ] **Step 4: Commit any lint/format fixes**

```bash
git add -A
git commit -m "chore(web): lint and format creation UI files"
```

(Skip this step if no changes were needed.)
