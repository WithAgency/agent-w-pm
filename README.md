# Agent W

<img src="agent-w.png" alt="Agent W" width="300">

Agent W is an OpenCode plugin that provides tools and skills required to
facilitate working on Model W projects with coding agents.

## Philosophy

Agent W strictly follows the Model W philosophy used by WITH to ensure a uniform
developer experience across projects.

By enforcing a **uniform tech stack** across the company, we minimize the mental
overhead and learning curve that typically comes from diverging technological
choices. This standardization allows developers to stay focused on what really
matters: high-level technical and architectural decisions on the non-trivial
aspects of the project.

In this paradigm, **everything that can be automated or handled by AI is
considered trivial**. Agent W exists to bridge that gap, providing the
specialized skills and tools required for coding agents to handle the trivial
lifting autonomously, ensuring they stay aligned with the broader Model W
ecosystem.

- **Focus on Impact:** Leave the boilerplate and convention-enforcement to the
  agent.
- **Local First:** Emphasizes development without Docker where possible for
  speed and simplicity.
- **Quarterly Releases:** Adheres to strict versioning across Python, Node,
  Django, and Svelte.
- **Quality by Default:** Enforces robust automated testing and consistent
  linting rules.

## Project Status

**⚠️ Alpha Quality (MATURITY_ALPHA):** Agent W is currently in alpha. It is
under active development, and its APIs, skills, and CLI commands are subject to
breaking changes. Use with caution in production environments.

### Goals for Version 1.0

We aim to reach version 1.0 once the following milestones are achieved:

- **Strong Internal Adoption:** Widespread use of the agent across projects
  within the company.
- **Front-End & Figma Integration:** Definitive AI-assisted workflows for
  translating Figma designs into high-quality front-end code.
- **Boosted Maintenance:** Significant automation of common project management
  and maintenance tasks.
- **Agentic Upgrades:** Model W version upgrades distributed and executed
  reliably through agentic skills.

## Features

- **Model W Meta Bootstrap:** Provides a bootstrapping skill
  (`model-w-bootstrap`) that guides the AI agent to create specialized local
  skills for the project's structure, dependencies, testing, and update
  processes.
- **De Facto Skills:** When used as an OpenCode plugin, Agent W skills are
  automatically available to the agent without any project-level installation.
- **MCP Server Setup:** Configures and authenticates all required MCP servers
  (Figma, Linear, Chrome DevTools, Sentry) in a single command.
- **CLI Tool:** Includes a command-line interface (`agent-w`) for managing the
  Agent W environment.

## For End-Users

### Installation

Install the package globally via npm:

```bash
npm install -g @model-w/agent-w
```

### Usage with OpenCode

Agent W works as a native OpenCode plugin. When installed, it automatically
registers its skill library, making the Model W bootstrapping skills available
to the LLM without any project-level setup.

To add Agent W to your OpenCode environment:

```bash
opencode plugin @model-w/agent-w
```

Once installed, you can simply ask the agent to bootstrap your project:
"Initialize this project using the model-w-bootstrap skill."

### Setting Up MCP Servers

Agent W ships with a CLI command that configures all required MCP servers for
OpenCode and handles OAuth authentication automatically:

```bash
agent-w setup-mcp
```

This single command will:

1. **Register and configure** the following MCP servers in your OpenCode config
   (`~/.config/opencode/opencode.json`):

    | Server            | Type         | Auth        | Description                        |
    | ----------------- | ------------ | ----------- | ---------------------------------- |
    | `figma`           | Remote       | OAuth       | Figma design integration           |
    | `linear`          | Remote       | OAuth       | Linear issue tracking              |
    | `chrome-devtools` | Local        | None        | Chrome DevTools browser automation |
    | `sentry`          | Remote/Local | OAuth/Token | Sentry error tracking & debugging  |
    | `notion`          | Remote       | OAuth       | Notion workspace integration       |
    | `drive`           | Remote       | OAuth       | Google Drive file access           |
    | `gmail`           | Remote       | OAuth       | Gmail email access                 |
    | `slack`           | Remote       | OAuth       | Slack workspace integration        |

    > **Sentry:** During setup you will be prompted for your Sentry instance
    > URL. Press Enter to accept the default (`https://sentry.io`) for the SaaS
    > version. For self-hosted instances, enter your custom URL and provide an
    > access token when prompted.

    > **Google (Drive/Gmail):** Requires a Google Cloud OAuth client created as
    > a "Desktop app" type. The project must be enrolled in the Workspace
    > Developer Preview Program (https://developers.google.com/workspace/preview).

2. **Authenticate** each server that requires OAuth by running
   `opencode mcp auth <name>`, which opens a browser window for you to
   authorize.

You can optionally pass a custom config path:

```bash
agent-w setup-mcp ~/.config/opencode/opencode.json
```

### Setting Up PM Agent

Agent W includes a specialized **Project Manager (PM) agent** configuration for
read-only project management tasks. This setup is ideal for PMs who need to
review Linear tickets, analyze Sentry issues, assess bugs, and work with Figma
designs without modifying code.

```bash
agent-w setup-pm
```

This command will:

1. **Configure the PM agent** in your OpenCode config
   (`~/.config/opencode/opencode.json`):
   - Sets `pm-planner` as the default agent
   - Configures read-only project permissions (no write/edit/patch/task access)
   - Allows access to Linear, Sentry, Figma, and Chrome DevTools MCP tools;
     browser uploads, extensions, performance, memory, and network tools are
     denied

2. **Copy PM-specific skills** to `~/.config/opencode/skills/`:
   - `agent-w-pm-linear-review` - Review Linear ticket specifications
   - `agent-w-pm-code-checkout` - Clone/sync repositories for analysis
   - `agent-w-pm-bug-assessment` - Assess bugs from Sentry for triage
   - `agent-w-pm-load-skills` - Discover and load project-specific skills on-demand from `./skills/`
   - `agent-w-pm-setup-project-data` - Set up or update the project data (see
     [Project Data](#project-data))
   - `model-w-docs-generate` - Generate project documentation

The PM agent is designed to be **safe and read-only** — it cannot create
commits, modify files, or run bash commands, making it ideal for non-technical
users who need to work with development artifacts.

#### Examples of what you can ask the PM agent:

- "Review this Linear ticket: https://linear.app/company/issue/ENG-123"
- "Get the code for WithAgency/CAMC3 and analyze the authentication flow"
- "Assess this Sentry bug: https://sentry.io/issues/12345/"
- "What's the business impact of the recent cart abandonment errors?"
- "List available project skills"
- "Load project skills from ./skills"
- "Generate documentation for this project"

### Project Data

Every project has its own GitHub repos, Linear team, Sentry projects, Notion
page, Google Drive folders and Figma folder. Agent W stores them once, in a
block inside the **project folder's `AGENTS.md`**, so every OpenCode
conversation started there already knows them. MCP calls and skills use the
stored values instead of searching for them, which saves time and tokens.

The project folder is the folder that contains `code/` and `skills/`, for
example `~/Desktop/_With/projects/cawl/`. Start OpenCode from that folder (not
from a clone inside `code/`).

To create or update the data, run the slash command in OpenCode:

```text
/setup-project-data
```

(or ask "set up the project data"). The PM agent finds candidates through the
connected MCPs (Linear teams, Sentry projects, Notion, Drive, Figma, the repos
cloned in `code/`), asks you to confirm or pick, previews the result, and only
then writes it.

The result is a block like this in `AGENTS.md` (everything outside the markers
is left alone):

````markdown
<!-- agent-w:project-data:start (managed by `agent-w project-data`, do not edit by hand) -->
## Project context
…usage notes for the agent…

```yaml
schema_version: 2
project: IB Global Data Reconciliation
updated: 2026-09-20
github:
  repos:
    - repo: niji/ib-api
      role: backend
linear:
  team: CAWL
sentry:
  org: niji
  projects: [ib-api, ib-web]
notion:
  page:
    id: 35609273-cd88-80fe-9b9b-f057fa3fb46d
    title: IB Global Data Reconciliation
    url: https://app.notion.com/p/withnotion/IB-Global-Data-Reconciliation-35609273cd8880fe9b9bf057fa3fb46d
drive:
  folders:
    - id: 1AbCdEfGhIjKlMnOp
      name: Client deliverables
figma:
  folder:
    id: "599655676"
    team_id: "912673193368393001"
    url: https://www.figma.com/files/team/912673193368393001/folder/599655676
```
<!-- agent-w:project-data:end -->
````

Every integration is optional, and the first GitHub repo is the default one.
Commit `AGENTS.md` if the project folder is under version control; it holds no
secrets.

The block is managed by the `agent-w project-data` command, which the skill
calls for you. You can also use it directly from the project folder:

```bash
agent-w project-data read                    # print the stored data as JSON
agent-w project-data validate                # validate the block in AGENTS.md
agent-w project-data write --file data.json  # validate, then create/update the block
agent-w project-data write --dry-run < data.yaml
agent-w project-data parse-url "<notion/figma/drive/github/linear url>"
```

`write` accepts JSON or YAML, validates it (IDs must be strings, Linear team
keys uppercase, and so on), normalizes it, and only replaces the marked block.
It refuses to touch an `AGENTS.md` that is not plain UTF-8 text (for example a
file saved as RTF or UTF-16 by a rich text editor).

> **Note:** OpenCode v2 loads `AGENTS.md` files, but the `instructions` entry
> of `opencode.json` is currently accepted and not loaded, which is why the data
> lives in `AGENTS.md` itself.

## For Contributors

If you want to modify or improve Agent W, you can test it locally.

### Local Development

To test the CLI command locally without publishing, link the npm package
globally:

```bash
npm link
agent-w install
```
In order to use your local agent into another project:
```bash
cd /path/to/other-project
npm link @model-w/agent-w

opencode plugin @model-w/agent-w
agent-w setup-mcp
```

If opencode doesn't pick your latest skill or agent changes, you can simply:

```bash
cd /path/to/other-project
opencode plugin /absolute/path/to/agent-w
```

opencode must be restarted for agent-w changes to take effect.

### Adding a New MCP Server

MCP servers are defined as classes in `bin/cli.js`. Each server extends the
`MCPServer` base class and implements:

- **`get name()`** — The key used in the OpenCode config (`mcp.<name>`).
- **`get requiresAuth()`** — Whether OAuth authentication is needed.
- **`async generateConfig()`** — Returns the config object to write.
- **`async authenticate()`** — Runs the authentication flow (calls
  `opencode mcp auth <name>` for OAuth servers, no-op for local servers).

```javascript
class MyNewMCP extends MCPServer {
    get name() {
        return "my-server";
    }
    get requiresAuth() {
        return true;
    }

    async generateConfig() {
        return {
            enabled: true,
            type: "remote",
            url: "https://mcp.example.com/mcp",
        };
    }

    async authenticate() {
        return runOpenCodeAuth("my-server");
    }
}
```

Then add an instance to the `MCP_SERVERS` array:

```javascript
const MCP_SERVERS = [
    new FigmaMCP(),
    new LinearMCP(),
    new ChromeDevtoolsMCP(),
    new MyNewMCP(),
];
```

### Formatting & Linting

This project follows the
[WITH Code Guidelines](https://with-codeguidelines.readthedocs-hosted.com/en/latest/code-formatting.html).
It uses **Prettier** with a 4-space indent to maintain consistency with the
Python ecosystem.

To format the project:

```bash
npx prettier --write .
```

## License

WTFPL
