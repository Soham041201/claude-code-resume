#!/usr/bin/env node

import { saveState, loadState, clearState } from '../lib/save.js';
import { logRateLimit, getHistory, clearHistory } from '../lib/history.js';
import { getScheduledStatus, unloadExisting } from '../lib/scheduler.js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');

const cmd = process.argv[2];
const cwd = process.argv[3] || process.cwd();

switch (cmd) {
  case 'setup':
    const target = join(homedir(), '.claude', 'skills', 'claude-code-resume');
    if (!existsSync(dirname(target))) mkdirSync(dirname(target), { recursive: true });
    cpSync(PLUGIN_ROOT, target, { recursive: true, force: true });
    console.log(`Installed to ${target}`);
    console.log('');
    console.log('What happens next:');
    console.log('  1. Restart Claude Code — the plugin auto-loads on next session.');
    console.log('  2. The StopFailure(rate_limit) hook is now registered automatically.');
    console.log('  3. When you hit a Max plan session limit, the hook fires:');
    console.log('     • Saves git state, session purpose, and recent context');
    console.log('     • Parses the reset time from the error');
    console.log('     • Schedules auto-resume via launchd');
    console.log('     • Logs the event to ~/.claude/resume/history.jsonl');
    console.log('  4. When the rate limit resets, launchd runs: claude -p "/resume"');
    console.log('     This triggers the resume skill, which presents a briefing');
    console.log('     of where you left off and asks if you want to continue.');
    console.log('');
    console.log('For help: npx claude-code-resume');
    console.log('Test immediately: claude --plugin-dir ' + PLUGIN_ROOT);
    break;

  case 'save':
    const state = saveState(cwd);
    console.log(JSON.stringify(state, null, 2));
    break;

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

  case 'schedule':
    const seconds = parseInt(process.argv[3] || '300');
    const { scheduleResume } = await import('../lib/scheduler.js');
    scheduleResume(cwd, seconds);
    console.log(`scheduled resume in ${seconds}s`);
    break;

  case 'status':
    console.log(getScheduledStatus());
    break;

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
`);
}
