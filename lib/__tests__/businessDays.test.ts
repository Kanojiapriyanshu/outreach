import { describe, it, expect } from "vitest";
import { addBusinessDays, addCalendarDays, clampToSendingWindow, isWithinSendingWindow } from "../businessDays";

const WINDOW = {
  sendWindowStartHour: 9,
  sendWindowStartMinute: 0,
  sendWindowEndHour: 17,
  sendWindowEndMinute: 0,
  sendWindowDays: "MON,TUE,WED,THU,FRI",
};

describe("addBusinessDays", () => {
  it("skips weekends", () => {
    // Friday 2026-09-04 + 1 business day -> Monday 2026-09-07
    const friday = new Date(2026, 8, 4, 10, 0, 0);
    const result = addBusinessDays(friday, 1);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(7);
  });

  it("adds N business days landing on a weekday", () => {
    const monday = new Date(2026, 8, 7, 10, 0, 0); // Monday
    const result = addBusinessDays(monday, 3);
    expect(result.getDay()).not.toBe(0);
    expect(result.getDay()).not.toBe(6);
  });
});

describe("addCalendarDays", () => {
  it("adds raw calendar days including weekends", () => {
    const friday = new Date(2026, 8, 4, 10, 0, 0);
    const result = addCalendarDays(friday, 2);
    expect(result.getDate()).toBe(6); // Sunday, not pushed to Monday
  });
});

describe("clampToSendingWindow / isWithinSendingWindow", () => {
  it("leaves a time already inside the window untouched", () => {
    const inWindow = new Date(2026, 8, 7, 11, 0, 0); // Monday 11am
    expect(isWithinSendingWindow(inWindow, WINDOW)).toBe(true);
    expect(clampToSendingWindow(inWindow, WINDOW).getTime()).toBe(inWindow.getTime());
  });

  it("pushes a too-early time to the window start same day", () => {
    const tooEarly = new Date(2026, 8, 7, 6, 0, 0); // Monday 6am
    const clamped = clampToSendingWindow(tooEarly, WINDOW);
    expect(clamped.getDate()).toBe(7);
    expect(clamped.getHours()).toBe(9);
  });

  it("pushes a too-late time to the next day's window start", () => {
    const tooLate = new Date(2026, 8, 7, 19, 0, 0); // Monday 7pm
    const clamped = clampToSendingWindow(tooLate, WINDOW);
    expect(clamped.getDate()).toBe(8); // Tuesday
    expect(clamped.getHours()).toBe(9);
  });

  it("skips a weekend day entirely", () => {
    const saturday = new Date(2026, 8, 5, 11, 0, 0);
    expect(isWithinSendingWindow(saturday, WINDOW)).toBe(false);
    const clamped = clampToSendingWindow(saturday, WINDOW);
    expect(clamped.getDay()).toBe(1); // Monday
    expect(clamped.getHours()).toBe(9);
  });
});
