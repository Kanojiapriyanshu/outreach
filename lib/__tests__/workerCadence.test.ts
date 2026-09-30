import { describe, it, expect } from "vitest";
import { isBusinessWeekend, isWorkingHours, nextTickDelaySeconds, WORKER_SILENT_MS } from "../workerCadence";

// Wednesday 30 Sep 2026, 10:00 IST.
const WEEKDAY = new Date("2026-09-30T04:30:00Z");
// Saturday 3 Oct 2026, 10:00 IST.
const SATURDAY = new Date("2026-10-03T04:30:00Z");
const at = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);

describe("nextTickDelaySeconds", () => {
  it("sleeps 15 minutes in the working day with nothing scheduled, an hour overnight and at the weekend", () => {
    expect(nextTickDelaySeconds({ now: WEEKDAY, dueNow: 0, nextSendAllowedAt: null, nextDueAt: null })).toBe(900);
    expect(nextTickDelaySeconds({ now: SATURDAY, dueNow: 0, nextSendAllowedAt: null, nextDueAt: null })).toBe(3600);
    // Wednesday 03:00 IST.
    expect(nextTickDelaySeconds({ now: new Date("2026-09-29T21:30:00Z"), dueNow: 0, nextSendAllowedAt: null, nextDueAt: null })).toBe(3600);
  });

  it("treats 08:00 to midnight IST on weekdays as the working day", () => {
    expect(isWorkingHours(new Date("2026-09-30T02:29:00Z"))).toBe(false); // 07:59 IST
    expect(isWorkingHours(new Date("2026-09-30T02:30:00Z"))).toBe(true); // 08:00 IST
    expect(isWorkingHours(new Date("2026-09-30T18:29:00Z"))).toBe(true); // 23:59 IST
    expect(isWorkingHours(new Date("2026-09-30T18:30:00Z"))).toBe(false); // 00:00 IST Thursday
  });

  it("still wakes overnight for an email scheduled then", () => {
    const night = new Date("2026-09-29T21:30:00Z");
    expect(nextTickDelaySeconds({ now: night, dueNow: 0, nextSendAllowedAt: null, nextDueAt: at(night, 600) })).toBe(605);
  });

  it("keeps sending while emails are due, as fast as the spacing gate allows", () => {
    expect(nextTickDelaySeconds({ now: WEEKDAY, dueNow: 12, nextSendAllowedAt: null, nextDueAt: null })).toBe(30);
    expect(nextTickDelaySeconds({ now: WEEKDAY, dueNow: 12, nextSendAllowedAt: at(WEEKDAY, 140), nextDueAt: null })).toBe(140);
  });

  it("wakes right when the next scheduled email is due", () => {
    expect(nextTickDelaySeconds({ now: WEEKDAY, dueNow: 0, nextSendAllowedAt: null, nextDueAt: at(WEEKDAY, 300) })).toBe(305);
    // Never sooner than 30s, never later than the 15-minute ceiling.
    expect(nextTickDelaySeconds({ now: WEEKDAY, dueNow: 0, nextSendAllowedAt: null, nextDueAt: at(WEEKDAY, 2) })).toBe(30);
    expect(nextTickDelaySeconds({ now: WEEKDAY, dueNow: 0, nextSendAllowedAt: null, nextDueAt: at(WEEKDAY, 7200) })).toBe(900);
  });

  it("reads the weekend in IST, not UTC", () => {
    // Friday 23:30 UTC is already Saturday 05:00 in India.
    expect(isBusinessWeekend(new Date("2026-10-02T23:30:00Z"))).toBe(true);
    // Sunday 20:00 UTC is Monday 01:30 in India.
    expect(isBusinessWeekend(new Date("2026-10-04T20:00:00Z"))).toBe(false);
  });

  it("only calls the worker stopped after more than its longest planned sleep", () => {
    expect(WORKER_SILENT_MS).toBeGreaterThan(60 * 60 * 1000);
  });
});
