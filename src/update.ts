import { rename } from "node:fs/promises";
import path from "node:path";
import { buildChampionsEvents, listBracketMatches } from "./calendar";
import { isSameCalendarContent, renderCalendar } from "./ics";
import { fetchBracket, fetchScheduleEvents } from "./riot-esports-api";

const CHAMPIONS_LEAGUE_ID = "107254585505459304";
const CHAMPIONS_SHANGHAI_2026_TOURNAMENT_ID = "115576361459045501";
const CALENDAR_FILE_PATH = path.join(import.meta.dir, "..", "public", "valorant-champions-2026.ics");

async function updateCalendarFile() {
  console.log(`[${new Date().toISOString()}] fetching the Champions 2026 bracket`);
  const bracket = await fetchBracket(CHAMPIONS_SHANGHAI_2026_TOURNAMENT_ID);
  const matchIds = new Set(listBracketMatches(bracket).map((e) => e.match.id));

  console.log(`bracket has ${matchIds.size} matches, fetching their start times`);
  const scheduleEvents = await fetchScheduleEvents(CHAMPIONS_LEAGUE_ID, matchIds);
  const events = buildChampionsEvents(bracket, scheduleEvents);

  // a half-empty API answer shouldn't wipe out a calendar people are subscribed to
  if (events.length === 0) {
    throw new Error("no scheduled matches found, leaving the existing calendar file alone");
  }

  const ics = renderCalendar(
    {
      name: "VALORANT Champions 2026",
      description: `Every match of ${bracket.name} 2026. TBD slots fill in as the bracket plays out.`,
      events,
    },
    new Date(),
  );

  // an untouched file tells the update workflow there's nothing to publish, so it skips timestamp-only commits
  const calendarFile = Bun.file(CALENDAR_FILE_PATH);
  if ((await calendarFile.exists()) && isSameCalendarContent(await calendarFile.text(), ics)) {
    console.log(`no match changes since the last update, left ${CALENDAR_FILE_PATH} as is`);
    return;
  }

  // rename is atomic, so whatever serves the file never sees it half-written
  const temporaryFilePath = `${CALENDAR_FILE_PATH}.tmp`;
  await Bun.write(temporaryFilePath, ics);
  await rename(temporaryFilePath, CALENDAR_FILE_PATH);
  console.log(`wrote ${events.length} matches to ${CALENDAR_FILE_PATH}`);
}

await updateCalendarFile();
