---
name: agent-w-pm-load-skills
description:
    Use this skill when the user asks to load, inspect, list, discover, or apply
    project-specific skills from the local ./skills folder (sibling of ./code).
    Provides on-demand discovery and context ingestion of project conventions,
    architecture, and workflows.
license: WTFPL
metadata:
    author: with-madrid.com
---

# Agent W PM Load Project Skills

Use this skill to discover and load project-specific skills on demand from the
`./skills/` directory in the current working directory.

## Expected Directory Layout

This skill operates in a workspace where project skills and code are siblings:

```text
<workspace root>/
├── code/       # Cloned repository code (managed via agent-w-pm-code-checkout)
│   └── <repo-name>/
└── skills/     # Pre-populated project-specific skills
    ├── <project-skill-1>/
    │   └── SKILL.md
    └── <project-skill-2>/
        └── SKILL.md
```

This version assumes `./skills/` is pre-populated by the user.

## Inputs

The user may ask to:

- **List or discover available skills**:
    - "List available project skills"
    - "List available project skills in ./skills"
    - "What project skills are available?"
    - "Show available project skills"
- **Load all project skills**:
    - "Load project skills"
    - "Load all project skills"
    - "Load project skills from ./skills"
- **Load specific project skills**:
    - "Load the QA skill from ./skills"
    - "Load project architecture conventions"
- **Combine with PM workflows**:
    - "Load project skills and review this ticket: <url>"
    - "Load project skills and assess this bug: <url>"

## Workflow

### 1. Verify `./skills/` Directory

Check whether `./skills/` exists in the workspace:

```bash
ls -d skills 2>/dev/null
```

- **If `./skills/` does not exist or is empty**: Inform the user:
    > The `./skills/` directory was not found (or is empty) at
    > `<current working directory>/skills`. Please place your project-specific
    > skills under `./skills/<skill-name>/SKILL.md` to load them. Stop the
    > workflow.

### 2. Discover Available Project Skills

Scan `./skills/` for all `SKILL.md` files:

```bash
find skills -mindepth 2 -maxdepth 2 -name "SKILL.md" 2>/dev/null
```

For each discovered skill:

1. Read the YAML frontmatter (`name`, `description`).
2. Extract the skill name and a one-sentence summary.

### 3. Match and Select Skills

- **If the user requested a specific skill or topic**:
    - Match the request against skill names and frontmatter descriptions.
    - If a single match is found, proceed to load it.
    - If multiple or ambiguous matches are found, list the matches and ask the
      user to confirm.
    - If no match is found, list all available skills in `./skills/` and ask the
      user which one they would like to load.

- **If the user asked to list available skills**:
    - Present the catalog of skills found in `./skills/` (name, path,
      description).
    - Ask the user which skill(s) they want to activate.

- **If the user asked to load all project skills**:
    - Select all discovered skills for loading.

### 4. Load Skill Content into Session Context

For each selected skill:

1. Read the full content of `skills/<skill-name>/SKILL.md`.
2. Ingest the rules, architectural patterns, conventions, and procedures into
   the active conversation.
3. Confirm to the user:
    - Skill name(s) loaded.
    - Key areas covered (e.g., coding standards, testing patterns, domain
      rules).
    - How these skills will inform subsequent PM actions (ticket review, bug
      qualification, etc.).

## Output Format

### When Listing Skills

```markdown
### Available Project Skills in `./skills/`

- **`<skill-name>`** (`skills/<skill-name>/SKILL.md`)
    - Description: [Summary from frontmatter]
```

### When Loading Skills

```markdown
### Project Skills Loaded

The following project skill(s) have been loaded into context:

1. **`<skill-name>`**
    - **Focus**: [Conventions / Domain logic / Testing / Architecture]
    - **Active Rules**: [Summary of key rules or guidelines now active]

I will apply these project conventions to all subsequent reviews and
assessments.
```

## Constraints

- **Read-Only**: Do not create, modify, or delete any files in `./skills/` or
  `./code/`.
- **Pre-populated Assumption**: Do not attempt to git-clone or fetch skills into
  `./skills/` in this version.
- **Strict Grounding**: Ground any future review or triage steps in both the
  loaded project skills and the checked-out code in `./code/<repo-name>/`.
