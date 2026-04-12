# @airtrafficcontrol/errors Changelog

## Unreleased

### Added

- `ConfigValidationError` — thrown when a config payload fails schema validation. Carries a `scope: ConfigScope` (`"global" | "profile" | "project" | "agent"`) and an `issues: readonly ConfigIssue[]` list so transport layers can serialize Zod-style issues verbatim to clients. Currently tagged with the placeholder rule id `RULE-CFG-1` pending a formal rule family in the spec.
- `UnknownConfigKeyError` — thrown when `unset()` or a DELETE-by-key names a key that is not part of the target scope's declared schema. Carries `scope: ConfigScope` and `key: string`. Also tagged `RULE-CFG-1`.
- `ConfigScope` type export — `"global" | "profile" | "project" | "agent"`.
- `ConfigIssue` type export — minimal shape compatible with Zod issues; declared locally so the package stays free of a runtime `zod` dependency.
