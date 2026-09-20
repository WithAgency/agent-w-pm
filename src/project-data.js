/**
 * Project data helper for `agent-w project-data`.
 *
 * Reads, validates and writes the per-project metadata block (GitHub repos,
 * Linear team, Sentry org/projects, Notion page, Drive folders, Figma folder)
 * that lives inside the project folder's `AGENTS.md`. OpenCode v2 loads
 * `AGENTS.md` into every conversation, which makes the block available to MCP
 * calls and skills without the PM asking for it.
 *
 * Only the region between the two HTML-comment markers is ever touched; the
 * rest of `AGENTS.md` is preserved byte for byte.
 *
 * The block holds a small YAML document. To stay dependency-free (the CLI is
 * installed globally and ships no runtime dependencies), this module includes
 * a parser and serializer for the YAML subset the block uses: block mappings,
 * block sequences, flow sequences/mappings of scalars, quoted and plain
 * scalars, and `#` comments.
 *
 * @module src/project-data
 */

import fs from "fs";
import os from "os";
import path from "path";

export const SCHEMA_VERSION = 2;

export const BLOCK_START =
    "<!-- agent-w:project-data:start (managed by `agent-w project-data`, do not edit by hand) -->";
export const BLOCK_END = "<!-- agent-w:project-data:end -->";
const BLOCK_START_PREFIX = "<!-- agent-w:project-data:start";

/** Canonical order of the top-level keys in the written YAML. */
const TOP_LEVEL_ORDER = [
    "schema_version",
    "project",
    "updated",
    "github",
    "linear",
    "sentry",
    "notion",
    "drive",
    "figma",
];

/**
 * Error raised for any user-facing problem (bad YAML, invalid data, unreadable
 * AGENTS.md). The CLI prints `message` and `details` and exits non-zero.
 */
export class ProjectDataError extends Error {
    /**
     * @param {string} message - Short description of the problem.
     * @param {string[]} [details] - Extra lines (for example one per
     *     validation error).
     */
    constructor(message, details = []) {
        super(message);
        this.name = "ProjectDataError";
        this.details = details;
    }
}

// ---------------------------------------------------------------------------
// YAML subset: parser
// ---------------------------------------------------------------------------

const KEY_RE = /^([A-Za-z_][\w.-]*|"(?:[^"\\]|\\.)*"|'[^']*'):(?:\s+(.*))?$/;

function yamlError(line, message) {
    return new ProjectDataError(`YAML line ${line}: ${message}`);
}

function isSeqItem(text) {
    return text === "-" || text.startsWith("- ");
}

/**
 * Remove a trailing `# comment`, ignoring `#` inside quoted strings and inside
 * words (a comment must be preceded by whitespace).
 *
 * @param {string} raw - One raw line.
 * @returns {string} The line without its comment.
 */
function stripComment(raw) {
    let quote = null;
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (quote) {
            if (c === "\\" && quote === '"') {
                i++;
            } else if (c === quote) {
                quote = null;
            }
        } else if (c === '"' || c === "'") {
            // A quote only opens a string at the start of a token.
            if (i === 0 || /[\s:[{,-]/.test(raw[i - 1])) {
                quote = c;
            }
        } else if (c === "#" && (i === 0 || /\s/.test(raw[i - 1]))) {
            return raw.slice(0, i);
        }
    }
    return raw;
}

/**
 * Split a flow collection body on top-level separators, respecting quotes and
 * nested brackets.
 *
 * @param {string} str - The text between the brackets.
 * @returns {string[]} Trimmed parts; empty for an empty collection.
 */
function splitTopLevel(str) {
    const parts = [];
    let depth = 0;
    let quote = null;
    let cur = "";
    for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (quote) {
            cur += c;
            if (c === "\\" && quote === '"') {
                cur += str[++i] ?? "";
            } else if (c === quote) {
                quote = null;
            }
            continue;
        }
        if (c === '"' || c === "'") {
            quote = c;
        } else if (c === "[" || c === "{") {
            depth++;
        } else if (c === "]" || c === "}") {
            depth--;
        } else if (c === "," && depth === 0) {
            parts.push(cur.trim());
            cur = "";
            continue;
        }
        cur += c;
    }
    if (cur.trim() !== "" || parts.length > 0) {
        parts.push(cur.trim());
    }
    return parts;
}

function unquoteKey(key) {
    if (key.startsWith('"')) {
        return JSON.parse(key);
    }
    if (key.startsWith("'")) {
        return key.slice(1, -1).replace(/''/g, "'");
    }
    return key;
}

function parseScalar(s, line) {
    if (s === "") {
        return null;
    }
    if (s.startsWith('"')) {
        if (s.length < 2 || !s.endsWith('"')) {
            throw yamlError(line, `unterminated double-quoted string: ${s}`);
        }
        try {
            return JSON.parse(s);
        } catch {
            throw yamlError(line, `invalid double-quoted string: ${s}`);
        }
    }
    if (s.startsWith("'")) {
        if (s.length < 2 || !s.endsWith("'")) {
            throw yamlError(line, `unterminated single-quoted string: ${s}`);
        }
        return s.slice(1, -1).replace(/''/g, "'");
    }
    if (s.startsWith("[")) {
        if (!s.endsWith("]")) {
            throw yamlError(line, `unterminated flow sequence: ${s}`);
        }
        return splitTopLevel(s.slice(1, -1)).map((p) => parseScalar(p, line));
    }
    if (s.startsWith("{")) {
        if (!s.endsWith("}")) {
            throw yamlError(line, `unterminated flow mapping: ${s}`);
        }
        const obj = {};
        for (const part of splitTopLevel(s.slice(1, -1))) {
            const m = part.match(KEY_RE);
            if (!m) {
                throw yamlError(line, `expected "key: value" in {...}: ${part}`);
            }
            const key = unquoteKey(m[1]);
            if (Object.hasOwn(obj, key)) {
                throw yamlError(line, `duplicate key "${key}"`);
            }
            obj[key] = parseScalar((m[2] ?? "").trim(), line);
        }
        return obj;
    }
    if (/^[|>&*!%@`]/.test(s)) {
        throw yamlError(
            line,
            `unsupported YAML syntax starting with "${s[0]}" (anchors, tags and block scalars are not supported)`
        );
    }
    if (s === "~" || s === "null") {
        return null;
    }
    if (s === "true") {
        return true;
    }
    if (s === "false") {
        return false;
    }
    if (/^-?\d+$/.test(s) || /^-?\d+\.\d+$/.test(s)) {
        return Number(s);
    }
    return s;
}

/**
 * Parse the YAML subset used by the project data block.
 *
 * Unquoted integers are returned as numbers, exactly like real YAML, so the
 * validator can tell a quoted ID from an unquoted one.
 *
 * @param {string} text - YAML text.
 * @returns {*} The parsed value (`null` for an empty document).
 * @throws {ProjectDataError} On syntax outside the supported subset.
 */
export function parseYaml(text) {
    const lines = [];
    text.split(/\r?\n/).forEach((raw, i) => {
        const lead = raw.match(/^[ \t]*/)[0];
        const content = stripComment(raw).trimEnd();
        if (!content.trim()) {
            return;
        }
        if (lead.includes("\t")) {
            throw yamlError(i + 1, "tabs are not allowed for indentation");
        }
        if (content.trim() === "---" && lines.length === 0) {
            return;
        }
        lines.push({ n: i + 1, indent: lead.length, text: content.trim() });
    });
    if (lines.length === 0) {
        return null;
    }

    let pos = 0;

    function parseBlock(indent) {
        return isSeqItem(lines[pos].text) ? parseSeq(indent) : parseMap(indent);
    }

    function parseMap(indent) {
        const obj = {};
        while (
            pos < lines.length &&
            lines[pos].indent === indent &&
            !isSeqItem(lines[pos].text)
        ) {
            const line = lines[pos];
            const m = line.text.match(KEY_RE);
            if (!m) {
                throw yamlError(
                    line.n,
                    `expected "key: value", got "${line.text}"`
                );
            }
            const key = unquoteKey(m[1]);
            if (Object.hasOwn(obj, key)) {
                throw yamlError(line.n, `duplicate key "${key}"`);
            }
            pos++;
            if (m[2] === undefined || m[2] === "") {
                const next = lines[pos];
                const nested =
                    next &&
                    (next.indent > indent ||
                        (next.indent === indent && isSeqItem(next.text)));
                obj[key] = nested ? parseBlock(next.indent) : null;
            } else {
                obj[key] = parseScalar(m[2], line.n);
            }
        }
        if (pos < lines.length && lines[pos].indent > indent) {
            throw yamlError(lines[pos].n, "unexpected indentation");
        }
        return obj;
    }

    function parseSeq(indent) {
        const arr = [];
        while (
            pos < lines.length &&
            lines[pos].indent === indent &&
            isSeqItem(lines[pos].text)
        ) {
            const line = lines[pos];
            const rest = line.text.slice(1).trim();
            if (rest === "") {
                pos++;
                const next = lines[pos];
                arr.push(
                    next && next.indent > indent ? parseBlock(next.indent) : null
                );
            } else if (KEY_RE.test(rest)) {
                // "- key: value" opens a mapping whose keys align with `key`.
                const offset =
                    line.text.length - line.text.slice(1).trimStart().length;
                lines[pos] = {
                    n: line.n,
                    indent: indent + offset,
                    text: rest,
                };
                arr.push(parseMap(indent + offset));
            } else {
                pos++;
                arr.push(parseScalar(rest, line.n));
            }
        }
        if (pos < lines.length && lines[pos].indent > indent) {
            throw yamlError(lines[pos].n, "unexpected indentation");
        }
        return arr;
    }

    const value = parseBlock(lines[0].indent);
    if (pos < lines.length) {
        throw yamlError(lines[pos].n, "unexpected content");
    }
    return value;
}

// ---------------------------------------------------------------------------
// YAML subset: serializer
// ---------------------------------------------------------------------------

function needsQuote(s) {
    return (
        s === "" ||
        /^\s|\s$/.test(s) ||
        /^(true|false|null|~|yes|no|on|off)$/i.test(s) ||
        /^-?\d+(\.\d+)?$/.test(s) ||
        /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
        /: |\s#|:$/.test(s) ||
        // eslint-disable-next-line no-control-regex
        /[\u0000-\u001f]/.test(s)
    );
}

function scalarToYaml(v) {
    if (v === null) {
        return "null";
    }
    if (typeof v === "string") {
        return needsQuote(v) ? JSON.stringify(v) : v;
    }
    return String(v);
}

function isScalar(v) {
    return v === null || typeof v !== "object";
}

function renderMap(obj, indent) {
    const pad = " ".repeat(indent);
    const out = [];
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined) {
            continue;
        }
        const key = /^[A-Za-z_][\w.-]*$/.test(k) ? k : JSON.stringify(k);
        if (isScalar(v)) {
            out.push(`${pad}${key}: ${scalarToYaml(v)}`);
        } else if (Array.isArray(v)) {
            const inline =
                v.length === 0
                    ? "[]"
                    : v.every(isScalar)
                      ? `[${v.map(scalarToYaml).join(", ")}]`
                      : null;
            if (inline !== null && inline.length + key.length < 72) {
                out.push(`${pad}${key}: ${inline}`);
            } else {
                out.push(`${pad}${key}:`);
                out.push(...renderSeq(v, indent + 2));
            }
        } else if (Object.keys(v).length === 0) {
            out.push(`${pad}${key}: {}`);
        } else {
            out.push(`${pad}${key}:`);
            out.push(...renderMap(v, indent + 2));
        }
    }
    return out;
}

function renderSeq(arr, indent) {
    const pad = " ".repeat(indent);
    const out = [];
    for (const item of arr) {
        if (isScalar(item)) {
            out.push(`${pad}- ${scalarToYaml(item)}`);
        } else if (Array.isArray(item)) {
            throw new ProjectDataError("Nested lists are not supported.");
        } else {
            const lines = renderMap(item, indent + 2);
            if (lines.length === 0) {
                out.push(`${pad}- {}`);
            } else {
                lines[0] = `${pad}- ${lines[0].slice(indent + 2)}`;
                out.push(...lines);
            }
        }
    }
    return out;
}

/**
 * Serialize a value to block-style YAML (the subset {@link parseYaml} reads).
 *
 * @param {*} value - A plain object (or scalar/array).
 * @returns {string} YAML text ending with a newline.
 */
export function stringifyYaml(value) {
    if (isScalar(value)) {
        return `${scalarToYaml(value)}\n`;
    }
    const lines = Array.isArray(value)
        ? renderSeq(value, 0)
        : renderMap(value, 0);
    return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Normalize a Notion page ID to the dashed lowercase UUID form.
 *
 * @param {string} id - 32 hex characters, with or without dashes.
 * @returns {string|null} The dashed UUID, or null if `id` is not a page ID.
 */
export function normalizeNotionId(id) {
    const hex = String(id).replace(/-/g, "").toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(hex)) {
        return null;
    }
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20),
    ].join("-");
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Validate project data against the schema (version 2).
 *
 * Every integration is optional. IDs must be strings: YAML reads unquoted
 * digits as numbers, which silently corrupts long Figma IDs.
 *
 * @param {*} data - The parsed project data.
 * @returns {{errors: string[], warnings: string[]}} Problems found.
 */
export function validateProjectData(data) {
    const errors = [];
    const warnings = [];

    if (!isObject(data)) {
        return {
            errors: ["The project data must be a mapping (key: value pairs)."],
            warnings,
        };
    }

    const at = (p, key) => (p ? `${p}.${key}` : key);
    const err = (p, message) => errors.push(`${p}: ${message}`);

    const checkKeys = (obj, known, p) => {
        for (const k of Object.keys(obj)) {
            if (!known.includes(k)) {
                warnings.push(`${at(p, k)}: unknown key (kept, but ignored)`);
            }
        }
    };

    const str = (obj, key, p, { re, hint, optional } = {}) => {
        const v = obj[key];
        const where = at(p, key);
        if (v === undefined || v === null) {
            if (!optional) {
                err(where, "is required");
            }
            return undefined;
        }
        if (typeof v !== "string") {
            err(
                where,
                typeof v === "number"
                    ? "must be a quoted string (unquoted digits are read as a number and long IDs lose precision)"
                    : "must be a string"
            );
            return undefined;
        }
        if (v.trim() === "") {
            err(where, "must not be empty");
            return undefined;
        }
        if (re && !re.test(v)) {
            err(where, `invalid value "${v}"${hint ? ` (${hint})` : ""}`);
            return undefined;
        }
        return v;
    };

    const list = (obj, key, p) => {
        const v = obj[key];
        const where = at(p, key);
        if (v === undefined || v === null) {
            err(where, "is required");
            return [];
        }
        if (!Array.isArray(v) || v.length === 0) {
            err(where, "must be a non-empty list");
            return [];
        }
        return v;
    };

    const section = (key) => {
        if (data[key] === undefined) {
            return undefined;
        }
        if (!isObject(data[key])) {
            err(key, "must be a mapping");
            return undefined;
        }
        return data[key];
    };

    checkKeys(data, TOP_LEVEL_ORDER, "");

    if (data.schema_version !== SCHEMA_VERSION) {
        err(
            "schema_version",
            `must be ${SCHEMA_VERSION} (got ${JSON.stringify(data.schema_version)})`
        );
    }
    str(data, "project", "");
    str(data, "updated", "", {
        re: /^\d{4}-\d{2}-\d{2}$/,
        hint: "use YYYY-MM-DD",
        optional: true,
    });

    const github = section("github");
    if (github) {
        checkKeys(github, ["repos"], "github");
        const seen = new Set();
        list(github, "repos", "github").forEach((r, i) => {
            const p = `github.repos[${i}]`;
            if (!isObject(r)) {
                err(p, "must be a mapping with a `repo` key");
                return;
            }
            checkKeys(r, ["repo", "role"], p);
            const repo = str(r, "repo", p, {
                re: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
                hint: "expected owner/name",
            });
            if (repo) {
                if (seen.has(repo.toLowerCase())) {
                    err(p, `duplicate repo "${repo}"`);
                }
                seen.add(repo.toLowerCase());
            }
            str(r, "role", p, { optional: true });
        });
    }

    const linear = section("linear");
    if (linear) {
        checkKeys(linear, ["team"], "linear");
        str(linear, "team", "linear", {
            re: /^[A-Z0-9]{1,10}$/,
            hint: "use the uppercase team key, for example ENG",
        });
    }

    const sentry = section("sentry");
    if (sentry) {
        checkKeys(sentry, ["org", "projects"], "sentry");
        const slug = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
        str(sentry, "org", "sentry", { re: slug, hint: "organization slug" });
        list(sentry, "projects", "sentry").forEach((proj, i) => {
            const p = `sentry.projects[${i}]`;
            if (typeof proj !== "string" || !slug.test(proj)) {
                err(p, `must be a project slug string, got ${JSON.stringify(proj)}`);
            }
        });
    }

    const notion = section("notion");
    if (notion) {
        checkKeys(notion, ["page"], "notion");
        const page = notion.page;
        if (!isObject(page)) {
            err("notion.page", "is required and must be a mapping");
        } else {
            checkKeys(page, ["id", "title", "url"], "notion.page");
            const id = str(page, "id", "notion.page");
            const normalized = id ? normalizeNotionId(id) : null;
            if (id && !normalized) {
                err(
                    "notion.page.id",
                    `invalid value "${id}" (expected a 32-character hex page ID, with or without dashes)`
                );
            }
            str(page, "title", "notion.page", { optional: true });
            const url = str(page, "url", "notion.page", {
                re: /^https:\/\//,
                hint: "must start with https://",
                optional: true,
            });
            if (normalized && url) {
                const inUrl = url.match(/([0-9a-f]{32})(?:[?#/]|$)/i);
                if (inUrl && normalizeNotionId(inUrl[1]) !== normalized) {
                    err(
                        "notion.page",
                        "`id` does not match the page ID found in `url`"
                    );
                }
            }
        }
    }

    const drive = section("drive");
    if (drive) {
        checkKeys(drive, ["folders"], "drive");
        const seen = new Set();
        list(drive, "folders", "drive").forEach((f, i) => {
            const p = `drive.folders[${i}]`;
            if (!isObject(f)) {
                err(p, "must be a mapping with an `id` key");
                return;
            }
            checkKeys(f, ["id", "name"], p);
            const id = str(f, "id", p, {
                re: /^[A-Za-z0-9_-]{10,}$/,
                hint: "Drive folder ID, the last part of the folder URL",
            });
            if (id) {
                if (seen.has(id)) {
                    err(p, `duplicate folder id "${id}"`);
                }
                seen.add(id);
            }
            str(f, "name", p, { optional: true });
        });
    }

    const figma = section("figma");
    if (figma) {
        checkKeys(figma, ["folder"], "figma");
        const folder = figma.folder;
        if (!isObject(folder)) {
            err("figma.folder", "is required and must be a mapping");
        } else {
            checkKeys(folder, ["id", "team_id", "url"], "figma.folder");
            const id = str(folder, "id", "figma.folder", {
                re: /^\d+$/,
                hint: "digits only",
            });
            const teamId = str(folder, "team_id", "figma.folder", {
                re: /^\d+$/,
                hint: "digits only",
                optional: true,
            });
            const url = str(folder, "url", "figma.folder", {
                re: /^https:\/\//,
                hint: "must start with https://",
                optional: true,
            });
            if (url) {
                const parsed = safeParseUrl(url);
                if (parsed?.service === "figma" && parsed.folder) {
                    if (id && parsed.folder.id !== id) {
                        err(
                            "figma.folder",
                            "`id` does not match the folder ID found in `url`"
                        );
                    }
                    if (
                        teamId &&
                        parsed.folder.team_id &&
                        parsed.folder.team_id !== teamId
                    ) {
                        err(
                            "figma.folder",
                            "`team_id` does not match the team ID found in `url`"
                        );
                    }
                }
            }
        }
    }

    return { errors, warnings };
}

function orderKeys(obj, order) {
    const out = {};
    for (const k of order) {
        if (obj[k] !== undefined) {
            out[k] = obj[k];
        }
    }
    for (const k of Object.keys(obj)) {
        if (!(k in out) && obj[k] !== undefined) {
            out[k] = obj[k];
        }
    }
    return out;
}

/**
 * Return a canonical copy of valid project data: keys in a fixed order,
 * Notion ID as a dashed UUID, and `updated` set to today.
 *
 * @param {object} data - Project data that passed {@link validateProjectData}.
 * @param {Date} [now] - Clock override for tests.
 * @returns {object} The normalized copy.
 */
export function normalizeProjectData(data, now = new Date()) {
    const d = structuredClone(data);
    const pad = (n) => String(n).padStart(2, "0");
    d.updated = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    if (d.github) {
        d.github.repos = d.github.repos.map((r) => orderKeys(r, ["repo", "role"]));
        d.github = orderKeys(d.github, ["repos"]);
    }
    if (d.sentry) {
        d.sentry = orderKeys(d.sentry, ["org", "projects"]);
    }
    if (d.notion?.page) {
        d.notion.page.id = normalizeNotionId(d.notion.page.id);
        d.notion.page = orderKeys(d.notion.page, ["id", "title", "url"]);
    }
    if (d.drive) {
        d.drive.folders = d.drive.folders.map((f) => orderKeys(f, ["id", "name"]));
    }
    if (d.figma?.folder) {
        d.figma.folder = orderKeys(d.figma.folder, ["id", "team_id", "url"]);
    }
    return orderKeys(d, TOP_LEVEL_ORDER);
}

// ---------------------------------------------------------------------------
// URL parsing (Notion, Figma, Drive, GitHub, Linear, Sentry)
// ---------------------------------------------------------------------------

/**
 * Turn a URL a PM pasted into the identifiers the schema needs.
 *
 * @param {string} input - A Notion, Figma, Google Drive, GitHub, Linear or
 *     Sentry URL (or a `git@github.com:owner/repo.git` remote).
 * @returns {object} `{service, ...fields}` shaped like the schema section.
 * @throws {ProjectDataError} If the URL is not recognized.
 */
export function parseUrl(input) {
    const raw = String(input).trim();

    const ssh = raw.match(/^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (ssh) {
        return { service: "github", repo: `${ssh[1]}/${ssh[2]}` };
    }

    let url;
    try {
        url = new URL(raw);
    } catch {
        throw new ProjectDataError(`Not a valid URL: ${raw}`);
    }
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);

    if (/(^|\.)notion\.(so|com|site)$/.test(host)) {
        const last = segments[segments.length - 1] ?? "";
        const m =
            last.match(/([0-9a-f]{32})$/i) ??
            (url.searchParams.get("p") ?? "").match(/^([0-9a-f]{32})$/i);
        const id = m ? normalizeNotionId(m[1]) : null;
        if (!id) {
            throw new ProjectDataError(
                "No Notion page ID found. Open the page in Notion and copy its link (the ID is the 32 characters at the end)."
            );
        }
        const slug = last.replace(/-?[0-9a-f]{32}$/i, "");
        const page = { id };
        if (slug) {
            page.title = slug.replace(/-/g, " ");
        }
        page.url = `${url.origin}${url.pathname}`;
        return { service: "notion", page };
    }

    if (/(^|\.)figma\.com$/.test(host)) {
        const m = url.pathname.match(
            /^\/files\/(?:team\/(\d+)\/)?(?:folder|project)\/(\d+)/
        );
        if (!m) {
            throw new ProjectDataError(
                "This Figma URL is not a folder link. Open the folder in Figma (https://www.figma.com/files/team/<team>/folder/<folder>) and copy that link."
            );
        }
        const folder = { id: m[2] };
        if (m[1]) {
            folder.team_id = m[1];
        }
        folder.url = `${url.origin}${m[0]}`;
        return { service: "figma", folder };
    }

    if (host === "drive.google.com") {
        const m = url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/);
        const id = m ? m[1] : url.searchParams.get("id");
        if (!id) {
            throw new ProjectDataError(
                "No Drive folder ID found. Open the folder in Google Drive and copy its link (…/drive/folders/<id>)."
            );
        }
        return { service: "drive", folder: { id } };
    }

    if (host === "github.com" || host === "www.github.com") {
        if (segments.length < 2) {
            throw new ProjectDataError(
                "Expected a repository URL like https://github.com/owner/name."
            );
        }
        return {
            service: "github",
            repo: `${segments[0]}/${segments[1].replace(/\.git$/, "")}`,
        };
    }

    if (host === "linear.app") {
        const i = segments.indexOf("team");
        if (i === -1 || !segments[i + 1]) {
            throw new ProjectDataError(
                "Expected a Linear team URL like https://linear.app/<workspace>/team/<KEY>/…"
            );
        }
        return { service: "linear", team: segments[i + 1].toUpperCase() };
    }

    if (host === "sentry.io" || host.endsWith(".sentry.io") || host.includes("sentry")) {
        const i = segments.indexOf("organizations");
        const org = i !== -1 ? segments[i + 1] : host.split(".")[0];
        if (!org || org === "sentry") {
            throw new ProjectDataError("Could not find a Sentry organization in this URL.");
        }
        return { service: "sentry", org };
    }

    throw new ProjectDataError(
        `Unrecognized URL host "${host}". Supported: Notion, Figma, Google Drive, GitHub, Linear, Sentry.`
    );
}

function safeParseUrl(url) {
    try {
        return parseUrl(url);
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// AGENTS.md block
// ---------------------------------------------------------------------------

/**
 * Build the human/LLM-readable usage notes that sit next to the YAML. Only the
 * integrations present in `data` get a line, so the always-loaded text stays
 * as short as possible.
 *
 * @param {object} data - Normalized project data.
 * @returns {string[]} Markdown lines.
 */
function usageLines(data) {
    const lines = [
        "The values below are the source of truth for this project. Answer",
        "questions about them directly, without calling any tool. Use them as",
        "defaults in MCP calls instead of searching for them. Only re-verify a",
        "value if the user asks or if a call using it fails; then say so and",
        "suggest running setup-project-data.",
        "",
    ];
    if (data.github) {
        lines.push(
            "- GitHub: the first repo is the default. Local clones live under ./code/."
        );
    }
    if (data.linear) {
        lines.push("- Linear: filter by the team key.");
    }
    if (data.sentry) {
        lines.push("- Sentry: use the org and only the listed projects.");
    }
    if (data.notion) {
        lines.push("- Notion: fetch the page by id.");
    }
    if (data.drive) {
        lines.push("- Drive: search inside the listed folders first.");
    }
    if (data.figma) {
        lines.push(
            "- Figma: `folder.id` is a Figma project; list its files to find file keys."
        );
    }
    return lines;
}

/**
 * Render the managed block (markers, usage notes, fenced YAML).
 *
 * @param {object} data - Normalized project data.
 * @returns {string} Block text with `\n` line endings, no trailing newline.
 */
export function renderBlock(data) {
    return [
        BLOCK_START,
        "## Project context",
        "",
        ...usageLines(data),
        "",
        "```yaml",
        stringifyYaml(data).trimEnd(),
        "```",
        BLOCK_END,
    ].join("\n");
}

/**
 * Locate the managed block in an AGENTS.md text.
 *
 * @param {string} text - File contents.
 * @returns {{found: false} | {found: true, startLine: number, endLine: number, yamlText: string}}
 *     Line numbers are 0-based and inclusive.
 * @throws {ProjectDataError} If the markers are unbalanced or duplicated.
 */
export function findBlock(text) {
    const lines = text.split("\n");
    const starts = [];
    const ends = [];
    lines.forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith(BLOCK_START_PREFIX) && t.endsWith("-->")) {
            starts.push(i);
        } else if (t === BLOCK_END) {
            ends.push(i);
        }
    });

    if (starts.length === 0 && ends.length === 0) {
        return { found: false };
    }
    if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) {
        throw new ProjectDataError(
            "The agent-w project data markers in AGENTS.md are damaged (expected exactly one start marker followed by one end marker).",
            ["Fix or delete the block between the markers, then run the command again."]
        );
    }

    const inner = lines.slice(starts[0] + 1, ends[0]);
    const open = inner.findIndex((l) => /^```ya?ml\s*$/.test(l.trim()));
    const close = inner.findIndex(
        (l, i) => i > open && open !== -1 && l.trim() === "```"
    );
    if (open === -1 || close === -1) {
        throw new ProjectDataError(
            "The project data block in AGENTS.md has no ```yaml fenced section."
        );
    }
    return {
        found: true,
        startLine: starts[0],
        endLine: ends[0],
        yamlText: inner.slice(open + 1, close).join("\n"),
    };
}

/**
 * Insert or replace the managed block in an AGENTS.md text, leaving
 * everything outside the markers untouched.
 *
 * @param {string} text - Current file contents ("" if the file is new).
 * @param {string} block - Output of {@link renderBlock}.
 * @returns {{text: string, action: "created"|"added"|"updated"}} New contents.
 */
export function upsertBlock(text, block) {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const blockText = block.split("\n").join(eol);
    const found = findBlock(text);

    if (found.found) {
        const lines = text.split("\n");
        // Lines keep their own trailing "\r" (if any), so the text before and
        // after the block is reassembled unchanged.
        const before = lines.slice(0, found.startLine).join("\n");
        const after = lines.slice(found.endLine + 1).join("\n");
        const parts = [];
        if (found.startLine > 0) {
            parts.push(before + "\n");
        }
        parts.push(blockText);
        if (found.endLine < lines.length - 1) {
            parts.push(eol + after);
        }
        return { text: parts.join(""), action: "updated" };
    }

    if (text.trim() === "") {
        return { text: blockText + eol, action: "created" };
    }
    let base = text;
    if (!base.endsWith("\n")) {
        base += eol;
    }
    if (!/\r?\n\r?\n$/.test(base)) {
        base += eol;
    }
    return { text: base + blockText + eol, action: "added" };
}

// ---------------------------------------------------------------------------
// File access
// ---------------------------------------------------------------------------

/**
 * Refuse to touch a file that is not plain UTF-8 text. Editors sometimes save
 * AGENTS.md as RTF or UTF-16; appending to such a file would corrupt it and
 * OpenCode would not load it anyway.
 *
 * @param {Buffer} buf - File contents.
 * @param {string} file - Path, for the error message.
 * @throws {ProjectDataError} If the contents are not plain UTF-8 text.
 */
export function assertPlainText(buf, file) {
    let reason = null;
    if (buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))) {
        reason = "UTF-16 encoded";
    } else if (buf.subarray(0, 5).toString("latin1") === "{\\rtf") {
        reason = "Rich Text Format (RTF)";
    } else if (buf.subarray(0, 6).toString("latin1") === "bplist") {
        reason = "binary property list";
    } else if (buf.includes(0)) {
        reason = "contains binary data";
    } else {
        try {
            new TextDecoder("utf-8", { fatal: true }).decode(buf);
        } catch {
            reason = "not valid UTF-8";
        }
    }
    if (reason) {
        throw new ProjectDataError(
            `${file} is not plain UTF-8 text (${reason}).`,
            [
                "Re-save it as plain text (in TextEdit: Format > Make Plain Text), or delete it so it can be recreated.",
            ]
        );
    }
}

/**
 * Read an AGENTS.md file, checking that it is plain text.
 *
 * @param {string} file - Path to AGENTS.md.
 * @returns {{exists: boolean, text: string}} Contents ("" when missing).
 */
export function readAgentsFile(file) {
    if (!fs.existsSync(file)) {
        return { exists: false, text: "" };
    }
    const buf = fs.readFileSync(file);
    assertPlainText(buf, file);
    return { exists: true, text: buf.toString("utf8") };
}

function writeFileAtomic(file, text) {
    const tmp = `${file}.tmp-${process.pid}`;
    try {
        fs.writeFileSync(tmp, text, "utf8");
        fs.renameSync(tmp, file);
    } catch (e) {
        fs.rmSync(tmp, { force: true });
        throw e;
    }
}

/**
 * Read the project data block for a folder, walking up towards the home
 * directory the way OpenCode discovers AGENTS.md files.
 *
 * @param {string} dir - Folder to start from.
 * @returns {{found: boolean, file?: string, data?: object, yamlText?: string, searched: string[]}}
 *     The nearest block, or `found: false`.
 */
export function readProjectData(dir) {
    const searched = [];
    const home = os.homedir();
    let current = path.resolve(dir);
    for (;;) {
        const file = path.join(current, "AGENTS.md");
        searched.push(file);
        const { exists, text } = readAgentsFile(file);
        if (exists) {
            const block = findBlock(text);
            if (block.found) {
                return {
                    found: true,
                    file,
                    yamlText: block.yamlText,
                    data: parseYaml(block.yamlText),
                    searched,
                };
            }
        }
        const parent = path.dirname(current);
        if (parent === current || current === home) {
            break;
        }
        current = parent;
    }
    return { found: false, searched };
}

/**
 * Parse project data supplied by a caller (JSON or the YAML subset).
 *
 * @param {string} input - Text from stdin or a file.
 * @returns {*} The parsed value.
 */
export function parseInput(input) {
    const trimmed = input.trim();
    if (trimmed === "") {
        throw new ProjectDataError("No project data received (empty input).");
    }
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
            return JSON.parse(trimmed);
        } catch {
            // Not JSON (could be a YAML flow mapping); fall through.
        }
    }
    return parseYaml(input);
}

/**
 * Validate input data and create or update the block in `<dir>/AGENTS.md`.
 *
 * @param {string} dir - The project folder.
 * @param {string} input - JSON or YAML text with the project data.
 * @param {{dryRun?: boolean, now?: Date}} [options] - Options.
 * @returns {{file: string, action: string, warnings: string[], block: string, data: object}}
 *     What happened.
 * @throws {ProjectDataError} On invalid input or an unreadable AGENTS.md.
 */
export function writeProjectData(dir, input, options = {}) {
    const data = parseInput(input);
    const { errors, warnings } = validateProjectData(data);
    if (errors.length > 0) {
        throw new ProjectDataError(
            `Invalid project data (${errors.length} problem${errors.length > 1 ? "s" : ""}):`,
            errors
        );
    }

    const normalized = normalizeProjectData(data, options.now);
    const block = renderBlock(normalized);
    const file = path.join(path.resolve(dir), "AGENTS.md");
    const current = readAgentsFile(file);
    const next = upsertBlock(current.text, block);

    if (!options.dryRun) {
        writeFileAtomic(file, next.text);
    }
    return { file, action: next.action, warnings, block, data: normalized };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `Usage: agent-w project-data <command> [options]

Manage the project metadata block in the project folder's AGENTS.md.

Commands:
  read                Print the project data as JSON. Looks in the current
                      folder, then in parent folders (like OpenCode does).
  validate            Validate the data in AGENTS.md, or in --file (use
                      "--file -" for stdin).
  write               Validate JSON or YAML from --file / stdin and create or
                      update the block in AGENTS.md. Content outside the
                      block is never changed.
  parse-url <url>     Extract IDs from a Notion, Figma, Drive, GitHub, Linear
                      or Sentry URL and print them as JSON.

Options:
  --dir <path>        Project folder (default: current folder).
  --file <path>       Read input from a file instead of stdin ("-" = stdin).
  --dry-run           write: show the block without writing anything.
  --yaml              read: print YAML instead of JSON.
  -h, --help          Show this help.
`;

function parseArgs(argv) {
    const opts = { positional: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--dir" || a === "-C") {
            opts.dir = argv[++i];
        } else if (a === "--file" || a === "-f") {
            opts.file = argv[++i];
        } else if (a === "--dry-run") {
            opts.dryRun = true;
        } else if (a === "--yaml") {
            opts.yaml = true;
        } else if (a === "-h" || a === "--help") {
            opts.help = true;
        } else if (a.startsWith("-") && a !== "-") {
            throw new ProjectDataError(`Unknown option: ${a}`);
        } else {
            opts.positional.push(a);
        }
    }
    return opts;
}

/**
 * Run the `project-data` command.
 *
 * @param {string[]} argv - Arguments after `project-data`.
 * @param {object} [io] - Injection points for tests.
 * @param {string} [io.cwd] - Working directory.
 * @param {(s: string) => void} [io.out] - stdout writer.
 * @param {(s: string) => void} [io.err] - stderr writer.
 * @param {() => string} [io.readStdin] - Reads all of stdin.
 * @param {boolean} [io.stdinIsTTY] - True if stdin is an interactive terminal.
 * @param {Date} [io.now] - Clock override.
 * @returns {number} Process exit code.
 */
export function runProjectData(argv, io = {}) {
    const cwd = io.cwd ?? process.cwd();
    const out = io.out ?? ((s) => process.stdout.write(s));
    const err = io.err ?? ((s) => process.stderr.write(s));
    const readStdin = io.readStdin ?? (() => fs.readFileSync(0, "utf8"));
    const stdinIsTTY = io.stdinIsTTY ?? Boolean(process.stdin.isTTY);

    /**
     * Read the command's input: a file, or stdin when `--file -` is given (or,
     * for commands that require input, when stdin is piped). Returns null when
     * no input was supplied.
     */
    const readInput = (opts, { stdinByDefault }) => {
        if (opts.file && opts.file !== "-") {
            const file = path.resolve(cwd, opts.file);
            if (!fs.existsSync(file)) {
                throw new ProjectDataError(`Input file not found: ${file}`);
            }
            return fs.readFileSync(file, "utf8");
        }
        if (opts.file === "-" || (stdinByDefault && !stdinIsTTY)) {
            try {
                return readStdin();
            } catch (e) {
                // No data on stdin (closed or non-blocking terminal).
                if (e.code === "EAGAIN" || e.code === "EOF") {
                    return "";
                }
                throw e;
            }
        }
        return null;
    };

    try {
        const opts = parseArgs(argv.slice(1));
        const command = argv[0];
        if (!command || command === "-h" || command === "--help" || opts.help) {
            out(HELP);
            return command ? 0 : 1;
        }
        const dir = path.resolve(cwd, opts.dir ?? ".");

        if (command === "parse-url") {
            if (opts.positional.length !== 1) {
                throw new ProjectDataError("Usage: agent-w project-data parse-url <url>");
            }
            out(JSON.stringify(parseUrl(opts.positional[0]), null, 2) + "\n");
            return 0;
        }

        if (command === "read") {
            const result = readProjectData(dir);
            if (!result.found) {
                out(JSON.stringify({ found: false, searched: result.searched }, null, 2) + "\n");
                return 0;
            }
            if (opts.yaml) {
                out(result.yamlText.trimEnd() + "\n");
            } else {
                out(JSON.stringify({ found: true, file: result.file, data: result.data }, null, 2) + "\n");
            }
            return 0;
        }

        if (command === "validate") {
            const input = readInput(opts, { stdinByDefault: false });
            let data;
            let source;
            if (input === null) {
                const result = readProjectData(dir);
                if (!result.found) {
                    throw new ProjectDataError(
                        "No project data block found.",
                        [`Searched: ${result.searched.join(", ")}`]
                    );
                }
                data = result.data;
                source = result.file;
            } else {
                data = parseInput(input);
                source = opts.file && opts.file !== "-" ? opts.file : "stdin";
            }
            const { errors, warnings } = validateProjectData(data);
            for (const w of warnings) {
                err(`warning: ${w}\n`);
            }
            if (errors.length > 0) {
                throw new ProjectDataError(`Invalid project data in ${source}:`, errors);
            }
            out(`OK: ${source} is valid (schema_version ${SCHEMA_VERSION}).\n`);
            return 0;
        }

        if (command === "write") {
            const input = readInput(opts, { stdinByDefault: true });
            if (input === null) {
                throw new ProjectDataError(
                    "No input. Pipe JSON or YAML on stdin or pass --file <path>."
                );
            }

            const target = path.join(dir, "AGENTS.md");
            const here = readAgentsFile(target);
            if (!(here.exists && findBlock(here.text).found)) {
                const parent = readProjectData(path.dirname(dir));
                if (parent.found) {
                    err(
                        `warning: a parent folder already defines project data (${parent.file}). OpenCode loads both files; the nearest one wins.\n`
                    );
                }
            }
            if (path.basename(path.dirname(dir)) === "code") {
                err(
                    "warning: this folder looks like a clone inside code/. Project data belongs in the project folder that contains code/ and skills/.\n"
                );
            }

            const result = writeProjectData(dir, input, {
                dryRun: opts.dryRun,
                now: io.now,
            });
            for (const w of result.warnings) {
                err(`warning: ${w}\n`);
            }
            if (opts.dryRun) {
                out(result.block + "\n");
                out(`(dry run: nothing written to ${result.file})\n`);
            } else {
                const verb = { created: "Created", added: "Added the block to", updated: "Updated the block in" }[result.action];
                const present = TOP_LEVEL_ORDER.filter(
                    (k) => result.data[k] && typeof result.data[k] === "object"
                );
                out(`${verb} ${result.file}\n`);
                out(`Integrations: ${present.length ? present.join(", ") : "none"}\n`);
            }
            return 0;
        }

        throw new ProjectDataError(`Unknown project-data command: ${command}`, [
            "Run `agent-w project-data --help` for usage.",
        ]);
    } catch (e) {
        if (e instanceof ProjectDataError) {
            err(`Error: ${e.message}\n`);
            for (const d of e.details) {
                err(`  - ${d}\n`);
            }
            return 1;
        }
        throw e;
    }
}
