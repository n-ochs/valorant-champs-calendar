# valorant-champs-calendar

A subscribable calendar of every VALORANT Champions 2026 (Shanghai) match. A GitHub Actions workflow rebuilds it once a day. Bracket slots start as TBD and pick up team names as results come in.

## Subscribe

| Feed | URL |
| --- | --- |
| VALORANT Champions 2026 | `webcal://raw.githubusercontent.com/n-ochs/valorant-champs-calendar/ics/valorant-champions-2026.ics` |

Most calendar apps take the `webcal://` URL as a subscription. If one wants `https://`, swap the scheme. The URL only works while the repo is public.

Apple Calendar and Outlook re-check every 6 hours, which the file asks for. Google Calendar ignores that and refreshes on its own schedule, usually every 12 to 24 hours.

## What the events look like

| Situation | Title |
| --- | --- |
| Both teams known | `100T vs T1 · Group A: Round 1` |
| One slot waiting on a match | `TL/TYL vs G2 · Group C: Lower Bracket - Finals` |
| Waiting on a match with no teams yet | `TBD vs TBD · Playoffs: Upper Bracket - Round 2` |

The description spells out where each team comes from ("Winner of C4 (Team Liquid vs TYLOO GAMING)"). It adds the final score once a match ends, and ends with stream and bracket links. Every event is a best-of-N block of N hours and is marked free, so it never shows you as busy.

## Commands

```bash
bun install
bun run update      # fetch the bracket and write public/valorant-champions-2026.ics
bun test
bun run typecheck
```

`public/` is gitignored. The published calendar lives on the `ics` branch, not `master`.

## Daily update

`.github/workflows/update-calendar.yml` runs at 20:17 UTC every day, and on demand from the Actions tab. Every Champions match starts between 06:00 and 12:00 UTC, so each run sees the day's results before the next day's matches start.

Each run:

1. Tests the code.
2. Downloads the calendar currently on the `ics` branch.
3. Rebuilds the calendar from Riot's API. `update.ts` leaves the file alone when no match changed.
4. Commits the file to `ics` if it changed. The first run creates the `ics` branch with nothing on it but the calendar.

Commits go through GitHub's API as `github-actions[bot]`. The workflow never sets a git identity and needs no repo settings changes. `.github/workflows/test.yml` runs the tests and typecheck on pushes to `master` and on pull requests.

GitHub turns off scheduled workflows in public repos after 60 days without activity. The tournament ends 2026-10-18, well inside that window.

## Data source

Riot's esports API, the one valorantesports.com uses:

- `getStandings` returns the bracket: which matches exist, round names, and which match feeds each slot.
- `getSchedule` returns start times and best-of counts.

The API key in `src/riot-esports-api.ts` is the public key the website ships. If Riot rotates it, the update fails with HTTP 403, the workflow run goes red, and the `ics` branch keeps the last good calendar. The same goes for a network failure, an unexpected response shape, or an empty schedule.

`fixtures/` holds real API responses from 2026-09-29 for the tests.
