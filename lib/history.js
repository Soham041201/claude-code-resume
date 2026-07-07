import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const DATA_DIR = join(homedir(), '.claude', 'resume');
const HISTORY_FILE = join(DATA_DIR, 'history.jsonl');

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

const MAX_FIELD_LENGTH = 2000;

export function logRateLimit(entry) {
  ensureDir();
  const record = {
    ts: new Date().toISOString(),
    ...entry,
  };
  for (const key of ['error', 'error_details']) {
    if (typeof record[key] === 'string' && record[key].length > MAX_FIELD_LENGTH) {
      record[key] = record[key].slice(0, MAX_FIELD_LENGTH) + '...';
    }
  }
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
