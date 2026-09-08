const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Adds N business days (Mon-Fri) to a date, landing on a business day. */
export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return result;
}

/** Adds N calendar days (used for the Creator track, which is not business-day gated). */
export function addCalendarDays(start: Date, days: number): Date {
  const result = new Date(start);
  result.setDate(result.getDate() + days);
  return result;
}

interface SendingWindow {
  sendWindowStartHour: number;
  sendWindowStartMinute: number;
  sendWindowEndHour: number;
  sendWindowEndMinute: number;
  sendWindowDays: string; // e.g. "MON,TUE,WED,THU,FRI"
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function windowStartMinutes(window: SendingWindow): number {
  return window.sendWindowStartHour * 60 + window.sendWindowStartMinute;
}

function windowEndMinutes(window: SendingWindow): number {
  return window.sendWindowEndHour * 60 + window.sendWindowEndMinute;
}

/**
 * If `date` falls outside the configured sending window (wrong day or wrong time), moves it
 * forward to the next valid moment inside the window. PRD §42. Minute-precise — a 9:30am start
 * isn't representable with hour-only granularity.
 */
export function clampToSendingWindow(date: Date, window: SendingWindow): Date {
  const allowedDays = new Set(window.sendWindowDays.split(",").map((d) => d.trim()));
  const result = new Date(date);
  const startMin = windowStartMinutes(window);
  const endMin = windowEndMinutes(window);

  for (let i = 0; i < 14; i++) {
    const dayCode = DAY_CODES[result.getDay()];
    if (!allowedDays.has(dayCode)) {
      result.setDate(result.getDate() + 1);
      result.setHours(window.sendWindowStartHour, window.sendWindowStartMinute, 0, 0);
      continue;
    }
    const nowMin = minutesOfDay(result);
    if (nowMin < startMin) {
      result.setHours(window.sendWindowStartHour, window.sendWindowStartMinute, 0, 0);
      continue;
    }
    if (nowMin >= endMin) {
      result.setDate(result.getDate() + 1);
      result.setHours(window.sendWindowStartHour, window.sendWindowStartMinute, 0, 0);
      continue;
    }
    return result;
  }
  return result;
}

/**
 * Picks a random moment within the sending window on the earliest valid day at/after `date` —
 * used so different sequences' follow-ups don't all land in the recipient's inbox at the exact
 * same clock time (an obvious "this is automated" signal). Reuses clampToSendingWindow to find
 * the right day, then overrides the time-of-day with a random pick inside the window.
 */
export function pickRandomSendTime(date: Date, window: SendingWindow): Date {
  const result = clampToSendingWindow(date, window);
  const startMinutes = windowStartMinutes(window);
  const endMinutes = windowEndMinutes(window);
  const rangeMinutes = Math.max(endMinutes - startMinutes, 1);
  const offsetMinutes = Math.floor(Math.random() * rangeMinutes);
  const totalMinutes = startMinutes + offsetMinutes;
  result.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, Math.floor(Math.random() * 60), 0);
  return result;
}

export function isWithinSendingWindow(date: Date, window: SendingWindow): boolean {
  const allowedDays = new Set(window.sendWindowDays.split(",").map((d) => d.trim()));
  const dayCode = DAY_CODES[date.getDay()];
  if (!allowedDays.has(dayCode)) return false;
  const nowMin = minutesOfDay(date);
  return nowMin >= windowStartMinutes(window) && nowMin < windowEndMinutes(window);
}
