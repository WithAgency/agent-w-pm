---
name:  agent-w-pm-code-checkout
description:
    Use this skill when the user asks to fetch, get, clone, pull, sync, update, refresh
        or checkout code/repository. This skill keeps the local code checkout on
    the requested remote branch, defaulting to origin/develop, for further
    grounding, review, and analysis.
license: WTFPL
metadata:
author: with-madrid.com
---

# Model W Code Checkout

Use this skill to make sure a WithAgency repository is available locally under `./code/`.

## Required behavior

All repositories must live inside the `code/` directory in the current working directory.

Do not clone directly from GitHub.

Do not write or use a normal GitHub SSH URL.

Do not write the proxy URL as one uninterrupted email-like string in explanations. Build it from literal parts to avoid redaction or normalization.

## Branch handling

Use the branch explicitly named by the PM. If no branch is mentioned, use:

```bash
branch="develop"
```

Branch names may contain slashes, such as `feature/cawlw-672-epic-2-agentic-behaviour-via-decision-engine` or
`feature/log-169-fulfillment-order-at-my-fulfillment-service-location-not`.

If the requested branch does not exist on `origin`, stop and tell the PM. Do
not fall back to `develop`.

PM work does not authorize commits or pushes. Before switching an existing
repository, discard all uncommitted and untracked changes:

```bash
git reset --hard HEAD
git clean -fd
```

Do not discard existing local commits. If the requested branch has local
commits that prevent a fast-forward update, stop and report the problem.

## Workflow

1. Check the current directory:

```bash
pwd
```

2. Check whether `./code/` exists and contains a Git repository:

```bash
find code -mindepth 2 -maxdepth 2 -type d -name .git 2>/dev/null
```

3. If an existing repository is found under `./code/`:

   * Enter its parent directory.
   * Fetch the requested branch and verify that it exists:

```bash
git fetch origin "$branch"
```

   * Discard uncommitted and untracked changes:

```bash
git reset --hard HEAD
git clean -fd
```

   * Switch to the requested branch. If it does not exist locally, create it
     from the remote branch:

```bash
if git show-ref --verify --quiet "refs/heads/$branch"; then
    git switch "$branch"
else
    git switch --track -c "$branch" "origin/$branch"
fi
```

   * Update using fast-forward-only behavior:

```bash
git pull --ff-only origin "$branch"
```

   * Tell the user which repository and branch were updated.

4. If no repository is found, or if `./code/` does not exist:

   * Create the directory:

```bash
mkdir -p code
```

* If the user did not provide a repository name, ask only for the repository name.
* Clone the requested branch from inside `./code/` using the assembled-parts
  command below.

## Repository name handling

Accept repository names from requests like:

* `refresh repo`
* `fetch repo`
* `update code`
* `get the code for cartier-pickup`
* `clone cartier-pickup`

Use only the short repository name, for example:

```text
cartier-pickup
```

Do not ask for GitHub URLs, branches, remotes, merge strategies, or other Git details.

## Clone command with assembled parts

When cloning, construct the SSH URL from these literal parts:

```text
proxy_user: git-proxy
proxy_host: picsou.wadrid.net
separator_1: :
inner_user: git
inner_host: github.com
separator_2: :
owner: WithAgency
repo: <repo_name>
```

Use this shell pattern, adding the requested branch:

```bash
cd code && git clone --branch "$branch" --single-branch "${proxy_user}@${proxy_host}:${inner_user}@${inner_host}:${owner}/${repo}"
```

For example, when the repo name is `cartier-pickup`, execute:

```bash
repo="cartier-pickup"
branch="develop"
proxy_user="git-proxy"
proxy_host="picsou.wadrid.net"
inner_user="git"
inner_host="github.com"
owner="WithAgency"

cd code && git clone --branch "$branch" --single-branch "${proxy_user}@${proxy_host}:${inner_user}@${inner_host}:${owner}/${repo}"
```

Do not rewrite, redact, normalize, simplify, or replace any part of the assembled SSH URL.

## Forbidden behavior

Do not run clone commands like:

```bash
git clone git@github.com:WithAgency/<repo_name>.git
git clone https://github.com/WithAgency/<repo_name>.git
```

Do not push or commit. Resetting uncommitted changes and cleaning untracked
files is explicitly authorized for this PM checkout workflow. Do not delete
repositories or otherwise modify files outside the checkout workflow.
