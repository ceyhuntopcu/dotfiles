import assert from "node:assert/strict";
import test from "node:test";

import { formatWaitProgress, type WaitProgressSnapshot } from "./wait-progress.ts";

const running: WaitProgressSnapshot = {
  id: "sa-1",
  title: "audit auth boundary",
  status: "running",
  backend: "pi",
  modelLabel: "openai-codex/gpt-5.6-sol",
  tokens: 410_000,
  contextWindow: 1_000_000,
  createdAt: 0,
  turns: 3,
  latestOutput: "Tracing authorization middleware and checking failure paths.",
};

const done: WaitProgressSnapshot = {
  id: "sa-2",
  title: "review database queries",
  status: "done",
  backend: "pi",
  modelLabel: "openai-codex/gpt-5.6-sol",
  tokens: 80_000,
  contextWindow: 1_000_000,
  createdAt: 0,
  settledAt: 192_000,
  turns: 2,
  latestOutput: "Found no query overfetching in the selected paths.",
};

test("formats every awaited subagent with live state and activity", () => {
  const progress = formatWaitProgress([running, done], 0, 658_000);

  assert.match(progress.text, /Waiting for 1 of 2 subagents · 10m58s/);
  assert.match(progress.text, /● sa-1 \[running\] audit auth boundary/);
  assert.match(progress.text, /gpt-5\.6-sol.*41%\/1M.*3 turns.*10m58s/);
  assert.match(progress.text, /Latest: Tracing authorization middleware/);
  assert.match(progress.text, /✓ sa-2 \[done\] review database queries/);
  assert.match(progress.text, /8%\/1M.*2 turns.*3m12s/);
  assert.deepEqual(progress.details.pending, ["sa-1"]);
  assert.equal(progress.details.agents[1]?.status, "done");
});

test("summarizes errors instead of pretending they are still running", () => {
  const failed: WaitProgressSnapshot = {
    ...running,
    id: "sa-3",
    status: "error",
    errorText: "Provider request timed out",
  };

  const progress = formatWaitProgress([failed], 0, 61_000);

  assert.match(progress.text, /✕ sa-3 \[error\]/);
  assert.match(progress.text, /Error: Provider request timed out/);
  assert.match(progress.text, /Waiting for 0 of 1 subagents/);
});

test("collapses whitespace and truncates a large live output preview", () => {
  const verbose: WaitProgressSnapshot = {
    ...running,
    latestOutput: `first line\n\n${"x".repeat(240)}`,
  };

  const progress = formatWaitProgress([verbose], 0, 1_000);

  assert.match(progress.text, /Latest: first line x+/);
  assert.match(progress.text, /…/);
  assert.ok(!progress.text.includes("\n\n\n"));
});
