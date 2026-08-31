/**
 * OMP-inspired composer chrome for pi's input editor.
 *
 * pi renders the editor as a plain top rule, the input rows, then a plain
 * bottom rule. This replaces those two rules with a rounded, mode-colored
 * frame whose top edge carries the whole status line —
 * `╭─ π › mode · model · thinking › path › ⑂ branch ──── 988k left · 1% ─╮` —
 * so location and budget live in the frame instead of a separate footer.
 *
 * The input rows themselves are never touched: pi positions the cursor from
 * its own layout, so indenting or wrapping those rows would desync it.
 * Layout/format decisions live in ./omp-inspired-ui/ui-chrome.ts, which is
 * plain-text and unit tested.
 */
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
    loadModeNameForModel,
    renderContextGauge,
    shortenPath,
    type ChromeSegment,
} from "./omp-inspired-ui/ui-chrome.ts";

const ANSI_RE = /\u001b\[[0-9;]*m/g;

/** Rounded frame pieces, matching pi's own box-drawing weight. */
const TOP_LEFT = "╭";
const TOP_RIGHT = "╮";
const BOTTOM_LEFT = "╰";
const BOTTOM_RIGHT = "╯";
const RULE = "─";
/** Chevron separator, OMP-style. */
const SEPARATOR = " › ";
/** Branch marker; the same glyph OMP shows before the branch name. */
const BRANCH_GLYPH = "⑂";

/**
 * Input gutter comes from pi's `editorPaddingX` setting, not from here: when an
 * extension installs a custom editor, pi copies its own padding onto it
 * (`newEditor.setPaddingX(defaultEditor.getPaddingX())`), so a constructor
 * value would be overwritten on the first settings sync.
 */
/** Below this width the path is dropped before the composer degrades further. */
const MAX_PATH_WIDTH = 44;

/** True only for pi's own plain "──────" rule — never a scroll indicator, which carries other text. */
function isPlainRule(line: string): boolean {
    const stripped = line.replace(ANSI_RE, "");
    return stripped.length > 0 && [...stripped].every(c => c === RULE);
}

interface ChromeInputs {
    cwd: string;
    display: ModelDisplayState;
    theme: Theme;
    getContextUsage: () => { percent?: number | null; contextWindow?: number } | undefined;
    getBranch: (cwd: string) => string | null;
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
        if (top === undefined || !isPlainRule(top) || width < 8) return lines;

        const { cwd, display, theme } = this.inputs;
        const { model, thinkingLevel } = display;
        const modeColor = colorForMode(cwd, model?.provider, model?.id) as ThemeColor;
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
            return theme.fg("muted", text);
        };

        // The frame owns 6 columns: "╭─ " + status + " ─╮".
        const statusWidth = width - 6;
        const status = composeStatusLine(
            {
                brand: "π",
                model: formatModelLabel(modeName, model?.id, thinkingLevel),
                path: shortenPath(cwd, MAX_PATH_WIDTH),
                branch: branch === null ? undefined : `${BRANCH_GLYPH} ${branch}`,
                context: contextWindow > 0 ? formatContextRemaining(percent, contextWindow) : undefined,
            },
            statusWidth,
            {
                paint,
                separator: SEPARATOR,
                // The whole span between the branch and the numbers IS the
                // context tracker: consumed cells then remaining track.
                renderGap: columns =>
                    renderContextGauge(percent, columns, {
                        fill: text => theme.fg(gaugeColor, text),
                        track: text => theme.fg("muted", text),
                    }),
            },
        );
        const leftEdge = theme.fg(modeColor, `${TOP_LEFT}${RULE} `);
        const rightEdge = theme.fg(modeColor, ` ${RULE}${TOP_RIGHT}`);
        lines[0] = leftEdge + status + rightEdge;

        // Remaining plain rules are the editor's bottom edge: close the frame in
        // the same color so the composer reads as one box.
        for (let index = 1; index < lines.length; index++) {
            const line = lines[index];
            if (line === undefined || !isPlainRule(line)) continue;
            lines[index] = theme.fg(modeColor, BOTTOM_LEFT + RULE.repeat(width - 2) + BOTTOM_RIGHT);
        }
        return lines;
    }
}

export default function (pi: ExtensionAPI) {
    let display: ModelDisplayState | undefined;
    const getBranch = createBranchReader();

    pi.on("session_start", (_event, ctx: ExtensionContext) => {
        if (!ctx.hasUI) return;
        ctx.ui.setEditorComponent((tui, editorTheme, keybindings) => {
            display = new ModelDisplayState(ctx.model, ctx.thinkingLevel, () => tui.requestRender());
            return new ModeColoredEditor(tui, editorTheme, keybindings, {
                cwd: ctx.cwd,
                display,
                theme: ctx.ui.theme,
                getContextUsage: () => ctx.getContextUsage(),
                getBranch,
            });
        });
    });

    pi.on("model_select", (event, ctx) => {
        display?.selectModel(event.model, ctx.thinkingLevel);
    });

    pi.on("thinking_level_select", event => {
        display?.selectThinkingLevel(event.level);
    });

    // Turn boundaries are the safe place to push context growth into the frame:
    // outside render(), so the state change may legitimately request a redraw.
    pi.on("turn_end", (_event, ctx: ExtensionContext) => {
        const usage = ctx.getContextUsage();
        display?.selectContext(usage?.percent ?? null, usage?.contextWindow ?? ctx.model?.contextWindow ?? 0);
    });
}
