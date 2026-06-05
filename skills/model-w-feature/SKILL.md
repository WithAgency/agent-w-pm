---
name: model-w-feature
description:
    MUST be loaded whenever the user asks to implement, build, or work on a
    feature, ticket, story, or Linear issue (e.g. "implement LOG-73",
    "let's work on this ticket", "build this feature"). Orchestrates the
    full feature implementation lifecycle -- planning, touchpoint analysis,
    user confirmation, implementation, visual testing, BDD test creation,
    and regression checks.
license: WTFPL
metadata:
    author: with-madrid.com
---

# Model W Feature Implementation

This skill drives the **end-to-end implementation of a single feature**, from
a Linear ticket (or equivalent specification) all the way to merge-ready code
with BDD coverage. It is opinionated about the order of operations and uses
a roster of sub-agents to keep each phase focused and context-light.

**CRITICAL: You are an orchestrator.** Your default mode is delegation --
ticket fetching, planning, exploration, touchpoint analysis,
implementation, testing, and design fixing all go through sub-agents.
You read their reports, decide what to do next, and craft the next
prompt. You handle user-facing interactions (questions, confirmations)
and the synthesis between phases (turning exploration into a plan,
deciding how to react to surprises), but the actual code-writing is the
implementer agent's job, not yours. You are also **forbidden** from
fetching the raw Linear ticket yourself — the ticket-filter agent
handles that to keep noise out of your context.

**Announce every phase transition AND which sub-agent will run it.**
Before starting any phase, output one line stating which phase you just
finished, which one you are about to start, and which sub-agent (if
any) you are about to delegate to:

> Completed Phase N (<name>). Starting Phase M (<name>) — delegating to `<sub-agent-name>`.

When a phase does not delegate (e.g. user-facing confirmations, plan
synthesis, assembling the Spec Pack), say so explicitly:

> Completed Phase N (<name>). Starting Phase M (<name>) — handling directly (no sub-agent).

For the very first phase, say `Starting Phase 0 (Gather the
Specification) — delegating to model-w-feature-ticket-filter.` (or
whichever sub-step comes first). Use the same form for sub-step
transitions inside a phase (e.g. `Completed 0c (Delegate ticket
filtering). Starting 0d (Resolve filter confirmation questions) —
handling directly.`) when the sub-step involves a tool call or a user
question.

This is non-negotiable. The announcement must precede the tool call
that starts the work, not follow it. It serves three purposes: the user
sees what is being delegated before it happens, your own context stays
anchored in the long flow, and choosing the sub-agent name out loud
forces you to verify you picked the right one before invoking it.

## When to Use

- The user asks to implement, build, or "work on" a feature, ticket, story,
  or Linear issue.
- The user pastes a Linear URL, issue ID (e.g. `LOG-73`), or Figma URL and
  asks for implementation.
- The user says things like "let's start on this", "code this up", "build
  this", referring to a specification.

## When NOT to Use

- Pure bug fixes with no design or specification work.
- Refactors that do not change behavior.
- Tasks that are obviously trivial (one-line changes, typo fixes).
- The user explicitly asks for a different workflow (e.g. "just write the
  code, no planning").

## Sub-Agent Roster

| Agent                          | Role                                                            | Can edit code? | Tools                |
| ------------------------------ | --------------------------------------------------------------- | -------------- | -------------------- |
| `model-w-feature-ticket-filter`| Fetches the Linear ticket and rewrites it as a delta-only spec, stripping noise | No | Linear MCP, Read, Grep, Glob |
| `model-w-feature-planner`      | Decomposes the feature into elements; orchestrates exploration  | No             | Task                 |
| `model-w-feature-data-explorer`| For one element, maps data flow (models, APIs, sequences)       | No             | Read, Grep, Glob     |
| `model-w-feature-touchpoints`  | Identifies insertion points in the existing codebase            | No             | Read, Grep, Glob     |
| `model-w-feature-implementer`  | Writes the feature code following the confirmed plan            | Yes            | Read, Edit, Write, Bash |
| `model-w-feature-tester`       | Tests the running feature against the spec via Chrome DevTools  | No             | Chrome DevTools, Task|
| `model-w-feature-design-fixer` | Applies CSS-only fixes to match Figma designs                   | Yes (CSS only) | Read, Edit, Write    |

## Phase 0: Gather the Specification

**You MUST NOT fetch the Linear ticket yourself.** Project managers
routinely pad tickets with restated obviousness, over-zealous specs,
broad context, and already-shipped requirements. Reading the raw ticket
drags you (and every downstream sub-agent that sees the Specification
Pack) into noise. The `model-w-feature-ticket-filter` agent is the
**only** place where raw ticket content is handled.

### 0a: Identify the Ticket

From the user's request, determine the ticket identifier. Sources, in
order of preference:

1. An ID or URL the user pasted directly (e.g. `LOG-73`,
   `https://linear.app/.../LOG-73`).
2. The current git branch, if it follows the `*/[issue-id]-*` pattern
   (e.g. `feature/log-73-something` → `LOG-73`).
3. If neither is available, ask the user via the `question` tool which
   ticket they want to work on.

### 0b: Identify Project Context Skills

Look at the loaded skills for any `model-w-project-*` or `model-w-qa-*`
skills. These contain the project-specific architecture and conventions
the ticket-filter and downstream agents will need. Collect the skill
names / paths — you will reference them in the prompt below.

### 0c: Delegate Ticket Fetching and Filtering

Invoke the `model-w-feature-ticket-filter` agent:

> **Prompt**: "Fetch and filter the following ticket.
>
> **Ticket identifier**: [TICKET ID, URL, or branch name as known]
>
> **Project context**: [BRIEF SUMMARY of the project's stack and main
> components, plus the paths/names of any `model-w-project-*` /
> `model-w-qa-*` skills the filter should consult to recognize what
> is 'already implemented' or 'obvious' for this codebase]
>
> Return a delta-only specification, a list of confirmation questions
> for the user, the list of Figma/image references found in the ticket,
> and a transparent audit of what you filtered out."

**After the filter returns**: do NOT second-guess the filtered spec by
re-fetching the ticket yourself. The filter is the source of truth from
this point forward.

If the filter reports the ticket can't be found, is cancelled, or has
no usable description, stop and report this to the user — do not invent
a specification.

### 0d: Resolve Filter Confirmation Questions

The filter may surface confirmation questions (ambiguities, contradictions
between description and comments, missing aspects). Use the `question`
tool to ask the user before moving on. Their answers fold directly into
the spec: merge each answer into the relevant CHANGES or CHECKS bullet,
or add a new bullet. Do NOT create a separate "clarifications" section
— that's noise. The end result is a spec that reads as if the answers
were always in the ticket.

### 0e: Fetch and Categorize Figma References

For every Figma URL in the filter's list of visual references, use the
Figma MCP tools to fetch the design context. This is the orchestrator's
job (not the filter's) because Figma frames are not noisy in the same
way ticket text is — they are the visual source of truth.

While fetching, **categorize each frame by viewport** so the implementer
and tester know which breakpoint it applies to:

- Use the frame's name and width from the Figma metadata. Typical width
  buckets: `mobile` (≤640 px), `tablet` (641–1023 px), `desktop` (≥1024 px).
- A frame whose name explicitly says "Responsive", "All breakpoints", or
  similar is `responsive`.
- If the filter tagged a frame `[mobile]`/`[tablet]`/`[desktop]`/
  `[responsive]` from ticket text, prefer that tag — the ticket author's
  intent overrides width-based inference.
- If the filter tagged `[?]` and you cannot determine the viewport from
  Figma metadata either, ask the user via the `question` tool. Do not
  guess.

Record the resolved `(viewport, frame name, URL)` triples for the
Specification Pack.

### 0f: Assemble the Specification Pack

Bundle everything into a **Specification Pack** that you will pass
verbatim to downstream sub-agents. Keep it as small as possible:

- The filtered + answer-merged spec from step 0d (the bulk of the pack).
- A `DESIGN` block grouped by viewport, one line per frame:

  ```
  DESIGN
  mobile:
    - <frame name> <URL>
  desktop:
    - <frame name> <URL>
  responsive:
    - <frame name> <URL>
  ```

  Drop any viewport group that has no frames. Drop the whole DESIGN
  block if there are no frames at all.
- One line pointing at the project-context skill(s) downstream agents
  should consult for conventions. Do not re-summarize them.

Do NOT include: the raw ticket content, the filter's "What was filtered
out" audit, the codebase notes (those go directly into the planner /
touchpoints prompts as a separate field — keeping them out of the Pack
prevents them from leaking into every other agent's context).

## Phase 1: Planning

Invoke the `model-w-feature-planner` agent:

> **Prompt**: "Plan the implementation of the following feature.
>
> **Specification Pack**:
> [INSERT THE FULL SPECIFICATION PACK]
>
> **Project context**:
> [INSERT THE PROJECT CONTEXT SUMMARY]
>
> Your job is to:
>
> 1. Enumerate every **visual element** and every **action** in the feature.
> 2. For each element, spawn a `model-w-feature-data-explorer` sub-agent to
>    determine where its data comes from and where it goes.
> 3. Produce a mapping table of element → data sources/sinks → status
>    (present, missing, to be confirmed).
> 4. Return the mapping and an explicit list of items that need user
>    confirmation."

**After the planner returns**: You will receive a list of elements with
their data-flow mapping and a list of items flagged for user confirmation.

### Phase 1b: User Confirmation of Data Flow

For **each item flagged for confirmation**, use the `question` tool to ask
the user. Group related questions into a single `question` call when
possible (the tool supports an array of questions). Typical questions:

- "The data for [element X] does not currently exist. Where should it come
  from?"
- "[Element Y] needs to write to [Z]. Is the proposed sink correct?"
- "Should [feature behavior] follow [option A] or [option B]?"

Record the user's answers. They become inputs for Phase 2.

## Phase 2: Touchpoint Analysis

Invoke the `model-w-feature-touchpoints` agent:

> **Prompt**: "Identify the codebase touchpoints required to implement the
> following feature.
>
> **Specification Pack**: [INSERT]
>
> **Confirmed data-flow mapping** (from planning + user confirmations):
> [INSERT THE UPDATED MAPPING TABLE]
>
> **Project context**: [INSERT]
>
> Your job is to identify, for each piece of work the feature requires:
>
> - The exact file(s) and function(s)/component(s) where changes must land.
> - Existing pathways (functions, hooks, API endpoints, signals, stores)
>   that can be reused to move data from source to sink.
> - Whether the required data is available at that point in the chronology
>   (e.g. is the user authenticated yet? is the parent component mounted?
>   are the relevant models loaded?).
> - Any blockers: missing infrastructure, missing fields on a model, missing
>   API endpoints, missing routes.
>
> Produce a structured **Touchpoint Report** that answers: 'Can this feature
> be implemented with the current state of things, and if so, exactly how?'"

**After the agent returns**: Review the Touchpoint Report. If it surfaces
blockers that require user input (e.g. "we need a new API endpoint -- should
it be REST or GraphQL?"), use the `question` tool to resolve them before
moving on.

## Phase 3: Plan Presentation & User Confirmation

Now you have everything you need to draft an actual implementation plan.
Write a concise plan covering:

1. **Goal**: One-paragraph summary of what will be built.
2. **Data model changes**: Any new fields, migrations, or schema work.
3. **Backend changes**: New endpoints, service methods, business logic.
4. **Frontend changes**: New components, routes, state, styles.
5. **Sequence**: The order in which the changes will be made.
6. **Out of scope**: Things you deliberately will not do.
7. **Open questions**: Anything still uncertain.

Present this plan to the user and use the `question` tool to ask for
explicit confirmation:

> "Here is the implementation plan. Should I proceed as described, or do
> you want changes?"

Do NOT proceed to implementation until the user confirms. If they request
changes, revise the plan and ask again.

## Phase 4: Implementation

Delegate the actual coding to the `model-w-feature-implementer` agent.
You do NOT write the feature code yourself — the implementer does. Your
job here is to brief it precisely and then digest its report.

Invoke the `model-w-feature-implementer` agent:

> **Prompt**: "Implement the following feature according to the confirmed
> plan and touchpoint report.
>
> **Specification Pack**: [INSERT]
>
> **Confirmed implementation plan** (from Phase 3, with user sign-off):
> [INSERT THE PLAN]
>
> **Touchpoint Report** (from Phase 2):
> [INSERT THE REPORT]
>
> **Confirmed data-flow mapping** (from Phase 1 + 1b):
> [INSERT THE MAPPING TABLE]
>
> **Project context**: [INSERT THE PROJECT CONTEXT SUMMARY, INCLUDING THE
> PATHS OF ANY `model-w-project-*` / `model-w-qa-*` SKILLS THE IMPLEMENTER
> SHOULD CONSULT FOR CONVENTIONS]
>
> Implement the plan, surface any surprises, and report back the full
> change log."

**After the implementer returns**: Read its report carefully.

- **Change log**: the list of files touched. Keep this for the commit
  message (Phase 9).
- **Plan coverage**: every plan item should be DONE. If anything is
  SKIPPED or DEFERRED, decide whether to re-invoke the implementer to
  finish it, or whether the deferral is acceptable. If you re-invoke,
  pass the same context plus an explicit list of the remaining items
  and the implementer's own notes about why they were not done.
- **Surprises**: each surprise needs a decision. Typical reactions:
  - The plan was wrong → loop back to Phase 2 or Phase 3 with the new
    information and re-confirm with the user before re-implementing.
  - The implementer made an unplanned change that's clearly correct →
    accept it and note it for the user in Phase 6.
  - The surprise reveals a missing piece outside the feature's scope →
    raise it with the user via the `question` tool; do not silently
    expand scope.
- **Unplanned changes**: every entry must be justified. If any look
  like scope creep, ask the implementer to revert them on a second
  invocation.
- **Notes for tester / QA**: keep these for Phase 5 and Phase 8 prompts.

You MAY take small direct edits yourself (one- or two-line fixes the
implementer flagged but didn't apply), but anything substantial goes
back to the implementer agent. Do not write whole new code units
yourself.

## Phase 5: Visual Testing (only if the feature has a UI)

If the feature has no visual component (e.g. it is purely a backend job or
data migration), **skip this phase** and go directly to Phase 7.

### 5a: Verify Test Servers Are Running

Visual testing requires the application to be running locally. **Do not
start servers yourself.** List running processes and look for the project's
dev servers (e.g. `vite`, `next`, `manage.py runserver`, `uvicorn`,
`pnpm dev`, `npm run dev`). If they are not running, **stop and ask the
user to start them**:

> "I need the test servers running to verify the feature visually. Please
> start them (e.g. `pnpm dev` for the frontend, `python manage.py runserver`
> for the backend) and let me know when they are ready."

Do not proceed until the user confirms the servers are up.

### 5b: Prepare Test Data and Credentials

If the feature requires specific test data (a particular user, a piece of
content, a project in a certain state), create it yourself before delegating.
Use the project's standard tooling (Django admin/shell, seed scripts, API
calls). Capture credentials (login email/password, API tokens, IDs of
created records) into a **Test Data Pack** that you will pass to the tester
agent.

**Do not read `.env` to fish out credentials.** OpenCode blocks access to
`.env` and `.env.*` files. If you need a value that lives in `.env` (e.g.
an admin password, an OAuth client secret, a service URL), ask the user
via the `question` tool — they can paste it for the duration of the test
run.

### 5c: Run the Tester Agent

Invoke the `model-w-feature-tester` agent:

> **Prompt**: "Test the following feature end-to-end against the running
> application.
>
> **Specification Pack**: [INSERT]
>
> **Implementation plan**: [INSERT THE CONFIRMED PLAN FROM PHASE 3]
>
> **Test Data Pack**:
> - Login URL: [URL]
> - Credentials: [EMAIL/PASSWORD]
> - Test records: [LIST WITH IDS]
> - Feature URL or navigation steps: [HOW TO REACH THE FEATURE]
>
> **Figma references**: [URLS OF THE RELEVANT FRAMES]
>
> Your job is to:
>
> 1. Open the application in Chrome via the chrome-devtools MCP tools.
> 2. Reach the feature using the provided navigation steps.
> 3. Verify every acceptance criterion functionally.
> 4. Compare the implementation visually to the Figma frames.
> 5. If design mismatches are found, spawn `model-w-feature-design-fixer`
>    sub-agents to fix CSS-only issues, reload the page, and re-check.
> 6. Produce a report covering: functional pass/fail per criterion, visual
>    deltas (resolved + outstanding), and BDD hints for any gaps that
>    cannot be expressed in the existing step library."

**After the tester returns**:

- If the tester reports functional failures: address them yourself in the
  code (these are not CSS issues; the design-fixer cannot handle them).
  Then re-run Phase 5c.
- If all is well: proceed to Phase 6.

## Phase 6: User Review

Once visual testing passes, hand off to the user for manual review. Use the
`question` tool:

> "The feature is implemented and visual testing has passed. Please review
> the code and try the feature yourself. Let me know if you want any
> changes, or if I can proceed to BDD test creation and final QA."

Apply whatever changes the user requests, re-running Phase 5 if visual
behavior changed. Do not proceed until the user gives the go-ahead.

## Phase 7: BDD Tests

Once the user has approved the implementation:

1. **Determine BDD conventions**: Check for `model-w-python-tests` or any
   project-specific BDD skill. Look at `tests/bdd/` (or equivalent) to see
   how existing scenarios are organized. BDD scenarios MUST be filed under
   the ticket ID (e.g. `tests/bdd/LOG-73.feature`).
2. **Write the feature file**: Translate the acceptance criteria into
   Gherkin scenarios. Cover the happy path and the most important edge
   cases mentioned in the ticket.
3. **Implement missing steps**: Use the BDD hints from the tester agent's
   Phase 5 report to flesh out step definitions. Reuse existing steps
   wherever possible.
4. **Run the new BDD scenarios**: Run just the new feature file first to
   confirm the scenarios pass.

## Phase 8: Full Regression

Invoke the `model-w-run-tests` skill (load it via the skill tool if not
already loaded) and let it orchestrate the full QA pipeline -- static
analysis + the entire test suite, including the BDD scenarios you just
added.

If failures appear that were introduced by your feature work, address them
through that skill's normal flow (its fixer agents). Do NOT mark the
feature done until every test passes.

## Phase 9: Commit

When QA is green, **ask the user whether to commit**:

> "All tests pass and the feature is functionally complete. Should I
> commit now?"

If they say yes, defer to the `model-w-commit-push` skill, which handles
the Linear-ID-aware commit message and pre-commit hygiene checks. Do NOT
push automatically -- the commit skill enforces a separate explicit push
instruction.

## Context Curation Rules

1. **Delegate by default.** Ticket fetching, planning, exploration,
   touchpoint analysis, implementation, testing, and CSS fixing all go
   through sub-agents. You handle user conversation, plan synthesis, and
   decision-making on sub-agent reports. You write code yourself only
   for trivial nudges (one- or two-line follow-ups the implementer
   flagged).
2. **Never fetch the raw Linear ticket yourself.** Project managers
   pad tickets with noise. The `model-w-feature-ticket-filter` agent
   is the **only** place where raw ticket content is handled — it
   returns a delta-only spec that you forward to downstream agents.
   Reading the raw ticket yourself defeats the entire filter mechanism
   and drags noise back into every downstream prompt.
3. **Never forward raw exploration output** between phases. Always distill
   it into the structured artifacts the agents produce (Specification Pack,
   Data-Flow Mapping, Touchpoint Report, Implementer Report, Test Data
   Pack, Tester Report).
4. **Sub-agents see only what they need.** The data-explorer for element X
   does not need to know about elements Y and Z. The design-fixer does not
   need the whole tester report -- it needs the specific CSS mismatch.
   The implementer needs the confirmed plan + touchpoint report, not the
   exploration transcripts that produced them.
5. **Ask the user via the `question` tool**, never via free-form text. This
   keeps confirmations auditable and structured.
6. **Never skip the confirmations.** The filter-question confirmation
   (Phase 0d), the data-flow confirmation (Phase 1b), the plan
   confirmation (Phase 3), and the review handoff (Phase 6) are
   mandatory checkpoints. Skipping them produces features the user did
   not ask for.
7. **Surprises trigger decisions, not silent fixes.** If the implementer
   reports a surprise that contradicts the plan, loop back to the relevant
   earlier phase (touchpoints or plan presentation) and re-confirm with
   the user before re-implementing. Do not patch over surprises in the
   orchestrator.
8. **Never start a dev server.** That is the user's job. If servers are
   down, stop and ask.
9. **Never read `.env` or `.env.*`.** OpenCode blocks them. To learn what
   configuration the project supports, point sub-agents at the framework's
   declarative settings surface: `settings.py` for Django,
   `.svelte-kit/ambient.d.ts` for SvelteKit, `next.config.*` for Next.js,
   or `process.env.` / `os.environ` greps for generic projects. To use
   an actual secret value during testing, ask the user via the `question`
   tool rather than trying to read it.
