import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join, basename } from 'path';

const DATA_DIR = join(homedir(), '.claude', 'resume');
const STATE_FILE = join(DATA_DIR, 'state.json');

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function run(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

export function saveState(cwd, sessionId) {
  ensureDir();

  const state = {
    saved_at: new Date().toISOString(),
    cwd,
    project: basename(cwd),
    session_id: sessionId || null,
  };

  const branch = run('git branch --show-current', cwd) || run('git rev-parse --short HEAD', cwd);
  state.branch = branch || '?';

  const status = run('git status --porcelain', cwd);
  state.dirty = status.length > 0;
  state.dirty_files = status ? status.split('\n').filter(Boolean) : [];

  const diffStat = run('git diff --stat 2>/dev/null', cwd);
  state.diff_stat = diffStat || '';

  const lastLog = run('git log --oneline -3', cwd);
  state.recent_commits = lastLog ? lastLog.split('\n') : [];

  const projDirName = cwd.replace(/\//g, '-');
  const projDir = join(homedir(), '.claude', 'projects', projDirName);

  if (existsSync(projDir)) {
    const files = readdirSync(projDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, mtime: statSync(join(projDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > 0) {
      const latest = join(projDir, files[0].name);
      try {
        const content = readFileSync(latest, 'utf-8');
        const lines = content.split('\n').filter(Boolean);
        const tail = lines.slice(-80);

        const messages = [];
        for (const line of tail) {
          try {
            const obj = JSON.parse(line);
            if (obj.type === 'user') {
              const msg = obj.message?.content;
              if (typeof msg === 'string') messages.push(`USER: ${msg.slice(0, 200)}`);
              else if (Array.isArray(msg)) {
                for (const c of msg) {
                  if (c.type === 'text') messages.push(`USER: ${c.text.slice(0, 200)}`);
                }
              }
            } else if (obj.type === 'ai-title') {
              messages.push(`TITLE: ${obj.aiTitle || ''}`);
            }
          } catch {}
        }
        state.session_context = messages.slice(-40).join('\n');
      } catch {}
    }
  }

  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  return state;
}

export function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
}

export function clearState() {
  try {
    if (existsSync(STATE_FILE)) writeFileSync(STATE_FILE, '{}');
  } catch {}
}
