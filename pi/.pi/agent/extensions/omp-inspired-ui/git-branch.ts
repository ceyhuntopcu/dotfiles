/**
 * TTL-cached git branch lookup for the composer chrome.
 *
 * The editor's render() runs on every keystroke, so the branch cannot be read
 * from disk each time; pi only hands its own cached branch to the footer
 * factory, not to the editor. A short TTL keeps typing free of syscalls while
 * still noticing a checkout within a second. Injectable `readHead`/`now` keep
 * the cache unit testable without a real repository.
 */

import fs from "node:fs";
import path from "node:path";

const DEFAULT_TTL_MS = 1000;
const SHORT_SHA_LENGTH = 7;

export interface BranchReaderOptions {
    ttlMs?: number;
    now?: () => number;
    /** Returns the raw HEAD contents for a repository root, or null when absent. */
    readHead?: (repoRoot: string) => string | null;
}

/** Nearest ancestor containing `.git` (a directory in a clone, a file in a worktree). */
export function findRepoRoot(cwd: string): string | null {
    let dir = path.resolve(cwd);
    for (;;) {
        try {
            if (fs.existsSync(path.join(dir, ".git"))) return dir;
        } catch {
            // Unreadable directory: keep walking up.
        }
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

/** Real HEAD reader: resolves `.git` as a directory or a worktree pointer file. */
function readHeadFromDisk(repoRoot: string): string | null {
    const gitPath = path.join(repoRoot, ".git");
    try {
        const stats = fs.statSync(gitPath);
        if (stats.isDirectory()) return fs.readFileSync(path.join(gitPath, "HEAD"), "utf8");
        const pointer = fs.readFileSync(gitPath, "utf8").match(/^gitdir:\s*(.+)$/m);
        if (!pointer) return null;
        const gitDir = path.resolve(repoRoot, pointer[1]!.trim());
        return fs.readFileSync(path.join(gitDir, "HEAD"), "utf8");
    } catch {
        return null;
    }
}

/** `ref: refs/heads/feat/x` -> `feat/x`; a bare sha -> short sha. */
function parseHead(head: string): string | null {
    const trimmed = head.trim();
    if (trimmed.length === 0) return null;
    const symbolic = trimmed.match(/^ref:\s*refs\/heads\/(.+)$/);
    if (symbolic) return symbolic[1]!.trim();
    if (/^[0-9a-f]{7,40}$/i.test(trimmed)) return trimmed.slice(0, SHORT_SHA_LENGTH);
    return null;
}

/** Build a `(cwd) => branch | null` lookup with a per-directory TTL cache. */
export function createBranchReader(options: BranchReaderOptions = {}): (cwd: string) => string | null {
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const now = options.now ?? Date.now;
    const readHead = options.readHead ?? readHeadFromDisk;
    const cache = new Map<string, { branch: string | null; readAt: number }>();

    return (cwd: string) => {
        const cached = cache.get(cwd);
        const timestamp = now();
        if (cached && timestamp - cached.readAt < ttlMs) return cached.branch;

        const head = readHead(cwd);
        const branch = head === null ? null : parseHead(head);
        cache.set(cwd, { branch, readAt: timestamp });
        return branch;
    };
}
