/**
 * Custom colored footer: git branch and token/cost/context stats, each as
 * its own colored badge. Mode/model/thinking now live in the input editor's
 * top border (mode-colored-editor.ts) instead, so they're intentionally not
 * duplicated here.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component, type Theme, type ThemeColor, type TUI } from "@earendil-works/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";

type ThemeBgKey = "selectedBg" | "userMessageBg";

/** Walk up from cwd to find the repo root (handles worktrees, where .git is a file, not a dir) and return its directory name. */
function findRepoName(cwd: string): string | null {
    let dir = path.resolve(cwd);
    for (;;) {
        try {
            if (fs.existsSync(path.join(dir, ".git"))) return path.basename(dir);
        } catch {
            // ignore
        }
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

function formatTokens(count: number): string {
    if (count < 1000) return count.toString();
    if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
    if (count < 1000000) return `${Math.round(count / 1000)}k`;
    if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
    return `${Math.round(count / 1000000)}M`;
}

interface UsageAccum {
    input: number;
    output: number;
    cost: number;
}

function accumulateUsage(ctx: ExtensionContext): UsageAccum {
    const totals: UsageAccum = { input: 0, output: 0, cost: 0 };
    for (const entry of ctx.sessionManager.getEntries()) {
        let usage: { input: number; output: number; cost: { total: number } } | undefined;
        if (entry.type === "message" && entry.message.role === "assistant") {
            usage = entry.message.usage;
        } else if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.usage) {
            usage = entry.message.usage;
        } else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
            usage = entry.usage;
        }
        if (!usage) continue;
        totals.input += usage.input;
        totals.output += usage.output;
        totals.cost += usage.cost.total;
    }
    return totals;
}

class PowerlineFooter implements Component {
    constructor(
        private ctx: ExtensionContext,
        private theme: Theme,
        private footerData: { getGitBranch(): string | null },
    ) {}

    invalidate(): void {
        // No cached render state to drop.
    }

    render(width: number): string[] {
        const { ctx, theme, footerData } = this;

        const branch = footerData.getGitBranch() ?? "no-git";
        const repoName = findRepoName(ctx.cwd);
        const branchLabel = repoName ? `${repoName} · ${branch}` : branch;

        const usage = accumulateUsage(ctx);
        const contextUsage = ctx.getContextUsage();
        const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
        const contextPercentValue = contextUsage?.percent ?? null;
        const contextPercentText = contextPercentValue != null ? `${contextPercentValue.toFixed(1)}%` : "?";

        const segments: Array<{ text: string; bg: ThemeBgKey; fg: ThemeColor }> = [
            { text: ` ${branchLabel} `, bg: "selectedBg", fg: "text" },
            { text: ` ↑${formatTokens(usage.input)} `, bg: "userMessageBg", fg: "text" },
            { text: ` ↓${formatTokens(usage.output)} `, bg: "userMessageBg", fg: "text" },
            { text: ` $${usage.cost.toFixed(3)} `, bg: "userMessageBg", fg: "text" },
            { text: ` ${contextPercentText}/${formatTokens(contextWindow)} `, bg: "userMessageBg", fg: "text" },
        ];

        const rendered = segments.map((s) => theme.bg(s.bg, theme.fg(s.fg, s.text)));
        let line = rendered.join(" ");
        if (visibleWidth(line) > width) {
            line = truncateToWidth(line, width, theme.fg("dim", "…"));
        }
        return [line];
    }
}

export default function (pi: ExtensionAPI) {
    pi.on("session_start", (_event, ctx: ExtensionContext) => {
        if (!ctx.hasUI) return;
        ctx.ui.setFooter((_tui: TUI, theme: Theme, footerData) => new PowerlineFooter(ctx, theme, footerData));
    });
}
