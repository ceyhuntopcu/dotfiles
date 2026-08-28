import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  buildToolBlock,
  createTidyExtension,
  requestCleanToolDecoration,
} from "../index.js";
import { style } from "../render.js";
import type { SourceToolDefinition } from "../tool-composition.js";

const withoutAnsi = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, "");

function absentIntegration() {
  return {
    async initialize() {
      return {
        status: {
          state: "absent" as const,
          owner: "tidy/native" as const,
          scopes: [],
          tuple: "unavailable" as const,
          journal: "none",
          action: "Install pi-fff before setup.",
        },
        skipTidyTools: new Set<"read" | "grep">(),
        commit() {},
      };
    },
    async run() {
      throw new Error("unused");
    },
  };
}

test("cooperative executor tools receive tidy rendering without changing execution", async () => {
  const eventHandlers = new Map<string, (value: unknown) => void>();
  const events = {
    on(channel: string, handler: (value: unknown) => void) {
      eventHandlers.set(channel, handler);
      return () => eventHandlers.delete(channel);
    },
    emit(channel: string, value: unknown) {
      eventHandlers.get(channel)?.(value);
    },
  };
  const extension = createTidyExtension({
    loadState: () => ({ enabled: true, source: "default" }),
    loadMode: () => "default",
    createIntegration: absentIntegration,
  });
  const pi = {
    events,
    on() {},
    registerCommand() {},
    registerShortcut() {},
    registerMessageRenderer() {},
    registerTool(_tool: unknown) {},
    sendMessage() {},
  };
  await extension(pi as unknown as ExtensionAPI);

  let delegatedParams: unknown;
  const source = {
    name: "executor_execute",
    label: "Executor",
    description: "Execute TypeScript",
    parameters: {
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"],
    },
    execute(_id: string, params: unknown) {
      delegatedParams = params;
      return { content: [{ type: "text", text: "ok" }], details: {} };
    },
  };
  const decorated = requestCleanToolDecoration(
    pi as unknown as Pick<ExtensionAPI, "events">,
    source as SourceToolDefinition,
  );
  pi.registerTool(decorated);

  assert.equal(decorated.renderShell, "self");
  assert.deepEqual(Object.keys(decorated.parameters.properties), ["reasoning", "code"]);
  await decorated.execute("executor", {
    reasoning: "inspect production data",
    code: "return 1",
  });
  assert.deepEqual(delegatedParams, { code: "return 1" });

  const lines = decorated.renderResult(
    { content: [{ type: "text", text: "ok" }], details: { piTidyElapsedMs: 1_500 } },
    { expanded: false },
    { bg: (_color: string, text: string) => text },
    { args: { reasoning: "inspect production data", code: "return 1" }, toolCallId: "executor" },
  ).render(120).map((line: string) => withoutAnsi(line).trimEnd());
  assert.deepEqual(lines, [
    " 󰆍 executor_execute inspect production data",
    "   TypeScript → done in 1s",
  ]);
});

test("subagent and executor summaries expose useful lifecycle state", () => {
  assert.deepEqual(
    buildToolBlock(
      "subagent_spawn",
      { reasoning: "review authentication flow", name: "auth review", harness: "pi" },
      { details: { id: "sa-1" }, content: [{ type: "text", text: "spawned" }] },
    ).map(withoutAnsi),
    [
      "󰚩 subagent_spawn review authentication flow",
      "  auth review · pi → sa-1",
    ],
  );
  assert.deepEqual(
    buildToolBlock(
      "subagent_wait",
      { reasoning: "collect parallel reviews", ids: ["sa-1", "sa-2"] },
      { details: { results: [{ id: "sa-1" }, { id: "sa-2" }] } },
    ).map(withoutAnsi),
    [
      "󰚭 subagent_wait collect parallel reviews",
      "  sa-1, sa-2 → 2 subagents settled",
    ],
  );
  assert.deepEqual(
    buildToolBlock(
      "executor_execute",
      { reasoning: "update the linear issue", code: "return tools.call()" },
      { content: [{ type: "text", text: "Execution paused: save_issue" }] },
      { elapsedMs: 2_100 },
    ).map(withoutAnsi),
    [
      "󰆍 executor_execute update the linear issue",
      "  TypeScript → paused in 2s",
    ],
  );
  assert.deepEqual(
    buildToolBlock(
      "webfetch",
      { reasoning: "inspect the primary documentation", url: "https://user:secret@example.com/docs" },
      { details: { status: 200, mime: "text/html", bytes: 2_048 } },
    ).map(withoutAnsi),
    [
      "󰖟 webfetch inspect the primary documentation",
      "  https://example.com/docs → 200 text/html · 2KB",
    ],
  );
  assert.deepEqual(
    buildToolBlock(
      "websearch",
      { reasoning: "find current release notes", query: "pi latest release" },
      { details: { resultCount: 5, provider: "exa" } },
    ).map(withoutAnsi),
    [
      "󰍉 websearch find current release notes",
      "  pi latest release → 5 results · exa",
    ],
  );
});

test("every supported extension tool has a dedicated Nerd Font icon", () => {
  const expected = {
    subagent_spawn: "󰚩",
    subagent_wait: "󰚭",
    subagent_cancel: "󰜺",
    subagent_check: "󰋼",
    subagent_list: "󰉹",
    executor_execute: "󰆍",
    executor_skills: "󰂺",
    executor_resume: "󰐊",
    webfetch: "󰖟",
    websearch: "󰍉",
  };
  assert.deepEqual(
    Object.fromEntries(Object.keys(expected).map((name) => [name, style(name).icon])),
    expected,
  );
  assert.equal(new Set(Object.values(expected)).size, Object.keys(expected).length);
});
