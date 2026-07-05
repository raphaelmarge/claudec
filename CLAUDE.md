# CLAUDE.md

## HeyGen Skills

Three self-contained HeyGen skills are installed at `.claude/skills/`, vendored
from [heygen-com/skills](https://github.com/heygen-com/skills) v3.2.0 (MIT):

- **heygen-avatar** — identity → avatar → voice. Output is reused by heygen-video.
- **heygen-video** — idea → script → video. Consumes avatars from heygen-avatar.
- **heygen-translate** — existing video → dubbed and lip-synced video in another language. Independent of the other two.

Each skill's `SKILL.md` carries its own mode-detection ladder, hard rules, and
full workflow; `references/` docs are loaded on demand per phase. Follow the
active skill's SKILL.md as the source of truth.

### Shared state

Skills communicate through `AVATAR-<NAME>.md` files at the workspace root:

- heygen-avatar writes them (avatar_id, group_id, voice_id).
- heygen-video reads them (picks up avatar + voice automatically).
- One file per character. Human-readable AND machine-readable.
- heygen-avatar also maintains role-based symlinks (`AVATAR-AGENT.md`,
  `AVATAR-USER.md`) pointing at the current agent / user named file, so
  consumer skills can resolve generic self-references ("make a video of
  yourself" / "my video update") without parsing identity files.

### API conventions

Two modes, in order of preference: MCP, then CLI. **Do not call
`api.heygen.com` directly with curl** — the skills route through MCP or the
CLI, never raw HTTP.

- **MCP (preferred):** the HeyGen Remote MCP server is configured in this
  repo's `.mcp.json` (`https://mcp.heygen.com/mcp/v1/`). OAuth on first
  connection; uses the user's HeyGen plan credits, no API key needed. Tools
  appear as `mcp__heygen__*`.
- **CLI fallback:** the `heygen` binary
  (install: `curl -fsSL https://static.heygen.ai/cli/install.sh | bash`),
  authenticated via the `HEYGEN_API_KEY` env var or `heygen auth login`.
- **Mode-detection rule:** setting `HEYGEN_API_KEY` short-circuits MCP
  detection — the skill uses the CLI / API-key route instead. To bill against
  MCP plan credits, leave the env var unset.
- **v3 only.** Deprecated v1/v2 endpoints (`POST /v1/video.generate`,
  `POST /v2/video/generate`, `GET /v2/avatars`, `GET /v1/avatar.list`) must
  not be used.

### Upgrading

Vendored copy — to upgrade, re-sync the three skill directories from
`https://github.com/heygen-com/skills` (master) and re-read the active
skill's SKILL.md if the version bumped.
