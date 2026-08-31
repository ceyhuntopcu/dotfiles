import { strict as assert } from "node:assert";
import test from "node:test";

import { createBranchReader } from "./git-branch.ts";

function stubbed(heads: Record<string, string>, clock: { now: number }) {
    let reads = 0;
    const reader = createBranchReader({
        ttlMs: 1000,
        now: () => clock.now,
        readHead: dir => {
            reads++;
            return heads[dir] ?? null;
        },
    });
    return { reader, reads: () => reads };
}

test("reads the checked-out branch from HEAD", () => {
    const clock = { now: 0 };
    const { reader } = stubbed({ "/repo": "ref: refs/heads/master\n" }, clock);

    assert.equal(reader("/repo"), "master");
});

test("keeps nested branch names intact", () => {
    const clock = { now: 0 };
    const { reader } = stubbed({ "/repo": "ref: refs/heads/feat/status-bar\n" }, clock);

    assert.equal(reader("/repo"), "feat/status-bar");
});

test("reports a detached HEAD as a short sha", () => {
    const clock = { now: 0 };
    const { reader } = stubbed({ "/repo": "9f1c2d3e4b5a69788796a5b4c3d2e1f00a1b2c3d\n" }, clock);

    assert.equal(reader("/repo"), "9f1c2d3");
});

test("returns null outside a repository", () => {
    const clock = { now: 0 };
    const { reader } = stubbed({}, clock);

    assert.equal(reader("/tmp"), null);
});

test("caches within the ttl so per-keystroke renders do not hit the disk", () => {
    const clock = { now: 0 };
    const { reader, reads } = stubbed({ "/repo": "ref: refs/heads/master\n" }, clock);

    reader("/repo");
    clock.now = 500;
    reader("/repo");

    assert.equal(reads(), 1);
});

test("re-reads once the ttl expires", () => {
    const clock = { now: 0 };
    const heads = { "/repo": "ref: refs/heads/master\n" };
    const { reader, reads } = stubbed(heads, clock);

    assert.equal(reader("/repo"), "master");
    heads["/repo"] = "ref: refs/heads/release\n";
    clock.now = 1001;

    assert.equal(reader("/repo"), "release");
    assert.equal(reads(), 2);
});

test("caches per directory", () => {
    const clock = { now: 0 };
    const { reader } = stubbed(
        { "/a": "ref: refs/heads/main\n", "/b": "ref: refs/heads/other\n" },
        clock,
    );

    assert.equal(reader("/a"), "main");
    assert.equal(reader("/b"), "other");
});
