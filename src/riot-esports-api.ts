import * as z from "zod";

// The public key the valorantesports.com web app sends with every request. It isn't a secret.
// If Riot rotates it, requests fail with a 403 and the update exits without touching the old file.
const RIOT_ESPORTS_API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";
const RIOT_ESPORTS_API_BASE_URL = "https://esports-api.service.valorantesports.com/persisted/val";
const REQUEST_TIMEOUT_MS = 30_000;

const bracketTeamSchema = z.object({
  name: z.string(),
  code: z.string(),
  result: z.object({ gameWins: z.number() }).nullable(),
  // where this slot's team comes from: a seed ("decisionPoint") or slot 1 (winner) / slot 2 (loser) of another match
  origin: z.object({ structuralId: z.string(), type: z.string(), slot: z.number() }).optional(),
});

const bracketMatchSchema = z.object({
  id: z.string(),
  structuralId: z.string(),
  state: z.string(),
  // short label Riot shows on the bracket, like "A1" or "M7"
  description: z.string(),
  teams: z.tuple([bracketTeamSchema, bracketTeamSchema]),
});

const bracketSchema = z.object({
  name: z.string(),
  stages: z.array(
    z.object({
      name: z.string(),
      sections: z.array(
        z.object({
          name: z.string(),
          columns: z.array(
            z.object({
              cells: z.array(z.object({ name: z.string(), matches: z.array(bracketMatchSchema) })),
            }),
          ),
        }),
      ),
    }),
  ),
});

const standingsResponseSchema = z.object({
  data: z.object({ standings: z.tuple([bracketSchema]) }),
});

const scheduleEventSchema = z.object({
  startTime: z.iso.datetime(),
  // shows and other non-match events have no match
  match: z.object({ id: z.string(), strategy: z.object({ count: z.number() }) }).optional(),
});

const scheduleResponseSchema = z.object({
  data: z.object({
    schedule: z.object({
      pages: z.object({ older: z.string().nullable(), newer: z.string().nullable() }),
      events: z.array(scheduleEventSchema),
    }),
  }),
});

export type Bracket = z.infer<typeof bracketSchema>;
export type BracketMatch = z.infer<typeof bracketMatchSchema>;
export type BracketTeam = z.infer<typeof bracketTeamSchema>;
export type ScheduleEvent = z.infer<typeof scheduleEventSchema>;
type SchedulePage = z.infer<typeof scheduleResponseSchema>["data"]["schedule"];

export function parseBracket(standingsResponse: unknown): Bracket {
  const [bracket] = parseApiResponse(standingsResponseSchema, standingsResponse, "getStandings").data.standings;
  return bracket;
}

export function parseSchedulePage(scheduleResponse: unknown): SchedulePage {
  return parseApiResponse(scheduleResponseSchema, scheduleResponse, "getSchedule").data.schedule;
}

export async function fetchBracket(tournamentId: string): Promise<Bracket> {
  return parseBracket(await fetchRiotEsportsApi("getStandings", { tournamentId }));
}

// Pages through a league's schedule until every requested match turns up. The first page holds the
// events around today, so a live tournament is usually all there; older and newer pages cover the rest.
export async function fetchScheduleEvents(leagueId: string, matchIds: ReadonlySet<string>): Promise<ScheduleEvent[]> {
  const firstPage = await fetchSchedulePage(leagueId, null);
  const events = [...firstPage.events];
  const isMissingMatches = () => {
    const foundMatchIds = new Set(events.flatMap((e) => (e.match ? [e.match.id] : [])));
    return [...matchIds].some((e) => !foundMatchIds.has(e));
  };

  for (const direction of ["older", "newer"] as const) {
    let pageToken = firstPage.pages[direction];
    while (pageToken !== null && isMissingMatches()) {
      const page = await fetchSchedulePage(leagueId, pageToken);
      events.push(...page.events);
      pageToken = page.pages[direction];
    }
  }

  return events;
}

async function fetchSchedulePage(leagueId: string, pageToken: string | null): Promise<SchedulePage> {
  console.log(`fetching schedule page ${pageToken ?? "(current)"}`);
  const params: Record<string, string> = pageToken === null ? { leagueId } : { leagueId, pageToken };
  return parseSchedulePage(await fetchRiotEsportsApi("getSchedule", params));
}

async function fetchRiotEsportsApi(endpoint: string, params: Record<string, string>): Promise<unknown> {
  // without sport=val, getSchedule answers 200 with an empty schedule instead of an error
  const url = `${RIOT_ESPORTS_API_BASE_URL}/${endpoint}?${new URLSearchParams({ hl: "en-US", sport: "val", ...params })}`;
  const response = await fetch(url, {
    headers: { "x-api-key": RIOT_ESPORTS_API_KEY },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${endpoint} failed with HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function parseApiResponse<Schema extends z.ZodType>(schema: Schema, response: unknown, endpoint: string): z.infer<Schema> {
  const result = schema.safeParse(response);
  if (!result.success) {
    throw new Error(`unexpected ${endpoint} response shape:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}
