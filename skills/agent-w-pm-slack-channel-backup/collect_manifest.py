#!/usr/bin/env python3
"""Build <channel>_assets/manifest.json from what was ACTUALLY downloaded.

The manifest drives the file lines in the transcript (see
build-transcript/build_transcript.py). Write it from real outcomes, never from
assumptions: enumerate what is on disk, and list every expected id that is
missing as failed. This removes the failure mode where a whole channel is marked
"not downloaded" because one probe failed (see SKILL.md §4.7).

Files on disk must be named "<FILE_ID>_<anything>" (that is what §4.7 step 4
names them), so the file id is recoverable from the filename.

Expected ids come from one of:
  --from-messages <messages.json>   files parsed from "Files:" lines (authoritative)
  --ids-file <path>                 one file id per line
  --ids "F1,F2,..."                 comma-separated

Usage:
  python3 collect_manifest.py \
      --assets-dir chatfaq_assets \
      --from-messages /tmp/chatfaq_messages.json
"""
import argparse
import json
import os
import re
import sys

FILE_RE = re.compile(r"\(ID: (F[A-Z0-9]+), ([^,)]+), ([^)]+)\)")
NAME_ID_RE = re.compile(r"^(F[A-Z0-9]+)_")


def ids_from_messages(path):
    """Map file id -> {mime, size} for every file referenced in message bodies."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    msgs = data["messages"] if isinstance(data, dict) else data
    out = {}
    for m in msgs:
        bodies = [m.get("b", "")] + [r.get("b", "") for r in m.get("r", [])]
        for body in bodies:
            for line in (body or "").split("\n"):
                if line.startswith("Files: "):
                    for mt in FILE_RE.finditer(line):
                        out.setdefault(
                            mt.group(1),
                            {"mime": mt.group(2).strip(), "size": mt.group(3).strip()},
                        )
    return out


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--assets-dir", required=True,
                    help="folder holding <FILE_ID>_<name> files")
    ap.add_argument("--from-messages", help="messages JSON with 'Files:' lines")
    ap.add_argument("--ids-file", help="file with one expected file id per line")
    ap.add_argument("--ids", help="comma-separated expected file ids")
    ap.add_argument("--out", help="default: <assets-dir>/manifest.json")
    ap.add_argument("--failed-reason", default="fetch failed",
                    help="reason recorded for expected-but-absent ids")
    args = ap.parse_args()

    expected = {}
    if args.from_messages:
        expected = ids_from_messages(args.from_messages)
    elif args.ids_file:
        with open(args.ids_file, encoding="utf-8") as f:
            for line in f:
                fid = line.strip()
                if fid:
                    expected.setdefault(fid, {})
    elif args.ids:
        for fid in args.ids.split(","):
            fid = fid.strip()
            if fid:
                expected.setdefault(fid, {})
    else:
        ap.error("one of --from-messages / --ids-file / --ids is required")

    assets_base = os.path.basename(os.path.normpath(args.assets_dir))
    downloaded = {}
    for fn in sorted(os.listdir(args.assets_dir)):
        m = NAME_ID_RE.match(fn)
        if not m:
            continue  # manifest.json, .DS_Store, anything unnamed
        fid = m.group(1)
        name = fn[len(fid) + 1:] or fn
        downloaded[fid] = {"name": name, "path": "%s/%s" % (assets_base, fn)}

    failed = {fid: args.failed_reason for fid in expected if fid not in downloaded}
    out = args.out or os.path.join(args.assets_dir, "manifest.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"downloaded": downloaded, "failed": failed}, f, indent=1)

    print("manifest:", out)
    print("downloaded:", len(downloaded), "failed:", len(failed))
    if failed:
        print("failed ids:", ", ".join(sorted(failed)))
    extra = sorted(set(downloaded) - set(expected))
    if expected and extra:
        print("note: on disk but not referenced in messages:", ", ".join(extra))
    return 0


if __name__ == "__main__":
    sys.exit(main())
