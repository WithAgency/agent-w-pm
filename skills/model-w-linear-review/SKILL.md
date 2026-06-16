---
name: model-w-linear-ticket-review
description:
    Use this skill when the user asks to review, assess, analyze, or evaluate a Linear
    ticket, issue, or specification. Reviews Linear tickets for gaps, ambiguity, missing
    acceptance criteria, test scenarios, and design completeness.
license: WTFPL
metadata:
author: with-madrid.com
---

# Linear Ticket Review

Use this skill when the user provides a direct Linear ticket link or ticket number and asks to
review the ticket specification, requirements, acceptance criteria, implementation
readiness, or test coverage.

This skill helps project managers and developers improve Linear ticket
descriptions before implementation by identifying gaps, ambiguity, missing
acceptance criteria, and missing key test scenarios.

## Inputs

The user should provide a direct Linear ticket URL.

If the user does not provide a Linear ticket URL or ticket number, ask them for one.

Optionally, the user may also provide:

- **Repository name** (if not provided, infer from Linear project or current working directory)

## Expected Repository Layout

This skill assumes the code is available at:

```
<current working directory>/code/<repo-name>
```

If the code is not present at this location, use the `model-w-code-checkout` skill first
to get the latest code from `origin/develop` after confirming with the user.

## Process

1. Read the Linear ticket using the Linear MCP server when available.
2. Infer the repository name from the Linear project if not explicitly provided.
3. Locate the Code: Ensure the repository code is available at `<current working directory>/code/<repo-name>`.
   - If not, ask the user if they want to check out the code using `model-w-code-checkout`.
   - While code analysis is optional for a ticket review, it is highly recommended to ground the assessment in the actual implementation.
4. Review the ticket title, description, acceptance criteria, labels, project,
   status, linked resources, and relevant comments if available.
5. Extract any Figma links from the ticket description, comments, or attached
   resources.
6. If Figma links are found, analyze each design using the Figma MCP tool:
   - If the Figma MCP tool is not available, stop and tell the user that the
     Figma MCP integration is required to review designs and ask them to enable
     it before continuing.
   - Review the designs for completeness: are all required states (loading,
     empty, error, success) shown? Do the flows match the written requirements?
     Are there visual elements that imply undescribed requirements?
   - Note any discrepancies between the designs and the written specification.
   - If a Figma link is present but the MCP cannot access it, flag it as a
     blocker in the review rather than skipping it silently.
7. Do not invent missing requirements. If something is unclear or absent, call it
   out as a gap, ambiguity, or question.
8. Review the ticket from both a product/project-management perspective and a
   developer/testing perspective.
9. Keep the response concise, constructive, and actionable.
10. If the Linear ticket cannot be accessed, ask the user to paste the ticket
   title, description, and acceptance criteria manually.

## Review Checklist

Evaluate the ticket for:

### Product Clarity

- Is the user problem or business goal clear?
- Is the expected outcome clear?
- Is the target user, persona, or actor identified when relevant?
- Is the scope clear?
- Are out-of-scope items mentioned when needed?

### Functional Requirements

- Are the main user flows described? (if applicable)
- Are alternate flows or important variants missing?
- Are permissions, roles, or access rules specified when relevant?
- Are state transitions clear?
- Are dependencies on other tickets, systems, APIs, designs, or decisions
  mentioned?

### Acceptance Criteria

- Are acceptance criteria present?
- Are they specific, measurable, and testable?
- Do they cover success, failure, and edge cases?
- Is the definition of done clear?

### UX and Content

- Are loading, empty, error, and success states described when relevant?
- Are copy/content requirements specified when relevant?
- Are design/Figma links included when needed?
- Are responsive expectations mentioned when relevant?
- Are accessibility expectations mentioned when relevant?
- Are ARIA roles, labels, and descriptions defined in the ticket or designs for
  any interactive or non-obvious elements?
- Are keyboard navigation rules specified (tab order, focus management, keyboard
  shortcuts, focus trapping for modals/dialogs, focus restoration on close)?
- Are screen reader navigation expectations defined (landmark regions, heading
  hierarchy, live regions for dynamic content)?

### Design Review (when Figma links are present)

- Do the designs cover all states described in the ticket (loading, empty,
  error, success, validation)?
- Do the designs cover all user flows and variants described in the ticket?
- Are there visual elements or interactions in the designs that are not
  described in the written spec (hidden requirements)?
- Are responsive or mobile variants included in the designs when the ticket
  implies them?
- Are accessibility concerns visible in the designs (contrast, touch targets,
  focus states)?
- Do the designs or the ticket define ARIA roles, labels, and descriptions for
  interactive or non-obvious elements? Flag any element that will need ARIA
  annotation but is not yet specified.
- Are keyboard navigation flows shown or described (tab order, focus states,
  focus trapping, focus restoration)?
- Are screen reader navigation patterns defined (landmark regions, heading
  hierarchy, live region announcements for dynamic content)?
- Is the copy in the designs consistent with any content requirements in the
  ticket?
- Are there design states or edge cases visible in Figma that are missing from
  the acceptance criteria?

### Technical and Integration Risks

- Use the codebase to identify if APIs, data models, migrations, background jobs,
  feature flags, or third-party integrations implied are consistent with the
  current architecture.
- Are APIs, data models, migrations, background jobs, feature flags, or
  third-party integrations implied but not considered?
- Check for existing similar implementations in the code to ensure consistency.
- Are analytics or tracking requirements needed?
- Are security or performance concerns relevant?
- Are there new privacy and personal data constraints or GDPR requirements?
- Are rollout or migration considerations missing when applicable?

### Test Scenarios

Identify missing or unclear test scenarios, referencing existing tests in the
codebase for the affected features to identify coverage gaps:

- Happy path
- Validation failures
- Permission and access-control cases
- Empty states
- Error states
- Boundary conditions
- Integration failures
- Regression risks
- Mobile or responsive behavior when relevant

## Output Format

Respond using this structure:

### Ticket Review Summary

Overall, the ticket is [clear / mostly clear / under-specified].

### Main Gaps

- ...

### Ambiguities / Questions

- ...

### Missing Acceptance Criteria

- ...

### Suggested Test Scenarios

- ...

### Design Feedback

_(Include this section only when Figma links were found and analyzed. If no
Figma links were present, omit this section entirely.)_

- ...


## Tone and Constraints

- Be constructive and concise.
- Prioritize the most important feedback.
- Do not be overly critical.
- Do not rewrite the whole ticket unless explicitly asked.
- Do not assume requirements that are not present.
- Phrase missing details as questions or suggested improvements.
- If the ticket is already clear, say so and provide only minor improvement suggestions.

### Error Handling

### Code Not Available

Ask:
```
The code for [repo-name] is not available at <current working directory>/code/<repo-name>.
Would you like me to check out the code using model-w-code-checkout first to ground the review?
```
