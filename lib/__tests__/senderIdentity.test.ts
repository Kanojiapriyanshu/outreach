import { describe, it, expect } from "vitest";
import { emailAddressOf, ownSenderMatcher } from "../senderIdentity";

describe("ownSenderMatcher", () => {
  const isOurs = ownSenderMatcher(["yash@fidemgrowth.com", "priyanshukanojia907@gmail.com"]);

  it("recognises the team's connected inboxes and teammates on the company domain", () => {
    expect(isOurs("Yash <yash@fidemgrowth.com>")).toBe(true);
    expect(isOurs("YASH@FIDEMGROWTH.COM")).toBe(true);
    expect(isOurs("Priya <priya@fidemgrowth.com>")).toBe(true);
    expect(isOurs("priyanshukanojia907@gmail.com")).toBe(true);
  });

  it("reads a reply from a different address than the one emailed as the other side", () => {
    // The bug: partnerships@6monthslater.net was emailed, their agency replied from this address.
    expect(isOurs("6 Months Later <6monthslater@finxisocial.com>")).toBe(false);
    expect(isOurs("Jane <jane@brand.com>")).toBe(false);
  });

  it("never treats someone else on a shared mailbox provider as the team", () => {
    expect(isOurs("Random Creator <somecreator@gmail.com>")).toBe(false);
  });

  it("treats bounce notices as not ours, so they're read as bounces", () => {
    expect(isOurs("Mail Delivery Subsystem <mailer-daemon@googlemail.com>")).toBe(false);
  });
});

describe("emailAddressOf", () => {
  it("pulls the address out of a From header", () => {
    expect(emailAddressOf('"Doe, Jane" <Jane.Doe@Brand.com>')).toBe("jane.doe@brand.com");
    expect(emailAddressOf("  plain@example.com ")).toBe("plain@example.com");
  });
});
