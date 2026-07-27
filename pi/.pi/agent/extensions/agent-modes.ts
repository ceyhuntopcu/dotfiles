import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONFIG_FILE_NAME = "agent-modes.json";
const WIDGET_ID = "agent-mode";

type ToolPolicy = "all" | "read-only";

type ModeSpec = {
	label: string;
	color: string;
	instructions: string;
	toolPolicy: ToolPolicy;
	disabledTools?: string[];
};

type ModesFile = {
	version: 1;
	currentMode: string;
	modes: Record<string, ModeSpec>;
};

const DEFAULT_MODES: ModesFile = {
	version: 1,
	currentMode: "default",
	modes: {
		default: {
			label: "Default",
			color: "neutral",
			toolPolicy: "all",
			instructions: "Default coding-agent behavior. You may use any available tool when it helps satisfy the user's request.",
		},
		plan: {
			label: "Plan",
			color: "yellow",
			toolPolicy: "read-only",
			instructions:
				"Focus on producing a clear plan artifact from the conversation. Research and inspect as needed, ask clarifying questions when requirements are ambiguous, and avoid making code or file changes. The plan artifact should include goals, assumptions, ordered steps, risks, and validation criteria.",
		},
		ask: {
			label: "Ask",
			color: "green",
			toolPolicy: "read-only",
			instructions:
				"Focus on answering questions and researching the codebase, APIs, frameworks, and documentation. Prefer reading, searching, and explaining over changing files. Do not implement code changes unless the user switches modes or explicitly asks to leave Ask mode.",
		},
		debugging: {
			label: "Debug",
			color: "red",
			toolPolicy: "all",
			instructions:
				"Focus on troubleshooting. Reproduce the issue, inspect symptoms, form hypotheses, gather evidence with targeted commands or reads, isolate the root cause, and propose or apply fixes when requested.",
		},
	},
};

const READONLY_MUTATING_TOOLS = new Set(["edit", "write"]);
const READONLY_MUTATING_PREFIXES = [
	"linear_save_",
	"linear_create_",
	"linear_delete_",
	"linear_prepare_",
	"paper_write_",
	"paper_create_",
	"paper_delete_",
	"paper_set_",
	"paper_update_",
	"paper_duplicate_",
	"paper_move_",
];

const DESTRUCTIVE_BASH_PATTERNS = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bchgrp\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,
	/(^|[^<])>(?!>)/,
	/>>/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bsudo\b/i,
	/\bsu\b/i,
	/\bkill\b/i,
	/\bpkill\b/i,
	/\bkillall\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
];

const READONLY_BASH_PATTERNS = [
	/^\s*cat\b/,
	/^\s*head\b/,
	/^\s*tail\b/,
	/^\s*less\b/,
	/^\s*more\b/,
	/^\s*grep\b/,
	/^\s*find\b/,
	/^\s*ls\b/,
	/^\s*pwd\b/,
	/^\s*echo\b/,
	/^\s*printf\b/,
	/^\s*wc\b/,
	/^\s*sort\b/,
	/^\s*uniq\b/,
	/^\s*diff\b/,
	/^\s*file\b/,
	/^\s*stat\b/,
	/^\s*du\b/,
	/^\s*df\b/,
	/^\s*tree\b/,
	/^\s*which\b/,
	/^\s*whereis\b/,
	/^\s*type\b/,
	/^\s*env\b/,
	/^\s*printenv\b/,
	/^\s*uname\b/,
	/^\s*whoami\b/,
	/^\s*id\b/,
	/^\s*date\b/,
	/^\s*uptime\b/,
	/^\s*ps\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get|grep|ls-)/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	/^\s*pnpm\s+(list|view|info|why|audit)/i,
	/^\s*node\s+--version/i,
	/^\s*python\w*\s+--version/i,
	/^\s*curl\s/i,
	/^\s*wget\s+-O\s*-/i,
	/^\s*jq\b/,
	/^\s*sed\s+-n/i,
	/^\s*awk\b/,
	/^\s*rg\b/,
	/^\s*fd\b/,
	/^\s*bat\b/,
	/^\s*eza\b/,
];

function expandUserPath(p: string): string {
	if (p === "~") return os.homedir();
	if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
	return p;
}

function getGlobalAgentDir(): string {
	const configured = process.env.PI_CODING_AGENT_DIR;
	return configured ? expandUserPath(configured) : path.join(os.homedir(), ".pi", "agent");
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function atomicWriteJson(filePath: string, data: ModesFile): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
	await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
	await fs.rename(tmp, filePath);
}

function normalizeToolPolicy(value: unknown): ToolPolicy {
	return value === "read-only" ? "read-only" : "all";
}

function normalizeModeSpec(name: string, raw: unknown): ModeSpec {
	const fallback = DEFAULT_MODES.modes[name] ?? DEFAULT_MODES.modes.default;
	const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	return {
		label: typeof obj.label === "string" && obj.label.trim() ? obj.label.trim() : fallback.label,
		color: typeof obj.color === "string" && obj.color.trim() ? obj.color.trim() : fallback.color,
		instructions:
			typeof obj.instructions === "string" && obj.instructions.trim()
				? obj.instructions.trim()
				: fallback.instructions,
		toolPolicy: normalizeToolPolicy(obj.toolPolicy ?? fallback.toolPolicy),
		disabledTools: Array.isArray(obj.disabledTools) ? obj.disabledTools.filter((x): x is string => typeof x === "string") : undefined,
	};
}

function normalizeModesFile(parsed: unknown): ModesFile {
	const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
	const rawModes = obj.modes && typeof obj.modes === "object" ? (obj.modes as Record<string, unknown>) : {};
	const modes: Record<string, ModeSpec> = {};

	for (const [name, spec] of Object.entries({ ...DEFAULT_MODES.modes, ...rawModes })) {
		modes[name] = normalizeModeSpec(name, spec);
	}

	const currentMode = typeof obj.currentMode === "string" && modes[obj.currentMode] ? obj.currentMode : DEFAULT_MODES.currentMode;
	return { version: 1, currentMode, modes };
}

async function readModesFile(filePath: string): Promise<ModesFile> {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		return normalizeModesFile(JSON.parse(raw));
	} catch {
		return normalizeModesFile(DEFAULT_MODES);
	}
}

async function resolveModesPath(ctx: ExtensionContext): Promise<string> {
	const projectPath = path.join(ctx.cwd, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
	if (ctx.isProjectTrusted() && (await fileExists(projectPath))) return projectPath;
	return path.join(getGlobalAgentDir(), CONFIG_FILE_NAME);
}

function modeNames(data: ModesFile): string[] {
	return Object.keys(data.modes);
}

function getActiveMode(data: ModesFile): ModeSpec {
	return data.modes[data.currentMode] ?? data.modes.default;
}

function colorize(theme: Theme, color: string, text: string): string {
	const normalized = color.trim().toLowerCase();
	const colorMap: Record<string, string> = {
		neutral: "muted",
		gray: "muted",
		grey: "muted",
		muted: "muted",
		dim: "dim",
		text: "text",
		accent: "accent",
		yellow: "warning",
		warning: "warning",
		green: "success",
		success: "success",
		red: "error",
		error: "error",
	};
	const themeColor = colorMap[normalized] ?? "muted";
	return theme.fg(themeColor as Parameters<Theme["fg"]>[0], text);
}

function isReadOnlySafeCommand(command: string): boolean {
	const destructive = DESTRUCTIVE_BASH_PATTERNS.some((pattern) => pattern.test(command));
	const readonly = READONLY_BASH_PATTERNS.some((pattern) => pattern.test(command));
	return !destructive && readonly;
}

function isReadOnlyBlockedTool(toolName: string, mode: ModeSpec): boolean {
	if (mode.disabledTools?.includes(toolName)) return true;
	if (READONLY_MUTATING_TOOLS.has(toolName)) return true;
	return READONLY_MUTATING_PREFIXES.some((prefix) => toolName.startsWith(prefix));
}

export default function agentModesExtension(pi: ExtensionAPI): void {
	let configPath = "";
	let modesFile: ModesFile = normalizeModesFile(DEFAULT_MODES);

	async function loadModes(ctx: ExtensionContext): Promise<ModesFile> {
		configPath = await resolveModesPath(ctx);
		modesFile = await readModesFile(configPath);
		if (!(await fileExists(configPath))) {
			await atomicWriteJson(configPath, modesFile);
		}
		return modesFile;
	}

	async function saveModes(ctx: ExtensionContext): Promise<void> {
		if (!configPath) configPath = await resolveModesPath(ctx);
		await atomicWriteJson(configPath, modesFile);
	}

	function updateModeLine(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		const currentMode = getActiveMode(modesFile);
		ctx.ui.setWidget(
			WIDGET_ID,
			(_tui, theme) => ({
				invalidate() {},
				render(width: number): string[] {
					if (modesFile.currentMode === "default") return [" "];
					const label = currentMode.label || modesFile.currentMode;
					return [truncateToWidth(colorize(theme, currentMode.color, theme.bold(label)), width)];
				},
			}),
			{ placement: "belowEditor" },
		);
	}

	async function setMode(ctx: ExtensionContext, modeName: string): Promise<boolean> {
		await loadModes(ctx);
		if (!modesFile.modes[modeName]) {
			if (ctx.hasUI) ctx.ui.notify(`Unknown mode "${modeName}". Available: ${modeNames(modesFile).join(", ")}`, "warning");
			return false;
		}

		modesFile.currentMode = modeName;
		await saveModes(ctx);
		updateModeLine(ctx);
		return true;
	}

	async function selectMode(ctx: ExtensionContext): Promise<void> {
		await loadModes(ctx);
		const choices = modeNames(modesFile);
		const choice = await ctx.ui.select(`Mode (current: ${modesFile.currentMode})`, choices);
		if (!choice) return;
		await setMode(ctx, choice);
	}

	async function cycleMode(ctx: ExtensionContext): Promise<void> {
		await loadModes(ctx);
		const names = modeNames(modesFile);
		if (names.length === 0) return;
		const currentIndex = Math.max(0, names.indexOf(modesFile.currentMode));
		const next = names[(currentIndex + 1) % names.length] ?? names[0];
		if (next) await setMode(ctx, next);
	}

	pi.registerCommand("agent-mode", {
		description: "Select agent mode",
		handler: async (args, ctx) => {
			const modeName = args.trim();
			if (!modeName) {
				await selectMode(ctx);
				return;
			}
			if (modeName === "list" || modeName === "show") {
				await loadModes(ctx);
				const lines = modeNames(modesFile).map((name) => `${name === modesFile.currentMode ? "*" : " "} ${name}`);
				ctx.ui.notify(`Modes from ${configPath}:\n${lines.join("\n")}`, "info");
				return;
			}
			await setMode(ctx, modeName);
		},
	});

	pi.registerShortcut("ctrl+t", {
		description: "Cycle agent mode",
		handler: async (ctx) => {
			await cycleMode(ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		await loadModes(ctx);
		updateModeLine(ctx);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		await loadModes(ctx);
		updateModeLine(ctx);

		const mode = getActiveMode(modesFile);
		if (modesFile.currentMode === "default") return;

		const readOnlyNote =
			mode.toolPolicy === "read-only"
				? "\n\nTool policy: read-only. Do not modify files or external resources; use read/search/inspection tools only."
				: "";

		return {
			systemPrompt: `${event.systemPrompt}\n\n[ACTIVE MODE: ${mode.label || modesFile.currentMode}]\n${mode.instructions}${readOnlyNote}`,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		await loadModes(ctx);
		const mode = getActiveMode(modesFile);
		if (mode.toolPolicy !== "read-only") return;

		if (event.toolName === "bash") {
			const command = typeof event.input.command === "string" ? event.input.command : "";
			if (!isReadOnlySafeCommand(command)) {
				return {
					block: true,
					reason: `${mode.label} mode blocks non-read-only bash commands. Switch to Default or Debug mode to run it.\nCommand: ${command}`,
				};
			}
			return;
		}

		if (isReadOnlyBlockedTool(event.toolName, mode)) {
			return {
				block: true,
				reason: `${mode.label} mode blocks mutating tool "${event.toolName}". Switch to Default or Debug mode to use it.`,
			};
		}
	});

	pi.on("session_shutdown", (_event, ctx) => {
		ctx.ui.setWidget(WIDGET_ID, undefined);
	});
}
