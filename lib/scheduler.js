import { writeFileSync, existsSync, rmSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join, isAbsolute } from 'path';
import { homedir } from 'os';

const PLIST_NAME = 'com.user.claude-resume';
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${PLIST_NAME}.plist`);
const LOG_DIR = join(homedir(), '.claude', 'resume');
const STDOUT_LOG = join(LOG_DIR, 'launchd-stdout.log');
const STDERR_LOG = join(LOG_DIR, 'launchd-stderr.log');

function validateDir(p) {
  if (typeof p !== 'string' || !p) return false;
  if (!isAbsolute(p)) return false;
  try { return statSync(p).isDirectory(); } catch { return false; }
}

export function scheduleResume(cwd, secondsUntilReset) {
  unloadExisting();

  const targetCwd = validateDir(cwd) ? cwd : homedir();

  const esc = (s) => s.replace(/[\\"'$`!|&;()<>]/g, '\\$&');
  const resumeCmd = `cd "${esc(targetCwd)}" && claude -p "/resume"`;
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
  <key>StartInterval</key>
  <integer>${secondsUntilReset}</integer>
  <key>RunAtLoad</key>
  <false/>
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
    if (existsSync(PLIST_PATH)) {
      execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null`, { stdio: 'pipe' });
      rmSync(PLIST_PATH);
    }
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
