# Checklist Runner Security: v1 Hardening & v2 Sandbox Path

## Threat Model

The ATC checklist runner executes shell commands configured in project metadata.
Commands are passed to `child_process.exec()` and interpreted by `/bin/sh`.
The primary attack surface:

| Entry Point | Risk | v1 Mitigation |
|---|---|---|
| `POST /api/v1/projects/:name/crafts/:callsign/checklist` | Arbitrary code execution via pre-configured commands | RULE-LCHK-1 authorization (pilot must hold controls) |
| `PATCH /PUT /api/v1/projects/:name/config` | Inject malicious checklist commands via config API | Schema validation (length, timeout caps) |
| `metadata.json` on disk | Direct filesystem command injection | File permissions (daemon user only) |
| Ambient environment variables | Secret leakage to child processes | Environment sanitization allowlist |
| Timeout configuration | Resource exhaustion via unbounded execution | MAX_TIMEOUT_MS = 600,000 (10 min) |

## v1 Hardening (Implemented)

### 1. RULE-LCHK-1 Authorization

The checklist route now requires `pilotId` in the request body and enforces:
- Pilot must be a crew member of the craft (captain, first officer, or jumpseater)
- Pilot must hold controls (exclusive holder or shared-area participant)
- Returns 400 if `pilotId` is missing, 403 if unauthorized

### 2. Environment Sanitization

Child processes receive only allowlisted environment variables:
`PATH`, `HOME`, `USER`, `SHELL`, `LANG`, `LC_ALL`, `TERM`, `NODE_ENV`, `CI`, `TMPDIR`

All other environment variables (API keys, tokens, secrets) are stripped.

### 3. Timeout Cap

- Default timeout: 120 seconds (unchanged)
- Maximum timeout: 600 seconds (10 minutes)
- Per-item `timeout` is clamped to `MAX_TIMEOUT_MS` regardless of configuration
- Schema rejects timeout values outside 1,000–600,000ms

### 4. Schema Validation

Checklist items in project metadata are now validated:
- `name`: non-empty, max 200 characters
- `command`: non-empty, max 2,000 characters
- `timeout`: integer, 1,000–600,000ms (optional)

## v2 Sandbox Path (Future)

v1 mitigations reduce the blast radius of misconfiguration but do not prevent a
privileged crew member from executing arbitrary commands. True isolation requires
a process-level sandbox.

### Container Isolation (Recommended)

Run each checklist execution inside a disposable container:

```
┌─────────────────────────────────────────┐
│ ATC Daemon (host)                       │
│                                         │
│  checklist request                      │
│        │                                │
│        ▼                                │
│  ┌───────────────────────────────────┐  │
│  │ Container (per-execution)         │  │
│  │                                   │  │
│  │  - Read-only bind mount of repo   │  │
│  │  - No network (--network=none)    │  │
│  │  - Dropped capabilities           │  │
│  │  - Memory/CPU limits              │  │
│  │  - Seccomp profile                │  │
│  │  - Timeout enforced by daemon     │  │
│  │                                   │  │
│  │  /bin/sh -c "<command>"           │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│        │                                │
│        ▼                                │
│  capture stdout/stderr, exit code       │
└─────────────────────────────────────────┘
```

**Implementation steps:**

1. **Container runtime detection** — check for `docker` or `podman` on PATH
2. **Base image** — provide a default `atc-checklist-runner` image with
   Node.js, common build tools; allow per-project override via config
3. **Execution wrapper** — replace `exec()` call with:
   ```
   docker run --rm --network=none \
     --read-only \
     --tmpfs /tmp:rw,noexec,nosuid \
     --memory=512m --cpus=1 \
     --security-opt=no-new-privileges \
     --security-opt=seccomp=<profile.json> \
     -v <worktree>:/workspace:ro \
     -w /workspace \
     <image> /bin/sh -c "<command>"
   ```
4. **Fallback** — if no container runtime is available, fall back to v1
   (env-sanitized `exec()`) with a warning logged

### seccomp Profile

A minimal seccomp profile should deny:
- `mount`, `umount2`, `pivot_root` — no filesystem namespace changes
- `ptrace` — no process tracing
- `socket` (AF_INET, AF_INET6) — no network access (redundant with `--network=none`)
- `clone` with `CLONE_NEWUSER` — no user namespace creation
- `keyctl`, `add_key`, `request_key` — no kernel keyring access

### Alternative: Landlock (Linux 5.13+)

For environments without container runtimes, Landlock LSM can restrict
filesystem access at the syscall level. A Node.js N-API addon could:
- Allow read-only access to the worktree
- Allow read-write access to `/tmp` only
- Deny all other filesystem paths
- Combine with `prctl(PR_SET_NO_NEW_PRIVS)` to prevent privilege escalation

### Alternative: macOS Sandbox (sandbox-exec)

On macOS, `sandbox-exec` (deprecated but functional) or the App Sandbox
entitlements framework can restrict file and network access per process.
This is relevant for local development but not production.

### Graduation Criteria for v2

- Container runtime available and configured in daemon profile
- Base image published and versioned alongside ATC releases
- Fallback behavior documented and tested
- Performance benchmarks showing acceptable overhead (<2s per checklist item)
- E2E tests covering container and non-container paths
