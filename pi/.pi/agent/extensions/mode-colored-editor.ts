/**
 * OMP-inspired composer chrome for pi's input editor.
 *
 * pi renders the editor as a plain top rule, the input rows, then a plain
 * bottom rule. This replaces those rules with a rounded, mode-colored frame
 * whose top edge carries model, location, repository, live activity badges,
 * and context budget. Session titles deliberately stay out of the composer.
 *
 * The input rows themselves are never touched: pi positions the cursor from
 * its own layout, so indenting or wrapping those rows would desync it.
 */
import { execFile } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, KeybindingsManager, Theme, ThemeColor, TUI } from "@earendil-works/pi-tui";
import { ModelDisplayState } from "./mode-colored-editor/model-display-state.ts";
import { createBranchReader } from "./omp-inspired-ui/git-branch.ts";
import {
    colorForMode,
    composeStatusLine,
    contextColor,
    formatContextRemaining,
    formatModelLabel,
    formatStatusBadges,
    loadModeNameForModel,
    renderContextGauge,
    shortenPath,
    type ChromeSegment,
    type StatusBadgeInputs,
} from "./omp-inspired-ui/ui-chrome.ts";

const ANSI_RE = /\u001b\[[0-9;]*m/g;
const TOP_LEFT = "╭";
const TOP_RIGHT = "╮";
const BOTTOM_LEFT = "╰";
const BOTTOM_RIGHT = "╯";
const RULE = "─";
const SEPARATOR = " › ";
const BRANCH_GLYPH = "⑂";
const MAX_PATH_WIDTH = 44;

/** True only for pi's own plain rule, never a scroll indicator carrying text. */
function isPlainRule(line: string): boolean {
    const stripped = line.replace(ANSI_RE, "");
    return stripped.length > 0 && [...stripped].every(char => char === RULE);
}

/** Pi replaces the plain top border with this marker once editor content scrolls. */
function isScrollIndicator(line: string): boolean {
    const stripped = line.replace(ANSI_RE, "");
    return stripped.includes("↑") || stripped.includes("↓");
}

interface ChromeInputs {
    cwd: string;
    display: ModelDisplayState;
    theme: Theme;
    getContextUsage: () => { percent?: number | null; contextWindow?: number } | undefined;
    getBranch: (cwd: string) => string | null;
    getBadges: () => string | undefined;
}

class ModeColoredEditor extends CustomEditor {
    private readonly inputs: ChromeInputs;

    constructor(tui: TUI, editorTheme: EditorTheme, keybindings: KeybindingsManager, inputs: ChromeInputs) {
        super(tui, editorTheme, keybindings);
        this.inputs = inputs;
    }

    render(width: number): string[] {
        const lines = super.render(width);
        const top = lines[0];
        if (top === undefined || width < 8) return lines;

        const { cwd, display, theme } = this.inputs;
        const { model, thinkingLevel } = display;
        const modeColor = colorForMode(cwd, model?.provider, model?.id) as ThemeColor;
        if (!isPlainRule(top)) {
            if (isScrollIndicator(top)) {
                lines[0] = theme.fg(modeColor, top.replace(ANSI_RE, ""));
                for (let index = 1; index < lines.length; index++) {
                    const line = lines[index];
                    if (line !== undefined && isPlainRule(line)) {
                        lines[index] = theme.fg(modeColor, BOTTOM_LEFT + RULE.repeat(width - 2) + BOTTOM_RIGHT);
                    }
                }
            }
            return lines;
        }

        const modeName = loadModeNameForModel(cwd, model?.provider, model?.id) ?? "custom";

        // Read live usage here rather than mutating state during render: a
        // requestRender() from inside render() would loop.
        const usage = this.inputs.getContextUsage();
        const percent = usage?.percent ?? display.contextPercent;
        const contextWindow = usage?.contextWindow ?? display.contextWindow;
        const branch = this.inputs.getBranch(cwd);
        const gaugeColor = (percent != null && percent > 0 ? contextColor(percent) : "muted") as ThemeColor;

        const paint = (segment: ChromeSegment, text: string) => {
            if (segment === "brand") return theme.fg(modeColor, text);
            if (segment === "model") return theme.fg(modeColor, theme.bold(text));
            if (segment === "branch") return theme.fg("success", text);
            if (segment === "badges") return theme.fg("accent", text);
            if (segment === "context") return theme.fg(gaugeColor, text);
            return theme.fg("muted", text);
        };

        // The frame owns 6 columns: "╭─ " + status + " ─╮".
        const status = composeStatusLine(
            {
                brand: "π",
                model: formatModelLabel(modeName, model?.id, thinkingLevel),
                path: shortenPath(cwd, MAX_PATH_WIDTH),
                branch: branch === null ? undefined : `${BRANCH_GLYPH} ${branch}`,
                badges: this.inputs.getBadges(),
                context: contextWindow > 0 ? formatContextRemaining(percent, contextWindow) : undefined,
            },
            width - 6,
            {
                paint,
                separator: SEPARATOR,
                renderGap: columns =>
                    renderContextGauge(percent, columns, {
                        fill: text => theme.fg(gaugeColor, text),
                        track: text => theme.fg("muted", text),
                    }),
            },
        );
        lines[0] = theme.fg(modeColor, `${TOP_LEFT}${RULE} `) + status + theme.fg(modeColor, ` ${RULE}${TOP_RIGHT}`);

        // Pi puts the scroll marker at the top while viewing the newest lines
        // and at the bottom while viewing the oldest lines; both inherit the
        // thinking color unless the composer recolors them explicitly.
        for (let index = 1; index < lines.length; index++) {
            const line = lines[index];
            if (line === undefined) continue;
            if (isScrollIndicator(line)) {
                lines[index] = theme.fg(modeColor, line.replace(ANSI_RE, ""));
            } else if (isPlainRule(line)) {
                lines[index] = theme.fg(modeColor, BOTTOM_LEFT + RULE.repeat(width - 2) + BOTTOM_RIGHT);
            }
        }
        return lines;
    }
}

export default function (pi: ExtensionAPI) {
    let display: ModelDisplayState | undefined;
    let requestRender: (() => void) | undefined;
    let activeCwd: string | undefined;
    let gitRefreshInFlight = false;
    let gitRefreshQueued = false;
    const getBranch = createBranchReader();
    const chromeStatus: StatusBadgeInputs = {
        dirtyFiles: 0,
        subagents: { running: 0, done: 0, failed: 0 },
        diffFiles: 0,
    };
    let statusBadges = formatStatusBadges(chromeStatus);

    const commitStatus = () => {
        const next = formatStatusBadges(chromeStatus);
        if (next === statusBadges) return;
        statusBadges = next;
        requestRender?.();
    };

    const refreshDirtyFiles = (cwd: string) => {
        if (gitRefreshInFlight) {
            gitRefreshQueued = true;
            return;
        }
        gitRefreshInFlight = true;
        execFile(
            "git",
            ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=normal"],
            { cwd, timeout: 2500, maxBuffer: 4 * 1024 * 1024 },
            (error, stdout) => {
                gitRefreshInFlight = false;
                if (activeCwd === cwd) {
                    const dirtyFiles = error ? 0 : stdout.split(/\r?\n/).filter(Boolean).length;
                    if (chromeStatus.dirtyFiles !== dirtyFiles) {
                        chromeStatus.dirtyFiles = dirtyFiles;
                        commitStatus();
                    }
                }
                if (gitRefreshQueued && activeCwd !== undefined) {
                    gitRefreshQueued = false;
                    refreshDirtyFiles(activeCwd);
                }
            },
        );
    };

    pi.events?.on("pi-ui:subagent-status", (value: unknown) => {
        if (value === null || typeof value !== "object") return;
        const payload = value as { running?: unknown; done?: unknown; failed?: unknown };
        chromeStatus.subagents = {
            running: typeof payload.running === "number" ? payload.running : 0,
            done: typeof payload.done === "number" ? payload.done : 0,
            failed: typeof payload.failed === "number" ? payload.failed : 0,
        };
        commitStatus();
    });

    pi.events?.on("pi-ui:turn-diff", (value: unknown) => {
        if (value === null || typeof value !== "object") return;
        const files = (value as { files?: unknown }).files;
        chromeStatus.diffFiles = typeof files === "number" ? files : 0;
        commitStatus();
    });

    pi.on("session_start", (_event, ctx: ExtensionContext) => {
        activeCwd = ctx.cwd;
        refreshDirtyFiles(ctx.cwd);
        if (!ctx.hasUI) return;
        ctx.ui.setEditorComponent((tui, editorTheme, keybindings) => {
            requestRender = () => tui.requestRender();
            display = new ModelDisplayState(ctx.model, ctx.thinkingLevel, requestRender);
            return new ModeColoredEditor(tui, editorTheme, keybindings, {
                cwd: ctx.cwd,
                display,
                theme: ctx.ui.theme,
                getContextUsage: () => ctx.getContextUsage(),
                getBranch,
                getBadges: () => statusBadges,
            });
        });
    });

    pi.on("model_select", (event, ctx) => {
        display?.selectModel(event.model, ctx.thinkingLevel);
    });

    pi.on("thinking_level_select", event => {
        display?.selectThinkingLevel(event.level);
    });

    pi.on("tool_execution_end", event => {
        if (activeCwd !== undefined && (event.toolName === "edit" || event.toolName === "write")) {
            refreshDirtyFiles(activeCwd);
        }
    });

    pi.on("turn_end", (_event, ctx: ExtensionContext) => {
        const usage = ctx.getContextUsage();
        display?.selectContext(usage?.percent ?? null, usage?.contextWindow ?? ctx.model?.contextWindow ?? 0);
        refreshDirtyFiles(ctx.cwd);
    });

    pi.on("session_shutdown", () => {
        activeCwd = undefined;
        requestRender = undefined;
        display = undefined;
        gitRefreshQueued = false;
    });
}
