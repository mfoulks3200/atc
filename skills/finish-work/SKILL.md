---
name: finish-work
description: Use when implementation work is complete and ready to finalize — runs quality gates, commits, pushes, and handles PR creation or parent-ticket notification via Paperclip
---

# Finish Work

End-to-end skill for finalizing a completed implementation task. Runs quality gates, commits and pushes changes, then either opens a PR or notifies the parent ticket depending on the issue structure.

## When to Use

- Implementation work on the current branch is complete.
- You are ready to hand off for review or signal completion to a parent task.
- The agent invokes `/finish-work` or the task description says to finish/wrap up.

**Do not use** mid-implementation. All functional work must be done before invoking this skill.

## Prerequisites

These environment variables must be set (auto-injected by Paperclip in heartbeat runs):

| Variable | Purpose |
|---|---|
| `PAPERCLIP_TASK_ID` | Current issue ID |
| `PAPERCLIP_API_URL` | Paperclip API base URL |
| `PAPERCLIP_API_KEY` | Auth token |
| `PAPERCLIP_RUN_ID` | Current heartbeat run ID |
| `PAPERCLIP_COMPANY_ID` | Company ID |
| `PAPERCLIP_AGENT_ID` | Your agent ID |

## Steps

Create a TodoWrite list with one todo per step. Mark each done only after its command output confirms success.

### 1. Survey the branch

Understand what changed before running gates.

```bash
git status
git diff --stat main...HEAD
git log main..HEAD --oneline
```

Note which packages and files changed — you need this for coverage verification in step 2.

### 2. Run quality gates

Run each gate in order. **Stop on first failure and fix it before continuing.**

#### 2a. Formatting

```bash
pnpm run format
pnpm run format:check
```

If `format:check` reports issues after `format`, stage the formatting fixes and continue.

#### 2b. Linting

```bash
pnpm run lint
```

Fix all errors and warnings at the root cause. Do not disable rules or suppress with `eslint-disable` comments.

#### 2c. Type checking

```bash
pnpm run build
```

All packages must compile with zero errors.

#### 2d. Tests and coverage

```bash
pnpm run test -- --coverage
```

Requirements per `docs/contributing.md`:

- All tests pass with zero failures.
- **90% coverage minimum on every changed file.** Cross-reference the coverage report against the file list from step 1. If any changed file is below 90%, add tests before continuing.

### 3. Verify documentation

Quick documentation check on changed files:

- [ ] All exported functions, classes, interfaces, types, enums, and constants have JSDoc comments.
- [ ] `@see RULE-*` references are present where the export implements a spec rule.
- [ ] If public API surface changed: version bump in `package.json` and `CHANGELOG.md` entry exist.

Do not do a deep documentation rewrite here — just verify the basics are covered per `docs/contributing.md`.

### 4. Commit changes

Stage and commit all work, including any fixes made during quality gates.

```bash
git add <changed-files>
```

Stage specific files — do not use `git add -A` or `git add .` to avoid accidentally including sensitive files.

Write a clear commit message summarizing the work. Always include the Paperclip co-author trailer:

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <short description>

<optional body>

Co-Authored-By: Paperclip <noreply@paperclip.ing>
EOF
)"
```

If there are no uncommitted changes (everything was already committed), skip this step.

### 5. Push branch

```bash
git push -u origin "$(git branch --show-current)"
```

If the branch is already up to date with the remote, this is a no-op.

### 6. Ticket resolution

This step determines how to signal completion based on the Paperclip issue structure.

#### 6a. Fetch the current issue

```bash
ISSUE=$(curl -sS "$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY")
```

Extract key fields:

```bash
PARENT_ID=$(echo "$ISSUE" | jq -r '.parentId // empty')
IDENTIFIER=$(echo "$ISSUE" | jq -r '.identifier')
TITLE=$(echo "$ISSUE" | jq -r '.title')
BRANCH=$(git branch --show-current)
```

#### 6b. If no parent ticket — create a PR

When the issue has no `parentId`, the work is standalone and needs a PR for review.

```bash
gh pr create \
  --title "$IDENTIFIER: $TITLE" \
  --body "$(cat <<'PREOF'
## Summary

<1-3 bullets describing what changed>

Closes $IDENTIFIER

## Quality gates

- [x] Format check passed
- [x] Lint passed
- [x] Build (typecheck) passed
- [x] All tests passed
- [x] Coverage >= 90% on changed files

## Test plan

- [ ] <manual verification steps if applicable>
PREOF
)"
```

Replace the summary bullets and test plan with specifics for this change. Include the issue identifier in the PR title.

If a PR already exists for this branch, skip creation — just verify it is up to date with the latest push.

#### 6c. If parent ticket exists — notify the parent

When the issue has a `parentId`, the work is a subtask. Instead of creating a PR, post a comment on the parent ticket indicating the work is done.

First, fetch the parent to find its owner:

```bash
PARENT=$(curl -sS "$PAPERCLIP_API_URL/api/issues/$PARENT_ID" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY")
PARENT_IDENTIFIER=$(echo "$PARENT" | jq -r '.identifier')
PARENT_ASSIGNEE_AGENT=$(echo "$PARENT" | jq -r '.assigneeAgentId // empty')
```

Resolve the parent owner's name for the @-mention:

```bash
if [ -n "$PARENT_ASSIGNEE_AGENT" ]; then
  OWNER_NAME=$(curl -sS "$PAPERCLIP_API_URL/api/agents/$PARENT_ASSIGNEE_AGENT" \
    -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq -r '.name')
fi
```

Post a completion comment on the parent issue:

```bash
COMMENT_BODY=$(cat <<MD
## Subtask completed: $IDENTIFIER

$TITLE is done.

- **Branch:** \`$BRANCH\`
- **Subtask:** [$IDENTIFIER](/$PREFIX/issues/$IDENTIFIER)

@$OWNER_NAME — ready for integration.
MD
)

curl -sS -X POST "$PAPERCLIP_API_URL/api/issues/$PARENT_ID/comments" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg body "$COMMENT_BODY" '{body: $body}')"
```

### 7. Update issue status

Mark the current issue as done with a summary comment:

```bash
curl -sS -X PATCH "$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg comment "Done. Branch \`$BRANCH\` pushed. $([ -z \"$PARENT_ID\" ] && echo 'PR created.' || echo \"Parent [$PARENT_IDENTIFIER](/$PREFIX/issues/$PARENT_IDENTIFIER) notified.\")" \
    '{status: "done", comment: $comment}')"
```

## Red Flags — Stop and Fix

| Symptom | Action |
|---|---|
| Test failure or coverage < 90% on a changed file | Fix before committing. Do not skip. |
| Lint or type errors | Fix at root cause. Do not suppress. |
| `git add -A` or `git add .` | No. Stage specific files. |
| PR already exists but is stale | Push latest changes; verify PR is up to date. |
| Missing `PAPERCLIP_TASK_ID` env var | You are not in a heartbeat run. Do steps 1-5 only (quality gates, commit, push). Skip ticket resolution. |
| Parent issue owner cannot be resolved | Post the comment without the @-mention. Do not fail the whole skill. |

## Common Mistakes

- **Committing without running quality gates.** Always run format, lint, build, and tests first. The commit should contain code that passes all gates.
- **Using `git add -A`** — this can stage `.env` files, credentials, or build artifacts. Always stage named files.
- **Creating a PR when a parent ticket exists.** The parent owner is expecting a notification, not a PR. Follow the branching: no parent = PR, has parent = notify parent.
- **Forgetting the issue identifier in the PR title.** The PR title must include the identifier (e.g., `AIR-42: Add pilot certification check`) so it is traceable.
- **Skipping the push.** A commit without a push is invisible to reviewers and CI. Always push.
- **Not including `X-Paperclip-Run-Id` on API calls.** All mutating Paperclip API requests must include this header for audit traceability.
