import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const DATA_DIR = join(homedir(), '.claude', 'resume');
const HISTORY_FILE = join(DATA_DIR, 'history.jsonl');

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function logRateLimit(entry) {
  ensureDir();
  const record = {
    ts: new Date().toISOString(),
    ...entry,
  };
  appendFileSync(HISTORY_FILE, JSON.stringify(record) + '\n');
  return record;
}

export function getHistory(limit = 50) {
  if (!existsSync(HISTORY_FILE)) return [];
  const content = readFileSync(HISTORY_FILE, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  const entries = lines.map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  return entries.slice(-limit).reverse();
}

export function clearHistory() {
  if (existsSync(HISTORY_FILE)) writeFileSync(HISTORY_FILE, '');
}
