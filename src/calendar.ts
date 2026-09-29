import type { Bracket, BracketMatch, BracketTeam, ScheduleEvent } from "./riot-esports-api";

const BRACKET_URL = "https://liquipedia.net/valorant/VCT/2026/Champions";
const STREAM_URLS = ["https://www.twitch.tv/valorant", "https://www.youtube.com/@ValorantEsports"];
// Riot puts Bo3 matches three hours apart, so an hour per map is how the organizers plan it too
const MILLISECONDS_PER_MAP = 60 * 60 * 1000;
const TBD_TEAM_NAME = "TBD";

export type CalendarEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description: string;
  url: string;
};

type PlacedMatch = { sectionName: string; roundName: string; match: BracketMatch };

// How one side of a match reads: the team once it's known, otherwise where the team will come from
type SideLabel = { short: string; long: string };

export function listBracketMatches(bracket: Bracket): PlacedMatch[] {
  return bracket.stages.flatMap((stage) =>
    stage.sections.flatMap((section) =>
      section.columns.flatMap((column) =>
        column.cells.flatMap((cell) =>
          cell.matches.map((match) => ({ sectionName: section.name, roundName: cell.name, match })),
        ),
      ),
    ),
  );
}

export function buildChampionsEvents(bracket: Bracket, scheduleEvents: ScheduleEvent[]): CalendarEvent[] {
  const placedMatches = listBracketMatches(bracket);
  const matchesByStructuralId = new Map(placedMatches.map((e) => [e.match.structuralId, e.match]));
  const scheduleEventsByMatchId = new Map(scheduleEvents.flatMap((e) => (e.match ? [[e.match.id, e] as const] : [])));

  const events = placedMatches.flatMap((placedMatch) => {
    const scheduleEvent = scheduleEventsByMatchId.get(placedMatch.match.id);
    if (!scheduleEvent?.match) {
      console.warn(`match ${placedMatch.match.description} (${placedMatch.match.id}) has no start time yet, skipping it`);
      return [];
    }

    return [toCalendarEvent(placedMatch, scheduleEvent.startTime, scheduleEvent.match.strategy.count, matchesByStructuralId)];
  });

  return events.toSorted((a, b) => a.start.getTime() - b.start.getTime());
}

function toCalendarEvent(
  { sectionName, roundName, match }: PlacedMatch,
  startTime: string,
  bestOf: number,
  matchesByStructuralId: ReadonlyMap<string, BracketMatch>,
): CalendarEvent {
  const [firstTeam, secondTeam] = match.teams;
  const firstSide = labelSide(firstTeam, matchesByStructuralId);
  const secondSide = labelSide(secondTeam, matchesByStructuralId);
  const start = new Date(startTime);

  return {
    uid: `${match.id}@valorant-calendar`,
    start,
    end: new Date(start.getTime() + bestOf * MILLISECONDS_PER_MAP),
    summary: `${firstSide.short} vs ${secondSide.short} · ${sectionName}: ${roundName}`,
    description: [
      `${sectionName}: ${roundName} (match ${match.description}), best of ${bestOf}`,
      `${firstSide.long} vs ${secondSide.long}`,
      ...(match.state === "completed" && firstTeam.result && secondTeam.result
        ? [`Final: ${firstTeam.name} ${firstTeam.result.gameWins}-${secondTeam.result.gameWins} ${secondTeam.name}`]
        : []),
      "",
      `Watch: ${STREAM_URLS.join(" or ")}`,
      `Bracket: ${BRACKET_URL}`,
    ].join("\n"),
    url: BRACKET_URL,
  };
}

function labelSide(team: BracketTeam, matchesByStructuralId: ReadonlyMap<string, BracketMatch>): SideLabel {
  if (team.name !== TBD_TEAM_NAME) {
    return { short: team.code, long: team.name };
  }

  // seeded slots (like playoff round 1) point at a draw, not a match, so there's nothing to say yet
  const sourceMatch = team.origin?.type === "match" ? matchesByStructuralId.get(team.origin.structuralId) : undefined;
  if (!team.origin || !sourceMatch) {
    return { short: TBD_TEAM_NAME, long: TBD_TEAM_NAME };
  }

  const advancement = `${team.origin.slot === 1 ? "Winner" : "Loser"} of ${sourceMatch.description}`;
  const [firstCandidate, secondCandidate] = sourceMatch.teams;
  if (firstCandidate.name === TBD_TEAM_NAME && secondCandidate.name === TBD_TEAM_NAME) {
    return { short: TBD_TEAM_NAME, long: advancement };
  }

  return {
    short: `${firstCandidate.code}/${secondCandidate.code}`,
    long: `${advancement} (${firstCandidate.name} vs ${secondCandidate.name})`,
  };
}
