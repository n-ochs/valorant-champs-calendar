import type { CalendarEvent } from "./calendar";

// RFC 5545: content lines are at most 75 octets, longer ones fold onto lines that start with a space
const MAX_LINE_OCTETS = 75;
// The file is rebuilt once a day, so asking clients to re-poll every few hours picks up each rebuild the same day.
// Apple Calendar reads REFRESH-INTERVAL, Outlook reads X-PUBLISHED-TTL, Google ignores both.
const REFRESH_INTERVAL = "PT6H";
const utf8Encoder = new TextEncoder();

export type Calendar = { name: string; description: string; events: CalendarEvent[] };

export function renderCalendar(calendar: Calendar, generatedAt: Date): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//valorant-calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendar.name)}`,
    `X-WR-CALDESC:${escapeText(calendar.description)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH_INTERVAL}`,
    `X-PUBLISHED-TTL:${REFRESH_INTERVAL}`,
    ...calendar.events.flatMap((event) => [
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${formatUtcDateTime(generatedAt)}`,
      `DTSTART:${formatUtcDateTime(event.start)}`,
      `DTEND:${formatUtcDateTime(event.end)}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      `URL:${event.url}`,
      // an esports match on the calendar shouldn't make you look busy
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// DTSTAMP holds the build time, so two builds of the same schedule differ only on those lines
export function isSameCalendarContent(firstIcs: string, secondIcs: string): boolean {
  const withoutBuildTime = (ics: string) => ics.replaceAll(/^DTSTAMP:.*\r\n/gm, "");
  return withoutBuildTime(firstIcs) === withoutBuildTime(secondIcs);
}

function escapeText(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n");
}

// 2026-09-27T09:00:00.000Z -> 20260927T090000Z
function formatUtcDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll("-", "").replaceAll(":", "");
}

function foldLine(line: string): string {
  const segments: string[] = [];
  let segment = "";
  let segmentOctets = 0;

  // iterating a string walks code points, so a multi-byte character never gets split across lines
  for (const character of line) {
    const characterOctets = utf8Encoder.encode(character).length;
    const maxOctets = segments.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (segmentOctets + characterOctets > maxOctets) {
      segments.push(segment);
      segment = "";
      segmentOctets = 0;
    }

    segment += character;
    segmentOctets += characterOctets;
  }

  segments.push(segment);
  return segments.join("\r\n ");
}
