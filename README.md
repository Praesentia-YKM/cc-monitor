# cc-monitor

Real-time TUI dashboard for monitoring [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions.

![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

```
┌─ ◉ Claude Code Monitor ─────────────────────────────────────────────┐
│ ▸ C:/projects/my-app                                                │
│ Session a1b2c3d4  ♦ opus-4-6  ◷ 1h 23m  ⏸ 12s                     │
│ Context ████████████░░░░░░░░ 62%                                    │
│ ▬ Msgs U:15 A:14  ■ Tokens In:45.2K Out:12.1K                      │
├─ ▶ Tools & Files ───────────────────────────────────────────────────┤
│ Total: 142 calls  ▷Read ||||||||| 52  ✎Write |||| 23  …Search || 8 │
│ Read:52(37%) Edit:23(16%) Bash:19(13%) Grep:15(11%) Agent:12(8%)    │
├─ ● Subagents ───────────────────────────────────────────────────────┤
│ ● code-reviewer       2m 31s  Review authentication module          │
│ ✓ Explore             45s     Find API endpoints                    │
├─ ★ Recent Activity ─────────────────────────────────────────────────┤
│ ★ 14:23  /commit                                                    │
│   14:20  Add user auth middleware                                   │
├─ ◈ Cost ────────────────────────────────────────────────────────────┤
│ Today $12.45  │  Session $3.21                                      │
└─────────────────────────── [1:Overview] [2:Flow]  ?:help  q:quit ───┘
```

## Features

**Overview Tab**
- Session info — model, age, idle time, working directory
- Context window progress bar with color-coded warnings (green/yellow/red)
- Tool usage breakdown with file activity bars (Read/Write/Search)
- Subagent tracking (running/completed with elapsed time)
- Recent user inputs and skill invocations
- Daily + session cost tracking

**Flow Tab**
- Chronological timeline of Claude Code's custom information flow
- Tracks hooks, rules, memory, skills execution in real-time
- Filterable by event type (h/f/m/s/u keys)

**Multi-Session**
- Auto-detects all active Claude Code sessions
- Navigate between sessions with arrow keys
- Rename sessions for easy identification (`n` key)

## Install

### npm (global)

```bash
npm install -g cc-monitor
cc-monitor
```

### From source

```bash
git clone https://github.com/Praesentia-YKM/cc-monitor.git
cd cc-monitor
npm install
npm link     # registers 'cc-monitor' command globally
```

## Usage

```bash
cc-monitor
```

Start while a Claude Code session is running. The monitor auto-detects active sessions and refreshes every 2 seconds.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Overview tab |
| `2` | Flow tab |
| `?` | Help overlay |
| `n` | Rename current session |
| `r` | Manual refresh (reset cache) |
| `q` / `ESC` | Quit |
| `Up/Down` | Switch sessions (Overview) / Scroll (Flow, Help) |

**Flow tab filters:**

| Key | Toggle |
|-----|--------|
| `h` | Hook events |
| `f` | Rule events |
| `m` | Memory events |
| `s` | Skill events |
| `u` | User messages |

## How It Works

cc-monitor reads Claude Code's local session data:

- **`~/.claude/projects/`** — JSONL session logs (messages, tool calls, tokens)
- **`~/.claude/sessions/`** — Active session metadata (PID, cwd, model)
- **`~/.claude/history.jsonl`** — User input and skill history
- **`~/.claude/powerline/usage/today.json`** — Daily cost data

All data is read-only. cc-monitor never modifies Claude Code's files.

## Context Bar Colors

| Color | Range | Meaning |
|-------|-------|---------|
| Green | < 80% | Normal |
| Yellow | 80–89% | Compaction approaching |
| Red | 90%+ | Compaction imminent |

## Requirements

- **Node.js** >= 18
- **Claude Code** — must be installed and have at least one active or recent session

## License

MIT
