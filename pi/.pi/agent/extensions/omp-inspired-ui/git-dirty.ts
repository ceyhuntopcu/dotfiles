import { execFileSync } from "node:child_process";

const TTL_MS = 1000;

/** TTL-cached count of modified, added, deleted, and untracked paths. */
export function createGitDirtyReader() {
    const cache = new Map<string, { value: string | undefined; checkedAt: number }>();
    return (cwd: string): string | undefined => {
        const now = Date.now();
        const cached = cache.get(cwd);
        if (cached && now - cached.checkedAt < TTL_MS) return cached.value;
        let value: string | undefined;
        try {
            const output = execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
            const entries = output.split("\n").filter(Boolean);
            if (entries.length > 0) value = `Δ ${entries.length}`;
        } catch {
            value = undefined;
        }
        cache.set(cwd, { value, checkedAt: now });
        return value;
    };
}
