#!/usr/bin/env node

import { saveState } from '../lib/save.js';
import { logRateLimit } from '../lib/history.js';
import { findResetTimeInTranscript, computeSecondsFromErrorText, computeSecondsUntilReset } from '../lib/reset-time.js';
import { scheduleResume } from '../lib/scheduler.js';
import { basename } from 'path';

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(input);
    const { cwd, session_id, error, error_details, transcript_path } = event;
    const project = cwd ? basename(cwd) : 'unknown';

    const state = saveState(cwd || process.cwd(), session_id);

    let secondsUntilReset = 5 * 3600;
    let resetSource = 'fallback';

    // Parse reset time from error_details first (most reliable — the
    // error message like "resets 4:20pm (Asia/Calcutta)" is delivered
    // via the StopFailure event, not always written to transcript
    // before the process is killed).
    if (error_details) {
      const fromError = computeSecondsFromErrorText(error_details);
      if (fromError !== 5 * 3600) {
        secondsUntilReset = fromError;
        resetSource = 'error_details';
      }
    }

    // Fall back to transcript parsing if error_details didn't yield
    // a result. The transcript may contain the error message if the
    // process managed to flush before termination.
    if (resetSource === 'fallback' && transcript_path) {
      const resetInfo = findResetTimeInTranscript(transcript_path);
      if (resetInfo) {
        secondsUntilReset = computeSecondsUntilReset(resetInfo);
        resetSource = `transcript:${resetInfo.type}`;
      }
    }

    logRateLimit({
      session_id,
      project,
      branch: state.branch,
      error,
      error_details,
      reset_source: resetSource,
      seconds_until_reset: secondsUntilReset,
      reset_at: new Date(Date.now() + secondsUntilReset * 1000).toISOString(),
    });

    if (cwd) {
      scheduleResume(cwd, secondsUntilReset);
    }

    process.exit(0);
  } catch (err) {
    process.stderr.write(`claude-resume-hook error: ${err.message}\n`);
    process.exit(1);
  }
});
