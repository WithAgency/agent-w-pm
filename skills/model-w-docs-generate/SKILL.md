---
name: model-w-docs-generate
description:
    Use this skill when the user asks to generate, create, or build project documentation
    from scratch. Produces a full perspective-based documentation tree (User, Admin, Tester,
    Developer) using Zensical via recursive sub-agents.
license: WTFPL
metadata:
    author: with-madrid.com
---

# Model W Documentation Generation (From Scratch)

This skill generates the complete **project-level documentation** for a Model W
project from nothing (or replaces stale documentation entirely). It produces a
tree of markdown files in `doc/`, built with
[Zensical](https://zensical.org/docs/get-started/), organized by perspective.

Inline code documentation (docstrings, JSDoc, etc.) is NOT part of this skill.
Inline docs are handled incrementally as code changes, through the
`model-w-docs-update` skill and the pre-commit documentation check.

Use this skill when:

- The project has no project-level documentation at all.
- The existing documentation is so outdated that incremental updates are not
  worth it.
- The user explicitly asks to regenerate docs from scratch.

For incremental updates (including inline docstrings), use the
`model-w-docs-update` skill instead.

## Documentation Standards

A tree of markdown files inside a `doc/` folder at the project root, organized
by **perspective**:

| Perspective   | Audience                    | Focus                                                     |
| ------------- | --------------------------- | --------------------------------------------------------- |
| **User**      | End users                   | Features, workflows, UI guides                            |
| **Admin**     | Application administrators  | User management, settings, moderation, in-app config      |
| **Tester**    | QA engineers                | Test plans, coverage maps, BDD scenarios                  |
| **Developer** | Software engineers          | Architecture, data models, API reference, deployment, ADRs |

The **Admin** perspective targets people who manage the application from within
it (e.g., Django admin panel, user management dashboards, project settings). It
is NOT for infrastructure/DevOps -- deployment and infrastructure concerns
belong in the **Developer** perspective.

Use Mermaid diagrams liberally (sequence diagrams, class diagrams, ER diagrams,
flowcharts) to convey complex flows and relationships.

## Sub-Agent Hierarchy

This skill uses a deep hierarchy of sub-agents to decompose documentation
writing into manageable units. Each level delegates downward and reviews the
output of its children before assembling the result.

```
model-w-docs-generate (this skill)
└── model-w-docs-orchestrator     # Project-level docs (recursive track)
    ├── model-w-docs-perspective  # One per perspective (User/Admin/Tester/Dev)
    │   ├── model-w-docs-section      # One per major section
    │   │   ├── model-w-docs-subsection   # One per subsection
    │   │   │   ├── model-w-docs-page         # One per page
    │   │   │   │   ├── model-w-docs-page-section     # One per H2 block
    │   │   │   │   │   └── model-w-docs-page-subsection  # One per H3 block (LEAF)
    │   │   │   │   └── ...
    │   │   │   └── ...
    │   │   └── ...
    │   └── ...
    └── model-w-docs-cleanup      # Final dedup/consistency pass
```

**7 levels deep**. Each non-leaf agent:

1. Plans the breakdown for its level.
2. Delegates to the next level via sub-agent invocations.
3. Reviews all sub-agent outputs for quality and consistency.
4. Assembles the final result, fixing issues found during review.

The `model-w-docs-page-subsection` agent is the **leaf writer**: it reads the
codebase directly, writes one H3-level content block, and does not delegate
further.

## Orchestration Procedure

You MUST perform the following phases in sequence.

### Phase 1: Project Documentation (Recursive)

Use the **Task tool** with `subagent_type: model-w-docs-orchestrator` and the
following prompt to produce the full project-level documentation tree.

> **Prompt**: "Analyze this project and produce comprehensive documentation
> from four perspectives: User (end users who use the product), Admin
> (application-level administrators who manage users, settings, and content
> from within the app -- NOT infrastructure/DevOps), Tester (QA engineers),
> and Developer (software engineers). Set up the doc/ folder with Zensical
> if it does not exist. Break down the work recursively:
>
> - For each perspective, invoke `model-w-docs-perspective`.
> - Each perspective invokes `model-w-docs-section` per section.
> - Each section invokes `model-w-docs-subsection` per subsection.
> - Each subsection invokes `model-w-docs-page` per page.
> - Each page invokes `model-w-docs-page-section` per H2 block.
> - Each page-section invokes `model-w-docs-page-subsection` per H3 block.
>
> After all writing is done, invoke `model-w-docs-cleanup` to eliminate
> duplicates, fix inconsistencies, verify links, and ensure the Zensical
> build passes."

### Phase 2: Update Local Model W Skills

If the project has been bootstrapped (`.agents/skills/` directory exists with
Model W skills), update them to reflect the new documentation infrastructure:

1. **`model-w-project-structure`** (if it exists): Add or update a
   "Documentation" section describing:
   - The `doc/` folder and the tooling (Zensical).
   - How to build and preview docs: `cd doc && uv run zensical serve`.
   - The perspective-based organization (User, Admin, Tester, Developer).
   - The inline documentation conventions (Numpy for Python, JSDoc for JS/TS).

2. **`model-w-qa-<component>`** skills (if they exist): Add or update a
   "Documentation" section requiring:
   - All new or modified code units must have inline documentation following
     the project's conventions.
   - Docstrings must explain **why**, **who needs it**, **tricky behavior**,
     and **hack justifications**.
   - If the `doc/` folder exists, project-level docs must be checked for
     staleness when features or architecture change.
   - Reference `model-w-docs-update` for incremental doc updates and
     `model-w-docs-generate` for full regeneration.

3. **Any other local skills** that reference project structure or development
   workflows: update them to mention the documentation folder and process.

Search for these skills with: `ls .agents/skills/`

### Phase 3: Verification

After all previous phases complete:

1. Verify the Zensical site builds: `cd doc && uv run zensical build`
2. Check that all internal links resolve.
3. Confirm every perspective has at least one substantive page.
4. If local Model W skills were updated in Phase 2, verify they still have
   valid YAML frontmatter and are well-formed.

## Final Instruction

Once all phases are complete, remind the user they can preview the documentation
with `cd doc && uv run zensical serve` and access it at `localhost:8000`.
