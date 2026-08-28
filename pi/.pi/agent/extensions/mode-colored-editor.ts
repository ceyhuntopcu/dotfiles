/**
 * Colors the input editor's border by active model-mode instead of pi's
 * default (thinking-level-based, which only ever showed purple/blue since
 * every mode here uses either "high" or "medium"), and embeds the mode/model
 * label directly into the top border — same technique pi's own scroll
 * indicator uses (a border string carrying text instead of a plain repeated
 * dash). Reuses pi's real CustomEditor/Editor classes untouched: only the
 * border color function and the already-rendered border line are touched,
 * so all typing/cursor/paste/keybinding behavior is unchanged.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { EditorTheme, KeybindingsManager, TUI } from "@earendil-works/pi-tui";
import type { Theme, ThemeColor } from "@earendil-works/pi-tui";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** True only for pi's own plain "──────" border line — never a scroll indicator, which carries other text. */
function isPlainBorderLine(line: string): boolean {
    const stripped = line.replace(ANSI_RE, "");
    return stripped.length > 0 && [...stripped].every((c) => c === "─");
}

/** Same technique pi's own scroll indicator uses (createScrollBorder): embed text into the border instead of a plain repeated dash. */
function buildLabeledBorder(width: number, label: string, colorFn: (s: string) => string): string {
    const prefix = `── ${label} `;
    const prefixWidth = visibleWidth(prefix);
    if (prefixWidth >= width) {
        return colorFn(truncateToWidth(prefix, width, ""));
    }
    return colorFn(prefix + "─".repeat(width - prefixWidth));
}

// Same 7-color set used for the footer's mode badge, in model-modes.json's own
// mode order, so a given mode reads as the same color in both places.
const MODE_COLOR_CYCLE: ThemeColor[] = [
    "syntaxKeyword",
    "syntaxFunction",
    "syntaxVariable",
    "syntaxString",
    "syntaxNumber",
    "syntaxType",
    "syntaxOperator",
];

function loadOrderedModeNames(cwd: string): string[] {
    const candidates = [
        path.join(cwd, ".pi", "model-modes.json"),
        path.join(os.homedir(), ".pi", "agent", "model-modes.json"),
    ];
    for (const p of candidates) {
        try {
            const raw = fs.readFileSync(p, "utf8");
            const data = JSON.parse(raw) as { modes?: Record<string, unknown> };
            return Object.keys(data.modes ?? {}).filter((n) => n !== "custom" && n !== "default");
        } catch {
            continue;
        }
    }
    return [];
}

function loadModeNameForModel(cwd: string, provider?: string, modelId?: string): string | undefined {
    if (!provider || !modelId) return undefined;
    const candidates = [
        path.join(cwd, ".pi", "model-modes.json"),
        path.join(os.homedir(), ".pi", "agent", "model-modes.json"),
    ];
    for (const p of candidates) {
        try {
            const raw = fs.readFileSync(p, "utf8");
            const data = JSON.parse(raw) as { modes?: Record<string, { provider?: string; modelId?: string }> };
            for (const [name, spec] of Object.entries(data.modes ?? {})) {
                if (spec.provider === provider && spec.modelId === modelId) return name;
            }
            return undefined;
        } catch {
            continue;
        }
    }
    return undefined;
}

function colorForMode(cwd: string, provider?: string, modelId?: string): ThemeColor {
    const orderedNames = loadOrderedModeNames(cwd);
    const modeName = loadModeNameForModel(cwd, provider, modelId);
    const index = modeName ? orderedNames.indexOf(modeName) : -1;
    return MODE_COLOR_CYCLE[index >= 0 ? index % MODE_COLOR_CYCLE.length : MODE_COLOR_CYCLE.length - 1]!;
}

class ModeColoredEditor extends CustomEditor {
    constructor(
        tui: TUI,
        editorTheme: EditorTheme,
        keybindings: KeybindingsManager,
        private ctx: ExtensionContext,
        private fullTheme: Theme,
    ) {
        super(tui, editorTheme, keybindings);
    }

    render(width: number): string[] {
        const { cwd, model } = this.ctx;
        const color = colorForMode(cwd, model?.provider, model?.id);
        const colorFn = (str: string) => this.fullTheme.fg(color, str);
        this.borderColor = colorFn;

        const lines = super.render(width);

        const modeName = loadModeNameForModel(cwd, model?.provider, model?.id) ?? "custom";
        const thinkingLevel = this.ctx.thinkingLevel;
        const label =
            thinkingLevel && thinkingLevel !== "off"
                ? `${modeName} · ${model?.id ?? "no-model"} · ${thinkingLevel}`
                : `${modeName} · ${model?.id ?? "no-model"}`;

        if (lines.length > 0 && isPlainBorderLine(lines[0]!)) {
            lines[0] = buildLabeledBorder(width, label, colorFn);
        }
        return lines;
    }
}

export default function (pi: ExtensionAPI) {
    pi.on("session_start", (_event, ctx: ExtensionContext) => {
        if (!ctx.hasUI) return;
        ctx.ui.setEditorComponent(
            (tui, editorTheme, keybindings) => new ModeColoredEditor(tui, editorTheme, keybindings, ctx, ctx.ui.theme),
        );
    });
}
