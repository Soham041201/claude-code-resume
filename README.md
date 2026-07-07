# claude-code-resume

Auto-save your Claude Code session when the Max plan limit hits and resume right where you left off — no manual intervention, no lost context.

```
You've hit your session limit · resets 4:20pm (Asia/Calcutta)
  ↓
  claude-code-resume saves git state + session context
  ↓
  Schedules launchd for the reset time
  ↓
4:20pm → launchd opens Claude → resume skill shows a briefing
```

## Install

```bash
npx claude-code-resume setup
```

Then restart Claude Code or run `/reload-plugins`.

### Community marketplace (pending review)

```bash
claude plugin marketplace add anthropics/claude-plugins-community
claude plugin install claude-code-resume@claude-community
```

## How it works

```
StopFailure(rate_limit) hook fires
  ├─ 1. Captures git state + session context → ~/.claude/resume/state.json
  ├─ 2. Parses "resets 4:20pm" from session transcript
  ├─ 3. Logs event to ~/.claude/resume/history.jsonl
  └─ 4. Schedules launchd job
         └─ At reset time: claude -p "/claude-code-resume:resume"
              └─ Resume skill reads state → presents briefing
```

## Test it

After install, run a simulation to verify everything works:

```bash
npx claude-code-resume test
```

It saves your current state, logs a test history entry, and shows a 10-second countdown before launching Claude with the resume skill.

## CLI

```bash
npx claude-code-resume setup      # Install to ~/.claude/skills/
npx claude-code-resume test       # Simulate rate limit + resume
npx claude-code-resume save       # Save current session state
npx claude-code-resume load       # View saved state
npx claude-code-resume history    # View rate-limit log
npx claude-code-resume clear      # Clear saved state + unschedule
npx claude-code-resume status     # Check scheduled resume
```

## Data

All data stays local in `~/.claude/resume/`:

| File | Purpose |
|---|---|
| `state.json` | Last saved session state (git branch, diff, recent messages) |
| `history.jsonl` | Append-only rate-limit event log |
| `launchd-stdout.log` | Launchd output (for debugging) |

## Requirements

- macOS (uses launchd for scheduling)
- Claude Code installed and authenticated
- Node.js 18+

## License

MIT
