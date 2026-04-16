# cc-monitor

Real-time TUI dashboard for monitoring [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions.

![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## Tab 1 — Overview

Session status, tool usage, subagents, recap, cost at a glance.

```
┌─ ◉ Claude Code Monitor ─────────────────────────────────────────────────┐
│ ▸ C:/projects/my-app                                                    │
│ Session a1b2c3d4  ♦ opus-4-6  ◷ 1h 23m  ⏸ 12s                         │
│ Context ████████████░░░░░░░░ 62%                                        │
│ ▬ Msgs U:15 A:14  ■ Tokens In:45.2K Out:12.1K CW:8.3K CR:102.5K        │
├─ ▶ Tools & Files ────────────────────────────────────────────────────────┤
│   Total: 142 calls  │  ▷Read ||||||||| 52  ✎Write |||| 23  …Search || 8│
│   Read:52(37%)  Edit:23(16%)  Bash:19(13%)  Grep:15(11%)  Agent:12(8%)  │
├─ ● Subagents ────────────────────────────────────────────────────────────┤
│   Total: 3  ● Running: 1  ✓ Done: 2                                    │
│   ● code-reviewer       2m 31s   Review authentication module           │
│   ✓ Explore               45s    Find API endpoints                     │
├─ ▬ Recent Conversation ───────────────────────────────────────────────────┤
│   ▶ 14:23  Add JWT token refresh logic                                  │
│     ◀ JWT refresh 로직을 구현하겠습니다. 먼저 현재 토큰...             │
│   ▶ 14:20  Fix the login validation bug                                 │
│     ◀ 로그인 검증 버그를 확인하겠습니다. validation 로직을...          │
├─ ↻ Recap ────────────────────────────────────────────────────────────────┤
│   #1 14:05  150.2K→45.3K (8s)                                          │
│     • Add authentication to the API                                     │
│     • Fix the login validation bug                                      │
│   Work: implementing JWT token refresh logic                            │
├─ ◈ Cost ─────────────────────────────────────────────────────────────────┤
│   Today $12.45                                                          │
└──────────────── [1:Overview] [2:Flow] [3:Config]  ?:help  n:rename  q:quit ─┘
```

### What each panel shows

| Panel | Description |
|-------|-------------|
| **Header** | Session ID, model, elapsed time, idle time, context window usage bar |
| **Tools & Files** | Tool call counts with percentages + Read/Write/Search activity bars |
| **Subagents** | Running and completed subagents with type, duration, description |
| **Recent Conversation** | User question + AI response summary pairs |
| **Recap** | Context compaction history — token changes, user message summary, current work |
| **Cost** | Today's total API cost |

### Context bar colors

| Color | Range | Meaning |
|-------|-------|---------|
| `███` Green | < 80% | Normal |
| `███` Yellow | 80-89% | Compaction approaching |
| `███` Red | 90%+ | Compaction imminent |

---

## Tab 2 — Flow

Chronological timeline of Claude Code's custom information flow.
Tracks when hooks, rules, memory files, and skills are loaded or executed.

```
┌─ ◉ Flow Summary ────────────────────────────────────────────────────────┐
│   Evt 47 │ ✓Hook 12 │ ☰Rule 8 │ ★Mem 5 │ Skill 3 │ User 6            │
├─ ▸ Flow Timeline ────────────────────────────────────────────────────────┤
│   09:41:02  ▶ [USER ]  #1 Add authentication to the API                │
│   09:41:02  ✓ [HOOK ]  SessionStart skill-activation-protocol           │
│   09:41:02  ☰ [RULE ]  ajax-common-rules.md                            │
│   09:41:02  ★ [MEM  ]  user_code_style.md                              │
│   ──────────────────────────────────────────────────────────────────     │
│   09:42:15  ▶ [USER ]  #2 Fix the login bug                            │
│   09:42:15  ✓ [HOOK ]  UserPromptSubmit skill-activation-protocol       │
│   09:42:15  ✦ [SKILL]  /systematic-debugging                           │
│                                                                         │
│   ═══════════════════════════════════════════════════════════════════    │
│   10:15:32  ↻ [RECAP] Context Compaction  150.2K → 45.3K               │
│   ═══════════════════════════════════════════════════════════════════    │
├─ Filter ─────────────────────────────────────────────────────────────────┤
│   ● h:Hooks  ● f:Rules  ● m:Memory  ● s:Skills  ● u:User              │
└──────────────── [1:Overview] [2:Flow] [3:Config]  ?:help  n:rename  q:quit ─┘
```

### Event icons

| Icon | Tag | Description |
|------|-----|-------------|
| `▶` | USER | User message input |
| `✓` | HOOK | Hook executed successfully |
| `✗` | HOOK | Hook cancelled / timed out |
| `☰` | RULE | Rule file loaded (`.claude/rules/*.md`) |
| `★` | MEM | Memory file loaded (`memory/*.md`) |
| `≡` | SKILL | Available skills listed |
| `✦` | SKILL | Skill invoked (`/brainstorming`, etc.) |
| `↻` | RECAP | Context compaction event |

### Filters

Press the key to toggle each event type on/off (Flow tab only):

| Key | Filter |
|-----|--------|
| `h` | Hook events |
| `f` | Rule events |
| `m` | Memory events |
| `s` | Skill events |
| `u` | User messages |

---

## Tab 3 — Config

Displays the current Claude Code configuration tree — CLAUDE.md, rules, hooks, skills, MCP servers, and memory files.

```
┌─ ◉ Config Summary ──────────────────────────────────────────────────────┐
│   CLAUDE.md: 2  Rules: 15  Hooks: 3  Skills: 42  MCP: 5  Memory: 8    │
├─ ▸ Config Tree ──────────────────────────────────────────────────────────┤
│   📄 CLAUDE.md                                                          │
│     project  C:\project\CLAUDE.md (2.1K)                                │
│     user     C:\Users\User\.claude\CLAUDE.md (1.5K)                     │
│   📏 Rules                                                              │
│     project  ajax-common-rules.md                                       │
│     project  behavior.md                                                │
│     user     dhtmlx-grid-rules.md                                       │
│   🔗 Hooks                                                              │
│     SessionStart  skill-activation-protocol                             │
│     UserPromptSubmit  skill-activation-protocol                         │
│   ⚡ Skills                                                              │
│     brainstorming, debugging, commit, ...                               │
│   🔌 MCP Servers                                                        │
│     playwright, notion, mariadb, ...                                    │
│   🧠 Memory                                                             │
│     user_code_style.md, feedback_slip_amount.md, ...                    │
└──────────────── [1:Overview] [2:Flow] [3:Config]  ?:help  n:rename  q:quit ─┘
```

---

## Install

### npm (from GitHub)

```bash
npm install -g github:Praesentia-YKM/cc-monitor
cc-monitor
```

### From source

```bash
git clone https://github.com/Praesentia-YKM/cc-monitor.git
cd cc-monitor
npm install
npm link     # registers 'cc-monitor' command globally
cc-monitor
```

## Update

```bash
# npm global install
npm install -g github:Praesentia-YKM/cc-monitor

# from source
cd cc-monitor
git pull
npm install
```

## Usage

```bash
cc-monitor            # normal mode
cc-monitor --debug    # debug logging to debug.log
```

Start while a Claude Code session is running.
The monitor auto-detects active sessions and refreshes every 2 seconds.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Overview tab |
| `2` | Flow tab |
| `3` | Config tab |
| `?` | Help overlay (scrollable) |
| `n` | Rename current session |
| `r` | Manual refresh (reset cache) |
| `q` / `ESC` | Quit |
| `Up/Down` | Switch sessions (Overview) / Scroll (Flow, Config, Help) |

### Multi-Session Support

When multiple Claude Code sessions are running, use `Up/Down` arrows on the Overview tab to switch between them. The status bar shows `Session 1/3 [↑↓]`.

Press `n` to give each session a custom name for easy identification. Names persist across monitor restarts.

## How It Works

cc-monitor reads Claude Code's local session data (read-only):

| Path | Data |
|------|------|
| `~/.claude/projects/` | JSONL session logs — messages, tool calls, tokens |
| `~/.claude/sessions/` | Active session metadata — PID, cwd, model |
| `~/.claude/history.jsonl` | User input and skill invocation history |
| `~/.claude/powerline/usage/today.json` | Daily API cost data |
| `~/.claude/settings.json` | Hooks, permissions, env vars |
| `~/.claude/CLAUDE.md` | User-level instructions |
| `.claude/rules/` | Project rules |
| `CLAUDE.md` | Project instructions |

cc-monitor **never modifies** any Claude Code files.

## Requirements

- **Node.js** >= 18
- **Claude Code** — must be installed with at least one active or recent session

## License

MIT
