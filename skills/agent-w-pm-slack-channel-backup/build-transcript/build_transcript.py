#!/usr/bin/env python3
"""Render a Slack channel backup (Markdown) from collected message data.

Inputs (--input, repeatable): JSON files shaped {"messages": [...]} or a bare list.
Each message:
  n  message ts without the dot (e.g. "1601574853006900")
  a  author display name
  d  date "YYYY-MM-DD"
  t  time "HH:MM:SS TZ" or "YYYY-MM-DD HH:MM:SS TZ"
  b  message text (mrkdwn already converted; "Files:" lines allowed)
  r  thread replies, same keys (n, a, t, b)

Downloaded Slack files are read from <assets-dir>/manifest.json, written by the
download step of the slack-channel-backup skill.
"""
import argparse, collections, datetime, json, os, re, sys
from urllib.parse import quote

FILE_RE = re.compile(r"\(ID: (F[A-Z0-9]+), ([^,)]+), ([^)]+)\)")


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def split_files(text):
    files, kept = [], []
    for line in text.split("\n"):
        if line.startswith("Files: "):
            seg = line[len("Files: "):]
            parsed, pos = [], 0
            for m in FILE_RE.finditer(seg):
                name = seg[pos:m.start()].strip().lstrip(",").strip()
                parsed.append({"id": m.group(1), "name": name,
                               "mime": m.group(2).strip(), "size": m.group(3).strip()})
                pos = m.end()
            if parsed:
                files.extend(parsed)
                continue
        kept.append(line)
    return "\n".join(kept), files


def clean(body):
    if body is None:
        return "", []
    body = re.split(r"(?:^|\n)=== Message at ", body)[0]
    body = re.split(r"(?:^|\n)=== THREAD ", body)[0]
    body, files = split_files(body)
    body = re.sub(r"\n{3,}", "\n\n", body)
    # Slack glues code fences to adjacent text; put every ``` on its own line.
    body = body.replace("```", "\n```\n")
    # Long messages get truncated by the Slack tool and can sever the closing fence.
    if body.count("```") % 2 == 1:
        body = body.rstrip() + "\n```\n\n_\u26a0 message truncated in Slack export \u2014 code block auto-closed_"
    return body.strip(), files


def split_time(t):
    parts = t.split()
    if len(parts) == 3:
        return parts[0], parts[1] + " " + parts[2]
    if len(parts) == 2:
        return None, parts[0] + " " + parts[1]
    return None, t


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", action="append", required=True, help="message JSON file (repeatable)")
    ap.add_argument("--channel-id", required=True)
    ap.add_argument("--channel-slug", required=True, help="e.g. tfs (used for names and the assets folder)")
    ap.add_argument("--workspace", required=True, help="Slack workspace subdomain, e.g. withdigital")
    ap.add_argument("--out", required=True, help="output Markdown path")
    ap.add_argument("--assets-dir", help="default: <out dir>/<channel-slug>_assets")
    ap.add_argument("--pins", default="", help="comma-separated message ts of pinned messages")
    ap.add_argument("--pins-note", default="", help="optional line describing how pins were confirmed")
    ap.add_argument("--excluded-note", default="Bots and system events excluded.")
    ap.add_argument("--exported", default=datetime.date.today().isoformat())
    args = ap.parse_args()

    slug = args.channel_slug
    assets_name = "%s_assets" % slug
    assets_dir = args.assets_dir or os.path.join(os.path.dirname(os.path.abspath(args.out)), assets_name)
    manifest_path = os.path.join(assets_dir, "manifest.json")
    base = "https://%s.slack.com/archives/%s/p" % (args.workspace, args.channel_id)
    pins = {p.strip() for p in args.pins.split(",") if p.strip()}

    msgs = []
    for path in args.input:
        data = load_json(path)
        msgs.extend(data["messages"] if isinstance(data, dict) else data)

    manifest = load_json(manifest_path) if os.path.exists(manifest_path) else {"downloaded": {}, "failed": {}}
    downloaded_files = manifest.get("downloaded", {})
    failed_files = manifest.get("failed", {})

    for m in msgs:
        m["b"], m["files"] = clean(m.get("b"))
        m["r"] = m.get("r", [])
        for r in m["r"]:
            r["b"], r["files"] = clean(r.get("b"))

    def file_lines(files):
        lines = []
        for f in files:
            name, size = f["name"], f["size"]
            hit = downloaded_files.get(f["id"])
            if hit:
                link = quote(hit["path"])
                if f["mime"].startswith("image/"):
                    lines.append("![%s](%s)" % (name, link))
                else:
                    lines.append("\U0001f4ce [%s](%s) \u00b7 %s" % (name, link, size))
            elif f["mime"].startswith("application/vnd.google-apps."):
                lines.append("\U0001f4ce %s \u00b7 Google Drive file \u00b7 _link only, see message_" % name)
            elif f["id"] in failed_files:
                lines.append("\U0001f4ce %s \u00b7 %s \u00b7 _not downloaded (fetch failed)_" % (name, size))
            else:
                lines.append("\U0001f4ce %s \u00b7 %s \u00b7 _not downloaded_" % (name, size))
        return lines

    msgs.sort(key=lambda m: m["n"])
    nreplies = sum(len(m["r"]) for m in msgs)
    authors = collections.Counter(m["a"] for m in msgs)
    dates = [m["d"] for m in msgs]
    span = (min(dates), max(dates)) if dates else ("?", "?")
    all_files = [f for m in msgs for f in m["files"]] + [f for m in msgs for r in m["r"] for f in r["files"]]
    downloaded = sum(1 for f in all_files if f["id"] in downloaded_files)

    lines = []
    lines.append("# #%s \u2014 Backup" % slug)
    lines.append("")
    lines.append("> Channel: #%s (%s) \u00b7 Exported: %s \u00b7 Range: %s \u2192 %s" % (slug, args.channel_id, args.exported, span[0], span[1]))
    lines.append("> %d human messages + %d thread replies. %s" % (len(msgs), nreplies, args.excluded_note))
    lines.append("> Faithful re-render, not a raw export. Slack-hosted files are downloaded to `%s/` and listed under their message (%d of %d downloaded); Google Drive files stay as links. Very long messages are truncated by the Slack export (~4,000 chars); any dangling code fence is auto-closed and flagged." % (assets_name, downloaded, len(all_files)))
    if args.pins_note:
        lines.append("> %s" % args.pins_note)
    lines.append("")

    pinned = [m for m in msgs if m["n"] in pins]
    lines.append("## \U0001f4cc Pinned messages")
    lines.append("")
    if pinned:
        for m in pinned:
            _, tim = split_time(m["t"])
            lines.append("**%s** \u00b7 %s %s \u00b7 [\u2197](%s%s)" % (m["a"], m["d"], tim, base, m["n"]))
            if m["b"]:
                lines.append(m["b"])
            lines.extend(file_lines(m["files"]))
            lines.append("")
    else:
        lines.append("_None._")
        lines.append("")

    lines.append("## Transcript")
    lines.append("")
    cur_date = None
    for m in msgs:
        _, tim = split_time(m["t"])
        if m["d"] != cur_date:
            cur_date = m["d"]
            lines.append("### %s" % cur_date)
            lines.append("")
        pin = " \U0001f4cc" if m["n"] in pins else ""
        lines.append("**%s** \u00b7 %s \u00b7 [\u2197](%s%s)%s" % (m["a"], tim, base, m["n"], pin))
        if m["b"]:
            lines.append(m["b"])
        lines.extend(file_lines(m["files"]))
        for r in m["r"]:
            _, rt = split_time(r["t"])
            lines.append("")
            lines.append("> \u21b3 **%s** \u00b7 %s \u00b7 [\u2197](%s%s)" % (r["a"], rt, base, r.get("n", m["n"])))
            if r["b"]:
                for bl in r["b"].split("\n"):
                    lines.append("> " + bl if bl else ">")
            for fl in file_lines(r["files"]):
                lines.append("> " + fl)
        lines.append("")

    text = "\n".join(lines)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(text)

    fence = sum(1 for l in text.split("\n") if l.lstrip("> ").strip() == "```")
    print("Wrote %s" % args.out)
    print("messages:", len(msgs), "replies:", nreplies, "span:", span)
    print("top authors:", authors.most_common(8))
    print("files:", len(all_files), "downloaded:", downloaded, "failed:", sum(1 for f in all_files if f["id"] in failed_files),
          "manifest:", manifest_path if os.path.exists(manifest_path) else "(none)")
    print("bytes:", len(text))
    print("fence lines:", fence, "balanced:", fence % 2 == 0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
