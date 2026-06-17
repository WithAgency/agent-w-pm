---
name: model-w-bug-assessment
description:
    Use this skill when the user asks to assess, analyze, triage, qualify, or investigate
    a bug, error, issue, or Sentry event. Provides business impact analysis, criticality
    rating, user scope, root cause, ownership classification, and BDD test recommendations
    for better triage decisions.
license: WTFPL
metadata:
    author: with-madrid.com
---

# Model W Bug Assessment

Use this skill to produce a concise, evidence-based bug assessment. The goal is triage and qualification, not implementation.

## Critical Rules

1. **Infer the Sentry project from the repository**
   - Inspect `./code/<repo-name>`.
   - Use `<repo-name>` as the Sentry `projectSlug` for every Sentry call.
   - Never infer or change the project from a Sentry URL, issue ID, or issue prefix.
   - If multiple repositories exist, ask which repository to use.
   - If no repository exists, ask for the repository name.

2. **Determine the environment**
   - If the user provides an environment, use it.
   - If a Sentry issue or URL is provided, retrieve the environment from Sentry.
   - If the environment cannot be determined, ask:
     > Is this happening in production, staging, or development?
   - Never assume the environment.

3. **Never ask for a Sentry ID**
   - Accept any of:
     - Sentry URL
     - Sentry issue ID
     - Error message
     - Stack trace
     - Bug description
   - If no Sentry issue is provided, search Sentry using the supplied details within the inferred project and environment.
   - If no matching Sentry issue is found, continue with the available information.

## Inputs

The user must provide at least one of:

- Sentry issue URL
- Sentry issue ID
- Error message
- Stack trace
- Bug description

Optional inputs:

- Environment
- Affected URL
- Affected feature or workflow
- Steps to reproduce

## Required Integrations

This skill requires Sentry MCP for Sentry-based assessment.

If Sentry MCP is unavailable, stop and say:

```text
Sentry MCP integration is required for bug assessment. Please enable the Sentry MCP server and try again.
```

Chrome MCP is optional. Use it only for UI-related reproduction when available.

## Workflow

### 1. Identify Repository

Run:

```bash
find code -mindepth 2 -maxdepth 2 -type d -name .git 2>/dev/null
```

Resolve the repository as follows:

- Exactly one repository found: use its folder name as `<repo-name>`.
- Multiple repositories found: ask the user which repository to assess.
- No repository found: ask for the repository name.

Use `<repo-name>` with optional api/front extensions as the Sentry `projectSlug`.

Do not use a project inferred from a Sentry URL, issue ID, organization, or prefix.

### 2. Identify Environment

Resolve environment in this order:

1. User-provided environment
2. Environment from Sentry issue or event
3. Ask the user whether the issue occurs in `production`, `staging`, or `development`

Use the resolved environment to filter Sentry issue and event searches.

### 3. Fetch Sentry Context

All Sentry calls must be scoped with:

- `projectSlug=<repo-name>`
- The resolved environment

Do not perform broad organization-wide project searches.

If a Sentry issue URL or ID is provided, fetch:

- Error message
- Stack trace
- First seen and last seen
- Event count and frequency
- Affected user count
- Tags: environment, release, browser, device, etc.
- Breadcrumbs and context
- Related events, if useful

If no Sentry issue is provided:

- Search Sentry using the supplied error message, stack trace, or bug description.
- Keep the search scoped to the inferred project and environment.
- If no match is found, continue using the supplied information.

If a user-provided Sentry issue prefix conflicts with `<repo-name>`, do not change `projectSlug`. Report the discrepancy and ask for clarification.

### 4. Locate and Analyze Code

Use code from:

```text
./code/<repo-name>
```

If code is unavailable, say:

```text
The code for [repo-name] is not available at ./code/[repo-name]. I can assess business impact from the available bug/Sentry data, but code-level root cause analysis requires the repository.
```

When code is available:

- Map stack trace frames to source files.
- Identify the likely error origin.
- Read relevant code.
- Use git blame when helpful to identify:
  - Commit
  - Author
  - Date
  - Change context
- Classify whether the issue comes from:
  - Application code
  - Third-party integration
  - Infrastructure/configuration
  - Unknown source

### 5. Assess Business Impact

Evaluate:

- Affected user workflow
- Whether the issue blocks a critical flow
- Whether data loss or corruption is possible
- Whether trust, security, payments, authentication, or submissions are affected
- Whether the failure is visible, silent, intermittent, or recoverable

### 6. Assess User Scope

Classify scope as:

- `All users`
- `Specific segment`
- `Individual users`
- `Unknown`

Use Sentry affected users, tags, devices, browsers, releases, environments, and event distribution when available.

### 7. Determine Criticality

Assign one level:

- **Critical**: Blocks core functionality for all or most users, causes data loss, or creates security risk.
- **High**: Blocks an important workflow or significantly affects a large segment.
- **Medium**: Affects some users or a non-critical workflow.
- **Low**: Minor issue, edge case, or limited impact.

Base the rating on business impact and user scope.

### 8. Identify Root Cause

When evidence allows, identify:

- Immediate cause
- Error origin
- Regression status
- Contributing factors
- Whether the issue was introduced recently

If evidence is insufficient, say so clearly and recommend the next investigation step.

### 9. Determine Ownership

Classify ownership as:

- `Our code`
- `Third-party integration`
- `Configuration/environment`
- `Unclear`

Explain briefly.

### 10. Analyze Test Coverage Gaps

Review relevant unit, integration, and BDD tests.

Explain:

- Why unit tests did not catch the issue.
- Why BDD or end-to-end tests did not catch the issue.
- Which test path should be added or improved.

### 11. Recommend BDD Regression Test

Provide one concrete Gherkin scenario that would catch this bug after it is fixed.

The scenario must:

- Cover the affected workflow.
- Include the triggering condition.
- Assert the expected correct behavior.

### 12. Reproduce When Applicable

If the bug is UI-related and Chrome MCP is available:

- Navigate to the affected URL.
- Follow available reproduction steps.
- Capture observed behavior.
- Note console errors or screenshots if useful.

If Chrome MCP is unavailable, note that manual reproduction is recommended.

## Output Format

```markdown
# Bug Assessment: [Brief Bug Title]

**Sentry Issue**: [Link or ID, if available]
**Repository**: [repo-name]
**Environment**: [production | staging | development]
**Analyzed at**: [current timestamp]

## Summary

[1-2 sentence summary of the bug and impact.]

## Criticality: [Critical | High | Medium | Low]

**Rationale**: [Brief explanation based on impact and scope.]

## Business Impact

- **Affected workflow**: [...]
- **Impact type**: [...]
- **Data risk**: [Yes | No | Unknown]
- **Visibility**: [...]

## User Scope

- **Affected users**: [All users | Specific segment | Individual users | Unknown]
- **Segment details**: [...]
- **Event count**: [...]
- **First seen**: [...]
- **Last seen**: [...]

## Root Cause Analysis

- **Error origin**: [...]
- **Immediate cause**: [...]
- **Introduced in**: [...]
- **Regression?**: [Yes | No | Unknown]
- **Contributing factors**: [...]

## Ownership

- **Classification**: [Our code | Third-party integration | Configuration/environment | Unclear]
- **Details**: [...]

## Test Coverage Gaps

### Unit Tests

[...]

### BDD / End-to-End Tests

[...]

## Recommended BDD Test

```gherkin
Scenario: [Scenario name]
  Given [...]
  When [...]
  Then [...]
```

## Reproduction

[...]

## Next Steps

1. [...]
2. [...]
3. [...]
```

## Constraints

- Be objective and evidence-based.
- Do not speculate beyond available evidence.
- Clearly label unknowns.
- Keep the assessment concise but complete.
- Prioritize actionable triage information.
- Do not implement fixes.
- Do not create Linear tickets unless explicitly requested.
