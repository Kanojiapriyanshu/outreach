import { describe, it, expect } from "vitest";
import { addBusinessDays, addCalendarDays, clampToSendingWindow, isWithinSendingWindow } from "../businessDays";

const WINDOW = {
  sendWindowStartHour: 9,
  sendWindowStartMinute: 0,
  sendWindowEndHour: 17,
  sendWindowEndMinute: 0,
  sendWindowDays: "MON,TUE,WED,THU,FRI",
};

// All inputs/expectations are explicit IST instants (+05:30) so these tests are correct
// regardless of the machine/CI runner's own local timezone — the whole point of this module is
// that it evaluates business days/hours in IST regardless of where the process itself runs.
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe("addBusinessDays", () => {
  it("skips weekends", () => {
    // Friday 2026-09-04 (IST) + 1 business day -> Monday 2026-09-07
    const friday = ist("2026-09-04T10:00:00");
    const result = addBusinessDays(friday, 1);
    expect(result.getTime()).toBe(ist("2026-09-07T10:00:00").getTime());
  });

  it("adds N business days landing on a weekday", () => {
    const monday = ist("2026-09-07T10:00:00");
    const result = addBusinessDays(monday, 3); // Mon -> Tue -> Wed -> Thu
    expect(result.getTime()).toBe(ist("2026-09-10T10:00:00").getTime());
  });
});

describe("addCalendarDays", () => {
  it("adds raw calendar days including weekends", () => {
    const friday = ist("2026-09-04T10:00:00");
    const result = addCalendarDays(friday, 2);
    expect(result.getTime()).toBe(ist("2026-09-06T10:00:00").getTime()); // Sunday, not pushed to Monday
  });
});

describe("clampToSendingWindow / isWithinSendingWindow", () => {
  it("leaves a time already inside the window untouched", () => {
    const inWindow = ist("2026-09-07T11:00:00"); // Monday 11am IST
    expect(isWithinSendingWindow(inWindow, WINDOW)).toBe(true);
    expect(clampToSendingWindow(inWindow, WINDOW).getTime()).toBe(inWindow.getTime());
  });

  it("pushes a too-early time to the window start same day", () => {
    const tooEarly = ist("2026-09-07T06:00:00"); // Monday 6am IST
    const clamped = clampToSendingWindow(tooEarly, WINDOW);
    expect(clamped.getTime()).toBe(ist("2026-09-07T09:00:00").getTime());
  });

  it("pushes a too-late time to the next day's window start", () => {
    const tooLate = ist("2026-09-07T19:00:00"); // Monday 7pm IST
    const clamped = clampToSendingWindow(tooLate, WINDOW);
    expect(clamped.getTime()).toBe(ist("2026-09-08T09:00:00").getTime());
  });

  it("skips a weekend day entirely", () => {
    const saturday = ist("2026-09-05T11:00:00");
    expect(isWithinSendingWindow(saturday, WINDOW)).toBe(false);
    const clamped = clampToSendingWindow(saturday, WINDOW);
    expect(clamped.getTime()).toBe(ist("2026-09-07T09:00:00").getTime()); // Monday 9am IST
  });

  it("evaluates the window and weekday in IST regardless of the process's own timezone", () => {
    // 2026-09-10 04:58 UTC is Thursday 10:28am IST -- well inside a 9:30am-12:00pm window. A
    // process running in UTC (e.g. Vercel) reading raw getHours()/getDay() would see Thursday
    // 04:58 (before 9:30), conclude it's outside the window, and wrongly push it a day forward --
    // this is the exact production bug this rewrite fixes.
    const utcInstant = new Date("2026-09-10T04:58:00.000Z");
    const istWindow = {
      sendWindowStartHour: 9,
      sendWindowStartMinute: 30,
      sendWindowEndHour: 12,
      sendWindowEndMinute: 0,
      sendWindowDays: "MON,TUE,WED,THU,FRI",
    };
    expect(isWithinSendingWindow(utcInstant, istWindow)).toBe(true);
    expect(clampToSendingWindow(utcInstant, istWindow).getTime()).toBe(utcInstant.getTime());
  });
});
