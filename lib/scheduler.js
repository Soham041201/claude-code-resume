import { writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join, isAbsolute } from 'path';
import { homedir } from 'os';

const DATA_DIR = join(homedir(), '.claude', 'resume');
const STATE_FILE = join(DATA_DIR, 'state.json');
const PLIST_NAME = 'com.user.claude-resume';
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${PLIST_NAME}.plist`);
const SCRIPT_PATH = join(DATA_DIR, 'resume.sh');

function validateDir(p) {
  if (typeof p !== 'string' || !p) return false;
  if (!isAbsolute(p)) return false;
  try { return statSync(p).isDirectory(); } catch { return false; }
}

export function scheduleResume(cwd, secondsUntilReset) {
  unloadExisting();

  const targetCwd = validateDir(cwd) ? cwd : homedir();

  let sessionId = '';
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    if (state.session_id) sessionId = state.session_id;
  } catch {}

  let claudePath = 'claude';
  try {
    claudePath = execSync('which claude 2>/dev/null || echo claude', { encoding: 'utf-8' }).trim().split('\n')[0];
  } catch {}

  const esc = (s) => s.replace(/[\\"'$`!|&;()<>]/g, '\\$&');

  // Write a shell script that Terminal will execute
  // This avoids osascript escaping complexity
  const scriptContent = sessionId
    ? `#!/bin/bash
cd "${esc(targetCwd)}" || exit 1
echo "=== Resuming previous Claude Code session ==="
echo "Session: ${esc(sessionId)}"
echo "Project: ${esc(targetCwd.split('/').pop())}"
echo ""
"${esc(claudePath)}" --resume "${esc(sessionId)}"
echo ""
echo "=== Session ended. Cleaning up... ==="
launchctl unload "${esc(PLIST_PATH)}" 2>/dev/null
rm -f "${esc(PLIST_PATH)}"
rm -f "${esc(SCRIPT_PATH)}"
`
    : `#!/bin/bash
cd "${esc(targetCwd)}" || exit 1
echo "=== Resuming work on ${esc(targetCwd.split('/').pop())} ==="
"${esc(claudePath)}"
echo ""
echo "=== Session ended. Cleaning up... ==="
launchctl unload "${esc(PLIST_PATH)}" 2>/dev/null
rm -f "${esc(PLIST_PATH)}"
rm -f "${esc(SCRIPT_PATH)}"
`;

  writeFileSync(SCRIPT_PATH, scriptContent, { mode: 0o755 });

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-a</string>
    <string>Terminal</string>
    <string>${SCRIPT_PATH}</string>
  </array>
  <key>StartInterval</key>
  <integer>${secondsUntilReset}</integer>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>`;

  writeFileSync(PLIST_PATH, plist, 'utf-8');
  execSync(`launchctl load "${PLIST_PATH}"`, { stdio: 'pipe' });
}

export function unloadExisting() {
  try {
    execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null`, { stdio: 'pipe' });
  } catch {}
  try {
    execSync(`launchctl remove ${PLIST_NAME} 2>/dev/null`, { stdio: 'pipe' });
  } catch {}
  try {
    if (existsSync(PLIST_PATH)) rmSync(PLIST_PATH);
  } catch {}
}

export function getScheduledStatus() {
  try {
    const out = execSync(`launchctl list ${PLIST_NAME} 2>/dev/null || true`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return out.trim() || 'not scheduled';
  } catch {
    return 'not scheduled';
  }
}
