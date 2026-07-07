import { writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join, isAbsolute } from 'path';
import { homedir } from 'os';

const DATA_DIR = join(homedir(), '.claude', 'resume');
const STATE_FILE = join(DATA_DIR, 'state.json');
const PLIST_NAME = 'com.user.claude-resume';
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${PLIST_NAME}.plist`);
const STDOUT_LOG = join(DATA_DIR, 'launchd-stdout.log');
const STDERR_LOG = join(DATA_DIR, 'launchd-stderr.log');

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
  const resumeCmd = sessionId
    ? `cd "${esc(targetCwd)}" && ${esc(claudePath)} -p "Continue from where I left off." --resume "${esc(sessionId)}"`
    : `cd "${esc(targetCwd)}" && ${esc(claudePath)} -p "I was working on ${esc(targetCwd.split('/').pop())}. Continue from where I left off."`;
  const cleanupCmd = `launchctl unload "${esc(PLIST_PATH)}" 2>/dev/null; rm -f "${esc(PLIST_PATH)}"`;
  const fullCmd = `${resumeCmd}; ${cleanupCmd}`;

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>${fullCmd}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${homedir()}/.local/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
  <key>StartInterval</key>
  <integer>${secondsUntilReset}</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>TimeOut</key>
  <integer>120</integer>
  <key>StandardOutPath</key>
  <string>${STDOUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${STDERR_LOG}</string>
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
