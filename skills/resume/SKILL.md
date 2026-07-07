---
name: resume
description: Resume a session that was auto-saved when the rate limit was hit. Loads saved state and presents a briefing so work can continue where it left off.
---

Read the saved state from `~/.claude/resume/state.json`. If it exists and the project matches the current directory, present a concise briefing:

- Project and branch
- Whether there are uncommitted changes
- The last known task/prompt from the previous session
- When the state was saved

Then ask: "This is where I left off. Want me to continue with that task, or something else?"

If no state exists, say "No saved state found."
