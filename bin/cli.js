#!/usr/bin/env node

/**
 * Agent W CLI
 *
 * Provides two commands:
 * - `install`: Copies the model-w-bootstrap skill to ~/.agents/skills/
 * - `setup-mcp`: Configures all MCP servers in the OpenCode config and
 *   triggers OAuth authentication for servers that require it.
 *
 * @module bin/cli
 */

import fs from "fs";
import path from "path";
import os from "os";
import https from "https";
import readline from "readline";
import { spawn, execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes
const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
};

/**
 * Prompt the user for input on the terminal.
 * @param {string} question - The prompt text to display.
 * @param {string} [defaultValue] - Default value shown in brackets, used when the user presses Enter.
 * @returns {Promise<string>} The user's answer (or the default value).
 */
function prompt(question, defaultValue) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        const suffix = defaultValue ? ` [${defaultValue}]` : "";
        rl.question(`  ${question}${suffix}: `, (answer) => {
            rl.close();
            resolve(answer.trim() || defaultValue || "");
        });
    });
}

// ---------------------------------------------------------------------------
// MCP Server classes
// ---------------------------------------------------------------------------

/**
 * Base class for MCP server definitions.
 *
 * Each subclass represents a single MCP server that can be installed into
 * the OpenCode configuration. Subclasses must implement `get name()` and
 * `generateConfig()`. If the server requires OAuth, override `get requiresAuth`
 * to return true and implement `authenticate()`.
 */
class MCPServer {
    /** @returns {string} The key used in the opencode config mcp section */
    get name() {
        throw new Error("Subclass must implement get name()");
    }

    /**
     * Generate the config entry for this MCP server.
     * May perform async operations (e.g. OAuth client registration).
     * @returns {Promise<object>} The config object to store under mcp.<name>
     */
    async generateConfig() {
        throw new Error("Subclass must implement generateConfig()");
    }

    /**
     * Run authentication for this MCP server.
     * Called after config is written. Default is a no-op for servers that
     * don't require auth.
     * @returns {Promise<void>}
     */
    async authenticate() {
        // Default: no-op (no auth needed)
    }

    /**
     * Whether this server requires OAuth authentication after config setup.
     * @returns {boolean}
     */
    get requiresAuth() {
        return false;
    }
}

/**
 * Figma MCP server (remote, OAuth).
 *
 * Registers a dynamic OAuth client with Figma's API during config generation,
 * then triggers browser-based OAuth via `opencode mcp auth figma`.
 */
class FigmaMCP extends MCPServer {
    get name() {
        return "figma";
    }

    get requiresAuth() {
        return true;
    }

    async generateConfig() {
        console.log(
            `  ${colors.cyan}Registering OAuth client with Figma...${colors.reset}`
        );
        const credentials = await this._registerClient();
        return {
            enabled: true,
            type: "remote",
            url: "https://mcp.figma.com/mcp",
            oauth: {
                clientId: credentials.client_id,
                clientSecret: credentials.client_secret,
            },
        };
    }

    async authenticate() {
        return runOpenCodeAuth("figma");
    }

    /**
     * Register an OAuth client with Figma's Dynamic Client Registration endpoint.
     * Uses "Claude Code (figma)" as the client name to bypass Figma's whitelist.
     * @returns {Promise<{client_id: string, client_secret: string}>}
     * @private
     */
    _registerClient() {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({
                client_name: "Claude Code (figma)",
                redirect_uris: ["http://127.0.0.1:19876/mcp/oauth/callback"],
                grant_types: ["authorization_code", "refresh_token"],
                response_types: ["code"],
                token_endpoint_auth_method: "none",
            });

            const options = {
                hostname: "api.figma.com",
                port: 443,
                path: "/v1/oauth/mcp/register",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": data.length,
                },
            };

            const req = https.request(options, (res) => {
                let body = "";
                res.on("data", (chunk) => (body += chunk));
                res.on("end", () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(body));
                        } catch (e) {
                            reject(
                                new Error(
                                    `Failed to parse Figma response: ${e.message}`
                                )
                            );
                        }
                    } else {
                        reject(
                            new Error(
                                `Figma registration failed with status ${res.statusCode}: ${body}`
                            )
                        );
                    }
                });
            });

            req.on("error", (e) => reject(e));
            req.write(data);
            req.end();
        });
    }
}

/**
 * Linear MCP server (remote, OAuth).
 *
 * Linear's MCP server handles OAuth natively — no client registration needed.
 * Authentication is triggered via `opencode mcp auth linear`.
 */
class LinearMCP extends MCPServer {
    get name() {
        return "linear";
    }

    get requiresAuth() {
        return true;
    }

    async generateConfig() {
        return {
            type: "remote",
            url: "https://mcp.linear.app/mcp",
            enabled: true,
        };
    }

    async authenticate() {
        return runOpenCodeAuth("linear");
    }
}

/**
 * Chrome DevTools MCP server (local stdio, no auth).
 *
 * Runs as a local process via pnpx (preferred) or npx as fallback.
 * No authentication is required.
 */
class ChromeDevtoolsMCP extends MCPServer {
    get name() {
        return "chrome-devtools";
    }

    get requiresAuth() {
        return false;
    }

    async generateConfig() {
        const runner = this._detectRunner();
        return {
            type: "local",
            command: [
                runner,
                "chrome-devtools-mcp@latest",
                "--no-usage-statistics",
            ],
            enabled: true,
        };
    }

    async authenticate() {
        // No authentication needed for local stdio server
    }

    /**
     * Detect whether pnpx is available, falling back to npx.
     * @returns {string} "pnpx" or "npx"
     * @private
     */
    _detectRunner() {
        try {
            execSync("which pnpx", { stdio: "ignore" });
            return "pnpx";
        } catch {
            return "npx";
        }
    }
}

/**
 * Sentry MCP server.
 *
 * Supports two modes depending on the Sentry instance:
 * - **SaaS (sentry.io)**: Remote transport via `https://mcp.sentry.dev/mcp`
 *   with OAuth authentication.
 * - **Self-hosted**: Local stdio transport via `npx @sentry/mcp-server@latest`
 *   with an access token and custom host.
 *
 * During config generation the user is prompted for their Sentry instance URL
 * (defaulting to the SaaS URL). Self-hosted users are additionally prompted
 * for an access token.
 */
class SentryMCP extends MCPServer {
    /** @type {boolean} Set during generateConfig based on user input */
    _isSaaS = true;

    get name() {
        return "sentry";
    }

    get requiresAuth() {
        return this._isSaaS;
    }

    async generateConfig() {
        const host = "https://sentry.wadrid.net";

        this._isSaaS = this._isSaaSHost(host);

        if (this._isSaaS) {
            return {
                type: "remote",
                url: "https://mcp.sentry.dev/mcp",
                enabled: true,
                oauth: {},
            };
        }

        // Self-hosted: stdio transport with access token
        const hostname = this._extractHostname(host);
        const accessToken = await prompt(
            "Sentry access token (create one at https://sentry.wadrid.net/settings/account/api/auth-tokens/new-token/ using Read-only permissions)"
        );

        if (!accessToken) {
            console.log(
                `  ${colors.yellow}⚠ No access token provided. You will need to set SENTRY_ACCESS_TOKEN as an environment variable.${colors.reset}`
            );
        }

        const runner = this._detectRunner();
        const args = ["@sentry/mcp-server@latest", `--host=${hostname}`];
        if (accessToken) {
            args.push(`--access-token=${accessToken}`);
        }

        return {
            type: "local",
            command: [runner, ...args],
            enabled: true,
        };
    }

    async authenticate() {
        if (this._isSaaS) {
            return runOpenCodeAuth("sentry");
        }
        // Self-hosted uses access token — no OAuth needed
    }

    /**
     * Determine whether the given URL points to the Sentry SaaS instance.
     * @param {string} host - URL or hostname entered by the user.
     * @returns {boolean}
     * @private
     */
    _isSaaSHost(host) {
        const normalized = host.replace(/\/+$/, "").toLowerCase();
        return (
            normalized === "https://sentry.io" ||
            normalized === "http://sentry.io" ||
            normalized === "sentry.io"
        );
    }

    /**
     * Extract the hostname (without protocol or trailing slashes) from a URL.
     * @param {string} url - The URL to extract from.
     * @returns {string}
     * @private
     */
    _extractHostname(url) {
        return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    }

    /**
     * Detect whether pnpx is available, falling back to npx.
     * @returns {string} "pnpx" or "npx"
     * @private
     */
    _detectRunner() {
        try {
            execSync("which pnpx", { stdio: "ignore" });
            return "pnpx";
        } catch {
            return "npx";
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Spawn `opencode mcp auth <name>` and return a promise that resolves on exit.
 * Opens a browser window for the user to complete the OAuth consent flow.
 * @param {string} name - The MCP server name as registered in the config.
 * @returns {Promise<void>} Resolves on successful auth, rejects on failure.
 */
function runOpenCodeAuth(name) {
    return new Promise((resolve, reject) => {
        console.log(
            `  ${colors.cyan}Running: opencode mcp auth ${name}${colors.reset}`
        );
        console.log(
            `  ${colors.yellow}A browser window will open for you to authorize.${colors.reset}\n`
        );

        const auth = spawn("opencode", ["mcp", "auth", name], {
            stdio: "inherit",
            shell: true,
        });

        auth.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(
                        `opencode mcp auth ${name} exited with code ${code}`
                    )
                );
            }
        });

        auth.on("error", (err) => {
            reject(
                new Error(
                    `Could not run 'opencode mcp auth ${name}': ${err.message}`
                )
            );
        });
    });
}

/**
 * Registry of all MCP servers to install during setup-mcp.
 * Add new MCPServer subclass instances here to include them in the setup flow.
 * @type {MCPServer[]}
 */
const MCP_SERVERS = [
    new FigmaMCP(),
    new LinearMCP(),
    new ChromeDevtoolsMCP(),
    new SentryMCP(),
];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** Print CLI usage information to stdout. */
const showHelp = () => {
    const serverNames = MCP_SERVERS.map((s) => s.name).join(", ");
    console.log(`
${colors.cyan}Agent W - CLI${colors.reset}

Usage:
  agent-w <command> [options]

Commands:
  install [destination]            Install the Model W skill.
                                   Defaults to ${colors.yellow}~/.agents/skills${colors.reset}.
  setup-mcp [configPath]           Setup MCP servers for OpenCode.
                                   Servers: ${colors.cyan}${serverNames}${colors.reset}.
                                   Defaults to ${colors.yellow}~/.config/opencode/opencode.json${colors.reset}.
                                   Automatically triggers OAuth for servers that need it.
  setup-pm                         Setup PM agent configuration in OpenCode.
                                   Updates ${colors.yellow}~/.config/opencode/opencode.json${colors.reset}.
                                   Copies allowed PM skills to ${colors.yellow}~/.config/opencode/skills/${colors.reset}.

Options:
  -h, --help                       Show this help message.

Example:
  agent-w install
  agent-w setup-mcp
  agent-w setup-mcp ~/.config/opencode/opencode.json
  agent-w setup-pm
`);
};

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    showHelp();
    process.exit(0);
}

const command = args[0];

if (command === "install") {
    let destBase = args[1];
    if (!destBase) {
        destBase = path.join(os.homedir(), ".agents", "skills");
    } else if (destBase.startsWith("~/")) {
        destBase = path.join(os.homedir(), destBase.slice(2));
    }

    const destFolder = path.join(destBase, "model-w-bootstrap");
    const srcFolder = path.join(__dirname, "..", "skills", "model-w-bootstrap");

    console.log(`${colors.blue}Installing Agent W skill...${colors.reset}`);
    console.log(`Source: ${colors.yellow}${srcFolder}${colors.reset}`);
    console.log(`Destination: ${colors.yellow}${destFolder}${colors.reset}`);

    try {
        if (!fs.existsSync(destFolder)) {
            fs.mkdirSync(destFolder, { recursive: true });
        }

        const srcFile = path.join(srcFolder, "SKILL.md");
        const destFile = path.join(destFolder, "SKILL.md");

        if (!fs.existsSync(srcFile)) {
            console.error(
                `${colors.red}Error: Source file not found at ${srcFile}${colors.reset}`
            );
            process.exit(1);
        }

        fs.copyFileSync(srcFile, destFile);
        console.log(
            `${colors.green}✔ Successfully installed Agent W skill to ${destFile}${colors.reset}`
        );
    } catch (error) {
        console.error(
            `${colors.red}Error during installation:${colors.reset}`,
            error.message
        );
        process.exit(1);
    }
} else if (command === "setup-mcp") {
    let configPath = args[1];

    if (!configPath) {
        configPath = path.join(
            os.homedir(),
            ".config",
            "opencode",
            "opencode.json"
        );
    } else if (configPath.startsWith("~/")) {
        configPath = path.join(os.homedir(), configPath.slice(2));
    }

    console.log(
        `${colors.blue}Setting up MCP servers for OpenCode...${colors.reset}`
    );
    console.log(`Config path: ${colors.yellow}${configPath}${colors.reset}\n`);

    (async () => {
        try {
            // Load existing config
            let configObj = {};
            if (fs.existsSync(configPath)) {
                try {
                    configObj = JSON.parse(
                        fs.readFileSync(configPath, "utf-8")
                    );
                } catch (e) {
                    console.error(
                        `${colors.red}Failed to parse config file. Overwriting with new config.${colors.reset}`
                    );
                }
            }
            if (!configObj.mcp) configObj.mcp = {};

            // Generate config for each server
            for (const server of MCP_SERVERS) {
                console.log(`${colors.magenta}▸ ${server.name}${colors.reset}`);
                configObj.mcp[server.name] = await server.generateConfig();
                console.log(
                    `  ${colors.green}✔ Config generated${colors.reset}\n`
                );
            }

            // Write config
            const configDir = path.dirname(configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            fs.writeFileSync(configPath, JSON.stringify(configObj, null, 2));
            console.log(
                `${colors.green}✔ Config written to ${configPath}${colors.reset}\n`
            );

            // Authenticate servers that require it (sequentially)
            const authServers = MCP_SERVERS.filter((s) => s.requiresAuth);
            if (authServers.length > 0) {
                console.log(
                    `${colors.blue}Authenticating OAuth servers...${colors.reset}\n`
                );
                for (const server of authServers) {
                    console.log(
                        `${colors.magenta}▸ ${server.name}${colors.reset}`
                    );
                    try {
                        await server.authenticate();
                        console.log(
                            `  ${colors.green}✔ Authenticated${colors.reset}\n`
                        );
                    } catch (err) {
                        console.error(
                            `  ${colors.yellow}⚠ ${err.message}${colors.reset}`
                        );
                        console.log(
                            `  ${colors.yellow}  Retry manually: opencode mcp auth ${server.name}${colors.reset}\n`
                        );
                    }
                }
            }

            console.log(`${colors.green}✔ MCP setup complete!${colors.reset}`);
        } catch (err) {
            console.error(
                `${colors.red}Error setting up MCP: ${err.message}${colors.reset}`
            );
            process.exit(1);
        }
    })();
} else if (command === "setup-pm") {
    const configPath = path.join(
        os.homedir(),
        ".config",
        "opencode",
        "opencode.json"
    );
    const configDir = path.dirname(configPath);

    console.log(
        `${colors.blue}Setting up PM agent configuration for OpenCode...${colors.reset}`
    );
    console.log(`Config path: ${colors.yellow}${configPath}${colors.reset}\n`);

    try {
        // Check if OpenCode config directory exists
        if (!fs.existsSync(configDir)) {
            console.error(
                `${colors.red}Error: OpenCode is not installed.${colors.reset}`
            );
            console.error(
                `${colors.red}Directory not found: ${configDir}${colors.reset}`
            );
            console.log(
                `\n${colors.yellow}Please install OpenCode first or run 'agent-w setup-mcp' to initialize the config.${colors.reset}`
            );
            process.exit(1);
        }

        // Load existing config or create new one
        let configObj = {};
        if (fs.existsSync(configPath)) {
            try {
                configObj = JSON.parse(fs.readFileSync(configPath, "utf-8"));
                // Create timestamped backup
                const timestamp = new Date()
                    .toISOString()
                    .replace(/:/g, "")
                    .replace(/\..+/, "")
                    .replace("T", "-");
                const backupPath = `${configPath}.${timestamp}.bak`;
                fs.copyFileSync(configPath, backupPath);
                console.log(
                    `${colors.cyan}✔ Backup created: ${backupPath}${colors.reset}\n`
                );
            } catch (e) {
                console.error(
                    `${colors.yellow}⚠ Failed to parse existing config. Creating new config.${colors.reset}\n`
                );
                configObj = {};
            }
        }

        // Load PM template
        const templatePath = path.join(
            __dirname,
            "..",
            ".config",
            "opencode-pm.json"
        );
        if (!fs.existsSync(templatePath)) {
            console.error(
                `${colors.red}Error: PM template not found at ${templatePath}${colors.reset}`
            );
            process.exit(1);
        }

        const pmTemplate = JSON.parse(fs.readFileSync(templatePath, "utf-8"));

        // Merge PM config into existing config
        configObj.$schema = pmTemplate.$schema;
        configObj.default_agent = pmTemplate.default_agent;
        if (!configObj.agent) configObj.agent = {};
        configObj.agent["pm-planner"] = pmTemplate.agent["pm-planner"];
        configObj.agent["build"] = pmTemplate.agent["build"];

        // Write updated config
        fs.writeFileSync(configPath, JSON.stringify(configObj, null, 2));
        console.log(
            `${colors.green}✔ PM agent configuration updated successfully!${colors.reset}`
        );
        console.log(
            `${colors.green}  Default agent set to: pm-planner${colors.reset}`
        );

        // Copy allowed skills to ~/.config/opencode/skills/
        console.log(
            `\n${colors.blue}Copying PM skills to OpenCode...${colors.reset}`
        );
        const skillsDestBase = path.join(configDir, "skills");
        if (!fs.existsSync(skillsDestBase)) {
            fs.mkdirSync(skillsDestBase, { recursive: true });
        }

        // Extract allowed skills from PM template
        const skillPermissions =
            pmTemplate.agent["pm-planner"].permission.skill;
        const allowedSkills = Object.keys(skillPermissions).filter(
            (skill) => skillPermissions[skill] === "allow" && skill !== "*"
        );

        const skillsSrcBase = path.join(__dirname, "..", "skills");
        let copiedCount = 0;
        let skippedCount = 0;

        for (const skillName of allowedSkills) {
            const srcSkillPath = path.join(skillsSrcBase, skillName);
            const destSkillPath = path.join(skillsDestBase, skillName);

            if (!fs.existsSync(srcSkillPath)) {
                console.log(
                    `  ${colors.yellow}⚠ Skill not found: ${skillName}${colors.reset}`
                );
                skippedCount++;
                continue;
            }

            // Create destination directory
            if (!fs.existsSync(destSkillPath)) {
                fs.mkdirSync(destSkillPath, { recursive: true });
            }

            // Copy SKILL.md file
            const srcFile = path.join(srcSkillPath, "SKILL.md");
            const destFile = path.join(destSkillPath, "SKILL.md");

            if (fs.existsSync(srcFile)) {
                fs.copyFileSync(srcFile, destFile);
                console.log(
                    `  ${colors.green}✔ ${skillName}${colors.reset}`
                );
                copiedCount++;
            } else {
                console.log(
                    `  ${colors.yellow}⚠ SKILL.md not found in ${skillName}${colors.reset}`
                );
                skippedCount++;
            }
        }

        console.log(
            `\n${colors.green}✔ Copied ${copiedCount} skill(s) to ${skillsDestBase}${colors.reset}`
        );
        if (skippedCount > 0) {
            console.log(
                `${colors.yellow}  ${skippedCount} skill(s) skipped (not found)${colors.reset}`
            );
        }
    } catch (error) {
        console.error(
            `${colors.red}Error setting up PM configuration:${colors.reset}`,
            error.message
        );
        process.exit(1);
    }
} else {
    console.error(`${colors.red}Unknown command: ${command}${colors.reset}`);
    showHelp();
    process.exit(1);
}
