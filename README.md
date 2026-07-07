# claude-code-resume

Auto-save session state when you hit your Claude Code session limit, log it, and auto-resume at reset time — no manual intervention.

```
You've hit your session limit · resets 4:20pm (Asia/Calcutta)
  ↓
  claude-code-resume saves state + schedules launchd job
  ↓
4:20pm → launchd opens claude -p "/resume" in your project
```

## Install

```bash
npx claude-code-resume setup
```

Or clone directly:

```bash
git clone https://github.com/Soham041201/claude-code-resume.git
cd claude-code-resume
node bin/claude-resume.js setup
```

Or as a Claude Code plugin (coming soon to community marketplace):

```bash
claude plugin add claude-code-resume@claude-community
```

## How it works

```
StopFailure(rate_limit) hook fires
  ├─ 1. Captures git state + session context → ~/.claude/resume/state.json
  ├─ 2. Parses "resets 4:20pm" from session transcript
  ├─ 3. Logs event to ~/.claude/resume/history.jsonl
  └─ 4. Schedules launchd job → at reset time, runs claude -p "/resume"
```

### Resume

When the session limit resets, launchd fires and Claude opens with `/claude-code-resume:resume` — it reads the saved state and presents a briefing of what was being worked on.

### History

All rate-limited sessions are logged to `~/.claude/resume/history.jsonl`:

```bash
npx claude-resume history
```

### CLI

```bash
npx claude-resume save     # Save current state
npx claude-resume load     # Show saved state
npx claude-resume history  # Rate-limit log
npx claude-resume clear    # Clear saved state
npx claude-resume status   # Check scheduled resume
```

## Data

All data lives in `~/.claude/resume/`:

| File | Purpose |
|---|---|
| `state.json` | Last saved session state |
| `history.jsonl` | Append-only rate-limit event log |

## Requirements

- macOS (uses launchd for scheduling)
- Claude Code installed and authenticated
- Node.js 18+

## License

MIT
