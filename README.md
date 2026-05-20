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

    > **Sentry:** During setup you will be prompted for your Sentry instance
    > URL. Press Enter to accept the default (`https://sentry.io`) for the SaaS
    > version. For self-hosted instances, enter your custom URL and provide an
    > access token when prompted.

2. **Authenticate** each server that requires OAuth by running
   `opencode mcp auth <name>`, which opens a browser window for you to
   authorize.

You can optionally pass a custom config path:

```bash
agent-w setup-mcp ~/.config/opencode/opencode.json
```

#### Examples of what you can ask:

- "Update all dependencies to the latest Model W release."
- "Check if the project's linting and formatting rules are followed."
- "Run the smoke tests for both the Django API and the SvelteKit frontend."
- "Create a changelog for the latest updates I just made."
- "Figure out how to run the BDD tests for this project."

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
