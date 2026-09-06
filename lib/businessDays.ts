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
  sendWindowEndHour: number;
  sendWindowDays: string; // e.g. "MON,TUE,WED,THU,FRI"
}

/**
 * If `date` falls outside the configured sending window (wrong day or wrong hour),
 * moves it forward to the next valid moment inside the window. PRD §42.
 */
export function clampToSendingWindow(date: Date, window: SendingWindow): Date {
  const allowedDays = new Set(window.sendWindowDays.split(",").map((d) => d.trim()));
  const result = new Date(date);

  for (let i = 0; i < 14; i++) {
    const dayCode = DAY_CODES[result.getDay()];
    if (!allowedDays.has(dayCode)) {
      result.setDate(result.getDate() + 1);
      result.setHours(window.sendWindowStartHour, 0, 0, 0);
      continue;
    }
    if (result.getHours() < window.sendWindowStartHour) {
      result.setHours(window.sendWindowStartHour, 0, 0, 0);
      continue;
    }
    if (result.getHours() >= window.sendWindowEndHour) {
      result.setDate(result.getDate() + 1);
      result.setHours(window.sendWindowStartHour, 0, 0, 0);
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
  const startMinutes = window.sendWindowStartHour * 60;
  const endMinutes = window.sendWindowEndHour * 60;
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
  const hour = date.getHours();
  return hour >= window.sendWindowStartHour && hour < window.sendWindowEndHour;
}
