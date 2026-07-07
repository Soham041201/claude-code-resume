#!/usr/bin/env node

import { saveState, loadState, clearState } from '../lib/save.js';
import { logRateLimit, getHistory, clearHistory } from '../lib/history.js';
import { getScheduledStatus, unloadExisting } from '../lib/scheduler.js';

const cmd = process.argv[2];
const cwd = process.argv[3] || process.cwd();

switch (cmd) {
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
  save [cwd]         Save current session state
  load [cwd]         Load saved session state
  clear              Clear saved state and unschedule resume
  history            Show rate-limit history
  clear-history      Clear history log
  schedule <secs>    Schedule a resume in N seconds (for testing)
  status             Check if resume is scheduled
`);
}
