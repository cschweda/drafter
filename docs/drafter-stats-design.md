# Writing stats — design (v0.5.0)

*Numbers that help a writer see the day's work and the script as a whole: in the status bar, and in a Stats window.*

Status: approved in conversation by the maintainer on 2026-10-27 ("put key stats down on the bottom nav bar — total words, total time spent … a stats modal … scenes, characters, total time spent, total words, total pages, approximate time"; the builder's recommendations below were accepted with "yes"). Items marked **Call** are the builder's choices, open to change.

## 1. What exists

`stats/count.ts` counts pages (to one decimal, title page left out), scenes, words (the text that prints), and running time (a page a minute). The status bar's page item is a button opening the **Counts** panel (`CountsPanel.vue`): those counts, a daily goal (`stats/goal.ts`, growth since the day began, per script, in the settings table as `goal:` and day-start rows, kept 30 days), and sprints (`stats/sprint.ts`). Nothing records time spent, words today without a goal, characters, or history.

## 2. Writing time

- **Active writing time** (decided): time counts while the writer edits the open script. Each edit made by the writer (not the app's own changes: a reset, a template switch, a file reload; the existing `appChange` annotation and `centersOn`-style checks tell them apart) extends the current stretch; a gap of **2 minutes** with no edit ends it, and the gap isn't counted. Hiding the tab or window (`visibilitychange`), closing it, or switching scripts ends the stretch at the last edit. A stretch of one edit counts **Call:** 30 seconds (one burst of typing is real work), capped by the time to the next edit.
- Kept **per script, per local day**. Nothing is kept for a sample (it is a shared record, as the goal treats it), in a read-only tab (another tab is editing), or while a file is locked.
- **Call:** stored in IndexedDB as settings rows like the goal's (`stats-day:<projectId>:<YYYY-MM-DD>`: `{ ms, words, pages }` where `words`/`pages` are the counts at the day's start and `ms` the writing time), written at most every few seconds and on `pagehide`. Kept **without a time limit** (a row a day a script is small); removed with the script. If the goal's own day-start rows can serve as the day start, reuse them rather than keep two; the builder decides and records it in `docs/DECISIONS.md`.
- The desktop app needs nothing extra (same IndexedDB in its profile).

## 3. The status bar

Next to the page-count button, two items (decided: **words today** and **time today**):

- **`+420 words today`** — net words added to this script today (a cut counts against it, as the goal does; `−35 words today` when shorter). Shown from the first edit of the day; a Markdown document has it too.
- **`38 min today`** — writing time on this script today (`1 h 05 min today` past an hour; under a minute: `<1 min today`).
- When a daily goal is set, its progress (`1.5 of 3 pages today`) stays as now; the words item is then left out if the goal is in words, so the bar doesn't say the same number twice.
- Hidden for a sample and in a read-only tab. On a phone the bar wraps as it does now; **Call:** on narrow screens only the time item is dropped if space requires.
- Neither is a live region: a screen reader reads them on demand, never as they change.

## 4. The Stats window

A dialog (same look as Settings), opened from **Stats…** at the foot of the Counts panel, **Show stats** in the palette, and the Drafter menu (Help or View section; builder's call). Esc and a Close button close it; focus returns where it was. Sections:

**Today** — words added, pages added (not for Markdown), writing time, and the goal's progress if one is set.

**This script** (by kind):
- Screenplay and stage play: pages, scenes, words, running time (≈ a page a minute; since v0.17.0, at each script's own minutes a page, with an estimate from the dialogue at its own words a minute), **characters** (the number of distinct speaking characters, ignoring extensions like `(V.O.)`/`(CONT'D)`), and a **character table**: name, scenes they speak in, speeches, words of dialogue, sorted by speeches (top 20, then "and N more"). Screenplay only: interior/exterior and day/night split of scene headings (counts and %, from the heading's prefix and its time of day; anything else is "other").
- Markdown: words, headings, reading time (**Call:** 230 words a minute).
- All kinds: **total writing time** on this script, **days written**, and the first day written.

**Last 30 days** (decided: yes) — a small bar chart of words added per day (net, so a cutting day shows below the line), with writing time per day shown alongside (second series or in the bar's label). Below it: **days written** in the 30, **best day** (most words), **average words per writing day**, and **current streak** (consecutive days with writing time, today included if written, else ending yesterday). Built with plain SVG or CSS, no chart library. The chart has a text alternative: a visually hidden table of the same numbers (the a11y pass later checks it; no new axe tests now).

Empty states: a new script says "Nothing written yet today." and "Writing time is counted from now on." for history; a sample says "Stats are kept for your own scripts, not the samples."

## 5. Privacy and help

Everything stays in the browser's (or desktop app's) own storage; nothing is sent anywhere. The Privacy page lists the writing-time rows alongside the goal's. The Keyboard shortcuts page lists **Show stats** automatically from the command data.

## 6. Non-goals

No accounts, no syncing stats between devices, no stats across all scripts (a later idea), no tracking keystrokes or anything beyond time and counts, no notifications, no new dependencies.

## 7. Testing

- Unit: the time tracker with a fake clock (stretches, the 2-minute gap, hidden tab, app changes not counted, sample/read-only not counted, day rollover at local midnight, the write throttle); character counting (extensions merged, forced `@` names, dual dialogue, a character with no dialogue); INT/EXT and DAY/NIGHT split (`INT./EXT.`, `I/E`, `EST.`, forced `.` headings, a missing time); the 30-day summary (streak, best day, average, a cutting day).
- e2e (all projects): the status bar shows words and time after typing; hidden on the sample; the Stats window opens from the panel, the palette, and the menu, shows the right numbers for a small typed script, and closes with Esc.
- Existing suites stay green; no new axe checks (accessibility comes last).
