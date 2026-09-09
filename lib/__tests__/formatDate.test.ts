import { describe, it, expect } from "vitest";
import { formatDateTime, formatDateOnly, BUSINESS_TIMEZONE } from "../formatDate";

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
