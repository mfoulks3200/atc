---
name: wrap-up
description: Use when preparing a branch to be merged into main — validates coverage, lint, and types, then dispatches a review subagent and syncs the @airtrafficcontrol/docs package with the branch's changes.
---

# Wrap Up a Branch for Merge

## Overview

Walk a branch through its pre-merge gauntlet: verify the test, lint, and type-check gates pass with adequate coverage; get an independent review of the diff; and make sure `packages/docs` reflects whatever behavior, API, or rule changed on the branch. Work the steps in order — do not skip ahead, and do not claim a step passed without seeing the command output.

## When to Use

- User says "wrap up", "get this ready to merge", "prep for PR", or invokes `/wrap-up`.
- Implementation work on a feature branch is believed complete and needs final validation.
- Before opening a PR or requesting landing clearance from the Tower.

**Do not use** for mid-implementation checkpoints — use only when the branch is believed done.

## Steps

Create a TodoWrite list with one todo per step below and mark each done only after its command output confirms success.

### 1. Survey the branch

Run these in parallel:

```bash
git status
git diff --stat main...HEAD
git log main..HEAD --oneline
```

Note which packages changed — you will need this list for step 2 (stubs), step 5 (review scope), and step 6 (docs sync).

### 2. Record stubs and deferred work

Scan the branch diff for anything that was left as a stub, placeholder, or explicitly deferred. Search for patterns like:

```bash
git diff main...HEAD -U0 | grep -iE '(TODO|FIXME|HACK|stub|placeholder|not yet implemented|will be implemented|implement later|no-op|noop|unimplemented)'
```

Also read through any new files from the step 1 file list and look for:

- Functions that return hardcoded values, throw `NotImplementedError`, or contain only a `// TODO` comment.
- Doc comments or inline comments that say something "is not yet" done, "will be added", or "is a placeholder".
- Test files with `it.skip`, `xit`, `xdescribe`, or `test.todo`.

For every stub or deferred item found, add a roadmap entry to `docs/roadmap.md`:

1. Read the current `docs/roadmap.md` to find the right section (or create a new section if none fits).
2. Write a checklist item (`- [ ]`) with a bolded short title, a one-sentence description of what needs to be implemented, and an italicized `_Packages:_` tag listing the affected packages — matching the format already used in the roadmap.
3. If a stub references a `RULE-*` identifier, include that rule ID in the description.
4. Do not duplicate items already present in the roadmap — if an existing entry already covers the deferred work, skip it.

If no stubs or deferred work are found, note that in the report and move on.

### 3. Validate tests and coverage

```bash
pnpm run test -- --coverage
```

Requirements (per `docs/contributing.md`):

- All tests pass.
- **90% coverage minimum on changed files.** Cross-reference the coverage report against the file list from step 1. If any changed file is below 90%, add tests before continuing — do not proceed to step 4.

### 4. Validate lint and types

Run in parallel:

```bash
pnpm run lint
pnpm run build
```

`pnpm run build` runs `tsc --build`, which is the type check. Both must exit clean. Fix issues at the root cause — do not disable rules or add `any` to silence errors.

### 5. Dispatch a review subagent

Spawn a subagent (subagent_type `feature-dev:code-reviewer` if available, else `general-purpose`) with a self-contained prompt. The subagent has no conversation context — brief it fully.

The prompt must include:

- The base branch (`main`) and the current branch name.
- The list of changed files from step 1.
- Explicit instructions to read `docs/specification.md`, `docs/contributing.md`, and `CLAUDE.md`.
- Ask it to check: spec compliance (every export referencing a `RULE-*` has a matching `@see` JSDoc), rule ID correctness, state-machine/permission correctness, test quality (not just coverage numbers), and any divergence between code and spec.
- Ask for a punch list of blocking issues vs. nits, under 400 words.

Address every blocking issue the reviewer raises before moving on. Nits are optional.

### 6. Sync `@airtrafficcontrol/docs`

The `packages/docs` package documents the system and must match the branch's behavior. For each changed package from step 1:

1. Read the relevant files in `packages/docs` that cover that package.
2. Compare against what actually changed on the branch (new exports, renamed APIs, new rules, new endpoints, new WebSocket channels, new config fields, etc.).
3. Update the docs to match. Common updates:
   - New or changed REST routes → update the REST API reference.
   - New config keys → update the config reference.
   - New rules or rule changes → update the rule index and any prose referencing the rule.
   - New packages or exports → update the architecture/overview.
4. If the branch introduced behavior the spec (`docs/specification.md`) doesn't cover, update the spec and its Appendix A Rule Index as well — `CLAUDE.md` requires this.

Do not invent documentation for behavior that doesn't exist. Do not leave stale references to removed APIs.

### 7. Re-validate after doc/review changes

If step 5 or step 6 caused any code edits, re-run step 3 and step 4. Coverage, lint, and types must still be green on the final tree.

### 8. Report

Summarize in ≤150 words:

- Test/coverage/lint/type status (with actual numbers where relevant).
- Stubs and deferred work found in step 2, and whether they were added to the roadmap or already tracked.
- Reviewer's blocking findings and how each was resolved.
- Which docs files were updated and why.
- Anything the user should decide before merging (spec gaps, semver bumps needed per `CLAUDE.md`, `CHANGELOG.md` entries for public API changes).

Do **not** commit, push, open a PR, or merge as part of this skill — stop at the report and let the user drive the next step.

## Red Flags — Stop and Fix

| Symptom | Action |
|---|---|
| "Coverage is close enough to 90%" | No. Add tests until the changed files are ≥90%. |
| "Lint warning is pre-existing" | Confirm with `git blame`; if your change touched the line, fix it. |
| "I'll skip the review subagent, I already read the diff" | No. The independent read is the point. Dispatch it. |
| "Docs package doesn't need updating, behavior is obvious" | Obvious to you ≠ documented. If the branch changed a public surface, docs must reflect it. |
| "I'll commit the wrap-up fixes myself" | Stop at the report. The user commits. |
| Any command failure glossed over | Treat as blocking. Read the output; fix the root cause. |

## Common Mistakes

- **Running coverage globally and eyeballing the total.** The 90% rule is per-changed-file, not repo-wide.
- **Briefing the review subagent with "review the branch".** It has no context. Give it the file list, the rules to check against, and the docs it must read.
- **Updating `packages/docs` without reading what's there first.** You will duplicate or contradict existing content.
- **Forgetting `CHANGELOG.md` and semver bumps** for public API changes — `CLAUDE.md` requires both.
- **Claiming success without showing command output.** Evidence before assertions.
