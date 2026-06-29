import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";

const REFRESH_MS = 2000;

type ModeSpec = {
	provider?: string;
	modelId?: string;
	thinkingLevel?: string;
	color?: string;
};

type ModesCache = {
	path: string;
	mtimeMs: number;
	modes: Record<string, ModeSpec>;
} | null;

let modesCache: ModesCache = null;

function resolveModesPath(cwd: string): string | null {
	const project = path.join(cwd, ".pi", "modes.json");
	if (existsSync(project)) return project;
	const global = path.join(os.homedir(), ".pi", "agent", "modes.json");
	return existsSync(global) ? global : null;
}

function loadModes(cwd: string): Record<string, ModeSpec> {
	const filePath = resolveModesPath(cwd);
	if (!filePath) {
		modesCache = null;
		return {};
	}
	try {
		const mtimeMs = statSync(filePath).mtimeMs;
		if (modesCache && modesCache.path === filePath && modesCache.mtimeMs === mtimeMs) {
			return modesCache.modes;
		}
		const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { modes?: Record<string, ModeSpec> };
		const modes = parsed.modes ?? {};
		modesCache = { path: filePath, mtimeMs, modes };
		return modes;
	} catch {
		return modesCache?.modes ?? {};
	}
}

function inferMode(
	modes: Record<string, ModeSpec>,
	provider: string | undefined,
	modelId: string | undefined,
	thinking: string,
	supportsThinking: boolean,
): { name: string; spec: ModeSpec } | null {
	if (!provider || !modelId) return null;
	const names = Object.keys(modes).filter((n) => n !== "custom");

	if (supportsThinking) {
		for (const name of names) {
			const spec = modes[name];
			if (!spec) continue;
			if (spec.provider !== provider || spec.modelId !== modelId) continue;
			if ((spec.thinkingLevel ?? undefined) !== thinking) continue;
			if (name === "default") continue;
			return { name, spec };
		}
		// Allow default as fallback so it's at least labeled.
		const def = modes.default;
		if (def && def.provider === provider && def.modelId === modelId && (def.thinkingLevel ?? undefined) === thinking) {
			return { name: "default", spec: def };
		}
		return null;
	}

	for (const name of names) {
		const spec = modes[name];
		if (!spec) continue;
		if (spec.provider !== provider || spec.modelId !== modelId) continue;
		if (name === "default") continue;
		return { name, spec };
	}
	return null;
}

type GitInfo = {
	inside: boolean;
	branch?: string;
	worktree: boolean;
	staged: number;
	modified: number;
	untracked: number;
	deleted: number;
	renamed: number;
	conflicted: number;
	ahead: number;
	behind: number;
};

const emptyGit: GitInfo = {
	inside: false,
	worktree: false,
	staged: 0,
	modified: 0,
	untracked: 0,
	deleted: 0,
	renamed: 0,
	conflicted: 0,
	ahead: 0,
	behind: 0,
};

function formatNumber(value: number): string {
	if (value < 1000) return String(value);
	if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
	return `${(value / 1_000_000).toFixed(1)}m`;
}

function formatMoney(value: number): string {
	if (value <= 0) return "$0";
	if (value < 0.01) return `$${value.toFixed(4)}`;
	return `$${value.toFixed(2)}`;
}

function formatDirectory(cwd: string): string {
	return path.basename(cwd) || cwd;
}

function parsePorcelain(output: string, fallbackBranch?: string): GitInfo {
	const info: GitInfo = { ...emptyGit, inside: true, branch: fallbackBranch };

	for (const line of output.split("\n")) {
		if (!line) continue;

		if (line.startsWith("## ")) {
			const branchPart = line.slice(3);
			info.branch = branchPart.split("...")[0]?.trim() || fallbackBranch;
			const ahead = branchPart.match(/ahead (\d+)/);
			const behind = branchPart.match(/behind (\d+)/);
			info.ahead = ahead ? Number(ahead[1]) : 0;
			info.behind = behind ? Number(behind[1]) : 0;
			continue;
		}

		if (line.startsWith("??")) {
			info.untracked += 1;
			continue;
		}

		const x = line[0];
		const y = line[1];
		if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) info.conflicted += 1;
		if (x !== " " && x !== "?") info.staged += 1;
		if (y === "M") info.modified += 1;
		if (x === "M" && y === " ") info.modified += 1;
		if (x === "R" || y === "R") info.renamed += 1;
		if (x === "D" || y === "D") info.deleted += 1;
	}

	return info;
}

async function getGitInfo(pi: ExtensionAPI): Promise<GitInfo> {
	const inside = await pi.exec("git", ["rev-parse", "--is-inside-work-tree"], { timeout: 1000 });
	if (inside.code !== 0 || inside.stdout.trim() !== "true") return emptyGit;

	const [branchResult, statusResult, commonDirResult, gitDirResult] = await Promise.all([
		pi.exec("git", ["branch", "--show-current"], { timeout: 1000 }),
		pi.exec("git", ["status", "--porcelain=v1", "--branch"], { timeout: 1500 }),
		pi.exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { timeout: 1000 }),
		pi.exec("git", ["rev-parse", "--path-format=absolute", "--git-dir"], { timeout: 1000 }),
	]);

	if (statusResult.code !== 0) return emptyGit;
	const info = parsePorcelain(statusResult.stdout, branchResult.stdout.trim() || undefined);
	info.worktree = commonDirResult.code === 0 && gitDirResult.code === 0 && commonDirResult.stdout.trim() !== gitDirResult.stdout.trim();
	return info;
}

function getUsage(ctx: ExtensionContext): { tokens: number; cost: number } {
	let cost = 0;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message" && entry.message.role === "assistant") {
			const message = entry.message as AssistantMessage;
			cost += message.usage?.cost?.total ?? 0;
		}
	}

	return {
		tokens: ctx.getContextUsage()?.tokens ?? 0,
		cost,
	};
}

function renderGitStatus(git: GitInfo, theme: ExtensionContext["ui"]["theme"]): string {
	if (!git.inside) return "";

	const parts: string[] = [];
	if (git.worktree) parts.push(theme.fg("success", "⛓"));
	if (git.staged) parts.push(theme.fg("success", ` ${git.staged}`));
	if (git.modified) parts.push(theme.fg("warning", ` ${git.modified}`));
	if (git.renamed) parts.push(theme.fg("thinkingLow", ` ${git.renamed}`));
	if (git.deleted) parts.push(theme.fg("error", ` ${git.deleted}`));
	if (git.untracked) parts.push(theme.fg("success", ` ${git.untracked}`));
	if (git.conflicted) parts.push(theme.fg("thinkingMedium", ` ${git.conflicted}`));
	if (git.ahead && git.behind) parts.push(theme.fg("thinkingHigh", ` ${git.ahead}  ${git.behind}`));
	else if (git.ahead) parts.push(theme.fg("thinkingMedium", ` ${git.ahead}`));
	else if (git.behind) parts.push(theme.fg("thinkingHigh", ` ${git.behind}`));

	return parts.length ? ` ${parts.join(" ")}` : "";
}

export default function (pi: ExtensionAPI) {
	let enabled = true;
	let git: GitInfo = emptyGit;
	let footerInterval: ReturnType<typeof setInterval> | null = null;
	let refreshInFlight = false;

	const refreshGit = async (ctx: ExtensionContext, requestRender?: () => void) => {
		if (refreshInFlight) return;
		refreshInFlight = true;
		try {
			git = await getGitInfo(pi);
			requestRender?.();
		} finally {
			refreshInFlight = false;
		}
	};

	const installFooter = (ctx: ExtensionContext) => {
		if (!ctx.hasUI || !enabled) return;

		ctx.ui.setFooter((tui, _theme, footerData) => {
			const unsubscribeBranch = footerData.onBranchChange(() => {
				void refreshGit(ctx, () => tui.requestRender());
			});

			void refreshGit(ctx, () => tui.requestRender());
			footerInterval = setInterval(() => {
				void refreshGit(ctx, () => tui.requestRender());
			}, REFRESH_MS);

			return {
				dispose() {
					unsubscribeBranch();
					if (footerInterval) {
						clearInterval(footerInterval);
						footerInterval = null;
					}
				},
				invalidate() {},
				render(width: number): string[] {
					const thinking = pi.getThinkingLevel();
					return [renderFooterLineWithThinking(ctx, git, width, thinking, footerData)];
				},
			};
		});
	};

	pi.registerCommand("starship-footer", {
		description: "Toggle Starship-style pi footer",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			if (enabled) {
				installFooter(ctx);
				ctx.ui.notify("Starship footer enabled", "info");
			} else {
				ctx.ui.setFooter(undefined);
				ctx.ui.notify("Default footer restored", "info");
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		installFooter(ctx);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		ctx.ui.setFooter(undefined);
		if (footerInterval) {
			clearInterval(footerInterval);
			footerInterval = null;
		}
	});

	function renderFooterLineWithThinking(ctx: ExtensionContext, git: GitInfo, width: number, thinking: string, footerData?: Parameters<Parameters<ExtensionContext["ui"]["setFooter"]>[0]>[2]): string {
		const theme = ctx.ui.theme;
		const directory = theme.fg("accent", formatDirectory(ctx.cwd));
		const branch = git.inside && git.branch ? ` ${theme.fg("dim", "on")} ${theme.fg("thinkingHigh", ` ${git.branch}`)}` : "";
		const left = `${directory}${branch}`;

		const usage = getUsage(ctx);
		const model = ctx.model ? ctx.model.id : "no model";
		const sessionName = ctx.sessionManager.getSessionName();

		// Short, readable model name: strip Fireworks-style path prefixes
		const shortModelName = (id: string): string => {
			const lastSegment = id.split("/").pop() ?? id;
			return lastSegment;
		};
		const providerLabel = ctx.model?.provider ?? "";
		const modelLabel = ctx.model ? `${providerLabel}/${shortModelName(ctx.model.id)}` : "no model";

		const modes = loadModes(ctx.cwd);
		const inferred = inferMode(
			modes,
			ctx.model?.provider,
			ctx.model?.id,
			thinking,
			Boolean(ctx.model?.reasoning),
		);

		let modeBadge: string;
		if (inferred) {
			const color = inferred.spec.color ?? "accent";
			let styled: string;
			try {
				styled = theme.fg(color as never, theme.bold(inferred.name));
			} catch {
				styled = theme.fg("accent", theme.bold(inferred.name));
			}
			modeBadge = styled;
		} else {
			modeBadge = theme.fg("warning", theme.bold(`${model}:${thinking || "off"}`));
		}

		// Read vim mode from extension statuses if pi-vim (or another extension) exposes it
		const vimMode = footerData?.getExtensionStatuses().get("pi-vim");
		const vimModeStr = vimMode ? theme.fg("accent", theme.bold(vimMode)) : undefined;

		const rightParts = [
			sessionName ? theme.fg("muted", sessionName) : undefined,
			modeBadge,
			theme.fg("dim", modelLabel),
			ctx.model?.reasoning ? theme.fg("muted", thinking || "off") : undefined,
			vimModeStr,
			usage.tokens ? theme.fg("muted", `${formatNumber(usage.tokens)} ctx`) : undefined,
			theme.fg("muted", formatMoney(usage.cost)),
		].filter(Boolean) as string[];
		const right = rightParts.join(theme.fg("dim", " · "));

		const available = width - visibleWidth(left) - visibleWidth(right);
		if (available >= 1) {
			return truncateToWidth(left + " ".repeat(available) + right, width);
		}

		const truncatedRight = truncateToWidth(right, Math.min(width, Math.max(20, Math.floor(width * 0.45))), "…");
		const truncatedLeft = truncateToWidth(left, Math.max(0, width - visibleWidth(truncatedRight) - 1), "…");
		const padding = " ".repeat(Math.max(1, width - visibleWidth(truncatedLeft) - visibleWidth(truncatedRight)));
		return truncateToWidth(truncatedLeft + padding + truncatedRight, width);
	}
}
