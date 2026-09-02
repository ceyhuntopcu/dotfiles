/**
 * pi-tidy-tools — tidy, reason-first tool output for pi.
 *
 * Model (per-tool 2-line block): each built-in tool renders its OWN compact
 * block inline in the transcript, in execution order, via the tool-renderer
 * path (renderShell: "self"). No collector, no above-editor widget, no
 * turn-end stamping — pi already renders tool components inline; we just make
 * them tight.
 *
 *     󰏫 edit put reasoning on line 1, detail on line 2
 *       index.ts → +28/-14
 *      bash 󰔟 run the typecheck
 *       npx tsc --noEmit → 2s
 *
 * Line 1: {icon} {name} {pending/error status?} {reasoning headline}
 * Line 2:   {dim arg/command detail} → {colored summary}
 *
 * Why this beats the spacer floor: pi bakes a Spacer(1) inside every tool's
 * ToolExecutionComponent, so N default cards = N blank lines. BUT in
 * `renderShell: "self"` mode, ToolExecutionComponent.render() skips that baked
 * spacer — it emits ONE leading blank + the self-rendered content, and returns
 * [] when content is empty. So each tool = 1 separator + 2 tight lines.
 *
 * `reasoning`: built-in tools have no reasoning of their own, so we inject a
 * REQUIRED `reasoning` string param into each wrapped tool. The model must fill
 * it with the GOAL/intent behind the call (not the file or command, which are
 * already shown); we strip it before delegating and render it as the line-1
 * headline. If ever absent, line 1 falls back to the arg detail.
 *
 * C-o (app.tools.expand) expansion: renderResult receives `{ expanded }`.
 * Collapsed shows the 2-line block; expanded appends the tool's real output —
 * a colored line-numbered diff for code edits (details.diff), else raw content.
 *
 * Foreign tools are left alone unless their owning extension opts into the
 * synchronous `pi-tidy-tools:decorate-tool` event before registration. This
 * preserves the original executor while allowing the same schema and renderer
 * composition used for built-ins.
 *
 * Usage:  pi -e ./index.ts     (or install as a pi package)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
} from "@earendil-works/pi-coding-agent";
import { Box, Container, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import {
	CONFIG_PATH,
	loadTidyBackground,
	loadTidyMode,
	loadTidyState,
	saveTidyBackground,
	saveTidyEnabled,
	saveTidyMode,
	type TidyMode,
} from "./config.js";
import {
	BOLD,
	CYAN,
	DIM,
	GREEN,
	MAGENTA,
	RED,
	RESET,
	grepResultCounts,
	nonEmptyLineCount,
	shortPath,
	style,
} from "./render.js";
import {
	composeSourceTool,
	createDiffingWriteTool,
	stripReasoning,
	withReasoning,
	type SourceToolDefinition,
} from "./tool-composition.js";
import {
	CLEAN_TOOL_DECORATION_EVENT,
	isCleanToolDecorationRequest,
	type CleanToolDecorationRequest,
} from "./tool-decoration.js";
import {
	concisePiFffStatus,
	createPiFffIntegrationController,
	type PiFffIntegrationController,
} from "./pi-fff/controller.js";
import type { PiFffLifecyclePreview } from "./pi-fff/integration.js";

export { withReasoning } from "./tool-composition.js";
export {
	CLEAN_TOOL_DECORATION_EVENT,
	CLEAN_TOOL_DECORATION_VERSION,
	requestCleanToolDecoration,
} from "./tool-decoration.js";

/** Match Pi's one-column transcript padding in self-rendered shells. */
const OUTPUT_PAD = " ";

/** Hanging indent for detail and expanded continuation lines. */
const INDENT = "  ";

/** Collapse whitespace/newlines to one line (width-based truncation happens at render). */
function oneLine(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

/** Fit a rendered line while preserving its useful result tail. */
export function fitToolLine(line: string, width: number): string {
	const max = Math.max(1, width);
	if (visibleWidth(line) <= max) return line;
	const arrowIndex = line.indexOf("→");
	if (arrowIndex < 0) return truncateToWidth(line, max, "…");

	const tail = line.slice(arrowIndex);
	const tailWidth = visibleWidth(tail);
	if (tailWidth >= max) return truncateToWidth(tail, max, "…");
	const head = line.slice(0, arrowIndex).trimEnd();
	return `${truncateToWidth(head, max - tailWidth - 1, "…")} ${tail}`;
}

/**
 * A width-aware component: truncates each pre-composed (ANSI-colored) line to the
 * live viewport width so nothing soft-wraps. Re-flows on resize
 * because render(width) is re-invoked by the TUI.
 */
class WidthAwareLines {
	constructor(private readonly source: string[] | (() => string[])) {}
	invalidate(): void {}
	render(width: number): string[] {
		const max = Math.max(1, width);
		const lines = typeof this.source === "function" ? this.source() : this.source;
		return lines.map((line) => fitToolLine(`${OUTPUT_PAD}${line}`, max));
	}
}

type ToolBackground = "toolPendingBg" | "toolSuccessBg" | "toolErrorBg";

interface ToolBackgroundTheme {
	bg(color: ToolBackground, text: string): string;
}

/** Paint every ANSI-reset-delimited segment so raw palette resets cannot clear the row background. */
function withToolBackground(
	component: Component,
	theme: ToolBackgroundTheme,
	color: ToolBackground,
	enabled: boolean,
): Component {
	if (!enabled) return component;
	const box = new Box(0, 0, (line) => line
		.split(RESET)
		.map((segment) => theme.bg(color, segment))
		.join(RESET));
	box.addChild(component);
	return box;
}

function safeUrlDetail(value: string): string {
	try {
		const url = new URL(value);
		url.username = "";
		url.password = "";
		return oneLine(url.toString());
	} catch {
		return oneLine(value.replace(/\/\/[^/@\s]+@/, "//***@"));
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${Number((bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0))}KB`;
	return `${Number((bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0))}MB`;
}

/** Dim line-2 detail when the model gave no `reasoning`. Always ONE line. */
function argDetail(name: string, args: Record<string, unknown>): string {
	if (name === "bash" && typeof args.command === "string") return oneLine(args.command);
	if ((name === "grep" || name === "find") && typeof args.pattern === "string") {
		return oneLine(typeof args.path === "string" ? `${args.pattern} in ${args.path}` : String(args.pattern));
	}
	if (name === "webfetch" && typeof args.url === "string") return safeUrlDetail(args.url);
	if (name === "websearch" && typeof args.query === "string") return oneLine(args.query);
	if (name === "executor_execute") return "TypeScript";
	if (name === "executor_skills") return typeof args.name === "string" ? args.name : "catalog";
	if (name === "executor_resume") {
		const id = typeof args.executionId === "string" ? args.executionId : "execution";
		return typeof args.action === "string" ? `${id} · ${args.action}` : id;
	}
	if (name === "subagent_spawn" && typeof args.name === "string") {
		return typeof args.harness === "string" ? `${args.name} · ${args.harness}` : args.name;
	}
	if (Array.isArray(args.ids)) return args.ids.filter((id): id is string => typeof id === "string").join(", ");
	if (typeof args.id === "string") return args.id;
	if (typeof args.path === "string") return oneLine(args.path);
	if (typeof args.name === "string") return oneLine(args.name);
	return "";
}

function resultDetails(result: unknown): Record<string, unknown> {
	const details = (result as { details?: unknown } | undefined)?.details;
	return details && typeof details === "object" && !Array.isArray(details)
		? details as Record<string, unknown>
		: {};
}

function summarizeCooperativeTool(name: string, result: unknown, elapsedMs: number): string | undefined {
	const details = resultDetails(result);
	if (name === "subagent_spawn") {
		return typeof details.id === "string" ? `${GREEN}${details.id}${RESET}` : `${GREEN}spawned${RESET}`;
	}
	if (name === "subagent_wait" || name === "subagent_cancel") {
		const results = Array.isArray(details.results) ? details.results : [];
		const count = results.length;
		const verb = name === "subagent_wait" ? "settled" : "cancelled";
		return `${GREEN}${count}${RESET} ${DIM}${count === 1 ? "subagent" : "subagents"} ${verb}${RESET}`;
	}
	if (name === "subagent_check") {
		return typeof details.status === "string" ? `${GREEN}${details.status}${RESET}` : `${GREEN}checked${RESET}`;
	}
	if (name === "subagent_list") {
		const count = Array.isArray(details.subagents) ? details.subagents.length : 0;
		return `${GREEN}${count}${RESET} ${DIM}${count === 1 ? "subagent" : "subagents"}${RESET}`;
	}
	if (name === "webfetch") {
		const status = typeof details.status === "number" && details.status > 0 ? String(details.status) : "fetched";
		const metadata = [
			typeof details.mime === "string" && details.mime ? details.mime : undefined,
			typeof details.bytes === "number" && details.bytes > 0 ? formatBytes(details.bytes) : undefined,
		].filter((value): value is string => value !== undefined);
		return `${GREEN}${status}${RESET}${metadata.length ? ` ${DIM}${metadata.join(" · ")}${RESET}` : ""}`;
	}
	if (name === "websearch") {
		const count = typeof details.resultCount === "number" ? details.resultCount : 0;
		const provider = typeof details.provider === "string" && details.provider ? details.provider : undefined;
		return `${GREEN}${count} ${count === 1 ? "result" : "results"}${RESET}${provider ? ` ${DIM}· ${provider}${RESET}` : ""}`;
	}
	if (name === "executor_execute") {
		const paused = textFromResult(result).startsWith("Execution paused:");
		return paused
			? `${MAGENTA}paused${RESET} ${DIM}in ${formatElapsed(elapsedMs)}${RESET}`
			: `${GREEN}done${RESET} ${DIM}in ${formatElapsed(elapsedMs)}${RESET}`;
	}
	if (name === "executor_skills") return `${GREEN}loaded${RESET}`;
	if (name === "executor_resume") return `${GREEN}resumed${RESET} ${DIM}in ${formatElapsed(elapsedMs)}${RESET}`;
	return undefined;
}

/** Compact elapsed time for an in-progress tool. */
export function formatElapsed(milliseconds: number): string {
	if (milliseconds < 1000) return "<1s";
	const seconds = Math.floor(milliseconds / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	if (minutes < 60) return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${(minutes % 60).toString().padStart(2, "0")}m`;
}

/** Colored result summary from a finished tool result. */
function summarize(
	name: string,
	result: any,
	isError: boolean,
	args: Record<string, unknown> = {},
	elapsedMs = 0,
): string {
	const text = textFromResult(result);
	if (isError) {
		if (name === "bash") return `${RED}error${RESET} ${DIM}in ${formatElapsed(elapsedMs)}${RESET}`;
		return `${RED}${text.split("\n")[0] || "error"}${RESET}`;
	}
	if (name === "read") return `${GREEN}${text.split("\n").length} lines${RESET}`;
	if (name === "write") {
		if (typeof args.content === "string" && !args.content.includes("\0")) {
			const lines = args.content.length === 0
				? 0
				: (args.content.match(/\n/g)?.length ?? 0) + (args.content.endsWith("\n") ? 0 : 1);
			return `${GREEN}${lines}${RESET} ${DIM}${lines === 1 ? "line" : "lines"}${RESET}`;
		}
		const bytes = text.match(/wrote (\d+) bytes/i)?.[1];
		return bytes ? `${GREEN}${bytes}b${RESET}` : `${GREEN}written${RESET}`;
	}
	if (name === "edit") {
		const diff = result?.details?.diff as string | undefined;
		if (!diff) return `${GREEN}applied${RESET}`;
		let add = 0;
		let del = 0;
		for (const l of diff.split("\n")) {
			if (l.startsWith("+") && !l.startsWith("+++")) add++;
			if (l.startsWith("-") && !l.startsWith("---")) del++;
		}
		return `${GREEN}+${add}${RESET}${DIM}/${RESET}${RED}-${del}${RESET}`;
	}
	if (name === "bash") {
		const m = text.match(/exit code: (\d+)/);
		const exit = m ? Number(m[1]) : null;
		const status = exit && exit !== 0 ? `${RED}exit ${exit}` : `${GREEN}done`;
		return `${status}${RESET} ${DIM}in ${formatElapsed(elapsedMs)}${RESET}`;
	}
	const cooperativeSummary = summarizeCooperativeTool(name, result, elapsedMs);
	if (cooperativeSummary) return cooperativeSummary;
	if (name === "grep") {
		const { matches: count, files } = grepResultCounts(text);
		const matchLabel = count === 1 ? "match" : "matches";
		const fileLabel = files === 1 ? "file" : "files";
		return `${GREEN}${count} ${matchLabel}${RESET} ${DIM}in${RESET} ${CYAN}${files} ${fileLabel}${RESET}`;
	}
	const count = nonEmptyLineCount(text);
	const noun = name === "find" ? "files" : name === "ls" ? "entries" : "results";
	return `${DIM}${count} ${noun}${RESET}`;
}

/** Pull the first text block out of a tool result / partial (shape varies). */
function textFromResult(r: any): string {
	const content = r?.content ?? r?.partialResult?.content;
	if (Array.isArray(content)) {
		const c = content.find((x: any) => x?.type === "text");
		if (c?.text) return c.text;
	}
	if (typeof r?.output === "string") return r.output;
	if (typeof r?.error === "string") return r.error;
	if (typeof r?.message === "string") return r.message;
	if (typeof r?.details?.error === "string") return r.details.error;
	return "";
}

/** Replace tabs with painted cells using stops relative to the code payload. */
function expandTabs(text: string): string {
	let column = 0;
	let expanded = "";
	for (const character of text) {
		if (character === "\t") {
			const spaces = 8 - (column % 8);
			expanded += " ".repeat(spaces);
			column += spaces;
		} else {
			expanded += character;
			column += visibleWidth(character);
		}
	}
	return expanded;
}

/** Keep line-number prefixes out of edit payload tab-stop calculations. */
function expandDiffTabs(line: string): string {
	const numbered = line.match(/^([ +\-]\s*\d+ )(.*)$/);
	return numbered ? `${numbered[1]}${expandTabs(numbered[2])}` : expandTabs(line);
}

/** Colorize a unified/line-numbered diff string (edit tool's details.diff). */
function colorizeDiff(diff: string): string[] {
	return diff.split("\n").map((rawLine) => {
		const line = expandDiffTabs(rawLine);
		if (line.startsWith("+") && !line.startsWith("+++")) return `${GREEN}${line}${RESET}`;
		if (line.startsWith("-") && !line.startsWith("---")) return `${RED}${line}${RESET}`;
		if (line.startsWith("@@")) return `${CYAN}${line}${RESET}`;
		return `${DIM}${line}${RESET}`;
	});
}

/** A file change captured during a turn, for the `/diff` recap. */
export interface TurnDiff {
	tool: string; // "edit" | "write"
	path: string;
	diff: string; // raw details.diff (may be empty for whole-file writes)
}

/** Render a set of turn diffs as colored lines with per-file headers. */
function renderTurnDiffs(diffs: TurnDiff[]): string[] {
	const lines: string[] = [];
	diffs.forEach((d, i) => {
		if (i > 0) lines.push("");
		const { icon, color } = style(d.tool);
		lines.push(`${color}${icon} ${BOLD}${shortPath(d.path)}${RESET}`);
		if (d.diff.trim()) lines.push(...colorizeDiff(d.diff.replace(/\s+$/, "")));
		else lines.push(`${DIM}(new file / full overwrite — no line diff)${RESET}`);
	});
	return lines;
}

/** Full `/diff` recap block — same lines the command posts into the transcript. */
export function buildTurnDiffBlock(diffs: TurnDiff[]): string[] {
	const n = diffs.length;
	const header = `${MAGENTA} ${BOLD}last turn diff${RESET} ${DIM}(${n} file${n === 1 ? "" : "s"})${RESET}`;
	return [header, ...renderTurnDiffs(diffs)];
}

/**
 * Build the expanded (C-o) continuation lines for a settled tool result:
 *   - bash: the full multi-line command input, then its output
 *   - edit/write: the colored line-numbered diff when present
 *   - otherwise: the raw result text
 * Each line is prefixed with the hanging INDENT.
 */
function expandedLines(name: string, args: Record<string, unknown>, result: any): string[] {
	const out: string[] = [];

	// bash: show the full command (collapsed line 2 is truncated to one line).
	if (name === "bash" && typeof args.command === "string") {
		const cmdLines = args.command.replace(/\s+$/, "").split("\n");
		cmdLines.forEach((cl, i) => {
			const prefix = i === 0 ? `${CYAN}$ ${RESET}` : `${DIM}  ${RESET}`;
			out.push(`${INDENT}${prefix}${CYAN}${cl}${RESET}`);
		});
	}

	// Whole-file writes do not provide a useful diff. Show the actual written
	// content instead of repeating the generic "Successfully wrote..." result.
	if (name === "write" && typeof args.content === "string") {
		if (args.content.length === 0) {
			out.push(`${INDENT}${DIM}(empty file)${RESET}`);
			return out;
		}
		const splitLines = args.content.split("\n");
		const contentLines = args.content.endsWith("\n") ? splitLines.slice(0, -1) : splitLines;
		const lineNumberWidth = String(contentLines.length).length;
		contentLines.forEach((line, index) => {
			const lineNumber = String(index + 1).padStart(lineNumberWidth, " ");
			out.push(`${INDENT}${DIM}${lineNumber} ${RESET}${expandTabs(line)}`);
		});
		return out;
	}

	// Prefer the structured diff over the generic "Successfully replaced..." text.
	const diff = result?.details?.diff as string | undefined;
	if (diff && diff.trim()) {
		for (const dl of colorizeDiff(diff)) out.push(`${INDENT}${dl}`);
		return out;
	}

	const text = textFromResult(result).replace(/\s+$/, "");
	if (text) for (const raw of text.split("\n")) out.push(`${INDENT}${DIM}${raw}${RESET}`);
	return out;
}

/**
 * Build the rendered lines for one settled tool call. Shared by the live
 * renderResult and the demo generator so the demo shows REAL output, never
 * hand-typed ANSI. `args` includes the model's `reasoning` (stripped here).
 */
export function buildToolBlock(
	name: string,
	args: Record<string, unknown>,
	result: any,
	opts: { isError?: boolean; isPartial?: boolean; expanded?: boolean; elapsedMs?: number; mode?: TidyMode } = {},
): string[] {
	const { isError = false, isPartial = false, expanded = false, elapsedMs = 0, mode = "default" } = opts;
	const { reasoning, rest } = stripReasoning(args ?? {});

	const status = isPartial ? ` ${DIM}󰔟${RESET}` : isError ? ` ${RED}󰅖${RESET}` : "";
	const summary = isPartial
		? `${DIM}${formatElapsed(elapsedMs)}${RESET}`
		: summarize(name, result, isError, rest, elapsedMs);

	const { icon, color } = style(name);
	const toolLabel = `${color}${icon} ${BOLD}${name}${RESET}${status}`;
	const headline = oneLine(reasoning || argDetail(name, rest));
	const detail = argDetail(name, rest);
	// Keep the target on failures too; width fitting preserves the useful error
	// tail while the command/path answers what actually failed.
	const line2 = !detail
		? `${INDENT}${DIM}→${RESET} ${summary}`
		: `${INDENT}${DIM}${detail}${RESET} ${DIM}→${RESET} ${summary}`;
	let lines: string[];
	if (mode === "reasoning") {
		lines = [`${toolLabel} ${headline} ${DIM}→${RESET} ${summary}`];
	} else if (mode === "result") {
		const resultDetail = !detail ? "" : ` ${DIM}${detail}${RESET}`;
		lines = [`${toolLabel}${resultDetail} ${DIM}→${RESET} ${summary}`];
	} else {
		lines = [
			`${toolLabel} ${headline}`,
			line2,
		];
	}
	if (!isPartial && (expanded || name === "edit" || name === "write" || name === "bash")) {
		lines.push(...expandedLines(name, rest, result));
	}
	return lines;
}

const DIFF_MSG_TYPE = "minimal-turn-diff";
const TIDY_COMPLETIONS = [
	"on", "off", "toggle", "status", "mode default", "mode reasoning", "mode result", "mode status",
	"background on", "background off", "background toggle", "background status",
	"pi-fff setup", "pi-fff status", "pi-fff teardown",
];

export interface TidyExtensionDependencies {
	cwd?: string;
	loadState?: typeof loadTidyState;
	loadMode?: typeof loadTidyMode;
	loadBackground?: typeof loadTidyBackground;
	createIntegration?: (pi: ExtensionAPI, cwd: string) => PiFffIntegrationController;
}

function previewText(preview: PiFffLifecyclePreview): string {
	return preview.changes.map((change) => `${change.scope}: ${change.settingsPath}\n${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`).join("\n");
}

export function createTidyExtension(dependencies: TidyExtensionDependencies = {}) {
	return async (pi: ExtensionAPI): Promise<void> => {
		const cwd = dependencies.cwd ?? process.cwd();
		const tidyState = (dependencies.loadState ?? loadTidyState)();
		const tidyMode = (dependencies.loadMode ?? loadTidyMode)();
		const tidyBackground = (dependencies.loadBackground ?? loadTidyBackground)();
		const integration = dependencies.createIntegration?.(pi, cwd)
			?? createPiFffIntegrationController({ pi: pi as any, cwd });
		let startupPlan: Awaited<ReturnType<PiFffIntegrationController["initialize"]>> | undefined;

		pi.registerCommand("tidy", {
			description: "Manage pi-tidy-tools state, layout, and pi-fff integration",
			getArgumentCompletions: (prefix) => TIDY_COMPLETIONS
				.filter((value) => value.startsWith(prefix.trim().toLowerCase()))
				.map((value) => ({ value, label: value })),
			handler: async (args, ctx) => {
				const action = args.trim().toLowerCase();
				const piFff = action.match(/^pi-fff (setup|status|teardown)$/);
				if (piFff) {
					const operation = piFff[1] as "setup" | "status" | "teardown";
					const result = await integration.run(operation, {
						enabled: tidyState.enabled,
						confirm: ctx.hasUI === false ? undefined : async (preview) => ctx.ui.confirm(`pi-fff ${preview.action}`, previewText(preview)),
						reload: operation === "status" ? undefined : async () => {
							ctx.ui.notify(`pi-fff ${operation} committed; reloading.`, "info");
							await ctx.reload();
							return;
						},
					});
					if (result.reload === "requested") return;
					ctx.ui.notify(result.message, result.level);
					return;
				}
				if (action === "status" || action === "mode status" || action === "background status") {
					const detail = tidyState.source === "environment" ? "PI_TIDY_TOOLS override"
						: tidyState.source === "file" ? CONFIG_PATH : "default enablement";
					const status = (await integration.run("status", { enabled: tidyState.enabled })).status;
					ctx.ui.notify(`pi-tidy-tools is ${tidyState.enabled ? "on" : "off"}, mode ${tidyMode}, background ${tidyBackground ? "on" : "off"} (${detail}).\n${concisePiFffStatus(status)}.`, "info");
					return;
				}
				const backgroundMatch = action.match(/^background (on|off|toggle)$/);
				if (backgroundMatch) {
					const background = backgroundMatch[1] === "toggle" ? !tidyBackground : backgroundMatch[1] === "on";
					if (background === tidyBackground) { ctx.ui.notify(`pi-tidy-tools background is already ${background ? "on" : "off"}.`, "info"); return; }
					try { await saveTidyBackground(background); }
					catch (error) { ctx.ui.notify(`Could not save ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`, "error"); return; }
					ctx.ui.notify(`pi-tidy-tools background set to ${background ? "on" : "off"}; reloading.`, "info");
					await ctx.reload(); return;
				}
				const modeMatch = action.match(/^mode (default|reasoning|result)$/);
				if (modeMatch) {
					const mode = modeMatch[1] as TidyMode;
					if (mode === tidyMode) { ctx.ui.notify(`pi-tidy-tools mode is already ${mode}.`, "info"); return; }
					try { await saveTidyMode(mode); }
					catch (error) { ctx.ui.notify(`Could not save ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`, "error"); return; }
					ctx.ui.notify(`pi-tidy-tools mode set to ${mode}; reloading.`, "info");
					await ctx.reload(); return;
				}
				if (action !== "on" && action !== "off" && action !== "toggle") {
					ctx.ui.notify("Usage: /tidy on|off|toggle|status|mode default|reasoning|result|status|background on|off|toggle|status|pi-fff setup|status|teardown", "warning"); return;
				}
				if (tidyState.source === "environment") { ctx.ui.notify("PI_TIDY_TOOLS overrides persistent settings; change or unset it first.", "warning"); return; }
				const enabled = action === "toggle" ? !tidyState.enabled : action === "on";
				if (enabled === tidyState.enabled) { ctx.ui.notify(`pi-tidy-tools is already ${enabled ? "on" : "off"}.`, "info"); return; }
				try { await saveTidyEnabled(enabled); }
				catch (error) { ctx.ui.notify(`Could not save ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`, "error"); return; }
				ctx.ui.notify(`pi-tidy-tools ${enabled ? "enabled" : "disabled"}; reloading.`, "info");
				await ctx.reload(); return;
			},
		});

		startupPlan = await integration.initialize(tidyState.enabled);
		if (startupPlan.notice) {
			const notice = startupPlan.notice;
			pi.on("session_start", (_event: unknown, ctx: any) => ctx.ui.notify(notice.message, notice.level));
		}
		if (!tidyState.enabled) return;

		let currentTurn: TurnDiff[] = [], lastTurn: TurnDiff[] = [];
		const pathByCallId = new Map<string, string>();
		const startedAtByCallId = new Map<string, number>();
		const elapsedTimerByCallId = new Map<string, ReturnType<typeof setInterval>>();
		const ownedTools = new Set<string>();

		const decorate = (source: SourceToolDefinition): SourceToolDefinition => {
			const name = source.name;
			const tool = composeSourceTool(source, { mode: tidyMode, reasoningGuideline: `Always pass a "reasoning" phrase to ${name}: state the GOAL/intent, not the file or command (those are shown already).` });
			ownedTools.add(name);
			return {
				...tool, name, renderShell: "self",
				renderCall: (args: any, _theme: any, context: any) => {
					if (!context?.isPartial) return new Container();
					const id = context.toolCallId as string;
					if (!elapsedTimerByCallId.has(id)) { const timer = setInterval(() => context.invalidate(), 1000); timer.unref?.(); elapsedTimerByCallId.set(id, timer); }
					let started = startedAtByCallId.get(id); if (started === undefined) { started = Date.now(); startedAtByCallId.set(id, started); }
					const rows = new WidthAwareLines(() => buildToolBlock(name, args ?? {}, {}, { isPartial: true, elapsedMs: Date.now() - started!, mode: tidyMode }));
					return withToolBackground(rows, _theme, "toolPendingBg", tidyBackground);
				},
				renderResult: (result: any, options: any, _theme: any, context: any) => {
					if (options?.isPartial) {
						// `subagent_wait` is a legitimately long-lived tool. Unlike
						// ordinary tool updates, its streamed result IS the UI: show
						// every child's live state and latest activity instead of the
						// generic opaque "Working..." placeholder.
						const progress = name === "subagent_wait" ? textFromResult(result) : "";
						if (!progress) return new Container();
						return withToolBackground(
							new WidthAwareLines(() => progress.split("\n")),
							_theme,
							"toolPendingBg",
							tidyBackground,
						);
					}
					const isError = context?.isError ?? result?.isError ?? false;
					const id = context?.toolCallId as string | undefined;
					const started = startedAtByCallId.get(id ?? ""), timer = elapsedTimerByCallId.get(id ?? "");
					if (timer) clearInterval(timer); elapsedTimerByCallId.delete(id ?? ""); startedAtByCallId.delete(id ?? "");
					const persisted = Number(result?.details?.piTidyElapsedMs);
					const elapsedMs = Number.isFinite(persisted) ? persisted : started === undefined ? 0 : Date.now() - started;
					const lines = buildToolBlock(name, context?.args ?? {}, result, { isError, expanded: options?.expanded ?? false, elapsedMs, mode: tidyMode });
					const rows = new WidthAwareLines(lines);
					return withToolBackground(rows, _theme, isError ? "toolErrorBg" : "toolSuccessBg", tidyBackground);
				},
			} as SourceToolDefinition;
		};

		pi.events?.on(CLEAN_TOOL_DECORATION_EVENT, (value: unknown) => {
			if (!isCleanToolDecorationRequest(value)) return;
			const request = value as CleanToolDecorationRequest;
			if (request.decorated) return;
			request.tool = decorate(request.tool);
			request.decorated = true;
		});

		pi.on("tool_execution_start", async (e: any) => {
			if (!startedAtByCallId.has(e.toolCallId)) startedAtByCallId.set(e.toolCallId, Date.now());
			if ((e.toolName === "edit" || e.toolName === "write") && typeof e?.args?.path === "string") pathByCallId.set(e.toolCallId, e.args.path);
		});
		pi.on("tool_execution_end", async (e: any) => {
			const timer = elapsedTimerByCallId.get(e.toolCallId); if (timer) clearInterval(timer); elapsedTimerByCallId.delete(e.toolCallId);
			if (e.toolName !== "edit" && e.toolName !== "write") return;
			const path = pathByCallId.get(e.toolCallId); pathByCallId.delete(e.toolCallId);
			if (!e.isError) currentTurn.push({ tool: e.toolName, path: path ?? "(unknown)", diff: (e?.result?.details?.diff as string | undefined) ?? "" });
		});
		pi.on("tool_result", async (e: any) => {
			if (!ownedTools.has(e.toolName)) return;
			const started = startedAtByCallId.get(e.toolCallId); if (started === undefined) return;
			return { details: {
				...(e.details ?? {}),
				piTidyElapsedMs: Math.max(0, Date.now() - started),
			} };
		});
		pi.on("turn_end", async () => {
			lastTurn = currentTurn; currentTurn = []; pathByCallId.clear(); startedAtByCallId.clear();
			pi.events?.emit("pi-ui:turn-diff", { files: new Set(lastTurn.map(change => change.path)).size });
			for (const timer of elapsedTimerByCallId.values()) clearInterval(timer); elapsedTimerByCallId.clear();
		});
		pi.on("session_shutdown", async () => {
			for (const timer of elapsedTimerByCallId.values()) clearInterval(timer);
			elapsedTimerByCallId.clear();
		});
		pi.registerMessageRenderer(DIFF_MSG_TYPE, (message: any) => new WidthAwareLines(message.details?.rows ?? String(message.content ?? "").split("\n")));
		const showLastTurnDiff = (ctx: any) => {
			if (!lastTurn.length) { ctx.ui.notify("No file changes recorded in the last turn.", "info"); return; }
			const rows = buildTurnDiffBlock(lastTurn); pi.sendMessage({ customType: DIFF_MSG_TYPE, content: rows.join("\n"), display: true, details: { rows } });
		};
		pi.registerCommand("diff", { description: "Show file changes (edit/write diffs) from the last turn", handler: async (_args, ctx) => showLastTurnDiff(ctx) });
		pi.registerShortcut("ctrl+shift+o", { description: "Show file changes from the last turn", handler: async (ctx) => showLastTurnDiff(ctx) });

		const sourceTools: Record<string, SourceToolDefinition> = {
			read: createReadTool(cwd) as SourceToolDefinition, write: createDiffingWriteTool(cwd) as SourceToolDefinition,
			edit: createEditTool(cwd) as SourceToolDefinition, bash: createBashTool(cwd) as SourceToolDefinition,
			grep: createGrepTool(cwd) as SourceToolDefinition, find: createFindTool(cwd) as SourceToolDefinition, ls: createLsTool(cwd) as SourceToolDefinition,
		};
		for (const [name, source] of Object.entries(sourceTools)) {
			if (startupPlan.skipTidyTools.has(name as "read" | "grep" | "find")) continue;
			pi.registerTool(decorate(source) as any);
		}
		startupPlan.commit(decorate);
	};
}

const extension = createTidyExtension();
export default extension;
