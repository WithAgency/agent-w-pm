---
name: model-w-code-checkout
description:
    Clones or refreshes a Model W GitHub repository so the local checkout exactly
    matches origin/develop for grounding, review, and analysis.
license: WTFPL
metadata:
    author: with-madrid.com
---

# Model W Code Checkout

This skill helps project managers and non-developer users get the latest code for a
Model W project onto their machine.

The goal is simple:

> Given a GitHub repository, ensure there is a local checkout of the code that
> exactly matches the latest `origin/develop`.

This skill is intended for read-only grounding workflows, such as using the code as
context for Linear review, planning, QA analysis, documentation, or product
discussion. It is **not** a developer Git workflow and must not be used to make, commit, or push
changes.

## Do Not Use This Skill When

Do not use this skill when the user wants to:

- make code changes,
- create a feature branch,
- preserve local edits,
- commit or push work,
- run tests or install dependencies,
- inspect a pull request, issue, branch, tag, or commit URL directly.

For commit and push operations, use `model-w-commit-push` instead.

## Critical Behavior

- Always use the `develop` branch.
- Always sync the local checkout to exactly match `origin/develop`.
- If the repository already exists locally, local edits in that checkout may be
  discarded with `git reset --hard origin/develop`.
- Never commit.
- Never push.
- Never merge.
- Never rebase.
- Never delete files or directories with shell deletion commands.
- Hard stop on authentication, repository mismatch, path collision, missing
  `develop`, or submodule failure.

## Accepted User Requests

Use this skill when the user asks for things like:

- "Get the code of https://github.com/WithAgency/CAMC3"
- "Pull the latest code for WithAgency/CAMC3"
- "Sync the code for this project"
- "Clone this repo"
- "Prepare the repo locally for review"
- "Update my local copy of the code"

## Inputs

The user must provide a GitHub repository reference.

Accept these forms:
```text
https://github.com/WithAgency/CAMC3
https://github.com/WithAgency/CAMC3.git
github.com/WithAgency/CAMC3
WithAgency/CAMC3
git@github.com:WithAgency/CAMC3.git
```
Normalize all accepted forms to the proxy Git URL:
```text
git-proxy@picsou.wadrid.net:git@github.com:WithAgency/CAMC3.git
```
For example:
```text
https://github.com/WithAgency/CAMC3
```
becomes:
```text
git-proxy@picsou.wadrid.net:git@github.com:WithAgency/CAMC3.git
```
## Repository Reference Validation

The resolved repository must contain exactly:
```text
OWNER/REPO
```
Hard stop and ask for a valid repository URL if the input is ambiguous or points to
a subpage, such as:
```text
https://github.com/WithAgency
https://github.com/WithAgency/CAMC3/issues
https://github.com/WithAgency/CAMC3/pull/123
```
Do not guess from issue, pull request, branch, commit, or tree URLs.

## Destination Directory

By default, the current working directory is treated as the **project workspace**.
The skill places the code inside a `code/` subfolder within that workspace:

```text
<current working directory>/code/<repo-name>
```

This keeps disposable code separate from PM-owned project files. A typical project
workspace looks like:

```text
<Project folder>/
  notes/
  assets/
  exports/
  code/
    <repo-name>/
```

- `code/` is the machine-managed area used by this skill.
- PM-owned files (notes, assets, exports) should live outside `code/`.
- The skill only creates or refreshes the repository inside `code/`.

The skill supports three destination modes:

1. **No destination provided** — use `<current working directory>/code/<repo-name>`.
2. **Project workspace folder provided** — use `<project-workspace>/code/<repo-name>`.
3. **Explicit full destination path provided** — use that exact path.

If the user provides a path and it is unclear whether it is a project workspace
folder or a full code destination, ask a clarifying question before proceeding.

The skill must never delete, rename, or overwrite an existing folder to resolve a
collision. If the destination cannot be verified as the requested repository, hard
stop and ask the user to choose another destination.

Always confirm the resolved destination before running Git commands.

## Mandatory Confirmation

Before cloning or refreshing code, show the user a confirmation using markdown
formatting so paths are readable and the prompt stands out. Example:

---
I will get the code for:

**Repository:** WithAgency/CAMC3
**Git URL:** `git-proxy@picsou.wadrid.net:git@github.com:WithAgency/CAMC3.git`
**Branch:** `develop`
**Project workspace:** `/Users/alice/Documents/Clients/ACME/Website Redesign`
**Code destination:** `/Users/alice/Documents/Clients/ACME/Website Redesign/code/CAMC3`

I will only create or refresh the repository at the code destination.
I will not touch your other project files.

If the code already exists locally at this destination, I will refresh it so it
exactly matches the latest shared develop branch. Any local edits in that checkout
will be discarded.

**Continue?**

---
If the user explicitly provided a full destination path and there is no project
workspace, omit the **Project workspace** line from the confirmation.

Do not proceed until the user confirms.

## Preconditions

This skill assumes:

- Git is installed.
- GitHub SSH authentication is already configured.
- The user has access to the repository.
- The repository has an `origin/develop` branch.
- The checkout is disposable and used for grounding, not for local development.

If any of these assumptions fail, hard stop and explain the issue clearly.

## Allowed Commands

Allowed command categories:
```bash
pwd
cd
git clone
git remote get-url origin
git remote set-url origin
git fetch origin
git checkout develop
git reset --hard origin/develop
git submodule update --init --recursive
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git rev-parse origin/develop
git rev-parse --short HEAD
git log -1 --pretty=%s
```
## Forbidden Commands

Never run:
```bash
rm
rm -rf
git clean
git push
git commit
git merge
git rebase
```
Also do not:

- install dependencies,
- run tests,
- start servers,
- modify project files,
- create branches,
- edit Git history beyond resetting the local checkout to `origin/develop`.

This skill only gets the code.

## Workflow

### 1. Resolve Repository

Parse the user-provided repository reference.

Normalize it to:
```text
git-proxy@picsou.wadrid.net:git@github.com:OWNER/REPO.git
```
Extract:
```text
OWNER
REPO
```
The local folder name should be the repository name, without `.git`.

Example:
```text
Input: https://github.com/WithAgency/CAMC3
Owner: WithAgency
Repo: CAMC3
Git URL: git-proxy@picsou.wadrid.net:git@github.com:WithAgency/CAMC3.git
Folder: CAMC3
```
### 2. Resolve Destination

Determine the destination path using the following logic:

**Default** (no destination provided):
```text
<current working directory>/code/<repo-name>
```

**Project workspace provided**:
```text
<provided-project-workspace>/code/<repo-name>
```

**Explicit full code destination provided**:
```text
<provided-destination>
```

If the user provides a path and it is unclear whether it is a project workspace or a
full destination, ask a clarifying question before proceeding.

The skill must create the `code/` directory only as needed when cloning into the
final destination. It must not delete, rename, or overwrite any existing project
folders.

Then ask for confirmation using the mandatory confirmation format.

### 3. Inspect Destination

After confirmation, inspect the destination.

#### Case A: Destination Does Not Exist

Clone the repository:
```bash
git clone git-proxy@picsou.wadrid.net:git@github.com:OWNER/REPO.git DESTINATION
```
Then enter the destination and continue to the sync step.

#### Case B: Destination Exists and Is the Same Git Repository

If the destination exists and is a Git repository:

1. Read the `origin` remote.
2. Confirm it points to the same GitHub `OWNER/REPO`.

If the existing remote is equivalent but uses HTTPS, normalize it to the proxied URL:
```bash
git remote set-url origin git-proxy@picsou.wadrid.net:git@github.com:OWNER/REPO.git
```
Then continue to the sync step.

#### Case C: Destination Exists but Is Not a Git Repository

Hard stop.

Say:
```text
The destination already exists but is not a Git repository. I will not overwrite or
delete it. Please choose another destination or move the existing folder manually.
```
Do not run destructive commands.

#### Case D: Destination Exists but Points to a Different Repository

Hard stop.

Say:
```text
The destination is already a Git repository, but its origin remote does not match
the requested repository. I will not modify it. Please choose another destination.
```
Do not alter the repository.

#### Case E: Destination Exists but Has No Origin Remote

Hard stop.

Say:
```text
The destination is a Git repository, but it has no origin remote. I cannot verify
that it matches the requested repository, so I will not modify it. Please choose
another destination.
```
## Sync Step

Once inside the correct repository directory, run:
```bash
git fetch origin
git rev-parse origin/develop
git checkout develop
git reset --hard origin/develop
git submodule update --init --recursive
```
This is intentionally destructive for local edits in the checkout. The expected
result is that the local `develop` branch exactly matches `origin/develop`.

Do not use `git pull`.

Do not merge or rebase.

## Submodules

Always run:
```bash
git submodule update --init --recursive
```
If submodule initialization or update fails, hard stop.

Say:
```text
The main repository was synchronized, but submodule initialization failed. The
local checkout may be incomplete. Please ask the technical team to verify submodule
access, then run this skill again.
```
Do not continue as if the code is ready.

## Verification

After syncing, verify:

1. Current branch is `develop`.
2. Local `HEAD` matches `origin/develop`.
3. Working tree is clean.
4. Latest commit can be reported.

Use commands such as:
```bash
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git rev-parse origin/develop
git status --short
git rev-parse --short HEAD
git log -1 --pretty=%s
```
If `HEAD` does not match `origin/develop`, hard stop.

If the working tree is not clean after reset and submodule update, hard stop and
report the unexpected dirty status.

## Error Handling

Hard stop if any core Git command fails.

### Authentication or Access Failure

If clone, fetch, or submodule update fails because of authentication or access,
say:
```text
GitHub authentication or repository access failed. This skill assumes SSH keys and
GitHub access are already configured. Please ask the technical team to verify
access to the repository, then run this skill again.
```
### Missing develop Branch

If `origin/develop` does not exist, say:
```text
The develop branch could not be found on origin. Model W projects are expected to
use develop. Please verify the repository URL and branch setup.
```
Do not switch to `main`, `master`, or any other branch.

### Existing Folder Collision

If the destination exists but cannot be safely verified as the requested repository,
hard stop. Never delete, rename, or overwrite folders.

## Final Output

When successful, provide a concise summary using markdown formatting. Example:

---
**Code is ready.**

**Repository:** `git-proxy@picsou.wadrid.net:git@github.com:OWNER/REPO.git`
**Project workspace:** `/resolved/project/workspace`
**Code path:** `/resolved/project/workspace/code/REPO`
**Branch:** `develop`
**Synced to:** `origin/develop`
**Commit:** `SHORT_HASH` Commit title
**Submodules:** initialized/updated
**Status:** clean

You can now use this path as grounding for review, Linear analysis, planning, QA,
or documentation work.

---
Omit the **Project workspace** line if no project workspace was identified (i.e., the
user provided an explicit full destination path).
## Important Notes for PM-Friendly Behavior

- Do not ask the user Git-specific questions such as whether to merge, rebase,
  stash, or pull.
- Do not explain unnecessary Git internals unless there is an error.
- Keep the user-facing language simple:
  - say "refresh the code" instead of "hard reset";
  - say "latest shared develop branch" instead of "remote tracking ref";
  - say "local edits will be discarded" when explaining destructive behavior.
- The skill should make the local checkout match the shared source of truth:
  `origin/develop`.
```
