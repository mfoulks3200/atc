# Changelog

All notable changes to `@airtrafficcontrol/adapter-claude-agent-sdk` are
documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package follows [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-04-24

### Added

- `ClaudeAgentSdkAdapterDeps.daemonUrl` optional field for overriding the ATC
  daemon URL (used by tests; defaults to `http://localhost:7700`).
- `launch()` now creates an ATC MCP session via `POST /api/v1/mcp/session` on
  the standalone `@airtrafficcontrol/mcp-server` and passes the bearer token
  to an HTTP-type `mcpServers.atc` entry, giving agents access to all ATC
  coordination tools (`atc_get_context`, `atc_intercom_send`,
  `atc_controls_read`, `atc_controls_transfer`, `atc_controls_share`,
  `atc_craft_report_vector`, `atc_craft_run_checklist`,
  `atc_tower_request_clearance`, `atc_tower_execute_merge`,
  `atc_declare_emergency`).
- `terminate()` now deletes the ATC MCP session via `DELETE /api/v1/mcp/session`
  to release server-side session resources on agent shutdown.

### Changed

- System prompt updated throughout to reference `atc_*` MCP tool names instead
  of curl examples. All agent instructions for intercom, controls, vector
  reports, checklist, and tower operations now use the MCP tool calls directly.

### Removed

- `createIntercomMcpServer` and `IntercomToolContext` — replaced by the
  standalone MCP server's `atc_intercom_send` tool.
- `createControlsMcpServer` and `ControlsToolContext` — replaced by
  `atc_controls_read`, `atc_controls_transfer`, and `atc_controls_share`.
- `createTowerMcpServer` and `TowerToolContext` — replaced by
  `atc_tower_request_clearance` and `atc_tower_execute_merge`.

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
