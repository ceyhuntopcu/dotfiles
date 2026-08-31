import { strict as assert } from "node:assert";
import test from "node:test";

import { ModelDisplayState } from "./model-display-state.ts";

test("model selection refreshes the displayed label without editor input", () => {
    let renderRequests = 0;
    const display = new ModelDisplayState(
        { provider: "anthropic", id: "claude-fable-5" },
        "high",
        () => renderRequests++,
    );

    display.selectModel({ provider: "anthropic", id: "claude-opus-5" }, "high");

    assert.deepEqual(display.model, { provider: "anthropic", id: "claude-opus-5" });
    assert.equal(display.thinkingLevel, "high");
    assert.equal(renderRequests, 1);
});

test("thinking selection refreshes the displayed label without editor input", () => {
    let renderRequests = 0;
    const display = new ModelDisplayState(
        { provider: "anthropic", id: "claude-opus-5" },
        "high",
        () => renderRequests++,
    );

    display.selectThinkingLevel("medium");

    assert.equal(display.thinkingLevel, "medium");
    assert.equal(renderRequests, 1);
});

test("context selection refreshes the displayed context once", () => {
    let renderRequests = 0;
    const display = new ModelDisplayState(
        { provider: "openai-codex", id: "gpt-5.6-terra" },
        "medium",
        () => renderRequests++,
    );

    display.selectContext(30, 1_000_000);

    assert.equal(display.contextPercent, 30);
    assert.equal(display.contextWindow, 1_000_000);
    assert.equal(renderRequests, 1);
});

test("an unchanged context does not request another render", () => {
    let renderRequests = 0;
    const display = new ModelDisplayState(
        { provider: "openai-codex", id: "gpt-5.6-terra" },
        "medium",
        () => renderRequests++,
    );

    display.selectContext(30, 1_000_000);
    display.selectContext(30, 1_000_000);

    assert.equal(renderRequests, 1);
});
