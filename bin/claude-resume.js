#!/usr/bin/env node

import { saveState, loadState, clearState } from '../lib/save.js';
import { logRateLimit, getHistory, clearHistory } from '../lib/history.js';
import { scheduleResume, getScheduledStatus, unloadExisting } from '../lib/scheduler.js';
import { findResetTimeInTranscript, computeSecondsUntilReset } from '../lib/reset-time.js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');

const cmd = process.argv[2];
const cwd = process.argv[3] || process.cwd();

switch (cmd) {
  case 'setup': {
    const target = join(homedir(), '.claude', 'skills', 'claude-code-resume');
    if (!existsSync(dirname(target))) mkdirSync(dirname(target), { recursive: true });
    cpSync(PLUGIN_ROOT, target, { recursive: true, force: true });
    console.log(`Installed to ${target}`);
    console.log('');
    console.log('To activate, restart Claude Code or run: /reload-plugins');
    console.log('');
    console.log('Once active, the plugin automatically saves your session when');
    console.log('the Max plan limit is hit and resumes when the reset window opens.');
    console.log('');

    try {
      const state = saveState(cwd);
      const projDirName = cwd.replace(/\//g, '-');
      const projDir = join(homedir(), '.claude', 'projects', projDirName);
      if (existsSync(projDir)) {
        const files = readdirSync(projDir)
          .filter(f => f.endsWith('.jsonl'))
          .map(f => ({ name: f, mtime: statSync(join(projDir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);
        if (files.length > 0) {
          const latest = join(projDir, files[0].name);
          const resetInfo = findResetTimeInTranscript(latest);
          if (resetInfo) {
            const seconds = computeSecondsUntilReset(resetInfo);
            scheduleResume(cwd, seconds);
            console.log(`Recovered from a recent rate limit —`);
            console.log(`resume scheduled in ~${Math.round(seconds / 60)} min.`);
            console.log('');
          }
        }
      }
    } catch {}

    console.log('Commands: npx claude-code-resume save | load | history | test');
    break;
  }

  case 'save': {
    const state = saveState(cwd);
    console.log(JSON.stringify(state, null, 2));
    break;
  }

  case 'load':
    const loaded = loadState();
    if (!loaded) {
      console.log(JSON.stringify({ error: 'no saved state' }));
      process.exit(0);
    }
    console.log(JSON.stringify(loaded, null, 2));
    break;

  case 'clear':
    clearState();
    unloadExisting();
    console.log('cleared');
    break;

  case 'history':
    const entries = getHistory();
    console.log(JSON.stringify(entries, null, 2));
    break;

  case 'clear-history':
    clearHistory();
    console.log('history cleared');
    break;

  case 'schedule': {
    const seconds = parseInt(process.argv[3] || '300');
    scheduleResume(cwd, seconds);
    console.log(`scheduled resume in ${seconds}s`);
    break;
  }

  case 'status':
    console.log(getScheduledStatus());
    break;

  case 'test': {
    const T = { bold: (s) => `\x1b[1m${s}\x1b[22m` };
    unloadExisting();

    console.log('');
    console.log(`  ╭──────────────────────────────────────────╮`);
    console.log(`  │${T.bold('        claude-code-resume test         ')}│`);
    console.log(`  ╰──────────────────────────────────────────╯`);
    console.log('');

    const sessionId = `test-${Date.now()}`;
    const state = saveState(cwd, sessionId);
    logRateLimit({
      session_id: sessionId,
      project: state.project,
      branch: state.branch,
      error: 'rate_limit',
      error_details: 'Simulated rate limit for testing',
      reset_source: 'test',
      seconds_until_reset: 10,
      reset_at: new Date(Date.now() + 10000).toISOString(),
    });
    scheduleResume(cwd, 10);

    console.log(`  ${T.bold('✔')}  Saved state + session ID`);
    console.log(`  ${T.bold('✔')}  Test entry logged to history`);
    console.log(`  ${T.bold('✔')}  Resume scheduled in 10 seconds`);
    console.log('');
    console.log(`  ${T.bold('→')}  When the timer fires, launchd runs:`);
    console.log(`     claude --resume ${sessionId}`);
    console.log('');
    console.log(`  ${T.bold('→')}  Inspect saved data:`);
    console.log(`     npx claude-code-resume load`);
    console.log(`     npx claude-code-resume history`);
    console.log('');
    break;
  }

  default:
    console.log(`
Usage: claude-resume <command> [args]

Commands:
  setup              Install plugin to ~/.claude/skills/ (auto-load)
  save [cwd]         Save current session state
  load [cwd]         Load saved session state
  clear              Clear saved state and unschedule resume
  history            Show rate-limit history
  clear-history      Clear history log
  schedule <secs>    Schedule a resume in N seconds (for testing)
  status             Check if resume is scheduled
  test               Run a simulation (save + history + schedule 60s)
`);
}
