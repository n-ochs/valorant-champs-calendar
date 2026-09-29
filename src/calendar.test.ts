import { expect, test } from "bun:test";
import standingsResponse from "../fixtures/champions-2026-standings.json";
import scheduleResponse from "../fixtures/champions-schedule.json";
import { buildChampionsEvents, type CalendarEvent } from "./calendar";
import { parseBracket, parseSchedulePage } from "./riot-esports-api";

// Fixtures are real API answers from 2026-09-29, mid group stage: Group C's winners' match is done,
// NRG vs Karmine Corp (D3) is live, and nothing in the playoffs has teams yet.
const bracket = parseBracket(standingsResponse);
const scheduleEvents = parseSchedulePage(scheduleResponse).events;
const events = buildChampionsEvents(bracket, scheduleEvents);

function findEvent(matchLabel: string): CalendarEvent {
  const event = events.find((e) => e.description.includes(`(match ${matchLabel})`));
  if (!event) throw new Error(`no event for match ${matchLabel}`);
  return event;
}

test("16 teams make 34 matches: four 5-match GSL groups and a 14-match double-elimination playoff", () => {
  expect(events).toHaveLength(34);
});

test("the schedule page also lists Champions 2024 and 2025, but only 2026 matches make it in", () => {
  expect(events.at(0)?.start.toISOString()).toBe("2026-09-24T09:00:00.000Z");
  expect(events.at(-1)?.start.toISOString()).toBe("2026-10-18T06:00:00.000Z");
});

test("a finished group match shows the teams, its time slot, and the final score", () => {
  const event = findEvent("A1");

  expect(event.summary).toBe("100T vs T1 · Group A: Round 1");
  // Liquipedia lists this match at September 27, 2026 - 17:00 CST (UTC+8)
  expect(event.start.toISOString()).toBe("2026-09-27T09:00:00.000Z");
  expect(event.end.toISOString()).toBe("2026-09-27T12:00:00.000Z");
  expect(event.description).toContain("100 Thieves vs T1");
  expect(event.description).toContain("Final: 100 Thieves 2-0 T1");
});

test("a live match has no final score yet", () => {
  expect(findEvent("D3").description).not.toContain("Final:");
});

test("a decider waiting on one result names the two teams that could still fill that slot", () => {
  const event = findEvent("C5");

  expect(event.summary).toBe("TL/TYL vs G2 · Group C: Lower Bracket - Finals");
  expect(event.description).toContain("Winner of C4 (Team Liquid vs TYLOO GAMING) vs G2 Esports");
});

test("the loser of a group's winners' match drops to that group's decider", () => {
  expect(findEvent("D5").description).toContain(
    "Loser of D3 (NRG vs Karmine Corp) vs Winner of D4 (NONGSHIM REDFORCE vs Xi Lai Gaming)",
  );
});

test("playoff round 1 stays TBD while the groups are still being played", () => {
  expect(findEvent("M1").summary).toBe("TBD vs TBD · Playoffs: Round 1");
});

test("the grand final is a best of 5 that points at the matches feeding it", () => {
  const event = findEvent("M14");

  expect(event.summary).toBe("TBD vs TBD · Playoffs: Finals");
  expect(event.description).toContain("Winner of M11 vs Winner of M13");
  expect(event.description).toContain("best of 5");
  expect(event.start.toISOString()).toBe("2026-10-18T06:00:00.000Z");
  expect(event.end.toISOString()).toBe("2026-10-18T11:00:00.000Z");
});

test("a bracket match with no start time is left out instead of guessed", () => {
  const scheduleWithoutA1 = scheduleEvents.filter((e) => e.match?.id !== "115576361461077125");
  const eventsWithoutA1 = buildChampionsEvents(bracket, scheduleWithoutA1);

  expect(eventsWithoutA1).toHaveLength(33);
  expect(eventsWithoutA1.some((e) => e.description.includes("(match A1)"))).toBe(false);
});
