# Web UI Creation Interfaces

**Date:** 2026-03-31
**Status:** Approved

## Overview

Add creation interfaces to the web dashboard for projects, pilots, craft categories, and crafts. The web UI is currently read-only; all backend POST endpoints already exist. This spec covers mutation hooks, a shared modal component, creation forms for projects and pilots, and a dedicated craft creation page.

## Scope

### In Scope
- Mutation hooks for create project, create pilot, create craft, update project
- Shared `FormModal` UI component
- Create Project modal (with inline category management)
- Create Pilot modal (project-scoped)
- Create Craft dedicated page with crew assignment and flight plan builder
- Route registration and navigation integration

### Out of Scope
- Project editing/deletion UI (future work)
- Pilot editing/deletion UI (future work)
- Checklist template and binding management (already has its own pages)
- Agent creation UI (agents are system-managed)

## Design

### 1. Mutation Hooks & API Layer

Add mutation hooks to `packages/web/src/hooks/use-api.ts` following the existing TanStack Query pattern.

**New hooks:**
- `useCreateProject()` — `POST /projects` with `{ name, remoteUrl, categories, checklist, mcpServers }`
- `useCreatePilot(project)` — `POST /projects/:name/pilots` with `{ identifier, certifications, mcpServers }`
- `useCreateCraft(project)` — `POST /projects/:name/crafts` with `{ callsign, branch, cargo, category, captain, firstOfficers, jumpseaters, flightPlan }`
- `useUpdateProject(name)` — `PATCH /projects/:name` for editing categories on existing projects

Each hook wraps `apiClient.post()`/`apiClient.patch()` in TanStack Query's `useMutation`. On success, each invalidates the relevant query keys:
- `useCreateProject` invalidates `["projects"]`
- `useCreatePilot` invalidates `["pilots", project]`
- `useCreateCraft` invalidates `["crafts", project]`
- `useUpdateProject` invalidates `["projects"]` and `["project", name]`

All hooks return the standard `{ mutate, isPending, error }` shape.

Also add `usePilots(project)` query hook if not already present (needed for crew dropdowns on the craft creation page).

### 2. FormModal Component

A lightweight shared modal at `packages/web/src/components/ui/form-modal.tsx`.

**Props:**
- `open: boolean` — controls visibility
- `onClose: () => void` — called on cancel, backdrop click, or Escape key
- `title: string` — modal header text
- `onSubmit: () => void` — called when submit button is clicked
- `isPending: boolean` — disables submit and shows loading state
- `error: string | null` — displays error message when set
- `children: ReactNode` — form field content

**Behavior:**
- Renders a backdrop overlay + centered dialog card using existing CSS custom properties
- Header with title and X close button
- Body renders children (form fields)
- Footer with Cancel and Submit buttons
- Submit button shows loading state via `isPending`
- Displays API error message when `error` is set
- Closes on backdrop click and Escape key press

### 3. Create Project Modal

**Trigger:** "+ New Project" button in the header of the `/projects` page.

**Fields:**
- **Name** — text input, required
- **Remote URL** — text input, required (git remote URL)
- **Categories** — tag-style input with text field + "Add" button. Displays added categories as removable chips/badges.

Checklist and mcpServers fields are omitted from the creation modal (advanced config for future project editing). Keep the creation form focused.

**On success:** Invalidate projects query, close modal, navigate to the new project's detail page.

### 4. Create Pilot Modal

**Trigger:** "+ New Pilot" button on the project detail page.

**Fields:**
- **Identifier** — text input, required (unique pilot name/ID)
- **Certifications** — multi-select from the project's existing categories. Displayed as toggleable chips/badges showing all available categories. Selected ones are highlighted.

**On success:** Invalidate pilots query for the project, close modal.

### 5. Create Craft Page

**Route:** `/projects/:name/crafts/new`

**Trigger:** "+ New Craft" button on the project's crafts list, navigates to this page.

**Form layout (top to bottom):**

1. **Callsign** — text input, required
2. **Branch** — text input, required. Auto-suggests based on callsign (e.g., typing callsign "fix-auth" prefills branch with "fix-auth").
3. **Cargo** — textarea, required (description of the change)
4. **Category** — single-select dropdown from the project's categories, required. Changing this resets the crew fields since certification eligibility changes.
5. **Crew Assignment** section:
   - **Captain** — single-select dropdown, required. Shows only pilots certified for the selected category. Disabled until category is chosen.
   - **First Officers** — multi-select, optional. Same certification filter as captain.
   - **Jumpseaters** — multi-select, optional. Shows all project pilots (no certification required per RULE-SEAT-3).
6. **Flight Plan** section:
   - Ordered list of vectors. Each row has: drag handle (for reordering), vector name input, acceptance criteria textarea, remove (X) button.
   - "+ Add Vector" button appends a new empty row at the bottom.
   - At least one vector required.

**Footer:** Cancel (navigates back to crafts list) and "Create Craft" submit button with loading state.

**On success:** Invalidate crafts query, navigate to the new craft's detail page.

### 6. Integration Points

**Where buttons are placed:**
- `/projects` page header — "+ New Project" button, opens Create Project modal
- `/projects/:name` detail page — "+ New Pilot" button, opens Create Pilot modal
- `/projects/:name` crafts list — "+ New Craft" button, navigates to `/projects/:name/crafts/new`

**New route:**
- `/projects/:name/crafts/new` registered in the existing React Router config

**No new dependencies.** Uses existing: TanStack Query `useMutation`, `apiClient`, Tailwind CSS, CSS custom properties from the design system.

### 7. File Changes

**New files:**
- `packages/web/src/components/ui/form-modal.tsx` — shared modal shell
- `packages/web/src/components/forms/create-project-modal.tsx` — project creation form
- `packages/web/src/components/forms/create-pilot-modal.tsx` — pilot creation form
- `packages/web/src/pages/create-craft.tsx` — craft creation page

**Modified files:**
- `packages/web/src/hooks/use-api.ts` — add mutation hooks + `usePilots` query hook
- `packages/web/src/pages/projects.tsx` — add New Project button + modal
- `packages/web/src/pages/project-detail.tsx` — add New Pilot button + modal
- Router config file — add `/projects/:name/crafts/new` route

## Spec Rules Referenced

- RULE-CRAFT-1 through RULE-CRAFT-5 (craft creation requirements)
- RULE-PILOT-1, RULE-PILOT-2 (pilot uniqueness and certifications)
- RULE-SEAT-1 through RULE-SEAT-3 (crew assignment constraints)
- RULE-CHKL-2 (checklist bindings to craft categories)
