import assert from "node:assert/strict";
import test from "node:test";

import { buildToolBlock } from "../index.js";

const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;]*m/g, "");

test("edit cards show their patch without requiring expansion", () => {
  const lines = buildToolBlock(
    "edit",
    { reasoning: "add the production route", path: "Sidebar.tsx" },
    { details: { diff: "+ new route\n- old route" } },
  ).map(stripAnsi);

  assert.ok(lines.some((line: string) => line.includes("+ new route")));
  assert.ok(lines.some((line: string) => line.includes("- old route")));
});

test("bash cards show the executed command without requiring expansion", () => {
  const lines = buildToolBlock(
    "bash",
    { reasoning: "run the focused test", command: "mise exec node@20 -- pnpm test" },
    { content: [{ type: "text", text: "passed" }] },
  ).map(stripAnsi);

  assert.ok(lines.some((line: string) => line.includes("$ mise exec node@20 -- pnpm test")));
});
