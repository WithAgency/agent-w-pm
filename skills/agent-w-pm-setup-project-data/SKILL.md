---
name: agent-w-pm-setup-project-data
description:
    Use this skill when the user asks to set up, configure, update, review or
    check the project data (Linear team, Sentry org and projects, Notion page,
    Google Drive folders, Figma folder) of the current project folder, or runs
    /setup-project-data. Resolves the values through the connected MCPs, asks
    the user to confirm, and stores them in the project's AGENTS.md so every
    future conversation starts with them.
license: WTFPL
metadata:
    author: with-madrid.com
---

# Agent W PM Setup Project Data

Use this skill to create or update the **project data block** in the current
project folder's `AGENTS.md`. OpenCode loads `AGENTS.md` into every
conversation, so once the block exists, MCP calls and other skills can use the
right Linear team, Sentry projects, Notion page, Drive folders, and Figma folder
without searching for them.

The block is read and written **only** through the `agent-w project-data`
command. It validates the data, keeps everything else in `AGENTS.md` untouched,
and refuses files that are not plain text. Never edit `AGENTS.md` by hand or
with file tools.

## What Gets Stored

All integrations are optional. This is the full shape (JSON is used when
sending data to the command; it is stored as YAML):

```json
{
    "schema_version": 2,
    "project": "IB Global Data Reconciliation",
    "linear": { "team": "CAWL" },
    "sentry": { "org": "niji", "projects": ["ib-api", "ib-web"] },
    "notion": {
        "page": {
            "id": "35609273-cd88-80fe-9b9b-f057fa3fb46d",
            "title": "IB Global Data Reconciliation",
            "url": "https://app.notion.com/p/…"
        }
    },
    "drive": {
        "folders": [
            { "id": "1AbCdEfGhIjKlMnOp", "name": "Client deliverables" }
        ]
    },
    "figma": {
        "folder": {
            "id": "599655676",
            "team_id": "912673193368393001",
            "url": "https://www.figma.com/files/team/912673193368393001/folder/599655676"
        }
    }
}
```

Rules that the command enforces:

- `linear.team` is the uppercase team **key** (for example `CAWL`), not the
  name.
- Figma IDs are strings of digits. The `folder.id` is a Figma project.
- Notion `id` is normalized to a dashed UUID.
- Do not store tokens, passwords or any secret. Authentication stays in the MCP
  configuration.

## Workflow

### 1. Check the Location

Run:

```bash
pwd
ls
```

The current folder must be the **project folder**: the one that contains
`code/` and/or `skills/`, not a repository clone inside `code/`. If the path
contains `/code/<repo>`, stop and tell the user to start OpenCode from the
project folder (the parent of `code/`), so this file is loaded in every
conversation.

### 2. Read the Current State

```bash
agent-w project-data read
```

- `"found": false` → **setup mode**. Start from an empty project.
- `"found": true` → **update mode**. Show the user a short summary of the stored
  values and ask (with the question tool) what they want to change. If
  `found` is true but the `file` is in a parent folder, tell the user and ask
  whether to create a separate block in this folder or update the parent's one
  (run the command from that folder).
- If the command reports that `AGENTS.md` is not plain text, relay the message
  and stop; do not try to work around it.

### 3. Choose the Integrations

In setup mode, ask (multi-select) which integrations apply to this project:
Linear, Sentry, Notion, Google Drive, Figma. In update mode, only the ones the
user wants to change. The project name defaults to the Notion page title if
there is one, otherwise ask.

### 4. Resolve Each Integration

For every selected integration, **discover candidates with the connected MCP,
let the user pick, then verify**. Ask one integration at a time and keep
choices short. If an MCP is not connected, ask the user to type or paste the
value and say clearly at the end that it was **not verified**.

For URLs the user pastes, extract the identifiers with the command instead of
doing it by hand:

```bash
agent-w project-data parse-url "<url>"
```

It understands Notion, Figma folder, Google Drive folder, Linear and Sentry URLs
and prints JSON in the same shape as the stored data.

**Linear**

1. Use the Linear MCP to list the teams. Suggest the team whose name or key
   resembles the project or folder name.
2. Let the user pick and store the team **key**. If a key the user typed does
   not exist in the list, show the closest teams and ask; do not store it.

**Sentry**

1. Use the Sentry MCP to find the organization(s), then the projects in the
   chosen organization.
2. Let the user select the projects that belong to this project (multi-select).
   Store the organization slug and project slugs.

**Notion**

1. Ask for the link of the project's main Notion page (or search Notion by the
   project name and offer the top results).
2. Run `parse-url`, then fetch the page with the Notion MCP to confirm it exists
   and that the title matches what the user expects.

**Google Drive**

1. Ask for the folder links, or search Drive by folder name with the Drive MCP
   and offer results. Several folders are allowed.
2. Run `parse-url` on links, confirm each folder can be opened, and ask for a
   short `name` for each ("Client deliverables", "Meeting notes").

**Figma**

1. Ask for the link of the Figma folder (`…/files/team/<team>/folder/<folder>`).
   A link to a single design file is not enough; ask for the folder link.
2. Run `parse-url`. If the Figma MCP can list the files of that project, do it
   and show the first few names so the user can confirm it is the right folder.

### 5. Preview and Confirm

Build the full JSON (merged with the existing values in update mode), then run a
dry run so the exact block is validated and shown, without writing anything:

```bash
agent-w project-data write --dry-run <<'EOF'
{ …the JSON… }
EOF
```

If the command reports errors, fix them (usually a value the user still needs to
choose) and run the dry run again. Then show the user a summary in plain
language, one line per integration, and mention any value that was not verified.
Ask for confirmation with the question tool.

### 6. Write and Verify

After confirmation, run the same command without `--dry-run`, then check the
result:

```bash
agent-w project-data write <<'EOF'
{ …the JSON… }
EOF
agent-w project-data read
```

Tell the user the file that was written and which integrations are stored.
The new values apply to the next message of the conversation; if a later
question does not use them, ask the user to start a new conversation.

## Constraints

- **Only the command writes.** Never create or edit `AGENTS.md` with file tools
  or shell redirection. Never touch anything outside the project folder.
- **No guessing.** Every ID must come from the user, a URL, or an MCP result.
  Never invent or "fix" IDs.
- **No secrets.** Do not store tokens, cookies or credentials.
- **Nothing is written without confirmation.** The dry run comes first.
- **Stay in scope.** Do not modify the code in `./code/` or the skills in
  `./skills/`.
