/**
 * Shared, dependency-free presentation helpers for the OMP-inspired Pi chrome.
 *
 * Everything here operates on PLAIN text and returns plain text: layout is
 * decided before any ANSI is applied, so callers inject their own theme paint
 * callback and widths stay correct. Keeping this module free of pi runtime
 * imports is what lets `node --test` exercise it directly.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Separator between left-hand chrome segments. */
export const SEPARATOR = " · ";
/** Consumed portion of the context meter. */
export const METER_FILL = "━";
/** Remaining portion of the context meter; dashed so it never reads as a frame rule. */
export const METER_TRACK = "╌";

/** A shortened path narrower than this reads as noise, so it is dropped instead. */
const MIN_PATH_WIDTH = 12;

/** Width in code points; inputs here are plain text, never ANSI-wrapped. */
function plainWidth(text: string): number {
    return [...text].length;
}

/** Collapse `$HOME` to `~`, then ellipsize from the left so the tail survives. */
export function shortenPath(absolutePath: string, maxWidth: number): string {
    const home = os.homedir();
    const collapsed =
        absolutePath === home
            ? "~"
            : absolutePath.startsWith(`${home}${path.sep}`)
              ? `~${absolutePath.slice(home.length)}`
              : absolutePath;

    const chars = [...collapsed];
    if (maxWidth <= 0) return "";
    if (chars.length <= maxWidth) return collapsed;
    if (maxWidth === 1) return "…";
    return `…${chars.slice(chars.length - (maxWidth - 1)).join("")}`;
}

/** Humanize a token count: `999`, `1.5k`, `200k`, `1M`. */
export function formatTokens(count: number): string {
    const trim = (value: string) => (value.endsWith(".0") ? value.slice(0, -2) : value);
    if (!Number.isFinite(count) || count <= 0) return "0";
    if (count < 1000) return String(Math.round(count));
    if (count < 10_000) return `${trim((count / 1000).toFixed(1))}k`;
    if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
    return `${trim((count / 1_000_000).toFixed(1))}M`;
}

/** `30% · 1M`; an unknown percentage renders as `?%` rather than a fake zero. */
export function formatContext(percent: number | null | undefined, contextWindow: number): string {
    const percentText = percent == null || !Number.isFinite(percent) ? "?%" : `${Math.round(percent)}%`;
    return `${percentText}${SEPARATOR}${formatTokens(contextWindow)}`;
}

/**
 * Context budget headline. At 60% the regular remaining-budget text gains a
 * warning marker; at 85% it collapses to the critical percentage so it stays
 * visible even when the rest of the chrome is crowded.
 */
export function formatContextRemaining(percent: number | null | undefined, contextWindow: number): string {
    const known = percent != null && Number.isFinite(percent);
    const clamped = known ? Math.min(100, Math.max(0, percent as number)) : 0;
    const roundedPercent = Math.round(clamped);
    if (known && clamped >= 85) return `⚠ ${roundedPercent}%`;

    const remaining = Math.max(0, Math.round(contextWindow * (1 - clamped / 100)));
    const remainingText = remaining === 0 ? "0" : formatTokens(remaining);
    const percentText = known ? `${roundedPercent}%` : "?%";
    const warning = known && clamped >= 60 ? "⚠ " : "";
    return `${warning}${remainingText} left${SEPARATOR}${percentText}`;
}

export interface SubagentBadgeCounts {
    running: number;
    done: number;
    failed: number;
}

export interface StatusBadgeInputs {
    dirtyFiles?: number;
    subagents?: SubagentBadgeCounts;
    diffFiles?: number;
}

function badgeCount(value: number | undefined): number {
    return value !== undefined && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/** Compact operational badges, ordered to sit immediately after the branch. */
export function formatStatusBadges(input: StatusBadgeInputs): string | undefined {
    const badges: string[] = [];
    const dirtyFiles = badgeCount(input.dirtyFiles);
    if (dirtyFiles > 0) badges.push(`±${dirtyFiles}`);

    const subagentParts: string[] = [];
    const running = badgeCount(input.subagents?.running);
    const done = badgeCount(input.subagents?.done);
    const failed = badgeCount(input.subagents?.failed);
    if (running > 0) subagentParts.push(`◉${running}`);
    if (done > 0) subagentParts.push(`✓${done}`);
    if (failed > 0) subagentParts.push(`×${failed}`);
    if (subagentParts.length > 0) badges.push(subagentParts.join("·"));

    const diffFiles = badgeCount(input.diffFiles);
    if (diffFiles > 0) badges.push(`Δ${diffFiles}`);
    return badges.length > 0 ? badges.join(" ") : undefined;
}

export interface GaugePaint {
    fill?: (text: string) => string;
    track?: (text: string) => string;
}

/**
 * Elastic gauge: consumed cells then remaining cells across the whole span it
 * is given, so the frame's own rule becomes the context tracker instead of
 * carrying a separate fixed-width meter. Each half is painted independently
 * while the returned visible width stays exactly `width`.
 */
export function renderContextGauge(
    percent: number | null | undefined,
    width: number,
    paint?: GaugePaint,
): string {
    if (width <= 0) return "";
    const safePercent = percent == null || !Number.isFinite(percent) ? 0 : Math.min(100, Math.max(0, percent));
    const raw = Math.round((width * safePercent) / 100);
    const filled = safePercent > 0 ? Math.min(width, Math.max(1, raw)) : 0;
    const paintFill = paint?.fill ?? (text => text);
    const paintTrack = paint?.track ?? (text => text);
    const consumed = filled > 0 ? paintFill(METER_FILL.repeat(filled)) : "";
    const remaining = width - filled > 0 ? paintTrack(METER_TRACK.repeat(width - filled)) : "";
    return consumed + remaining;
}

/** `Terra · gpt-5.6-terra · medium`; an inactive thinking level is omitted. */
export function formatModelLabel(
    modeName: string | undefined,
    modelId: string | undefined,
    thinkingLevel: string | undefined,
): string {
    const parts = [modeName?.trim() || undefined, modelId?.trim() || "no-model"].filter(Boolean) as string[];
    if (thinkingLevel && thinkingLevel !== "off") parts.push(thinkingLevel);
    return parts.join(SEPARATOR);
}

/** Segment identities handed to the caller's paint callback, left to right. */
export type ChromeSegment = "brand" | "model" | "path" | "branch" | "badges" | "context" | "fill";

export interface StatusLineParts {
    brand?: string;
    model: string;
    path?: string;
    branch?: string;
    badges?: string;
    context?: string;
}

export type ChromePaint = (segment: ChromeSegment, text: string) => string;

export interface StatusLineOptions {
    paint?: ChromePaint;
    /** Gap character. Default " "; pass "─" to compose a ruled frame edge. */
    fill?: string;
    /** Separator between left segments. Default " · "; OMP-style is " › ". */
    separator?: string;
    /**
     * Renders the gap itself, receiving its exact column count and returning
     * already-painted text of that visible width. Wins over `fill`; this is how
     * the frame's rule becomes a context gauge.
     */
    renderGap?: (columns: number) => string;
}

/**
 * Compose one full-width status line: `brand · model · path · branch · badges`
 * on the left, the context text right-aligned, and the gap between them either
 * padded, ruled, or rendered as a gauge. Under pressure the layout degrades in
 * a fixed order — shorten/drop the path, drop the branch, drop the badges, then
 * drop the context — so the operationally important budget outlives repository
 * detail.
 */
export function composeStatusLine(parts: StatusLineParts, width: number, options?: StatusLineOptions): string {
    if (width <= 0) return "";
    const applyPaint: ChromePaint = options?.paint ?? ((_segment, text) => text);
    const fill = options?.fill && options.fill.length > 0 ? options.fill : " ";
    const separator = options?.separator ?? SEPARATOR;

    const brand = parts.brand?.trim() || undefined;
    const model = parts.model.trim();
    const originalPath = parts.path?.trim() || undefined;
    const originalBadges = parts.badges?.trim() || undefined;

    let pathText = originalPath;
    let branch = parts.branch?.trim() || undefined;
    let context = parts.context?.trim() || undefined;
    let badges = originalBadges;

    const leftWidth = () => {
        const segments = [brand, model, pathText, branch, badges].filter(Boolean) as string[];
        return segments.reduce((total, segment, index) => total + plainWidth(segment) + (index > 0 ? plainWidth(separator) : 0), 0);
    };
    const rightWidth = () => {
        return context === undefined ? 0 : plainWidth(context);
    };
    const fits = () => leftWidth() + (rightWidth() > 0 ? 1 + rightWidth() : 0) <= width;

    const shrinkPath = () => {
        if (!pathText) return;
        const others = leftWidth() - plainWidth(pathText);
        const available = width - others - (rightWidth() > 0 ? 1 + rightWidth() : 0);
        if (available >= MIN_PATH_WIDTH) pathText = shortenPath(pathText, available);
    };

    const degradations: Array<() => void> = [
        () => shrinkPath(),
        () => {
            pathText = undefined;
        },
        () => {
            branch = undefined;
        },
        () => {
            badges = undefined;
        },
        () => {
            context = undefined;
        },
    ];

    for (const degrade of degradations) {
        if (fits()) break;
        degrade();
    }

    const leftSegments: Array<{ segment: ChromeSegment; text: string }> = [];
    if (brand) leftSegments.push({ segment: "brand", text: brand });
    leftSegments.push({ segment: "model", text: model });
    if (pathText) leftSegments.push({ segment: "path", text: pathText });
    if (branch) leftSegments.push({ segment: "branch", text: branch });
    if (badges) leftSegments.push({ segment: "badges", text: badges });

    const rightSegments: Array<{ segment: ChromeSegment; text: string }> = [];
    if (context) rightSegments.push({ segment: "context", text: context });

    // Last resort: only the leading segments can be shown, hard-truncated.
    if (!fits()) {
        const plain = leftSegments.map(entry => entry.text).join(separator);
        const truncated = [...plain].slice(0, width).join("");
        return applyPaint("model", truncated) + fill.repeat(Math.max(0, width - plainWidth(truncated)));
    }

    const padding = Math.max(0, width - leftWidth() - rightWidth());
    const left = leftSegments.map(entry => applyPaint(entry.segment, entry.text)).join(separator);

    // A caller-supplied gap renderer wins: that is how the rule becomes a
    // gauge. Otherwise a plain space pad needs no color, while a real rule is
    // painted and gets one column of air on each side so it never fuses with
    // the text it separates.
    const gapRenderer = options?.renderGap;
    const ruled =
        padding >= 3
            ? gapRenderer
                ? gapRenderer(padding - 2)
                : fill !== " "
                  ? applyPaint("fill", fill.repeat(padding - 2))
                  : undefined
            : undefined;
    const right = rightSegments.map(entry => applyPaint(entry.segment, entry.text)).join(" ");

    if (ruled === undefined) return left + " ".repeat(padding) + right;
    return `${left} ${ruled} ${right}`;
}

/**
 * Per-mode color cycle, in `model-modes.json` order, so one mode reads as the
 * same color in the editor chrome and the footer. Values are pi theme color
 * names; callers cast to `ThemeColor`.
 */
export const MODE_COLOR_CYCLE: readonly string[] = [
    "syntaxKeyword",
    "syntaxFunction",
    "syntaxVariable",
    "syntaxString",
    "syntaxNumber",
    "syntaxType",
    "syntaxOperator",
];

function modeFileCandidates(cwd: string): string[] {
    return [path.join(cwd, ".pi", "model-modes.json"), path.join(os.homedir(), ".pi", "agent", "model-modes.json")];
}

/** Mode names in configured order, excluding the reserved `custom`/`default` slots. */
export function loadOrderedModeNames(cwd: string): string[] {
    for (const candidate of modeFileCandidates(cwd)) {
        try {
            const data = JSON.parse(fs.readFileSync(candidate, "utf8")) as { modes?: Record<string, unknown> };
            return Object.keys(data.modes ?? {}).filter(name => name !== "custom" && name !== "default");
        } catch {
            // Unreadable or malformed candidate: fall through to the next one.
        }
    }
    return [];
}

/** Configured mode name owning this provider/model pair, when one exists. */
export function loadModeNameForModel(cwd: string, provider?: string, modelId?: string): string | undefined {
    if (!provider || !modelId) return undefined;
    for (const candidate of modeFileCandidates(cwd)) {
        try {
            const data = JSON.parse(fs.readFileSync(candidate, "utf8")) as {
                modes?: Record<string, { provider?: string; modelId?: string }>;
            };
            for (const [name, spec] of Object.entries(data.modes ?? {})) {
                if (spec.provider === provider && spec.modelId === modelId) return name;
            }
            return undefined;
        } catch {
            // Unreadable or malformed candidate: fall through to the next one.
        }
    }
    return undefined;
}

/** Deterministic color for the active mode; unknown selections take the last slot. */
export function colorForMode(cwd: string, provider?: string, modelId?: string): string {
    const orderedNames = loadOrderedModeNames(cwd);
    const modeName = loadModeNameForModel(cwd, provider, modelId);
    const index = modeName ? orderedNames.indexOf(modeName) : -1;
    const fallback = MODE_COLOR_CYCLE[MODE_COLOR_CYCLE.length - 1] ?? "muted";
    if (index < 0) return fallback;
    return MODE_COLOR_CYCLE[index % MODE_COLOR_CYCLE.length] ?? fallback;
}

/** Theme color for a context meter, escalating as the window fills. */
export function contextColor(percent: number | null | undefined): string {
    if (percent == null || !Number.isFinite(percent)) return "muted";
    if (percent >= 85) return "error";
    if (percent >= 60) return "warning";
    return "success";
}
