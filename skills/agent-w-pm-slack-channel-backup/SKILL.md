---
name: slack-channel-backup
description: >
    Use this skill when the user asks to back up, archive, export, dump, snapshot,
    or save a Slack channel (or a conversation/DM) into a file. Produces a single
    chronological Markdown transcript, with a dedicated Pinned-messages section at
    the top and every user ID resolved to a display name. Slack-hosted files are
    downloaded into a `<channel>_assets/` folder and referenced under their message.
    Works for any channel; sensible defaults are human-messages-only, thread replies
    expanded inline, and the entire channel history.
license: WTFPL
metadata:
    author: with-madrid.com
---

# Slack Channel Backup (to Markdown)

Turn a Slack channel into a single, readable, chronological Markdown file that is
a faithful *re-render* of the conversation: pinned messages first, then the full
timeline with human-readable author names and permalinks.

This skill is channel-agnostic. It was distilled from a real run on `#tfs`
(`C098P86M327`) — see the "Decisions log" at the end for the rationale behind each
default.

## 0. Preflight — run these two checks before anything else

Do NOT page the channel, read pins, or download files until both checks pass.
Each one, if skipped, wastes a whole harvest or makes every thread lookup fail.

### 0.1 Write access to the output folder (hard gate)

The deliverable is one Markdown file **plus** a `<channel-slug>_assets/` folder
(with `manifest.json`), so the run MUST be able to create and overwrite files in
the output folder. Before starting:

1. **Probe it.** Write a throwaway file (e.g. `.slack-backup-write-test`) into the
   output folder and read it back, then delete it. Use the host's `write` tool, or
   a `shell`/`bash` tool with redirection. Confirm you can also create a
   sub-folder.
2. **If you cannot write files, STOP and do not start the harvest.** Tell the user
   the run cannot be saved and ask them to **grant write permission for the
   working directory** (or enable a write-capable tool), then wait for them. A
   harvest with nowhere to land is wasted work.
3. Prefer the host's `write` tool if it exists; otherwise use the shell (`cat > …`,
   `mkdir -p`, `mv`). Keep the collected input JSON — it is the only copy of the
   data if the Markdown must be rebuilt.

### 0.2 Masked timestamps — never pass `[PHONE]…` to a tool

Some hosts redact email addresses and long digit runs from tool output. A Slack
timestamp then arrives **masked**: its integer part is replaced by `[PHONE]` (or
similar) while the fractional part survives — e.g. `[PHONE].809169`. You do NOT
get the integer part from the tool.

`slack_read_thread`, permalinks, and the `n` field of `build_transcript.py` all
need the **full** ts. Rebuild it from the message's **displayed local time**
(unmasked, e.g. `2026-01-26 19:04:41 CET`) plus the surviving fraction — see
§4.6a for the exact rule. Handing `[PHONE].…` to a tool fails with
`thread_not_found`.

## 1. Required inputs (ask before doing anything)

You MUST know:

- **Channel** — a channel name (`#tfs`), a channel ID (`C098P86M327`), or a
  user ID for a DM. If the user only gave a name, resolve it with
  `slack_search_channels` (see §4.1).
- **Output path** — default to `<cwd>/<channel-slug>-backup.md` (e.g.
  `tfs-backup.md`). Confirm if ambiguous.

If the channel is missing or ambiguous (several channels match the name), list
the candidates and ask. Never guess.

## 2. Options and defaults

Present these once, briefly, and let the user adjust. The defaults reflect the
agreed `#tfs` behavior.

| Option | Default | Alternatives |
| --- | --- | --- |
| Bot messages (transcript) | **Exclude** | Include all (labeled); include but collapse CI noise |
| Pinned messages that are bot posts | **Exclude** | Keep; show a placeholder line (`author · permalink · bot message omitted`) |
| Threads | **Expand inline** | Parent only + reply count; threads in a separate appendix |
| Pinned section placement | **Top section, ALSO repeated in the body** | Top only (flag in body); top only (remove from body) |
| Coverage | **Entire history** | Recent window (e.g. last 3 months); since a specific date |
| System events (join/leave/topic changes) | **Skip** | Include as short italic event lines |
| Timestamps | **Channel-local** (e.g. `CEST`/`CET`) | Normalize to UTC |
| Slack-hosted files | **Download to `<channel-slug>_assets/`** and reference after the message | Links only (Slack URL); skip files entirely |
| Artifacts | **Markdown + assets folder** | Markdown only; Markdown + JSON sidecar; extra pins-only file |

## 3. Tooling map

Slack access is via MCP tools (there is no raw-JSON export). The tools return
pre-formatted text, so this is a re-render, not a byte-exact archive.

| Need | Tool |
| --- | --- |
| Resolve channel name → ID | `slack_search_channels` |
| Read messages (newest-first, 100/page, cursor) | `slack_read_channel` |
| Read a thread's replies | `slack_read_thread` |
| Resolve a user (name + `is_bot` / app flag) | `slack_read_user_profile` |
| Current members (name map seed) | `slack_list_channel_members` |
| Find users by name/email | `slack_search_users` |
| Enumerate a channel's files + canonical URLs | Slack web API `files.list` / `files.info` from the browser (§4.5a) — never hand-build paths |
| Find pinned messages | Slack web API `pins.list` from the browser (§4.5, §4.5a). No reliable Slack MCP search for pins |
| Download Slack-hosted **binary** files | `browser` tools in the redirected **app tab** (§4.7). Fetch the canonical `url_private`; `slack_read_file` returns metadata only, not bytes |
| Read a **text-type** file (snippet, CSV, HTML, email) | `slack_read_file` content (§4.7 step 5) — the binary route always fails for these |
| Build the download manifest from what landed | `collect_manifest.py` (sibling of this skill; §4.7 step 7) |
| Assemble and save the final file | sub-skill `build-transcript/` (`build_transcript.py`); needs write access for the `.md` and `_assets/` (§0.1) |

Key constraints:

- `slack_read_channel` returns **newest-first**; reverse to get chronological.
- It **cannot filter senders** — you page the whole channel, then drop bots
  client-side.
- Threads are **not** inlined by `slack_read_channel` (only "N replies" +
  parent `message_ts`); fetch each thread separately.
- There is **no `pins.list` MCP tool** — pins come from Slack's web API via the
  browser (§4.5, §4.5a), never from `has:pin` search.
- Code-mode has no filesystem: accumulate the Markdown in-session, then write it
  with the host's `write` tool or the shell (§0.1 — verify write access first).
- Message timestamps may be **masked** by the host (`[PHONE].809169`); rebuild the
  full ts per §4.6a before using it in any tool, permalink, or the JSON `n`.
- Message bodies carry a `Files:` line per attachment, e.g.
  `Files: image.png (ID: F0C5UEE41L5, image/png, 145.4 KB)`. Several entries can
  share one line, separated by `, `. Names may contain commas or parentheses, so
  parse each entry by its `(ID: …, mime, size)` tail.
- Google-native files (`application/vnd.google-apps.*`, 0 bytes) have no binary to
  download. They stay as links.
- **File URLs must be canonical.** Slack serves `files-pri` only for the file's
  *stored* (sanitized) name. A URL built from the message's **displayed** name is
  **302-redirected** to `files-origin.slack.com` (404), which the browser surfaces
  as an opaque `TypeError: Failed to fetch`. Always take the URL from
  `files.list`/`files.info` (§4.5a, §4.7) — never synthesise it from `Files:` text.
- **Browser fetches are origin-bound.** `files.slack.com` (file bytes) answers only
  when the fetch runs from the redirected `app.slack.com/client/<TEAM>/<CHANNEL>`
  tab; from a `*.slack.com` (API/JSON) page it is CORS-blocked. Slack's web API
  (`files.*`, `pins.list`) is the mirror image: it must run **same-origin on the
  workspace host** and needs the `xoxc` session token (§4.5a).

## 4. Procedure

Run the phases in order.

### 4.1 Resolve the channel

`slack_search_channels` with `keywords: ["<name>"]`. If multiple match, list them
and ask. Record `channel_id`.

### 4.2 Build the user map (names + bot flags)

1. Seed from `slack_list_channel_members` (`response_format: "concise"` for human
   names; `"ids_only"` returns *all* IDs including bots).
2. As you page messages (§4.3), collect **every distinct author ID**. Membership
   is not enough — departed users still posted (e.g. `roxane.chatel`, `tiph`).
3. For each unknown author ID, call `slack_read_user_profile` and record
   `{ id, displayName, isBot }`. Prefer display name, fall back to real name,
   then handle/email.

Build `userID → { name, isBot }`. Every name rendered in the file comes from
this map, never from a raw `<@U…>` token.

### 4.3 Page the channel (newest → oldest)

Loop `slack_read_channel(channel_id, limit: 100, cursor)` until exhausted. For
each page:

- Record `message_ts`, author ID, timestamp, `text`, `subtype`, reactions,
  attachments, and whether it has a thread (`reply_count`).
- Split the `Files:` line out of `text` and record each entry as
  `{ id, name, mime, size }`. Keep the rest of the text unchanged.
- Classify each message as **keep** or **drop**:
  - Drop the author is a bot (`isBot`/app) — **unless** the user chose to include
    bots.
  - Drop system subtypes (`channel_join`, `channel_leave`,
    `channel_topic`/`channel_purpose`) — **unless** the user chose to include
    events.

Coverage: if the user chose a bounded range, stop paging once `message_ts` is
older than the start bound.

### 4.4 Expand threads (inline)

For every **kept** message with `reply_count > 0`, call
`slack_read_thread(channel_id, message_ts: <parent ts>)`. Apply the same bot and
system filters to replies, keep them chronological, and nest them under the
parent (see §6). Threads whose parent was dropped (e.g. a bot parent) are skipped.

### 4.5 Pinned messages  (always via the signed-in browser)

There is **no `pins.list` tool** exposed by the Slack MCP server, and the
`has:pin` search operator is **unreliable**: it tends to return only the *most
recent* pin(s) and silently omits older ones (and Slack's search index does not
cover the whole channel history). On `#tfs` it returned **1** pin while the
channel actually had **3** (the missed two were from 2022 and 2021).

**Get the faithful pin list from the signed-in browser — the only method:**

1. Open the channel in the signed-in browser: `browser.tabs.open` with
   `https://<workspace>.slack.com/archives/<CHANNEL_ID>`. If it lands on a sign-in
   page you are NOT authenticated — stop and ask the user to log in; do not fall
   back to search. (The `pins.list` call itself follows §4.5a's origin rules:
   **workspace** origin, with the `xoxc` token — not the app tab.)
2. Read the pins with the web API `pins.list` via §4.5a — from a page on the
   **workspace origin**, either a same-origin `POST /api/pins.list`
   (`channel=<CHANNEL_ID>&count=100`, token in the body) or a top-level navigation
   to `/api/pins.list?token=<xoxc>&channel=<CHANNEL_ID>&count=100` (then parse
   `document.body.innerText`). A plain
   `fetch(…, {credentials: "include"})` from `app.slack.com` fails
   (CORS / `not_authed`) — do **not** use it. Take the **complete** set, not just
   the first page. Each item carries `message.permalink` (`…/p<ts>`), which yields
   the exact `ts` for step 3.
3. For each pinned item, **locate the message in the already-harvested
   transcript** (match on author + date, confirmed by text). Every pin is a
   normal message, so it is already captured — do not re-fetch.

Never use `slack_search_public` with `has:pin` for the pin set: it silently
under-reports and must not be presented as complete. If the browser session is
unavailable, report the pin section as unconfirmed rather than guessing.

### 4.5a Talking to the Slack web API from the browser (token + origin)

Both the pin list (§4.5) and the file list (§4.7) come from Slack's **web API**,
not the MCP tools. Two things are required, and both are easy to get wrong.

**1. A session token.** The web client's `xoxc-…` token lives in its storage.
Read it once, in the app tab:

```js
// browser.evaluate, from the app.slack.com tab
const token = Object.values(localStorage)
  .map(v => (String(v).match(/xoxc-[A-Za-z0-9-]+/) || [])[0])
  .find(Boolean);
```

The matching `d` cookie is already present; the token is the missing half. API
calls **without** it answer `{"ok":false,"error":"not_authed"}`.
Use the token only for the live calls — never write it into a file, a shared URL,
or the transcript.

**2. The right origin for the call.** Two hosts take the two families of call:

- **Workspace host** (`https://<workspace>.slack.com`) — serves `/api/…`
  (`files.list`, `files.info`, `pins.list`). Call it **same-origin** (from a page
  already on that host) as a `POST` with `Content-Type:
  application/x-www-form-urlencoded` and the token in the body; **or** as a
  top-level navigation to
  `https://<workspace>.slack.com/api/<method>?token=<xoxc>&<params>` (navigation
  is not CORS-restricted — read the JSON back from `document.body.innerText`).
  A `fetch` to this host **from `app.slack.com` is CORS-blocked**.
- **`files.slack.com`** — serves file bytes and is fetchable **only** from the
  `app.slack.com` tab (§4.7). It is **not** fetchable from the workspace host.

Rule of thumb: **API/enumeration on the workspace origin; file bytes on the app
origin.** Keep one tab on each and never cross them — crossing produces either a
CORS error or `not_authed`.

### 4.6 Normalize content

Convert Slack `mrkdwn` → Markdown (§5), resolve mentions/channels/links, decode
HTML entities, and render reactions + attachment metadata as sub-lines.

### 4.6a Rebuilding a masked timestamp

When `message_ts` is masked (`[PHONE].809169`), rebuild the full ts from the
displayed local time and the surviving fraction. The displayed time is
`<HH:MM:SS> <TZ>` (e.g. `19:04:41 CET`). **Parse only the `HH:MM:SS` token, and
compute the UTC offset from the `TZ` token separately.** Feeding the whole
`"41 CET"` into the seconds field yields `NaN`, and every later
`slack_read_thread` call then fails with `thread_not_found` — this is exactly the
bug to avoid.

```python
import datetime

_OFF = {"CET": 1, "CEST": 2, "UTC": 0, "Z": 0, "WET": 0, "WEST": 1}

def full_ts(date, time_with_tz, masked_ts):
    # date "2026-01-26"; time_with_tz "19:04:41 CET"; masked_ts "[PHONE].809169"
    hms, _, tz = time_with_tz.partition(" ")      # "19:04:41", "CET"
    h, m, s = (int(x) for x in hms.split(":"))     # never int("41 CET") -> NaN
    y, mo, d = (int(x) for x in date.split("-"))
    tzinfo = datetime.timezone(datetime.timedelta(hours=_OFF[tz]))
    secs = int(datetime.datetime(y, mo, d, h, m, s, tzinfo=tzinfo).timestamp())
    return f"{secs}.{masked_ts.split('.')[-1]}"
```

Sanity check before bulk work: rebuild one known message's ts, call
`slack_read_thread` with it, and confirm it returns that parent. `thread_not_found`
means the ts is wrong — almost always a `NaN`/timezone slip.

### 4.7 Download Slack-hosted files (after the messages)

Runs once paging, thread expansion and normalization are done, and before
assembly. Each downloaded file is then referenced under its message (§6).

1. **Skip** Google-native files (`application/vnd.google-apps.*`). Also skip files
   over 5 MiB, the browser transfer limit. Both stay as links.
2. Open the channel in the signed-in browser: `browser.tabs.open` with
   `https://<workspace>.slack.com/archives/<channel_id>`. It redirects to
   `app.slack.com/client/<TEAM>/<channel_id>`. **Do every byte fetch from this app
   tab and leave it there** — `files.slack.com` allows no other origin. If it lands
   on a sign-in page, stop and ask the user to log in.
3. **Enumerate the files and take their canonical URLs — do not guess names.** On a
   *separate* tab on the **workspace origin** (§4.5a), call the web API `files.list`
   (`channel=<channel_id>&count=100&page=<n>`, token in the body), paging until
   done, exactly as the web client does. Each file gives `id`, `name`, `size`,
   `mode` and `url_private` / `url_private_download`. Build the work list from
   **this** response (for a single file, `files.info`). The ASCII-ised filename in
   `url_private` is mandatory: a URL built from the message's **displayed** name
   (`Screenshot 2025-08-19 at 11.06.17.png`) is **302-redirected to
   `files-origin.slack.com` → 404**, surfacing as `TypeError: Failed to fetch`.
   This was the single biggest failure mode on the #chatfaq run.
4. For **every** file in the work list, from the **app tab**, run
   `browser.evaluate`:
   ```js
   const res = await fetch(file.url_private, { credentials: "include" }); // 200, no redirect
   const b = await res.blob();
   const a = document.createElement("a");
   a.href = URL.createObjectURL(b);
   a.download = `${file.id}_${file.name}`;   // canonical name
   document.body.appendChild(a); a.click(); a.remove();
   ```
   Do **not** retry through other routes: the `files-origin` host returns 404, the
   `withdigital.slack.com/files/...` permalink opens the desktop app, and the file
   viewer exposes no Download control to the browser tools.
   **Attempt every file** — never extrapolate a single failure into a blanket
   "all failed"; that is a procedural error, not a shortcut.
5. **Text-type files have no fetchable binary.** Snippets, `text/csv`, `text/html`
   (e.g. `email` mode) and `quip` files fail step 4 with `Failed to fetch`.
   Recover them with `slack_read_file`: its payload is the file's text wrapped in
   `<file_content_<hex>> … </file_content_<hex>>`; strip the wrapper and write the
   inner text to `./<channel-slug>_assets/<FILE_ID>_<safe name>`. Use this only for
   text types — real binaries have no such fallback.
6. `browser.files.list` to find each completed download, then `browser.files.get`
   (max 5 MiB) to copy it to a server-local path, and move it into
   `./<channel-slug>_assets/<FILE_ID>_<safe name>` with `shell`. Discard 0-byte
   pending entries. The saved name must match step 4's `download` so the id↔file
   mapping stays unambiguous.
7. Write `./<channel-slug>_assets/manifest.json` from the **actual** results — the
   helper `collect_manifest.py` does this deterministically (it scans the assets
   dir and marks every expected-but-absent id as failed):
   ```json
   {
     "downloaded": { "<FILE_ID>": { "name": "...", "path": "<channel-slug>_assets/<file>" } },
     "failed": { "<FILE_ID>": "fetch failed (<reason>)" }
   }
   ```
   Google-native and oversize files go under neither key. `downloaded` renders an
   embed/link; `failed` renders `not downloaded (fetch failed)`.

Verified on #chatfaq: `files.list` returned **254** files; the canonical-URL fetch
downloaded **245** binaries (95 MB) across six batches, and `slack_read_file`
recovered the remaining **8** text files (6 CSV, 2 HTML) — **253/253 referenced
files, 0 failures**. The earlier attempt returned *zero* downloads purely because
it derived the URL from the displayed name instead of the canonical one.

### 4.8 Assemble and write

Save the collected messages and replies as JSON (§6 input format), then run the
sub-skill `build-transcript/SKILL.md`. It sorts everything chronologically, applies
the file links from the manifest, and writes `<channel-slug>-backup.md`. Check its
summary (counts, balanced fences) before reporting. For small channels the `write`
tool can still produce the file directly.

## 5. Slack mrkdwn → Markdown

| Slack | Markdown |
| --- | --- |
| `<@U123>` / `<@U123\|name>` | `@DisplayName` (via the map) |
| `<#C123>` / `<#C123\|name>` | `#channel-name` |
| `<https://u\|text>` | `[text](https://u)` |
| `<https://u>` | `<https://u>` |
| `*bold*` | `**bold**` |
| `_italic_` | `*italic*` |
| `~strike~` | `~~strike~~` |
| `` `code` ``, ```` ``` ```` blocks, `>` quotes | unchanged |
| `• item` | `- item` |
| `&amp;` `&lt;` `&gt;` `&quot;` | `&` `<` `>` `"` |

Resolve `<@U…>` even when Slack did not inline a name (e.g. `<@U09600CBTCP|remy>`
→ `@remy`; bare `<@U…>` → look up the map).

### Code blocks (critical for correct rendering)

The Slack tool renders fenced code blocks with the backticks **glued to the
content**: the opening ``` shares a line with the first code line
(`` ```from contracts… ``) and the closing ``` trails the last code line
(`` …count()``` ``). Emitted as-is, the fence **never closes** and swallows the
rest of the document. Rules:

1. **Put every ``` on its own line** before writing Markdown
   (`body = body.replace("```", "\n```\n")`).
2. **Balance fences per message.** Long messages are **truncated by the tool
   (~4,000 chars, marked `…`)**, severing the closing fence. If a message has an
   odd number of ```, append a closing fence and flag it, e.g.
   `_⚠ message truncated in Slack export — code block auto-closed_`.
3. **Reply indentation:** never indent replies with HTML entities (`&nbsp;`) or
   raw spaces around code — that breaks an inner fence. Use a **blockquote**
   (prefix every reply line with `> `); `> ``` ` is a valid fenced block inside a
   blockquote, whereas `&nbsp;``` ` is not.

## 6. Output format

### File header

```markdown
# #<channel> — Backup

> Channel: #<channel> (<channel_id>) · Exported: <YYYY-MM-DD> · Range: <first> → <last> · <N> messages
> Human messages only; bots & system events excluded. Faithful re-render, not a raw export.

## Pinned messages

**<Author>** · <YYYY-MM-DD HH:MM TZ> · [↗](<permalink>)
<text>

## Transcript

### <YYYY-MM-DD>
**<Author>** · <HH:MM TZ> · [↗](<permalink>)
<text>
    ├─ **<Author>** · <HH:MM TZ> · [↗](<permalink>)
    │  <reply text>
```

Rules:

- One `### YYYY-MM-DD` heading per day, in ascending date order.
- Every message: `**Author** · HH:MM TZ · [↗](permalink)` on its own line, then the
  text. Keep the permalink so each line traces back into Slack.
- Thread replies are nested under the parent, indented, chronologically after it.
- Pinned messages appear in the Pinned section **and** again in place in the
  transcript (per §2).
- Reactions render as a sub-line, e.g. `:thumbsup: ×3 (Romain, Rémy)`.
- Attachments/deploy metadata render as sub-lines (title + link + status).
- **Files go after the message body**, one line per file, before any thread
  replies. Replies get the same treatment, quoted (`> `). Images embed as
  `![name](<channel>_assets/<file>)`. Other files render as
  `📎 [name](<channel>_assets/<file>) · <size>`. Undownloaded files render as
  `📎 name · <size> · _not downloaded_`. Google Drive files render as
  `📎 name · Google Drive file · _link only, see message_`.
- Direct Slack file URLs written inside the message text are left as they are.
  Only the attachment lines get rewritten. Rewriting inline links would add
  complexity without much gain.

### Limitations note

State these in the file header (or just below it):

- Faithful re-render, not a raw JSON export; Block Kit/attachment detail may be
  lossy.
- Slack-hosted files are downloaded into `<channel>_assets/` from their **canonical
  `url_private`** (fetched in the app tab), up to 5 MiB each; **text-type** files
  (snippets, CSV, HTML/email) are written out from `slack_read_file` content.
  Google Drive files and genuinely unfetchable or oversize files remain links or
  "not downloaded" notes.
- Pinned messages are read from Slack's web API `pins.list` through the signed-in
  browser (workspace origin + session token, §4.5a); Slack search (`has:pin`) is
  never used as the pin source.
- One-shot snapshot (not a re-runnable sync unless an API token is provided).

## 7. Deliverable & constraints

- **Always read-only in Slack.** Never post, react, edit, or join. This skill
  only reads and writes the local Markdown file.
- One file per channel unless the user asks to split (per-year files + index if
  the transcript is unwieldy).
- The output file goes wherever the user asked; default
  `<cwd>/<channel-slug>-backup.md`.
- Downloaded files go in `<output folder>/<channel-slug>_assets/`, next to the
  Markdown, with a `manifest.json`. Relative links in the Markdown point there.

## 8. Checklist

- [ ] **Write access verified (probe file created, sub-folder creatable); if missing, user asked to grant it — harvest NOT started without it (§0.1)**
- [ ] **Masked ts rebuilt from local time + fraction; no `NaN` or `[PHONE]…` passed to any tool (§0.2, §4.6a)**
- [ ] Channel resolved (name → ID); asked if ambiguous
- [ ] Output path confirmed (default `<cwd>/<channel-slug>-backup.md`)
- [ ] Options confirmed; defaults applied (bots excluded, threads inline, pins
      top + repeated, full history, system events skipped, channel-local times)
- [ ] User map built from **authors seen in messages**, not just members
- [ ] Bot roster detected dynamically (`slack_read_user_profile`) + known integrations
- [ ] Whole channel paged (newest→oldest), reversed to chronological; bots/system dropped
- [ ] Every kept parent with replies expanded via `slack_read_thread`, bot/system filtered
- [ ] Pins read from the Slack web API `pins.list` via the browser (workspace
      origin + `xoxc` token, §4.5a), then located in the transcript; `has:pin`
      search never used as the pin source
- [ ] mrkdwn converted; mentions/links/entities resolved
- [ ] **Code fences isolated** (` ``` ` on its own line) and **balanced per
      message**; replies indented with `> ` blockquotes, not `&nbsp;`
- [ ] `Files:` lines parsed out of bodies (messages and replies) into `{id, name, mime, size}`
- [ ] Files enumerated via `files.list`; each fetched from its **canonical
      `url_private`** (never the displayed name) from the **app tab**
- [ ] **Every** file attempted (no blanket "failed"); text-type files recovered via
      `slack_read_file`
- [ ] `manifest.json` written from actual results by `collect_manifest.py`;
      Google Drive and >5 MiB files left as links
- [ ] Each message's files rendered after its body (replies quoted)
- [ ] Header + Pinned section + day-by-day transcript written; limitations documented

## 9. Example invocation

> "Back up #tfs to Markdown, full history, no bots, threads inline."

→ Resolve `#tfs` → confirm `tfs-backup.md` → page all, drop bots/system → expand
threads → fetch pins → normalize → write `/…/tfs-backup.md`.

## Decisions log (origin: the #tfs run)

- **Exclude bots entirely** (transcript *and* pins): the channel was dominated by
  CI/CD noise (GitHub `U098CGA8YF9`, Kerfufoo `U0APCBRLMFA`); the user wanted a
  human-knowledge archive, not a literal CI record.
- **Threads expanded inline**: replies carry real content that the top-level
  stream omits.
- **Pins at top + repeated in body**: quick reference up top, complete chronology
  below.
- **Entire history**: the `#tfs` human record spans ~3 years (2023-11 → 2026-10),
  longer than the apparent "created" date (a migration artifact).
- **Skip system events / channel-local times**: chosen to keep the file clean,
  consistent with the channel, and portable.
- **Files downloaded, placed after the message body**: MCP file reads return only
  metadata, so bytes come from the signed-in browser session. Files sit under their
  message so each one stays next to its context. Inline Slack URLs in text are left
  alone to keep the transform simple.
- **Pins need an authoritative source**: on `#tfs`, `has:pin` search returned 1
  pin but the channel had 3 — Slack's search under-reports old pins. Pins are
  therefore always read from the signed-in browser session (`pins.list` / Pins
  tab, the same tab used for file downloads), then located in the transcript
  (§4.5).

- **Write access is a preflight, not an afterthought**: the deliverable is a file
  plus an assets folder, so §0.1 probes the output folder and stops to ask the
  user for write permission if it is missing — before any harvesting.
- **Masked timestamps must be rebuilt, not passed through**: hosts redact the
  integer part of a Slack ts (`[PHONE].809169`). §0.2/§4.6a rebuild the full ts
  from the displayed local time + the surviving fraction, and call out the
  `NaN` trap (parsing the timezone token into the seconds field) that otherwise
  makes every `slack_read_thread` call fail with `thread_not_found`.
- **File URLs must be canonical (the #chatfaq failure)**: `files-pri` is served
  only for the file's *stored* name. A URL built from the message's **displayed**
  name is 302-redirected to `files-origin` → 404 and surfaces as
  `Failed to fetch`. Fix: enumerate with `files.list`/`files.info` and fetch the
  exact `url_private`, from the `app.slack.com` tab (§4.7). On #chatfaq this turned
  a "0 of 253 downloaded" result into **253/253**.
- **Text files need `slack_read_file`, not the byte route**: snippets, `text/csv`,
  `text/html` (email mode) and `quip` files never yield a binary — their content
  arrives as text inside `<file_content_…>` and must be written out directly
  (§4.7 step 5). On #chatfaq that recovered the last 8 files.
- **Attempt every file; never extrapolate**: recording a channel-wide "failed"
  from a single test is a process bug, not a shortcut. §4.7 step 4 requires a
  per-file attempt loop, and the manifest is built from real outcomes
  (`collect_manifest.py`).
- **Origin discipline (one place for both API users)**: enumeration (`files.*`,
  `pins.list`) runs on the **workspace origin** with the `xoxc` token; file bytes
  run on the **app origin**. Crossing them yields CORS errors or `not_authed`.
  Captured once in §4.5a so §4.5 and §4.7 share a single explanation, and the
  previously broken *"fetch `pins.list` with `credentials: include`"* recipe was
  corrected.
