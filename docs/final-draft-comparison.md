# Final Draft research for Drafter

Read 2026-10-27. Subject: Final Draft 13 (launched Jan 9, 2024 per the press coverage; a Sept 5, 2025 blog post lists FD13 updates). Sources are finaldraft.com product/blog/learn pages and the kb.finaldraft.com help center (the KB returned 403 to direct fetch; KB facts below come from search snippets and are marked "(snippet)"). Confidence is lower where only a snippet or a third party was available. "Story Map", "Speech to Script", and "Character Profiles" as named features were NOT found in official sources; the nearest FD13 items are Outline Editor, Navigator 2.0, and Character Development Tools.

## 1. Feature comparison

Drafter status is from README.md (feature list, Roadmap Phases 2-5, Later) and docs/drafter-architecture.md section 13. Items Drafter already has or plans are listed only briefly, as the comparison baseline; the interesting rows are "missing".

| Final Draft feature | What it does | Drafter status | Worth adding? |
|---|---|---|---|
| Auto formatting / pagination | Formats to industry standard | have | n/a |
| Beat Board | Visual idea cards, send beats to script | planned Phase 2 | n/a (already planned) |
| Outline Editor / Structure Lines | Lanes and colors for acts, sequences, scenes | planned Phase 2 (storylines, pacing guides) | n/a |
| Navigator 2.0 | Custom tabs, columns, filters, editable cells, color highlights | partly (Outline, Cards, Notes, character grid planned) | maybe: user-defined filters/columns on Outline; low cost once Outline exists |
| Typewriter mode, Sprint timer, Writing stats | Eye-level scrolling, timer, stats by day/week | have (stats by day planned Phase 2) | n/a |
| Track Changes (FD12+) | Author-colored add/delete marks; Accept/Reject/Accept All; name+color set in Preferences; usable in collaboration | missing (Phase 4 has Compare of snapshots and revision marks, not accept/reject of attributed edits) | yes: accept/reject per hunk when merging a reader's or co-writer's copy; fits the file-based model |
| Revision Mode + page locking | Numbered colored revision sets, asterisks in margin, locked pages, A/B pages (FD says lock first, then Revision Mode; 20-30 sets in production) | planned Phase 4 | n/a |
| ScriptNotes | Notes anchored to a paragraph, title + body, color, category, shown as margin markers and side-by-side with the script (FD12+), listed in Navigator, can be hidden from print/PDF | partial: `[[notes]]` and Notes tab (Phase 2); no categories, colors, replies, or status | yes: see section 2 |
| Built-in commenting / Reader Mode | Free browser view-and-comment role in Final Draft Cloud, invitation only, account required | planned Phase 4 as "Proof mode" | yes, and this is where Drafter can beat FD (no account) |
| Collaboration (real-time) | Host starts a session, shares a session ID, admits guests; simultaneous editing, chat, notes, tracked changes; same FD version required; no third-party server | missing | no: needs a network/server; contradicts the no-server principle. Offer file-based merge instead |
| Final Draft Cloud / Vault / auto version saving | Cloud storage, projects, sharing, automatic versions | Snapshots planned Phase 2; Dropbox/Drive "Later" | no for cloud; snapshots cover versions |
| PDF import | Converts a PDF script to an editable file | explicitly out of scope | maybe (later): useful to writers receiving PDFs, but fidelity is poor and out-of-scope decision stands; low priority |
| FDX import/export | Native format | planned Phase 3 | n/a |
| Emoji support in script/notes | Emoji in script, Beats, ScriptNotes | have by virtue of text (verify font and PDF embedding) | maybe: check Courier Prime fallback in PDF |
| Custom color PDFs, Night/Midnight mode | Themed screen/PDF colors | dark/light theme have | no: PDFs should stay black on white; low value |
| Character Development Tools | Screen time per character, who interacts | planned Phase 2 | n/a |
| Reports (scene, character, location, dialogue, cast, etc.) | Printable lists | breakdown report planned Phase 4; character pass planned | maybe: a per-character dialogue export (everything one character says) for actors |
| Watermarks, headers/footers, "CONFIDENTIAL" | Marks each page for distribution | missing | yes: watermark and custom header/footer on PDF export; matters exactly when sending drafts to readers |
| Import/Export notes in PDF | Print scripts with/without notes | missing | yes: PDF export option: "with notes in the margin" / "without notes" |
| Scene properties / Scene numbers / Omit | Per-scene metadata, omitted scenes | scene goals and OMITTED planned | n/a |
| Final Draft Go (iOS) | iPad/iPhone app | PWA, phone/tablet layouts | no separate app; verify iPad quality |
| Dual dialogue, Smart Type, spellcheck, format assistant | Standard writing aids | have / planned | n/a |
| Template library (FD templates) | Many format templates | planned Phase 3 | n/a |
| Speech: Final Draft has no confirmed speech-to-script feature | - | table read planned | maybe: browser dictation (Web Speech) is possible but privacy-leaky (Chrome sends audio to a server); if added, make it opt-in with a warning |

Sources: https://www.finaldraft.com/products/final-draft/ (FD13 feature list, platforms, price); https://www.finaldraft.com/blog/final-draft-13-is-here (FD13 additions, Sept 5, 2025); https://www.finaldraft.com/blog/tech-tips-track-changes-vs.-revision-mode (Track Changes accept/reject, per-author color; Revision Mode sets); https://www.finaldraft.com/learn/collaborate/ (session ID, host admits guests, chat, tracked changes, no third-party server); https://www.finaldraft.com/reader-mode (Reader Mode); https://kb.finaldraft.com/hc/en-us/articles/27813588722708-How-do-I-use-Revision-Mode and https://kb.finaldraft.com/hc/en-us/articles/27817054455828-How-do-I-lock-or-unlock-script-pages-and-use-the-locking-tools (snippets); https://nofilmschool.com/final-draft-13-arrives and https://scriptmag.com/news/final-draft-13-launches-today-in-surprise-drop (launch coverage).

## 2. Reader annotations

### How Final Draft does it

- **ScriptNotes**: the writer or reader clicks a paragraph, then Insert > ScriptNote (Cmd+Shift+K on Mac, Ctrl+J on Windows). A clickable marker appears in the right margin next to that paragraph. Each note has a title and/or body, a color, and a category. Source: https://kb.finaldraft.com/hc/en-us/articles/27716323130644-How-do-I-insert-notes-into-my-script (snippet; the page itself returned 403).
- FD12 redesign: icon became a speech bubble, notes show side by side with the script (no Navigator needed), a note's color is changed from a swatch at the bottom left, delete is in a three-dot menu, arrows move between notes. Source: https://www.finaldraft.com/blog/tech-tips-new-and-improved-scriptnotes (Sept 5, 2025).
- Navigator lists, colors, and categorizes all ScriptNotes. A 2019 post says character notes are purple flags that do not print to paper/PDF. Source: https://blog.finaldraft.com/tech-tip-script-notes-in-the-navigator (snippet).
- Notes are stored inside the Final Draft script file (not verified in the docs), so notes travel only with the whole script file. Final Draft does not document a separate notes-only export/import; I found none (absence of evidence, not proof).
- **Track Changes** (FD12+): additions/deletions marked on the page; hover for Accept or Reject; Accept All/Reject All; name and color set in Preferences. A marked-up script can be sent to a collaborator who accepts/rejects and adds their own. Source: https://www.finaldraft.com/blog/tech-tips-track-changes-vs.-revision-mode. In a collaboration session the host turns tracking on from the Edit menu and each person's changes take their cursor color; a departed writer's changes keep their name and color. Source: https://www.finaldraft.com/learn/collaborate/.
- **Revision Mode** is a production tool (locked pages, numbered colored sets), not a feedback tool.
- **Readers**: Final Draft's current route is Reader Mode in Final Draft Cloud: free, view and comment only (adds ScriptNotes), by invitation, browser-based, but the reader must sign up for an account. How comments return to the writer is not stated on the page. Source: https://www.finaldraft.com/reader-mode. Historically the free iPad "Final Draft Reader" let readers highlight a character's lines and add notes, but export was one-way and no round-trip was documented; John August, 2012: https://johnaugust.com/apps/fdx-reader/page/2 and https://www.engadget.com/2012-07-29-final-draft-reader-for-ipad-hopes-to-replace-paper-scripts.html. I found no current confirmation the iPad Reader still exists.
- Takeaway: FD's feedback loop needs either the full app on both sides, a Cloud account, or a PDF with paper/PDF-reader annotations that cannot be merged back. That is the gap Drafter can fill.

### How others do it (briefly; mostly from aggregator pages, low confidence)

- WriterDuet: comments on specific parts, @mentions, private-link sharing; cloud-based (https://www.g2.com/compare/writerduet-vs-ia-writer-vs-celtx).
- Arc Studio: notes given and managed inside the script, one-click co-writer access (https://glcoverage.com/2024/07/04/script-writing-tools).
- Celtx: comments and tasks, cloud project. Fade In: revision colors/tracking; I found nothing on note sharing. Highland: nothing found (known from general knowledge: Highland uses Fountain `[[notes]]` and exports PDF; unverified here).
- Ideas worth borrowing: notes by color/category as filters; status (open/resolved); reply threads; a "comments off" print option.

### Proposed Drafter design: "Proof mode" as a file round-trip

Goal: a reader with no account and nothing installed comments on a script, sends a file back, and the author merges even after more editing. Nothing leaves the device except the file people choose to send.

1. **Send.** Author chooses "Send for notes" -> exports the `.fountain` file (and optionally a PDF for people who only read). Drafter stamps the file with a trailing boneyard metadata block (already the project's convention) holding a `proof` record: draft id (random), a content hash per scene/block, and the author's name. For readers who will not install anything, the author can also share a link to drafter.dev plus the file; the web app is a static page, so the reader just opens the file in it (File > Open, or drag it in). Optionally a "reader bundle": a single self-contained .html file (Phase 3's standalone export) with the script rendered and a minimal comment form, which works offline in any browser.
2. **Reader mode.** drafter.dev opens the file read-only ("Reader mode": script pane, no editing of text). The reader selects text or a line and adds a comment: author name (asked once, stored locally), category/color (e.g. Question, Cut, Idea, Typo, Praise; default color per category), optional replies. Nothing is uploaded; no account.
3. **Return.** "Export comments" writes either (a) the same .fountain with comment notes inserted, or (preferred) (b) a small sidecar `*.notes.json` (or `.drafter-notes`) file. (a) keeps one file and uses standard Fountain: `[[c:7f3a|Dana|question| Why does she lie here?]]` placed after the anchored line. Any Fountain tool shows it as a normal note; Drafter parses the structured form. (b) is better for merging because it never touches the author's text. Offer both; (a) for non-Drafter authors, (b) for Drafter authors.
4. **Anchoring that survives edits.** Each comment stores: the target text (the selected quote, up to ~120 chars), 40 chars of context before and after, the scene key (heading text + occurrence index, matching Drafter's existing scene-id scheme), a block-index hint, and the per-block hash from the sent draft. On merge, resolve in order: exact quote+context match within the scene; same scene with fuzzy match (diff-match-patch style bitap); same block hash elsewhere; scene heading only; else "orphaned" (kept, shown in a Problems-style list with the original quote and its nearest scene, never silently dropped). This is the same approach as W3C Web Annotation text-quote selectors, which is well tested for edited documents.
5. **Merge.** Author opens their current draft and chooses "Add reader comments"; Drafter shows a preview (N matched, N approximate, N orphaned), the author confirms, and comments are inserted as `[[...]]` notes (or kept in the sidecar and shown without touching the source; author's choice). Dedupe by comment id so re-importing the same file twice does nothing. Because inserts are ordinary text edits, undo works and snapshots protect the draft.
6. **Margin.** Notes tab and margin markers in the Script pane (Phase 2 Notes tab + Phase 4 margin): colored by category, filter by reader/category/status, click to jump. Replies are stored as further `c:` records with a `re:` parent id; resolve sets `status=resolved` (kept, hidden by default). Optional PDF export "with comments in margin" and "without comments".
7. **Reply loop.** The author's replies/resolutions go back to the reader the same way (same file type), so a thread can continue; the reader app shows author replies.

**Risks and mitigations**
- Anchoring after heavy edits: use the layered resolver above; always surface orphans; never delete.
- Privacy: comments contain names and opinions; the file may be forwarded. Strip nothing silently; show the author the list of names present before sending; reader name is optional ("Reader 1"). Metadata block must not contain the author's system info. No analytics on file contents.
- Trust and injection: treat incoming comment files as untrusted text; render comments as plain text (no HTML), cap lengths, validate the schema, ignore unknown fields.
- Readers who open the .fountain in a text editor and type `[[...]]` by hand: support plain `[[Name: comment]]` as a fallback (parse name before a colon) so a bare note still merges, anchored by position (nearest preceding block text).
- PDF-only readers: they cannot return structured comments. Mitigation: the optional self-contained reader HTML, or accept that a PDF reader's annotations are out of scope (Drafter does not import PDF).
- Phones: Reader mode must work on a phone, with one pane and a tap-to-comment sheet.
- Version skew: the metadata block carries a format version; unknown versions load read-only with a warning.
- Multiple readers: ids are random (not sequential) so several returned files merge without collisions.
- File-size/browser limits: sidecar JSON is tiny; the standalone HTML is the only large artifact.

## 3. Most worthwhile additions

See the one-line list in the final message.
