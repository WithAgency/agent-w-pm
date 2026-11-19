---
name: slack-build-transcript
description: >
    Sub-skill of slack-channel-backup. Renders the final Markdown transcript of a
    Slack channel from collected message JSON, the thread replies and the download
    manifest. Use it from slack-channel-backup at the "assemble and write" step
    (§4.8), not on its own.
license: WTFPL
metadata:
    author: with-madrid.com
---

# Slack Build Transcript

Deterministic renderer for the `slack-channel-backup` skill. It does not call
Slack. It only turns data already collected into `<channel>-backup.md`.

## When to use

- The messages (and thread replies) of the channel have been paged and saved as JSON.
- The Slack-hosted files have been downloaded and `<channel-slug>_assets/manifest.json` exists
  (or the channel has no files).

## Input format

`--input` takes one or more JSON files, each `{"messages": [...]}` or a bare list.
Each message:

| Key | Meaning |
| --- | --- |
| `n` | message ts without the dot, e.g. `"1601574853006900"` |
| `a` | author display name (already resolved, never a raw `<@U…>`) |
| `d` | date `YYYY-MM-DD` |
| `t` | time `HH:MM:SS TZ` or `YYYY-MM-DD HH:MM:SS TZ` |
| `b` | text, mrkdwn already converted; `Files: name (ID: F…, mime, size)` lines allowed |
| `r` | thread replies, same keys (`n`, `a`, `t`, `b`) |

Bots and system events must already be dropped by the caller.

## Command

```bash
python3 skills/slack-channel-backup/build-transcript/build_transcript.py \
  --input <messages.json> [--input <more.json> ...] \
  --channel-id <C…> --channel-slug <slug> --workspace <subdomain> \
  --out <output-folder>/<slug>-backup.md \
  [--assets-dir <output-folder>/<slug>_assets] \
  [--pins <ts1>,<ts2>] [--pins-note "<pin source, e.g. browser pins.list>"] \
  [--excluded-note "<which bots/events were excluded>"] [--exported YYYY-MM-DD]
```

- `--assets-dir` defaults to `<output folder>/<slug>_assets`. Its `manifest.json` drives the
  file lines. Without it, every file is shown as "not downloaded".
- `--pins` lists the message ts of pinned messages. They are shown at the top and in place.
- The script prints a summary: message and reply counts, date range, file counts and
  whether code fences are balanced. Check that fences are balanced before reporting success.

## Output rules (built in)

- One `### YYYY-MM-DD` heading per day; each message as `**Author** · time · [↗](permalink)`.
- Images embed as `![name](<slug>_assets/<file>)`; other files as `📎 [name](…) · size`.
  Undownloaded files are `📎 name · size · _not downloaded_` (or `(fetch failed)` when the
  manifest lists them). Google Drive files stay as links.
- Thread replies are blockquoted under the parent and link to the reply's own message.
- Code fences are isolated on their own lines and balanced per message; a truncated
  message gets an auto-close note.

## Notes

- Run it after the download step, so the manifest is complete. Re-run it any time the
  manifest changes; it does not touch Slack.
- Build `<assets-dir>/manifest.json` from what was actually downloaded with
  `collect_manifest.py` (sibling of the parent skill), not by hand — it scans the
  assets dir, recovers each file id from the `<FILE_ID>_<name>` filename, and marks
  every expected-but-absent id as failed.
- Keep the input JSON files. They are the only copy of the collected data if the
  Markdown ever has to be rebuilt.
