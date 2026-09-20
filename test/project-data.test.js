import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
    BLOCK_END,
    findBlock,
    normalizeProjectData,
    parseUrl,
    parseYaml,
    renderBlock,
    runProjectData,
    stringifyYaml,
    upsertBlock,
    validateProjectData,
} from "../src/project-data.js";

const NOW = new Date(2026, 8, 20);

const FULL = {
    schema_version: 2,
    project: "IB Global Data Reconciliation",
    github: {
        repos: [
            { repo: "niji/ib-api", role: "backend" },
            { repo: "niji/ib-web", role: "frontend" },
        ],
    },
    linear: { team: "CAWL" },
    sentry: { org: "niji", projects: ["ib-api", "ib-web"] },
    notion: {
        page: {
            id: "35609273cd8880fe9b9bf057fa3fb46d",
            title: "IB Global Data Reconciliation",
            url: "https://app.notion.com/p/withnotion/IB-Global-Data-Reconciliation-35609273cd8880fe9b9bf057fa3fb46d",
        },
    },
    drive: {
        folders: [
            { id: "1AbCdEfGhIjKlMnOp", name: "Client deliverables" },
            { id: "1QrStUvWxYzAbCdEf", name: "Meeting notes" },
        ],
    },
    figma: {
        folder: {
            id: "599655676",
            team_id: "912673193368393001",
            url: "https://www.figma.com/files/team/912673193368393001/folder/599655676",
        },
    },
};

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "agent-w-pd-"));
}

function run(argv, { cwd, stdin } = {}) {
    let out = "";
    let err = "";
    const code = runProjectData(argv, {
        cwd,
        now: NOW,
        out: (s) => (out += s),
        err: (s) => (err += s),
        readStdin: () => stdin ?? "",
        stdinIsTTY: stdin === undefined,
    });
    return { code, out, err };
}

// -- YAML subset ------------------------------------------------------------

test("yaml: round-trips the full schema, keeping long IDs as strings", () => {
    const yaml = stringifyYaml(normalizeProjectData(FULL, NOW));
    assert.match(yaml, /team_id: "912673193368393001"/);
    assert.match(yaml, /id: "599655676"/);
    const parsed = parseYaml(yaml);
    assert.deepEqual(parsed, normalizeProjectData(FULL, NOW));
    assert.equal(typeof parsed.figma.folder.id, "string");
});

test("yaml: parses comments, flow collections, quotes and same-indent lists", () => {
    const parsed = parseYaml(`
# leading comment
schema_version: 2
project: "Acme: the # project"   # trailing comment
sentry:
  org: niji
  projects: [a, "b c", 'd''e']
github:
  repos:
  - repo: o/r
    role: backend
  - {repo: o/s}
`);
    assert.equal(parsed.project, "Acme: the # project");
    assert.deepEqual(parsed.sentry.projects, ["a", "b c", "d'e"]);
    assert.deepEqual(parsed.github.repos, [
        { repo: "o/r", role: "backend" },
        { repo: "o/s" },
    ]);
});

test("yaml: unquoted digits are numbers, like real YAML", () => {
    const parsed = parseYaml("figma:\n  folder:\n    id: 599655676\n");
    assert.equal(parsed.figma.folder.id, 599655676);
});

test("yaml: rejects tabs, duplicate keys and unsupported syntax", () => {
    assert.throws(() => parseYaml("a:\n\tb: 1\n"), /tabs/);
    assert.throws(() => parseYaml("a: 1\na: 2\n"), /duplicate key/);
    assert.throws(() => parseYaml("a: &x 1\n"), /unsupported/);
    assert.throws(() => parseYaml("a: |\n  text\n"), /unsupported/);
    assert.throws(() => parseYaml("a: 1\n b: 2\n"), /indentation/);
});

// -- validation -------------------------------------------------------------

test("validate: the full example is valid", () => {
    const { errors, warnings } = validateProjectData(FULL);
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
});

test("validate: minimal data is valid, every integration is optional", () => {
    const { errors } = validateProjectData({
        schema_version: 2,
        project: "P",
        linear: { team: "CAWL" },
    });
    assert.deepEqual(errors, []);
});

test("validate: reports each problem with its path", () => {
    const { errors } = validateProjectData({
        schema_version: 1,
        linear: { team: "cawl" },
        github: { repos: [{ repo: "just-a-name" }, { repo: "a/b" }, { repo: "A/B" }] },
        sentry: { org: "niji", projects: [] },
        notion: { page: { id: "nope" } },
        drive: { folders: [{ id: "short" }] },
        figma: { folder: { id: 599655676 } },
    });
    const text = errors.join("\n");
    assert.match(text, /schema_version: must be 2/);
    assert.match(text, /project: is required/);
    assert.match(text, /linear\.team: invalid value "cawl"/);
    assert.match(text, /github\.repos\[0\]\.repo: invalid value/);
    assert.match(text, /github\.repos\[2\]: duplicate repo/);
    assert.match(text, /sentry\.projects: must be a non-empty list/);
    assert.match(text, /notion\.page\.id: invalid value "nope"/);
    assert.match(text, /drive\.folders\[0\]\.id: invalid value/);
    assert.match(text, /figma\.folder\.id: must be a quoted string/);
});

test("validate: catches ids that disagree with their url", () => {
    const { errors } = validateProjectData({
        ...FULL,
        notion: {
            page: {
                id: "00000000000000000000000000000000",
                url: FULL.notion.page.url,
            },
        },
        figma: { folder: { id: "111", url: FULL.figma.folder.url } },
    });
    assert.match(errors.join("\n"), /notion\.page: `id` does not match/);
    assert.match(errors.join("\n"), /figma\.folder: `id` does not match/);
});

test("validate: unknown keys are warnings, not errors", () => {
    const { errors, warnings } = validateProjectData({
        ...FULL,
        jira: { key: "X" },
        linear: { team: "CAWL", cycle: "current" },
    });
    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 2);
});

// -- normalization ----------------------------------------------------------

test("normalize: canonical key order, dashed Notion ID, updated date", () => {
    const shuffled = {
        figma: FULL.figma,
        project: FULL.project,
        notion: FULL.notion,
        schema_version: 2,
        linear: FULL.linear,
    };
    const n = normalizeProjectData(shuffled, NOW);
    assert.deepEqual(Object.keys(n), [
        "schema_version",
        "project",
        "updated",
        "linear",
        "notion",
        "figma",
    ]);
    assert.equal(n.updated, "2026-09-20");
    assert.equal(n.notion.page.id, "35609273-cd88-80fe-9b9b-f057fa3fb46d");
});

// -- URLs -------------------------------------------------------------------

test("parse-url: the Notion and Figma URLs from the spec", () => {
    assert.deepEqual(parseUrl(FULL.notion.page.url), {
        service: "notion",
        page: {
            id: "35609273-cd88-80fe-9b9b-f057fa3fb46d",
            title: "IB Global Data Reconciliation",
            url: FULL.notion.page.url,
        },
    });
    assert.deepEqual(
        parseUrl(
            "https://www.figma.com/files/team/912673193368393001/folder/599655676?fuid=912699443454383230"
        ),
        {
            service: "figma",
            folder: {
                id: "599655676",
                team_id: "912673193368393001",
                url: "https://www.figma.com/files/team/912673193368393001/folder/599655676",
            },
        }
    );
});

test("parse-url: Drive, GitHub, Linear and error cases", () => {
    assert.deepEqual(
        parseUrl("https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjKlMnOp?usp=sharing"),
        { service: "drive", folder: { id: "1AbCdEfGhIjKlMnOp" } }
    );
    assert.deepEqual(parseUrl("https://github.com/niji/ib-api/tree/main"), {
        service: "github",
        repo: "niji/ib-api",
    });
    assert.deepEqual(parseUrl("git@github.com:niji/ib-api.git"), {
        service: "github",
        repo: "niji/ib-api",
    });
    assert.deepEqual(parseUrl("https://linear.app/with/team/cawl/active"), {
        service: "linear",
        team: "CAWL",
    });
    assert.throws(() => parseUrl("https://www.figma.com/design/AbC123/My-file"), /not a folder link/);
    assert.throws(() => parseUrl("https://example.com/x"), /Unrecognized/);
    assert.throws(() => parseUrl("https://www.notion.so/workspace"), /No Notion page ID/);
});

// -- AGENTS.md block --------------------------------------------------------

test("block: created, then replaced without touching surrounding text", () => {
    const data = normalizeProjectData(FULL, NOW);
    const block = renderBlock(data);
    const created = upsertBlock("", block);
    assert.equal(created.action, "created");

    const original = `# Team rules\n\nBe kind.\n\n${block}\n\n## Other\n\nKeep me.\n`;
    const changed = renderBlock({ ...data, linear: { team: "NEW" } });
    const updated = upsertBlock(original, changed);
    assert.equal(updated.action, "updated");
    assert.ok(updated.text.startsWith("# Team rules\n\nBe kind.\n\n"));
    assert.ok(updated.text.endsWith("\n\n## Other\n\nKeep me.\n"));
    assert.match(updated.text, /team: NEW/);
    assert.doesNotMatch(updated.text, /team: CAWL/);
    assert.equal(updated.text.split(BLOCK_END).length - 1, 1);
});

test("block: appended to an existing file with a blank line, once", () => {
    const block = renderBlock(normalizeProjectData(FULL, NOW));
    const first = upsertBlock("# Rules\nno trailing newline", block);
    assert.equal(first.action, "added");
    assert.match(first.text, /^# Rules\nno trailing newline\n\n<!-- agent-w:project-data:start/);
    const again = upsertBlock(first.text, block);
    assert.equal(again.text, first.text);
});

test("block: CRLF files keep CRLF line endings", () => {
    const block = renderBlock(normalizeProjectData(FULL, NOW));
    const crlf = "# Rules\r\n\r\nText\r\n";
    const added = upsertBlock(crlf, block);
    assert.ok(!/[^\r]\n/.test(added.text), "every line ending is CRLF");
    const updated = upsertBlock(added.text, renderBlock(normalizeProjectData({ ...FULL, linear: { team: "X" } }, NOW)));
    assert.ok(!/[^\r]\n/.test(updated.text), "still all CRLF after update");
    assert.ok(updated.text.startsWith(crlf));
});

test("block: damaged markers are rejected", () => {
    assert.throws(
        () => findBlock("<!-- agent-w:project-data:start (x) -->\nno end"),
        /markers/
    );
    assert.throws(() => findBlock(`${BLOCK_END}\n`), /markers/);
    assert.throws(
        () => findBlock(`<!-- agent-w:project-data:start (x) -->\ntext\n${BLOCK_END}`),
        /yaml/
    );
});

test("block: only present integrations get a usage line", () => {
    const block = renderBlock(
        normalizeProjectData({ schema_version: 2, project: "P", linear: { team: "CAWL" } }, NOW)
    );
    assert.match(block, /- Linear: filter by the team key\./);
    assert.doesNotMatch(block, /- GitHub|- Sentry|- Notion|- Drive|- Figma/);
});

// -- CLI --------------------------------------------------------------------

test("cli: write creates AGENTS.md, read returns the data, validate passes", () => {
    const dir = tmpDir();
    const w = run(["write"], { cwd: dir, stdin: JSON.stringify(FULL) });
    assert.equal(w.code, 0, w.err);
    assert.match(w.out, /Created .*AGENTS\.md/);
    assert.match(w.out, /github, linear, sentry, notion, drive, figma/);

    const text = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
    assert.match(text, /```yaml\nschema_version: 2\nproject: IB Global Data Reconciliation\nupdated: 2026-09-20\n/);

    const r = run(["read"], { cwd: dir });
    const read = JSON.parse(r.out);
    assert.equal(read.found, true);
    assert.equal(read.data.linear.team, "CAWL");
    assert.equal(read.data.notion.page.id, "35609273-cd88-80fe-9b9b-f057fa3fb46d");

    assert.equal(run(["validate"], { cwd: dir }).code, 0);
});

test("cli: write accepts YAML input and keeps the rest of AGENTS.md", () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "# Mine\n\nKeep this.\n");
    const yaml = "schema_version: 2\nproject: P\nlinear:\n  team: CAWL\n";
    const w = run(["write"], { cwd: dir, stdin: yaml });
    assert.equal(w.code, 0, w.err);
    assert.match(w.out, /Added the block to/);
    const text = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
    assert.ok(text.startsWith("# Mine\n\nKeep this.\n\n"));

    const w2 = run(["write"], { cwd: dir, stdin: yaml.replace("CAWL", "ABC") });
    assert.match(w2.out, /Updated the block in/);
    assert.ok(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8").startsWith("# Mine\n\nKeep this.\n\n"));
});

test("cli: invalid data is rejected and nothing is written", () => {
    const dir = tmpDir();
    const bad = { schema_version: 2, project: "P", figma: { folder: { id: 599655676 } } };
    const w = run(["write"], { cwd: dir, stdin: JSON.stringify(bad) });
    assert.equal(w.code, 1);
    assert.match(w.err, /figma\.folder\.id: must be a quoted string/);
    assert.equal(fs.existsSync(path.join(dir, "AGENTS.md")), false);
});

test("cli: --dry-run prints the block and writes nothing", () => {
    const dir = tmpDir();
    const w = run(["write", "--dry-run"], { cwd: dir, stdin: JSON.stringify(FULL) });
    assert.equal(w.code, 0, w.err);
    assert.match(w.out, /<!-- agent-w:project-data:start/);
    assert.equal(fs.existsSync(path.join(dir, "AGENTS.md")), false);
});

test("cli: refuses AGENTS.md files that are not plain UTF-8 text", () => {
    const cases = {
        rtf: Buffer.from("{\\rtf1\\ansi Hello}"),
        utf16: Buffer.from("\ufeffhello", "utf16le"),
        binary: Buffer.from([0x61, 0x00, 0x62, 0x00, 0x01]),
        badUtf8: Buffer.from([0x68, 0xff, 0xfe, 0x69, 0xc3]),
    };
    for (const [name, buf] of Object.entries(cases)) {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, "AGENTS.md"), buf);
        const w = run(["write"], { cwd: dir, stdin: JSON.stringify(FULL) });
        assert.equal(w.code, 1, name);
        assert.match(w.err, /not plain UTF-8 text/, name);
        assert.deepEqual(fs.readFileSync(path.join(dir, "AGENTS.md")), buf, `${name} untouched`);
    }
});

test("cli: read finds a block in a parent folder", () => {
    const dir = tmpDir();
    run(["write"], { cwd: dir, stdin: JSON.stringify(FULL) });
    const child = path.join(dir, "code");
    fs.mkdirSync(child);
    const r = JSON.parse(run(["read"], { cwd: child }).out);
    assert.equal(r.found, true);
    assert.equal(r.file, path.join(dir, "AGENTS.md"));
});

test("cli: read reports found:false when there is no block", () => {
    const dir = tmpDir();
    const r = JSON.parse(run(["read", "--dir", dir], { cwd: os.tmpdir() }).out);
    assert.equal(r.found, false);
});

test("cli: write warns about a parent block and about code/ clones", () => {
    const dir = tmpDir();
    run(["write"], { cwd: dir, stdin: JSON.stringify(FULL) });
    const clone = path.join(dir, "code", "repo");
    fs.mkdirSync(clone, { recursive: true });
    const w = run(["write"], { cwd: clone, stdin: JSON.stringify(FULL) });
    assert.equal(w.code, 0);
    assert.match(w.err, /parent folder already defines project data/);
    assert.match(w.err, /clone inside code\//);
});

test("cli: parse-url and help", () => {
    const p = run(["parse-url", "https://github.com/niji/ib-api"]);
    assert.deepEqual(JSON.parse(p.out), { service: "github", repo: "niji/ib-api" });
    assert.equal(run(["parse-url", "https://example.com/x"]).code, 1);
    assert.equal(run([]).code, 1);
    assert.equal(run(["--help"]).code, 0);
    assert.equal(run(["nope"]).code, 1);
});

test("cli: validate reads stdin only when asked with --file -", () => {
    const dir = tmpDir();
    const ok = run(["validate", "--file", "-"], { cwd: dir, stdin: JSON.stringify(FULL) });
    assert.equal(ok.code, 0, ok.err);
    // Without --file, validate looks at AGENTS.md, and there is none.
    const none = run(["validate"], { cwd: dir, stdin: JSON.stringify(FULL) });
    assert.equal(none.code, 1);
    assert.match(none.err, /No project data block found/);
});

test("cli: write with an empty stdin fails cleanly", () => {
    const dir = tmpDir();
    const w = run(["write"], { cwd: dir, stdin: "" });
    assert.equal(w.code, 1);
    assert.match(w.err, /empty input/);
});
