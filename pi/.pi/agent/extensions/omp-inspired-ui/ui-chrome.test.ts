import { strict as assert } from "node:assert";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as chromeModule from "./ui-chrome.ts";
import {
    composeStatusLine,
    formatContext,
    formatContextRemaining,
    formatModelLabel,
    formatTokens,
    renderContextGauge,
    shortenPath,
    METER_FILL,
} from "./ui-chrome.ts";

const REPO_PATH = "/Users/ceyhuntopcu/Documents/GitHub/entr-clients-cloudfunctions";

test("shortenPath collapses the home directory", () => {
    const inside = path.join(os.homedir(), "Documents", "GitHub", "repo");

    assert.equal(shortenPath(inside, 80), "~/Documents/GitHub/repo");
});

test("shortenPath ellipsizes to the requested width, keeping the tail", () => {
    const shortened = shortenPath(REPO_PATH, 28);

    assert.equal(shortened.length, 28);
    assert.ok(shortened.startsWith("…"), `expected leading ellipsis, got ${shortened}`);
    assert.ok(shortened.endsWith("entr-clients-cloudfunctions"), `expected path tail, got ${shortened}`);
});

test("formatContext renders percent and humanized context window", () => {
    assert.equal(formatContext(30, 1_000_000), "30% · 1M");
    assert.equal(formatContext(null, 200_000), "?% · 200k");
});

test("formatTokens humanizes window sizes", () => {
    assert.equal(formatTokens(999), "999");
    assert.equal(formatTokens(200_000), "200k");
    assert.equal(formatTokens(1_000_000), "1M");
});

test("formatContextRemaining reports what is left, not just what is used", () => {
    assert.equal(formatContextRemaining(0, 1_000_000), "1M left · 0%");
    assert.equal(formatContextRemaining(12, 1_000_000), "880k left · 12%");
});

test("formatContextRemaining falls back to the window when usage is unknown", () => {
    assert.equal(formatContextRemaining(null, 200_000), "200k left · ?%");
});
test("formatContextRemaining clamps overruns before rendering the critical warning", () => {
    assert.equal(formatContextRemaining(140, 200_000), "⚠ 100%");
});

test("formatModelLabel includes the thinking level when it is active", () => {
    assert.equal(
        formatModelLabel("Terra", "gpt-5.6-terra", "medium"),
        "Terra · gpt-5.6-terra · medium",
    );
});

test("formatModelLabel omits an inactive thinking level", () => {
    assert.equal(formatModelLabel("Terra", "gpt-5.6-terra", "off"), "Terra · gpt-5.6-terra");
    assert.equal(formatModelLabel("Terra", "gpt-5.6-terra", undefined), "Terra · gpt-5.6-terra");
});

test("composeStatusLine keeps model, path, branch, and context in order at full width", () => {
    const line = composeStatusLine(
        {
            model: "Terra · gpt-5.6-terra · medium",
            path: REPO_PATH,
            branch: "master",
            context: "1M left · 0%",
        },
        160,
    );

    assert.equal(line.length, 160);
    const modelAt = line.indexOf("Terra");
    const pathAt = line.indexOf("entr-clients-cloudfunctions");
    const branchAt = line.indexOf("master");
    const contextAt = line.indexOf("1M left · 0%");
    assert.ok(modelAt >= 0 && pathAt > modelAt, "model precedes path");
    assert.ok(branchAt > pathAt, "branch follows path");
    assert.ok(contextAt > branchAt, "context is right-aligned after branch");
});

test("composeStatusLine truncates the path before dropping context", () => {
    const line = composeStatusLine(
        {
            model: "Terra · gpt-5.6-terra · medium",
            path: REPO_PATH,
            branch: "master",
            context: "1M left · 0%",
        },
        70,
    );

    assert.ok(line.length <= 70, `expected width <= 70, got ${line.length}`);
    assert.ok(line.includes("1M left · 0%"), "context survives");
    assert.ok(!line.includes(REPO_PATH), "full path does not survive");
});

test("composeStatusLine drops the path before the context text", () => {
    const line = composeStatusLine(
        { model: "Terra", path: REPO_PATH, branch: "master", context: "1M left · 0%" },
        22,
    );

    assert.ok(line.length <= 22, `expected width <= 22, got ${line.length}`);
    assert.ok(line.includes("1M left · 0%"), "context outlives the path");
    assert.ok(!line.includes("entr-clients"), "path is dropped first");
});

test("composeStatusLine keeps the model when only the model fits", () => {
    const line = composeStatusLine(
        {
            model: "Terra · gpt-5.6-terra",
            path: REPO_PATH,
            branch: "master",
            context: "1M left · 0%",
        },
        12,
    );

    assert.ok(line.length <= 12, `expected width <= 12, got ${line.length}`);
    assert.ok(line.startsWith("Terra"), `expected the model first, got ${line}`);
});

test("composeStatusLine paints each segment with its own color", () => {
    const painted: string[] = [];
    const line = composeStatusLine(
        {
            model: "Terra",
            path: REPO_PATH,
            branch: "master",
            context: "30% · 1M",
        },
        120,
        {
            paint: (segment, text) => {
                painted.push(segment);
                return text;
            },
        },
    );

    assert.equal(line.length, 120);
    assert.deepEqual(painted, ["model", "path", "branch", "context"]);
});

test("composeStatusLine breathes around a rule fill", () => {
    const line = composeStatusLine(
        { model: "Terra", branch: "master", context: "1M left · 0%" },
        60,
        { fill: "─", separator: " › " },
    );

    assert.equal(line.length, 60);
    assert.ok(line.includes("Terra › master"), `expected chevron separators, got ${line}`);
    assert.ok(line.includes("master ───"), `expected a space before the rule, got ${line}`);
    assert.ok(line.includes("─── 1M left"), `expected a space after the rule, got ${line}`);
});

test("renderContextGauge spans the requested width and splits at the usage point", () => {
    const gauge = renderContextGauge(25, 20);

    assert.equal(gauge.length, 20);
    assert.equal([...gauge].filter(char => char === METER_FILL).length, 5);
});

test("renderContextGauge is an empty track at zero usage", () => {
    const gauge = renderContextGauge(0, 10);

    assert.equal(gauge.length, 10);
    assert.ok(!gauge.includes(METER_FILL), "no consumed cells at 0%");
});

test("renderContextGauge paints consumed and remaining parts separately", () => {
    const seen: string[] = [];
    const gauge = renderContextGauge(50, 8, {
        fill: text => {
            seen.push(`fill:${text.length}`);
            return text;
        },
        track: text => {
            seen.push(`track:${text.length}`);
            return text;
        },
    });

    assert.equal(gauge.length, 8);
    assert.deepEqual(seen, ["fill:4", "track:4"]);
});

test("composeStatusLine delegates the gap to renderGap when provided", () => {
    const widths: number[] = [];
    const line = composeStatusLine({ model: "Terra", context: "1M left · 0%" }, 40, {
        renderGap: columns => {
            widths.push(columns);
            return "=".repeat(columns);
        },
    });

    assert.equal(line.length, 40);
    assert.equal(widths.length, 1);
    assert.equal(line, `Terra ${"=".repeat(widths[0]!)} 1M left · 0%`);
});

test("composeStatusLine still pads with spaces by default", () => {
    const line = composeStatusLine({ model: "Terra", context: "0%" }, 20);

    assert.equal(line, `Terra${" ".repeat(13)}0%`);
});

test("composeStatusLine paints the fill as its own segment", () => {
    const painted: string[] = [];
    composeStatusLine({ model: "Terra", context: "0%" }, 30, {
        fill: "─",
        paint: (segment, text) => {
            painted.push(segment);
            return text;
        },
    });

    assert.deepEqual(painted, ["model", "fill", "context"]);
});

test("formatContextRemaining warns at 60% and becomes compact at 85%", () => {
    assert.equal(formatContextRemaining(59, 1_000_000), "410k left · 59%");
    assert.equal(formatContextRemaining(60, 1_000_000), "⚠ 400k left · 60%");
    assert.equal(formatContextRemaining(84, 1_000_000), "⚠ 160k left · 84%");
    assert.equal(formatContextRemaining(85, 1_000_000), "⚠ 85%");
});

test("formatStatusBadges keeps git, subagents, and last-turn diff compact and ordered", () => {
    const module = chromeModule as Record<string, unknown>;
    assert.equal(typeof module.formatStatusBadges, "function");
    const formatStatusBadges = module.formatStatusBadges as (input: unknown) => string | undefined;

    assert.equal(
        formatStatusBadges({
            dirtyFiles: 3,
            subagents: { running: 2, done: 1, failed: 1 },
            diffFiles: 4,
        }),
        "±3 ◉2·✓1·×1 Δ4",
    );
    assert.equal(
        formatStatusBadges({
            dirtyFiles: 0,
            subagents: { running: 0, done: 0, failed: 0 },
            diffFiles: 0,
        }),
        undefined,
    );
});

test("composeStatusLine places badges directly after the branch", () => {
    const line = composeStatusLine(
        {
            model: "Terra",
            path: "~/repo",
            branch: "⑂ main",
            badges: "±3 ◉2 Δ4",
            context: "1M left · 0%",
        } as Parameters<typeof composeStatusLine>[0],
        80,
        { separator: " › " },
    );

    assert.ok(line.includes("⑂ main › ±3 ◉2 Δ4"), line);
});
