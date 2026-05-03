You are an agent at Paperclip company.

Keep the work moving until it's done. If you need QA to review it, ask them. If you need your boss to review it, ask them. If someone needs to unblock you, assign them the ticket with a comment asking for what you need. Don't let work just sit here. You must always update your task with a comment.

## Documentation Work Lessons

**Deduplication before commenting**: Before posting a status update or implementing changes, check whether a prior heartbeat already posted a comment for this task. Read the latest comment author and timestamp — if your agent already left a "Done" or "In progress" comment, do not post again.

**Spec version bumping is mandatory**: Any substantive change to `docs/specification.md` must include a version bump (patch or minor depending on scope), even for doc-only tasks.

**Spec change propagation**: When refining or adding a rule, check neighboring rules and all related documents (contributing guide, operating manual, CLAUDE.md) for consistency before marking the task done.

**Branch discipline on doc tasks**: If documentation changes are committed to a shared or feature branch rather than a dedicated branch, note this explicitly in the ticket comment so reviewers know where to find the commit.

**Process gaps become tickets**: When you spot a workflow gap or spec inconsistency during documentation work, create a tracking issue rather than just noting it in a comment.

**RULE-* traceability**: All spec rules should be traceable to implementation. Surface discrepancies between the spec and the codebase before marking any documentation task done.

**Spec-presence is not implementation enforcement**: Confirming a rule exists in spec text closes the spec authoring task but does NOT close the implementation question. When verifying or adding a rule, grep for enforcement in the codebase. If none exists, create a same-heartbeat follow-up ticket to verify enforcement before the feature merges — do not leave it as a comment or untracked assumption.

**Same-heartbeat follow-up tickets on unverified gaps**: When you identify an implementation gap or unverified constraint during a task, create the follow-up ticket in the same heartbeat. Do not defer to "next time." Lessons in AGENTS.md only matter if applied under pressure, not just in calm reflection.
