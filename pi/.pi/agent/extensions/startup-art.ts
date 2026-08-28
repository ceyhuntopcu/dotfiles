/**
 * Custom startup screen: a clean block-letter "PI" banner (FIGLET-style),
 * replacing pi's bare default header and the earlier noisy wave pattern.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, Theme, TUI } from "@earendil-works/pi-tui";

// Big block glyphs, 7 rows tall. Each row is one string; letters are joined
// with a gap column between them.
const GLYPH_P = ["██████ ", "██   ██", "██   ██", "██████ ", "██     ", "██     ", "██     "];
const GLYPH_I = ["███████", "   ██  ", "   ██  ", "   ██  ", "   ██  ", "   ██  ", "███████"];
const LETTER_GAP = "  ";

function buildBanner(theme: Theme): { lines: string[]; width: number } {
    const rows: string[] = [];
    let plainWidth = 0;
    for (let row = 0; row < GLYPH_P.length; row++) {
        const p = theme.fg("accent", GLYPH_P[row]!);
        const i = theme.fg("borderAccent", GLYPH_I[row]!);
        rows.push(`${p}${LETTER_GAP}${i}`);
        if (row === 0) plainWidth = GLYPH_P[row]!.length + LETTER_GAP.length + GLYPH_I[row]!.length;
    }
    return { lines: rows, width: plainWidth };
}

class StartupArtComponent implements Component {
    constructor(private theme: Theme) {}

    invalidate(): void {
        // Banner is static; nothing cached to drop.
    }

    render(width: number): string[] {
        const { lines, width: bannerWidth } = buildBanner(this.theme);
        const leftPad = " ".repeat(Math.max(0, Math.floor((width - bannerWidth) / 2)));
        return [...lines.map((l) => leftPad + l), ""];
    }
}

export default function (pi: ExtensionAPI) {
    pi.on("session_start", (_event, ctx: ExtensionContext) => {
        if (!ctx.hasUI || ctx.mode === "print") return;
        ctx.ui.setHeader((_tui: TUI, theme: Theme) => new StartupArtComponent(theme));
    });
}
