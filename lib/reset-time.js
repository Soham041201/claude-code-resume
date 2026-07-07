import { readFileSync, existsSync } from 'fs';

const RESET_PATTERNS = [
  /resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)/i,
  /resets\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)/i,
  /resets\s+(\w+\s+\d+)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)/i,
  /(\d+)-hour\s+limit\s+reached.*?resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)/i,
];

export function findResetTimeInTranscript(transcriptPath) {
  if (!existsSync(transcriptPath)) return null;

  const content = readFileSync(transcriptPath, 'utf-8');
  const lines = content.split('\n').filter(Boolean).slice(-200);

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const text = extractText(obj);
      if (text) {
        const match = parseResetTime(text);
        if (match) return match;
      }
    } catch {}
  }

  return null;
}

function extractText(obj) {
  if (obj.type === 'assistant' && obj.message?.content) {
    const content = obj.message.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.filter(c => c.type === 'text').map(c => c.text).join(' ');
    }
  }
  if (obj.type === 'user' && obj.message?.content) {
    const content = obj.message.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.filter(c => c.type === 'text').map(c => c.text).join(' ');
    }
  }
  return null;
}

export function parseResetTime(text) {
  for (const pattern of RESET_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    // Weekly cap format: "resets Feb 20 at 12am (America/New_York)"
    if (match[1] && match[2] && match[3] && match[4] && match[5] && isNaN(match[1])) {
      const monthDay = match[1];
      let hour = parseInt(match[2]);
      const minute = parseInt(match[3] || '0');
      const ampm = match[4].toLowerCase();
      const timezone = match[5];

      if (ampm === 'pm' && hour !== 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;

      return { type: 'weekly', hour, minute, timezone, monthDay };
    }

    // 5-hour cap format: "resets 9pm (America/New_York)"
    let hour = parseInt(match[1]);
    const minute = parseInt(match[2] || '0');
    const ampm = match[3]?.toLowerCase() || '';
    const timezone = match[4];

    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    return { type: 'session', hour, minute, timezone };
  }

  return null;
}

export function computeSecondsUntilReset(resetInfo) {
  if (!resetInfo) return 5 * 3600;

  const { hour, minute, timezone } = resetInfo;

  const now = new Date();
  const nowMs = now.getTime();

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type) => parseInt(parts.find(p => p.type === type)?.value || '0');

  const currentYear = get('year');
  const currentMonth = get('month');
  const currentDay = get('day');
  const currentHour = get('hour');
  const currentMinute = get('minute');

  let targetDate = new Date(Date.UTC(currentYear, currentMonth - 1, currentDay, hour, minute, 0));

  const targetMs = targetDate.getTime();
  const offset = targetMs - Date.UTC(currentYear, currentMonth - 1, currentDay, currentHour, currentMinute, 0);

  if (offset <= 0) {
    targetDate = new Date(Date.UTC(currentYear, currentMonth - 1, currentDay + 1, hour, minute, 0));
  }

  const secondsUntilReset = Math.max(60, Math.floor((targetDate.getTime() - nowMs) / 1000));
  return secondsUntilReset;
}

export function computeSecondsFromErrorText(message) {
  const resetInfo = parseResetTime(message);
  if (!resetInfo) return 5 * 3600;
  return computeSecondsUntilReset(resetInfo);
}
