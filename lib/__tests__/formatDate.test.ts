import { describe, it, expect } from "vitest";
import { formatDateTime, formatDateOnly, formatAgo, businessHour, istDayStart, istDayEnd, BUSINESS_TIMEZONE } from "../formatDate";

describe("formatAgo", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  it("says how long ago, in the largest sensible unit", () => {
    expect(formatAgo(new Date("2026-09-30T11:59:40Z"), now)).toBe("just now");
    expect(formatAgo(new Date("2026-09-30T11:48:00Z"), now)).toBe("12m ago");
    expect(formatAgo(new Date("2026-09-30T07:00:00Z"), now)).toBe("5h ago");
    expect(formatAgo(new Date("2026-09-27T12:00:00Z"), now)).toBe("3d ago");
    expect(formatAgo(new Date("2026-08-19T12:00:00Z"), now)).toBe("6w ago");
  });
});

describe("businessHour", () => {
  it("reads the hour in IST", () => {
    expect(businessHour(new Date("2026-09-30T04:30:00Z"))).toBe(10);
    expect(businessHour(new Date("2026-09-30T18:30:00Z"))).toBe(0);
  });
});

describe("formatDateTime", () => {
  it("renders a UTC instant as the correct wall-clock time in the business timezone (IST, UTC+5:30)", () => {
    // 04:30 UTC is exactly 10:00 IST — the bug this exists to fix: a bare toLocaleString() on a
    // server (UTC) would show "4:30 AM" for a moment someone deliberately picked as "10:00 AM".
    const d = new Date("2026-09-10T04:30:00.000Z");
    expect(formatDateTime(d)).toBe("9/10/2026, 10:00:00 AM");
  });

  it("defaults to Asia/Kolkata but accepts an explicit timezone", () => {
    expect(BUSINESS_TIMEZONE).toBe("Asia/Kolkata");
    const d = new Date("2026-09-10T04:30:00.000Z");
    expect(formatDateTime(d, "UTC")).toBe("9/10/2026, 4:30:00 AM");
  });
});

describe("formatDateOnly", () => {
  it("renders just the date in the business timezone", () => {
    // 19:00 UTC on the 9th is already the 10th in IST (+5:30) — a date-only formatter must use
    // the same timezone-aware conversion, not just the UTC calendar date.
    const d = new Date("2026-09-09T19:00:00.000Z");
    expect(formatDateOnly(d)).toBe("9/10/2026");
  });
});

describe("istDayStart / istDayEnd", () => {
  it("returns the UTC instants bracketing midnight-to-midnight IST for a date string", () => {
    // IST midnight on 2026-09-10 is 2026-09-09T18:30:00.000Z
    expect(istDayStart("2026-09-10").toISOString()).toBe("2026-09-09T18:30:00.000Z");
    // The last millisecond of that IST day is just before the next day's IST midnight
    expect(istDayEnd("2026-09-10").toISOString()).toBe("2026-09-10T18:29:59.999Z");
  });

  it("round-trips through formatDateOnly (a moment inside the range formats back to the same date)", () => {
    const start = istDayStart("2026-09-10");
    const end = istDayEnd("2026-09-10");
    expect(formatDateOnly(start)).toBe("9/10/2026");
    expect(formatDateOnly(end)).toBe("9/10/2026");
  });
});
