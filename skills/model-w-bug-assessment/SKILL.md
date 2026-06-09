---
name: model-w-bug-assessment
description:
    Assesses and qualifies bugs for triage decisions using Sentry, codebase analysis,
    git blame, and optional browser reproduction. Produces business impact analysis,
    criticality rating, and BDD test recommendations.
license: WTFPL
metadata:
    author: with-madrid.com
---

# Model W Bug Assessment

This skill helps project managers and QA leads **qualify and triage bugs** by analyzing
them from multiple perspectives: business impact, affected users, root cause, ownership,
and test coverage gaps.

The goal is to produce actionable triage information, not to fix the bug itself.

## When to Use This Skill

Use this skill when:

- A bug has been reported in Sentry or by users
- You need to decide on priority and assignment
- You need to understand business and user impact before scheduling work
- You need to determine if a bug is regression or a new issue
- You want to identify test coverage gaps

Do not use this skill for:

- Implementing bug fixes (use development skills instead)
- Creating Linear tickets (use `model-w-linear-review` after assessment)
- General code review

## Inputs

The user must provide **at least one** of the following:

1. **Sentry issue URL or ID** (e.g., `https://sentry.io/organizations/org/issues/12345/` or `12345`)
2. **Bug description** with steps to reproduce
3. **Error message or stack trace**

Optionally, the user may also provide:

- **Repository name** (if not provided, infer from Sentry project name or current working directory)
- **Affected URL or feature** (for browser reproduction via Chrome MCP)

If the repository is not clear, ask the user to specify it.

## Expected Repository Layout

This skill assumes the code is available at:

```
<current working directory>/code/<repo-name>
```

If the code is not present at this location, use the `model-w-code-checkout` skill first
to get the latest code from `origin/develop` after confirming with the user.

## Required MCP Servers

This skill requires:

- **Sentry MCP**: For fetching issue details, error context, user impact, and event data
- **Chrome MCP** (optional): For reproducing the issue in a browser if applicable

If Sentry MCP is not available, stop and tell the user that Sentry integration is required
for bug assessment.

If Chrome MCP is not available but the bug appears to be UI-related, note this in the
assessment and recommend manual reproduction.

## Assessment Process

Perform the following steps in sequence:

### 1. Fetch Bug Details from Sentry

If a Sentry issue URL or ID is provided:

1. Use Sentry MCP to fetch:
   - Error message and stack trace
   - First seen / last seen timestamps
   - Event count and frequency trends
   - Affected user count (if available)
   - Tags (environment, release, browser, device, etc.)
   - Breadcrumbs and context
   - Related events

2. Infer the repository name from the Sentry project name if not explicitly provided.

If a Sentry issue is not provided, proceed with the user-provided bug description.

### 2. Locate the Code

Ensure the repository code is available at `<current working directory>/code/<repo-name>`.

If not:
- Ask the user if they want to check out the code using `model-w-code-checkout`.
- Do not proceed with code analysis until the code is available locally.

### 3. Analyze the Stack Trace

If a stack trace is available:

1. Identify the error origin (file and line number).
2. Read the relevant code files to understand the context.
3. Use git blame to identify:
   - When the problematic code was introduced
   - Who authored the change
   - The commit message and associated pull request (if available)

4. Determine if the error is in:
   - Application code (our responsibility)
   - Third-party library or integration (external dependency)
   - Infrastructure or environment configuration

### 4. Assess Business Impact

Answer the following questions:

- **What user action or workflow is affected?**
- **Does this block a critical flow?** (e.g., checkout, authentication, data submission)
- **Does this cause data loss or corruption?**
- **Does this affect user trust or security?**
- **Is this a visible error or silent failure?**

Use the codebase, Sentry context, and error details to inform this analysis.

### 5. Assess User Scope

Determine how many users are affected:

- **All users**: The error occurs for everyone under certain conditions
- **Specific segment**: Affects users with certain roles, permissions, devices, or configurations
- **Individual users**: Only one or very few users affected
- **Unknown**: Insufficient data to determine scope

Use Sentry's "affected users" count, tags (browser, device, environment), and event
distribution to inform this analysis.

### 6. Determine Criticality

Based on business impact and user scope, assign a criticality level:

- **Critical**: Blocks core functionality for all or most users, causes data loss, or affects security
- **High**: Significantly degrades user experience for a large segment or blocks important workflows
- **Medium**: Noticeable issue affecting some users or non-critical workflows
- **Low**: Minor issue with limited impact or edge case

### 7. Identify Root Cause (if possible)

If the stack trace and code analysis allow:

- Identify the immediate cause of the error (e.g., null reference, failed API call, validation error)
- Determine if this is a regression or a longstanding issue using git blame and Sentry first-seen date
- Identify the contributing factors (e.g., missing error handling, incorrect assumption, race condition)

If the root cause cannot be determined from static analysis alone, note this and recommend
further investigation.

### 8. Determine Ownership

Classify the bug:

- **Our code**: The issue originates in code we control
- **Third-party integration**: The issue is caused by an external service, library, or API
- **Configuration or environment**: The issue is due to deployment, infrastructure, or environment settings
- **Unclear**: Needs further investigation to determine ownership

### 9. Analyze Test Coverage Gaps

Review the existing test suite (unit tests and BDD tests) to determine:

- **Why didn't unit tests catch this?**
  - No unit test exists for the affected code path
  - Unit test exists but does not cover this edge case
  - Unit test exists but has incorrect assertions or mocks

- **Why didn't BDD tests catch this?**
  - No BDD scenario exists for the affected user workflow
  - BDD scenario exists but does not cover this failure mode
  - BDD scenario exists but is incomplete or skipped

Search the codebase for test files related to the affected code or feature.

### 10. Recommend BDD Test for Regression Prevention

Suggest a specific BDD test scenario (in Gherkin format) that would have caught this bug
and will prevent regressions once the bug is fixed.

The scenario should:
- Cover the affected user workflow
- Include the specific conditions that trigger the bug
- Assert the expected correct behavior

Example:
```gherkin
Scenario: User submits form with missing required field
  Given I am logged in as a standard user
  When I navigate to the profile settings page
  And I clear the "email" field
  And I submit the form
  Then I should see an error message "Email is required"
  And the form should not be submitted
```

### 11. Reproduce the Issue (if applicable)

If the bug is UI-related and Chrome MCP is available:

1. Use Chrome MCP to navigate to the affected URL.
2. Follow the steps to reproduce from the Sentry breadcrumbs or user report.
3. Observe whether the error occurs.
4. Capture screenshots or console errors if helpful.

If reproduction is successful, include this in the assessment.

If Chrome MCP is not available or the bug is backend-only, skip this step and note it in
the assessment.

## Output Format

Respond using this structure:

---

# Bug Assessment: [Brief Bug Title]

**Sentry Issue**: [Link or ID, if applicable]
**Repository**: [Repository name]
**Analyzed at**: [Current timestamp]

---

## Summary

[1-2 sentence description of the bug and its impact]

---

## Criticality: [Critical | High | Medium | Low]

**Rationale**: [Brief explanation of why this criticality level was assigned based on business impact and user scope]

---

## Business Impact

- **Affected workflow**: [Description of the user action or feature affected]
- **Impact type**: [e.g., Blocks core functionality, degrades UX, causes confusion, etc.]
- **Data risk**: [Yes/No - Does this cause data loss or corruption?]
- **Visibility**: [Visible error message, silent failure, intermittent, etc.]

---

## User Scope

- **Affected users**: [All users | Specific segment | Individual users | Unknown]
- **Segment details**: [If specific segment, describe: device type, role, browser, environment, etc.]
- **Event count**: [From Sentry, if available]
- **First seen**: [Date/time from Sentry or git blame]
- **Last seen**: [Date/time from Sentry]

---

## Root Cause Analysis

**Error origin**: [File path and line number, if available]

**Immediate cause**: [Description of what went wrong, e.g., "Null reference exception when user object is undefined"]

**Introduced in**: [Commit hash, date, author from git blame]

**Regression?**: [Yes/No - Was this working before?]

**Contributing factors**: [List of conditions or assumptions that led to the bug]

---

## Ownership

- **Classification**: [Our code | Third-party integration | Configuration/environment | Unclear]
- **Details**: [Brief explanation]

---

## Test Coverage Gaps

### Why didn't unit tests catch this?

- [Explanation, e.g., "No unit test exists for the `validateUserInput` function"]

### Why didn't BDD tests catch this?

- [Explanation, e.g., "No BDD scenario covers form submission with missing required fields"]

---

## Recommended BDD Test

To prevent regression once this bug is fixed, add the following BDD scenario:

```gherkin
[Gherkin scenario here]
```

---

## Reproduction

[If browser reproduction was attempted, include steps and outcome. Otherwise, note "Manual reproduction recommended" or "Backend-only issue, no browser reproduction needed"]

---

## Next Steps

1. [Suggested immediate action, e.g., "Assign to backend team for investigation"]
2. [Suggested follow-up, e.g., "Add recommended BDD test before deploying fix"]
3. [Any other recommendations]

---

## Tone and Constraints

- Be objective and fact-based.
- Do not speculate beyond what the evidence supports.
- If information is unavailable (e.g., Sentry data, git blame), note it clearly.
- Prioritize actionable insights over exhaustive analysis.
- Keep the assessment concise but complete.
- Use markdown formatting for readability.

## Error Handling

### Sentry MCP Not Available

Stop and say:
```
Sentry MCP integration is required for bug assessment. Please enable the Sentry MCP
server and try again.
```

### Code Not Available

Ask:
```
The code for [repo-name] is not available at <current working directory>/code/<repo-name>.
Would you like me to check out the code using model-w-code-checkout first?
```

### Cannot Determine Repository

Ask:
```
I could not determine which repository this bug belongs to. Please provide the repository
name (e.g., "WithAgency/CAMC3").
```

### Insufficient Information

If the bug description, Sentry data, and stack trace are all insufficient to perform a
meaningful assessment, say:
```
I need more information to assess this bug. Please provide at least one of the following:
- A Sentry issue URL or ID
- A detailed bug description with steps to reproduce
- An error message or stack trace
```
