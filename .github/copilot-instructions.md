# Copilot Instructions for Air Traffic Control (ATC)

**Trust these instructions.** Only fall back to repository search when something here is incomplete or demonstrably wrong.

## Before You Write Any Code: Is This Change Aligned With The Spec?

Code quality is necessary but **not sufficient**. A perfectly-written change that drifts from the project's vision is worse than no change at all — it adds surface area, cements an incorrect direction, and forces a future revert. Before opening a PR, answer all three of these questions in writing (in the PR description):

1. **Does this change help achieve the vision in `docs/specification.md`?** Cite the specific `RULE-*` identifier(s) the change implements, enforces, fixes, or extends. If you cannot cite a rule, the change is probably out of scope.
2. **Is this change consistent with the existing spec, or does it require a spec update?** If the implementation and spec diverge, **stop and surface the discrepancy** rather than silently changing one to fit the other. Either:
   - Adjust the implementation to match the spec, **or**
   - Update `docs/specification.md` (with the Rule Index in Appendix A) and `docs/agent/operating-manual.md` as part of the same PR, with explicit reasoning for the change.
3. **Is this on the critical path, or is it a sidequest?** Refactors, "cleanups", new abstractions, additional defensive checks, expanded error handling, and broadened scope are sidequests unless they are required by the rule being implemented or fix a concrete bug. Default to *not* doing them. If you find yourself thinking "while I'm here, I'll also…" — stop. Open a separate issue or add it to `docs/roadmap.md`.

If a request is ambiguous about which rule it serves, ask before implementing. **A small change that lands one rule cleanly is more valuable than a large change that touches many.**

Known spec gaps (e.g., merge execution, some lifecycle preconditions) are documented in `CLAUDE.md` under "Known Spec Gaps". Closing one of those is in-scope; expanding the scope of a feature you were not asked to build is not.

## Repository Overview

ATC is an agent orchestration system that coordinates multiple autonomous agents working on concurrent code changes in a shared repository. It uses aviation terminology as its domain language — changes are "crafts" flown by "pilots" navigating "vectors" who request "landing clearance" from a "tower" to merge.

The vision: **strict, statically defined process around the agent**, so agents can focus on the task and the platform catches them when they fall. Every change should reinforce that property — strengthening guardrails, clarifying state transitions, or hardening enforcement of an existing rule. Changes that *loosen* guardrails, *blur* state, or add behavior outside the rule set need an explicit spec update justifying them.

- **Type:** TypeScript pnpm monorepo (12 packages under `packages/`).
- **Languages/runtimes:** TypeScript 5.8 targeting ES2022, Node 20, pnpm 10. Module resolution is `Node16` (strict mode, ESM throughout — `"type": "module"`).
- **Frameworks:** Fastify (daemon), React 19 + Vite 6 + TanStack Query + React Router 7 + Tailwind 4 (web), Vitest 3 (tests), Playwright (e2e), Docusaurus (docs site), ESLint 9 + Prettier 3.

## Environment Setup — Always Do This First

1. Use **pnpm 10** and **Node 20**. Do not use npm or yarn — only `pnpm-lock.yaml` is committed.
2. **Always** run `pnpm install --frozen-lockfile` before any build, test, lint, or format command. CI uses `--frozen-lockfile`; local installs must match the lockfile.
3. After install, run `pnpm run build` once before running tests if you have not built yet — Vitest resolves cross-package imports through compiled `dist/` output. Tests against fresh source in shared packages (`types`, `core`, `errors`, `validation`, etc.) will fail or import stale code if `dist/` is out of date.

## Validated Command Sequences

Run from the repo root (`/`) unless noted.

| Purpose | Command | Notes |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | Required first step. |
| Type check / build all packages | `pnpm run build` | Runs `tsc --build` across the project references in root `tsconfig.json`. Must pass with zero errors. |
| Run unit/integration tests | `pnpm run test` | Vitest. Pattern: `packages/*/src/**/*.test.ts(x)`. Web tests use jsdom; rest use node. |
| Tests with coverage | `pnpm run test:coverage` | CI runs this. v8 coverage. Changed files must hit ≥90% statements/branches/functions/lines. |
| Lint | `pnpm run lint` | ESLint over `packages/*/src/**/*.ts`. Must be zero errors and zero warnings. `pnpm run lint -- --fix` for auto-fix. |
| Format check | `pnpm run format:check` | Prettier over `packages/*/src/**/*.ts`. **CI fails on any diff.** |
| Format write | `pnpm run format` | Run before committing. |
| Run a single test file | `pnpm run test -- packages/types/src/enums.test.ts` | |
| Dev (daemon + web) | `pnpm run dev` | Concurrently runs daemon and Vite dev server. |
| Build docs site | `pnpm run docs:build` | Docusaurus 3, in `packages/docs/`. |

### Required pre-merge gate (matches CI exactly)

Run, in order, and confirm each succeeds:

```bash
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm run build
pnpm run test:coverage
```

These four jobs (`format`, `lint`, `typecheck`, `test`) gate every PR via `.github/workflows/ci.yml`. The `publish` job runs `pnpm -r publish --access public --no-git-checks --provenance` only on push to `main`.

### End-to-end tests (NOT run by `pnpm run test`)

Playwright (Chromium-only) suite in `packages/e2e/`. Boots a real daemon against a `mkdtemp` scratch profile and drives the built web bundle through `vite preview`. Run only when changes touch the daemon REST/WebSocket surface, the web dashboard, or the README screenshots.

```bash
pnpm --filter @airtrafficcontrol/e2e exec playwright install chromium  # one-time
pnpm --filter @airtrafficcontrol/web build                             # build bundle preview serves
pnpm --filter @airtrafficcontrol/e2e test                              # smoke + screenshots
pnpm --filter @airtrafficcontrol/e2e test:screenshots                  # screenshots only — also overwrites docs/assets/screenshots
```

## Code Conventions — Failures here will block CI

- **Imports must use `.js` extensions** even when importing `.ts` source files (Node16 module resolution). Example: `import { foo } from "./foo.js";` from `foo.ts`. Forgetting this breaks `pnpm run build`.
- **All exports** (functions, classes, interfaces, types, enums, consts) require **JSDoc**, ideally with `@see RULE-*` references back to `docs/specification.md` when the export implements a spec rule.
- **Test files are colocated**: `foo.ts` ↔ `foo.test.ts` in the same directory. Do not put tests in a separate `__tests__/` folder.
- **Prettier** (`.prettierrc`): double quotes, semicolons, trailing commas (`all`), 100-char print width, 2-space indent.
- **ESLint** (`eslint.config.mjs`): `@typescript-eslint/recommended` + `eslint:recommended`. Unused vars are errors unless prefixed with `_`. Ignores `**/dist/**` and `**/node_modules/**`.
- **Public API changes** (exported types, functions, enums, constants) require:
  1. A semver bump in the affected package's `package.json`.
  2. A new entry in that package's `CHANGELOG.md` using categories `Added | Changed | Deprecated | Removed | Fixed`.
- **Spec compliance is mandatory and is the single most important review criterion.** Implementation and `docs/specification.md` must agree. If they diverge, surface the discrepancy — do not silently change one to match the other. New major behavior requires updating the spec, the Rule Index (Appendix A), and `docs/agent/operating-manual.md`. Reviewers will reject a PR that lacks `RULE-*` traceability before they look at code style.
- **No scope creep.** Don't add features, refactors, abstractions, error handling, or "future-proofing" that the assigned rule does not require. A bug fix doesn't need surrounding cleanup. Three similar lines is better than a premature abstraction. Defer extras to `docs/roadmap.md`.

## Known Gotchas (and the fixes)

- **Stale compiled `vite.config.{js,d.ts}` in `packages/web/`** can shadow `vite.config.ts` so edits don't take effect. The web package's `predev` / `prebuild` / `prepreview` scripts already clean these via `pnpm clean:shadow`. If you bypass the scripts, run `pnpm --filter @airtrafficcontrol/web clean:shadow` manually. These shadow files are gitignored.
- **Vitest hits `dist/`** for cross-package imports. After editing source in a shared package and before running tests, run `pnpm run build`.
- **`pnpm-workspace.yaml`** restricts native build scripts to `core-js`, `core-js-pure`, `esbuild`. If you add a dependency that needs install scripts, you may need to allow it in `onlyBuiltDependencies`.
- **`tsconfig.tsbuildinfo`** at the repo root is a TypeScript build cache. Delete it (and per-package `*.tsbuildinfo`) if you see baffling "already built, nothing to do" behavior after a major refactor.
- **Don't use `npm` or `yarn`.** Only `pnpm` — there is no `package-lock.json` and `node_modules` is hoisted via pnpm's content-addressable store.

## Project Layout

```
/                              repo root — pnpm workspace
├─ .github/workflows/ci.yml    CI: format → lint → typecheck → test → publish-on-main
├─ package.json                Root scripts (build/test/lint/format/dev/docs)
├─ pnpm-workspace.yaml         Workspace = packages/*
├─ pnpm-lock.yaml              Source of truth for deps
├─ tsconfig.json               Project references — lists every buildable package
├─ vitest.config.ts            Test glob, coverage (v8), jsdom for web
├─ eslint.config.mjs           ESLint flat config
├─ .prettierrc                 Prettier
├─ CLAUDE.md                   Detailed agent guidance — read this for deep context
├─ README.md                   Project overview, domain glossary
├─ docs/
│  ├─ specification.md         Authoritative formal spec (62 RULE-* identifiers). Cite these.
│  ├─ contributing.md          Full pre-merge checklist — comprehensive
│  ├─ overview.md              Original informal design brief
│  ├─ agent/operating-manual.md  Behavioral guidance injected into agent contexts
│  ├─ rest_api.md              Daemon REST API reference
│  ├─ roadmap.md               Deferred work tracker
│  └─ assets/screenshots/      README screenshots — regenerated by e2e
└─ packages/
   ├─ types/                   @airtrafficcontrol/types — Pure types/enums/consts. No runtime deps.
   ├─ errors/                  @airtrafficcontrol/errors — AtcError hierarchy, each carries ruleId.
   ├─ validation/              @airtrafficcontrol/validation — Pure validators (certification, seat, permission).
   ├─ core/                    @airtrafficcontrol/core — Runtime domain logic (lifecycle, controls, vectors, blackbox).
   ├─ checklist/               @airtrafficcontrol/checklist — Landing checklist runner.
   ├─ tower/                   @airtrafficcontrol/tower — Tower class, FCFS merge queue, emergency declarations.
   ├─ daemon/                  @airtrafficcontrol/daemon — Fastify HTTP/WebSocket server. Owns persistence + git worktrees.
   ├─ adapter-claude-agent-sdk/ Stub adapter for Anthropic Claude Agent SDK; buildSystemPrompt lives here.
   ├─ mcp-server/              @airtrafficcontrol/mcp-server — MCP server exposing daemon tools.
   ├─ web/                     @airtrafficcontrol/web — React 19 SPA dashboard (Vite + Tailwind 4).
   ├─ docs/                    @airtrafficcontrol/docs — Docusaurus documentation site.
   └─ e2e/                     @airtrafficcontrol/e2e — Playwright suite (Chromium-only). NOT run by `pnpm run test`.
```

Each non-private package has a `package.json` (with `version`), `CHANGELOG.md`, `tsconfig.json`, `src/`, and a generated `dist/`. Daemon and web also ship a `README.md`.

## Domain Quick Reference

| Term | Meaning |
|---|---|
| Craft | Unit of work tied to a git branch |
| Pilot / Captain / First Officer / Jumpseat | Agent roles (Captain = final authority; Jumpseat = read-only observer) |
| Vector | Ordered milestone with acceptance criteria |
| Flight Plan | The vector sequence |
| Black Box | Append-only event log per craft |
| Tower | Per-repo merge coordinator |
| Controls | Exclusive or shared code-modification rights |

Rule IDs are `RULE-{PREFIX}-{N}` (e.g., `RULE-CRAFT-1`, `RULE-CTRL-3`). Insertions use letter suffixes (`RULE-CTRL-2a`) so existing numbers never shift.

## Where to look when stuck

- Build/test/lint behavior → root `package.json`, `vitest.config.ts`, `eslint.config.mjs`, `tsconfig.json`.
- CI behavior → `.github/workflows/ci.yml`.
- Domain rules / what counts as correct → `docs/specification.md`.
- Pre-merge checklist (formatting through spec compliance) → `docs/contributing.md`.
- Cross-cutting context Claude relies on → `CLAUDE.md`.

If a command in this file fails in your environment, prefer fixing the underlying cause over inventing a workaround. Investigate before deleting build artifacts, lockfiles, or worktrees.
