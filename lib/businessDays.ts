// Every date here (day-of-week, business-day math, the sending window) is evaluated against
// India Standard Time — the team's actual business timezone — not whatever timezone the process
// happens to be running in. That distinction is invisible in local dev (this machine's own clock
// is IST) but is NOT invisible on Vercel, which runs in UTC: the old implementation used
// `date.getHours()`/`getDay()`/etc, which read the *server's* local time, so "9:30am-12:00pm"
// was actually being enforced as 9:30am-12:00pm UTC (= 3:00-5:30pm IST) in production, and
// business-day rollover happened on the UTC calendar boundary instead of the IST one. IST has no
// DST, so a fixed +5:30 offset is exact and doesn't need a timezone-database library — shifting a
// UTC instant by that offset and reading its UTC fields gives you IST wall-clock fields, and the
// reverse (treating desired IST wall-clock fields as UTC, then subtracting the offset) gives you
// the correct real-world instant.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

interface IstParts {
  year: number;
  month: number; // 0-11
  date: number;
  day: number; // 0=Sun..6=Sat
  hours: number;
  minutes: number;
}

function toIstParts(date: Date): IstParts {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    day: shifted.getUTCDay(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

/** The real-world instant corresponding to a specific IST wall-clock moment. */
function fromIstParts(year: number, month: number, date: number, hours: number, minutes: number, seconds = 0, ms = 0): Date {
  return new Date(Date.UTC(year, month, date, hours, minutes, seconds, ms) - IST_OFFSET_MS);
}

const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Adds N business days (Mon-Fri, IST calendar) to a date, landing on a business day. */
export function addBusinessDays(start: Date, days: number): Date {
  const p = toIstParts(start);
  let y = p.year;
  let m = p.month;
  let d = p.date;
  let remaining = days;
  while (remaining > 0) {
    const next = new Date(Date.UTC(y, m, d + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth();
    d = next.getUTCDate();
    const dow = next.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return fromIstParts(y, m, d, p.hours, p.minutes);
}

/** Adds N calendar days, IST calendar (used for the Creator track, which is not business-day gated). */
export function addCalendarDays(start: Date, days: number): Date {
  const p = toIstParts(start);
  const next = new Date(Date.UTC(p.year, p.month, p.date + days));
  return fromIstParts(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), p.hours, p.minutes);
}

interface SendingWindow {
  sendWindowStartHour: number;
  sendWindowStartMinute: number;
  sendWindowEndHour: number;
  sendWindowEndMinute: number;
  sendWindowDays: string; // e.g. "MON,TUE,WED,THU,FRI"
}

function windowStartMinutes(window: SendingWindow): number {
  return window.sendWindowStartHour * 60 + window.sendWindowStartMinute;
}

function windowEndMinutes(window: SendingWindow): number {
  return window.sendWindowEndHour * 60 + window.sendWindowEndMinute;
}

/**
 * If `date` falls outside the configured sending window (wrong day or wrong time, both read in
 * IST), moves it forward to the next valid moment inside the window. PRD §42. Minute-precise — a
 * 9:30am start isn't representable with hour-only granularity.
 */
export function clampToSendingWindow(date: Date, window: SendingWindow): Date {
  const allowedDays = new Set(window.sendWindowDays.split(",").map((d) => d.trim()));
  const startMin = windowStartMinutes(window);
  const endMin = windowEndMinutes(window);

  let candidate = date;
  for (let i = 0; i < 14; i++) {
    const p = toIstParts(candidate);
    const dayCode = DAY_CODES[p.day];
    if (!allowedDays.has(dayCode)) {
      candidate = fromIstParts(p.year, p.month, p.date + 1, window.sendWindowStartHour, window.sendWindowStartMinute);
      continue;
    }
    const nowMin = p.hours * 60 + p.minutes;
    if (nowMin < startMin) {
      return fromIstParts(p.year, p.month, p.date, window.sendWindowStartHour, window.sendWindowStartMinute);
    }
    if (nowMin >= endMin) {
      candidate = fromIstParts(p.year, p.month, p.date + 1, window.sendWindowStartHour, window.sendWindowStartMinute);
      continue;
    }
    return candidate;
  }
  return candidate;
}

/**
 * Picks a random moment within the sending window (IST) on the earliest valid day at/after
 * `date` — used so different sequences' follow-ups don't all land in the recipient's inbox at
 * the exact same clock time (an obvious "this is automated" signal). Reuses clampToSendingWindow
 * to find the right day, then overrides the time-of-day with a random pick inside the window.
 */
export function pickRandomSendTime(date: Date, window: SendingWindow): Date {
  const clamped = clampToSendingWindow(date, window);
  const p = toIstParts(clamped);
  const startMinutes = windowStartMinutes(window);
  const endMinutes = windowEndMinutes(window);
  const rangeMinutes = Math.max(endMinutes - startMinutes, 1);
  const offsetMinutes = Math.floor(Math.random() * rangeMinutes);
  const totalMinutes = startMinutes + offsetMinutes;
  return fromIstParts(p.year, p.month, p.date, Math.floor(totalMinutes / 60), totalMinutes % 60, Math.floor(Math.random() * 60));
}

export function isWithinSendingWindow(date: Date, window: SendingWindow): boolean {
  const allowedDays = new Set(window.sendWindowDays.split(",").map((d) => d.trim()));
  const p = toIstParts(date);
  const dayCode = DAY_CODES[p.day];
  if (!allowedDays.has(dayCode)) return false;
  const nowMin = p.hours * 60 + p.minutes;
  return nowMin >= windowStartMinutes(window) && nowMin < windowEndMinutes(window);
}
