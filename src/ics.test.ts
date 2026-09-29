import { expect, test } from "bun:test";
import type { CalendarEvent } from "./calendar";
import { isSameCalendarContent, renderCalendar } from "./ics";

const grandFinal: CalendarEvent = {
  uid: "115576361461208331@valorant-calendar",
  start: new Date("2026-10-18T06:00:00Z"),
  end: new Date("2026-10-18T11:00:00Z"),
  summary: "G2 vs PRX · Playoffs: Finals",
  description: "Final: G2 Esports 3-2 Paper Rex\nLine two; with, punctuation \\ and a backslash",
  url: "https://liquipedia.net/valorant/VCT/2026/Champions",
};

function render(events: CalendarEvent[]): string {
  return renderCalendar({ name: "VALORANT Champions 2026", description: "test", events }, new Date("2026-09-29T20:00:00Z"));
}

function unfold(ics: string): string {
  return ics.replaceAll("\r\n ", "");
}

test("times come out as UTC in iCalendar basic format", () => {
  const ics = unfold(render([grandFinal]));

  expect(ics).toContain("\r\nDTSTART:20261018T060000Z\r\n");
  expect(ics).toContain("\r\nDTEND:20261018T110000Z\r\n");
  expect(ics).toContain("\r\nDTSTAMP:20260929T200000Z\r\n");
});

test("commas, semicolons, backslashes, and newlines in text are escaped", () => {
  expect(unfold(render([grandFinal]))).toContain(
    "\r\nDESCRIPTION:Final: G2 Esports 3-2 Paper Rex\\nLine two\\; with\\, punctuation \\\\ and a backslash\r\n",
  );
});

test("a line of 88 characters folds into 75 plus a continuation of 13", () => {
  const ics = render([{ ...grandFinal, summary: "a".repeat(80) }]);

  expect(ics).toContain(`\r\nSUMMARY:${"a".repeat(67)}\r\n ${"a".repeat(13)}\r\n`);
});

test("folding counts UTF-8 octets and never splits a character", () => {
  const summary = `Leviatán vs KRÜ 🏆 ${"é".repeat(60)}`;
  const ics = render([{ ...grandFinal, summary }]);
  const lines = ics.split("\r\n");

  expect(lines.every((e) => new TextEncoder().encode(e).length <= 75)).toBe(true);
  expect(lines.every((e) => e.isWellFormed())).toBe(true);
  expect(unfold(ics)).toContain(`\r\nSUMMARY:${summary}\r\n`);
});

test("the file is a single VCALENDAR with CRLF line endings throughout", () => {
  const ics = render([grandFinal, { ...grandFinal, uid: "other@valorant-calendar" }]);

  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(ics.endsWith("\r\nEND:VCALENDAR\r\n")).toBe(true);
  expect(ics.replaceAll("\r\n", "")).not.toContain("\n");
  expect(ics.match(/^BEGIN:VEVENT$/gm)).toHaveLength(2);
});

test("rebuilding the same schedule on a later day counts as no change", () => {
  const calendar = { name: "VALORANT Champions 2026", description: "test", events: [grandFinal] };
  const firstBuild = renderCalendar(calendar, new Date("2026-09-29T20:00:00Z"));
  const nextDayBuild = renderCalendar(calendar, new Date("2026-09-30T20:00:00Z"));

  expect(firstBuild).not.toBe(nextDayBuild);
  expect(isSameCalendarContent(firstBuild, nextDayBuild)).toBe(true);
});

test("a filled-in team or a moved start time counts as a change", () => {
  const original = render([grandFinal]);

  expect(isSameCalendarContent(original, render([{ ...grandFinal, summary: "G2 vs TBD · Playoffs: Finals" }]))).toBe(false);
  expect(isSameCalendarContent(original, render([{ ...grandFinal, start: new Date("2026-10-18T07:00:00Z") }]))).toBe(false);
});
