# Changelog

All notable changes to this project will be documented in this file.

## [0.9.0] - 2026-05-19

### Features

- **Linear Review Skill:** Add a specialized skill for reviewing Linear issues
  to improve issue-driven workflows. This initial version focuses on workflow
  improvement, with full agent capabilities planned for future updates. Link to
  #4.

## [0.8.0] - 2026-05-19

### Features

- **Distributed QA Pipeline:** Introduce a specialized QA pipeline skill with
  dedicated sub-agents for distributed analysis and testing.
- **Sentry MCP Integration:** Add native support for Sentry MCP server in the
  `setup-mcp` flow.

### Fixes

- **Plugin Commands:** Correct typo in the plugin install command for better
  reliability.

## [0.7.0] - 2026-05-07

### Features

- **Recursive Documentation:** Introduce a recursive documentation generation
  and incremental update system to ensure codebase documentation remains
  synchronized with evolving code structures.
- **MCP Architecture Refactor:** Rewrite `setup-mcp` around a class-based MCP
  server architecture optimized for OpenCode, improving extensibility and
  maintenance of remote integrations.
- **Python Testing Standards:** Mandate the use of Django's test Client for view
  tests within the Python testing skill to ensure robust and idiomatic backend
  verification.

### CI/CD & Reliability

- **OpenCode Release Workflow:** Replace Gemini CLI with OpenCode in the release
  workflow and implement fail-fast mechanisms for agent errors.
- **Workflow Robustness:** Fix release workflow issues related to Google API key
  environment variable naming, provider resolution in CI, and model
  auto-detection across workflow phases.

## [0.6.0] - 2026-04-23

### Features

- **Python Testing Skill:** Introduce a specialized Python testing skill to
  standardize and automate the verification of Model W backend services,
  ensuring consistent quality across the ecosystem.

## [0.5.1] - 2026-04-21

### Features

- **Git Orchestration:** Implement a mandatory Model W git orchestration
  workflow to ensure consistent commit quality and automated push safety across
  all agent-led operations.

## [0.5.0] - 2026-04-21

### Features

- **Automatic Skill Injection:** Inject workspace `.agents/skills` automatically
  into Claude Code sessions via a symlink-based plugin hook, ensuring seamless
  access to project-specific skills.
- **Enhanced Model W Bootstrap:** Refactor the bootstrap process into a
  multi-phase sub-agent workflow (Explorer, Drafter, Tester) for significantly
  improved reliability and depth of project analysis.
- **Strict Coding Standards:** Enforce Model W philosophy, path conventions, and
  mandatory metadata headers in all generated skills to ensure ecosystem
  consistency.
- **Advanced Git Hygiene:** Implement strict guidelines for commit and push
  operations for coding agents, including mandatory issue referencing and clear
  differentiation between local and remote operations.
- **License Management:** Enforce a Proprietary license for generated skills
  while maintaining WTFPL for Agent W internals, protecting internal project
  intellectual property.

### Fixes

- **Claude Code Integration:** Fix JS interface issues and implement robust
  symlink injection fallbacks for varied environments.
- **OpenCode Plugin:** Resolve agent loading issues and improve plugin
  initialization reliability.
- **Skill Naming:** Enforce strict naming conventions across the Model W skill
  library.

## [0.4.1] - 2026-04-16

### Maintenance

- **Release Standardization:** Enforce a consistent GitHub Release naming format
  `v<Version> — <Title>`.
- **Workflow Optimization:** Update release workflow prompts to match updated
  skill instructions.

## [0.4.0] - 2026-04-16

### Features

- **Native OpenCode Support:** Enable Agent W as a native OpenCode plugin via a
  new configuration hook that automatically registers the Model W skill library.
- **ES Modules Refactor:** Complete migration of the codebase to ES Modules to
  support the plugin SDK and modern Node.js standards.

### Refactoring

- Refactor bootstrap skill for improved reliability and maintainability.

### Fixes

- Filter out TTS models during maturity analysis to ensure accurate project
  assessment.
- Fix maturity analysis script to correctly use `.cjs` extension where required.

### Maintenance

- Clean up temporary release files in CI/CD workflows and `.gitignore`.

## [0.3.1] - 2026-03-11

### CI/CD & Publishing

- Re-enable NPM token publishing (provenance not supported for private repos)
- Simplify NPM publish workflow

## [0.3.0] - 2026-03-11

### Features

- Automate GitHub Release creation with AI-generated notes

### CI/CD & Security

- Switch to NPM trusted publishing (provenance)
- Force non-interactive mode in CI/CD via CI=true environment variable

## [0.2.0] - 2026-03-11

### Features

- Auto-detect and use latest Gemini flash model for Phase 1
- Make model detection and LLM output explicit in Phase 1 logs

## [0.1.1] - 2026-03-11

### Security & Refactoring

- Refactor Phase 1 to use gh cli and direct Gemini API call for security
- Fix Phase 1 prompt injection and prevent unauthorized tool use

## [0.1.0] - 2026-03-11

### Features

- Integrate GitHub MCP server for Phase 1 project maturity analysis
- Implement AI-driven release with GitHub issue verification
- Add AI-driven release workflow and maintainer skill
- Enable YOLO mode for the AI release agent
- Initial commit of Agent W: Gemini CLI extension with Model W meta-skill and
  CLI installer

### Fixes

- Fix invalid approval-mode in release workflow
- Fix Gemini CLI flag and maturity analysis in release workflow

### Maintenance

- Upgrade CI to Node 24 and add human-approval mandate to maintainer skill
- Update GitHub Action workflow to use Node 22
