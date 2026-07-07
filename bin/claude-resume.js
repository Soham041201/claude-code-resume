#!/usr/bin/env node

import { saveState, loadState, clearState } from '../lib/save.js';
import { logRateLimit, getHistory, clearHistory } from '../lib/history.js';
import { scheduleResume, getScheduledStatus, unloadExisting } from '../lib/scheduler.js';
import { findResetTimeInTranscript, computeSecondsUntilReset } from '../lib/reset-time.js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, statSync } from 'fs';
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
    // Remove old install first, then copy via rsync to exclude .git
    execSync(`rm -rf "${target}" 2>/dev/null; mkdir -p "${target}" && rsync -a --exclude=.git "${PLUGIN_ROOT}/" "${target}/"`, { stdio: 'pipe' });
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

    // 1. Start a fresh disposable session with a unique tag
    const testTag = `resume-test-${Date.now()}`;
    console.log(`  ${T.bold('→')}  Starting fresh test session...`);
    const claudeProc = execSync(`claude --print "echo ${testTag}" 2>/dev/null & echo $!`, {
      encoding: 'utf-8', stdio: 'pipe', shell: true,
    }).trim();
    const claudePid = parseInt(claudeProc.split('\n').pop());
    console.log(`     PID: ${claudePid}`);

    // 2. Wait for it to finish
    execSync('sleep 5', { stdio: 'ignore' });

    // 3. Find the transcript containing our test tag
    const projDir = join(homedir(), '.claude', 'projects');
    let sessionId = '';
    let sessionCwd = cwd;
    if (existsSync(projDir)) {
      const dirs = readdirSync(projDir);
      scan: for (const dir of dirs) {
        const d = join(projDir, dir);
        if (!statSync(d).isDirectory()) continue;
        for (const f of readdirSync(d)) {
          if (!f.endsWith('.jsonl')) continue;
          try {
            const content = readFileSync(join(d, f), 'utf-8');
            if (content.includes(testTag)) {
              const first = content.split('\n')[0];
              const parsed = JSON.parse(first);
              if (parsed.sessionId) {
                sessionId = parsed.sessionId;
                sessionCwd = parsed.cwd || cwd;
                break scan;
              }
            }
          } catch {}
        }
      }
    }

    if (!sessionId) {
      console.log(`  ${T.bold('✖')}  Could not get session ID from transcript.`);
      console.log(`     The test session might not have created a transcript file.`);
      process.exit(1);
    }

    // 3. Save state and schedule resume
    const state = saveState(sessionCwd, sessionId);
    logRateLimit({
      session_id: sessionId,
      project: state.project,
      branch: state.branch,
      error: 'rate_limit',
      error_details: 'Simulated rate limit for testing',
      reset_source: 'test',
      seconds_until_reset: 15,
      reset_at: new Date(Date.now() + 15000).toISOString(),
    });
    scheduleResume(sessionCwd, 15);

    console.log(`  ${T.bold('✔')}  Fresh session created & saved:`);
    console.log(`     Session: ${sessionId}`);
    console.log(`     CWD:     ${sessionCwd}`);
    console.log('');
    console.log(`  ${T.bold('✔')}  State saved, history logged`);
    console.log(`  ${T.bold('✔')}  Resume scheduled in 15 seconds`);
    console.log('');
    console.log(`  ${T.bold('→')}  A new Terminal window will open in 15s`);
    console.log(`     with claude --resume ${sessionId}`);
    console.log('');
    process.stdout.write(`     Resuming in `);
    for (let i = 15; i > 0; i--) {
      process.stdout.write(`\r     Resuming in ${i}...`);
      execSync('sleep 1', { stdio: 'ignore' });
    }
    process.stdout.write(`\r     Resuming now...\n`);
    execSync('sleep 2', { stdio: 'ignore' });

    // 4. Check results
    const statusText = getScheduledStatus();
    console.log('');
    if (statusText === 'not scheduled') {
      console.log(`  ${T.bold('✔')}  launchd fired and unloaded`);
    } else {
      console.log(`  ${T.bold('→')}  Terminal window should already be open with the resumed session.`);
    }

    console.log('');
    console.log(`  ${T.bold('→')}  Inspect saved state:`);
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
