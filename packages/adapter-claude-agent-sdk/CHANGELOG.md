# Changelog

All notable changes to `@airtrafficcontrol/adapter-claude-agent-sdk` are
documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-04-14

### Added

- Real implementation of `AgentAdapter` backed by
  `@anthropic-ai/claude-agent-sdk`'s `query()` primitive. Each launched agent
  now owns a long-lived streaming `Query` session rooted at the craft's
  worktree directory, seeded with the provided `systemPrompt` plus a kickoff
  user message built from the craft cargo.
- `ClaudeAgentSdkAdapterDeps` constructor option (`{ query }`) for injecting
  a fake SDK client from tests.
- `DEFAULT_MODEL` export (`claude-opus-4-6`), with per-launch override via
  `AgentLaunchOptions.adapterConfig.model`.
- Intercom → SDK bridge: `sendMessage` pushes user-turn events into the
  streaming input iterator, `onMessage` surfaces assistant text blocks as
  `IntercomMessage`s, `onUsageReport` maps `SDKResultMessage.usage` to
  `AgentUsageReport`, and `onStatusChange` fires on lifecycle transitions.
- MCP server configs are translated to the SDK's stdio shape before launch,
  so daemon-level `McpServerConfig` values flow through unchanged.

### Changed

- Replaced the no-op stub adapter with the real implementation. Public
  surface (`AgentAdapter` methods) is unchanged.
- Dependency swap: drop `@anthropic-ai/sdk`, add
  `@anthropic-ai/claude-agent-sdk ^0.2.108`.
- Version bumped to `0.1.0` to reflect the first functional release.
