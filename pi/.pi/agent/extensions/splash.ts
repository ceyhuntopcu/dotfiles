/**
 * Animated splash header — circular orb with noise-driven ripple animation.
 *
 * Renders a circular orb where:
 *   - Characters cycle through ·∘◦○◎◉● based on a combined noise + radial
 *     ripple value — giving a wave of dense glyphs propagating outward.
 *   - Colors shift from cyan (185°) to blue (228°) following the same pattern.
 *   - Concentric rings are created by  sin(r·π·6 - t)  and grow outward.
 *
 * Disappears on first prompt.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";

// ── Orb geometry ──────────────────────────────────────────────────────────
// Terminal cells are ~2× taller than wide.
// H_RADIUS ≈ 2× V_RADIUS so the shape looks visually circular.
const ORB_ROWS = 20;
const ORB_COLS = 44;
const CX = (ORB_COLS - 1) / 2;
const CY = (ORB_ROWS - 1) / 2;
const H_RADIUS = (ORB_COLS - 1) / 2;
const V_RADIUS = (ORB_ROWS - 1) / 2;

// Characters from sparse → dense.  The ripple drives which one is shown.
const CHARS = ["·", "∘", "◦", "○", "◎", "◉", "●"] as const;

const QUOTES = [
	'"The best way to predict the future is to invent it." \u2014 Alan Kay',
	'"Programs must be written for people to read." \u2014 Abelson & Sussman',
	'"Simplicity is prerequisite for reliability." \u2014 Edsger Dijkstra',
	'"First, solve the problem. Then, write the code." \u2014 John Johnson',
	'"Any sufficiently advanced technology is indistinguishable from magic." \u2014 Arthur C. Clarke',
	'"Talk is cheap. Show me the code." \u2014 Linus Torvalds',
	'"The Omnissiah knows all, comprehends all." \u2014 Adeptus Mechanicus',
	'"Make it work, make it right, make it fast." \u2014 Kent Beck',
	'"Code is like humor. When you have to explain it, it\'s bad." \u2014 Cory House',
	'"Controlling complexity is the essence of computer programming." \u2014 Brian Kernighan',
	'"From the weakness of the mind, Omnissiah save us." \u2014 Litany of the Electromancer',
	'"There is no truth in flesh, only betrayal." \u2014 Fabricator-General',
	'"The machine is immortal." \u2014 Cult Mechanicus',
	'"Information is power. But like all power, there are those who want to keep it for themselves." \u2014 Aaron Swartz',
	'"We are all connected; to each other, biologically. To the earth, chemically. To the universe, atomically." \u2014 Neil deGrasse Tyson',
	'"Baking is love made visible." \u2014 Unknown',
	'"A recipe has no soul. You, as the cook, must bring soul to the recipe." \u2014 Thomas Keller',
	'"Life is short. Eat dessert first." \u2014 Jacques Torres',
	'"Good bread is the most fundamentally satisfying of all foods; and good bread with fresh butter, the greatest of feasts." \u2014 James Beard',
	'"If baking is any labor at all, it\'s a labor of love." \u2014 Regina Brett',
	'"Cakes are healthy too, you just eat a small slice." \u2014 Mary Berry',
	'"Baking is therapy." \u2014 Unknown',
	'"You can\'t buy happiness, but you can bake cake, and that\'s kind of the same thing." \u2014 Unknown',
	'"The smell of good bread baking, like the sound of lightly flowing water, is indescribable in its evocation of innocence and delight." \u2014 M.F.K. Fisher',
	'"Baking is both an art and a science." \u2014 Unknown',
];

// ── Noise ──────────────────────────────────────────────────────────────────
// Sum-of-sines spanning full [0, 1] with spatial variation.
function noise(x: number, y: number, t: number): number {
	const a = Math.sin(x * 2.1 + t * 1.3);
	const b = Math.sin(y * 1.8 - t * 1.1);
	const c = Math.sin((x + y) * 1.5 + t * 0.8);
	const d = Math.sin((x - y) * 1.2 - t * 1.6);
	return ((a + b + c + d) / 4 + 1) / 2; // [0, 1]
}

// ── Color ──────────────────────────────────────────────────────────────────
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r = 0,
		g = 0,
		b = 0;
	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}
	return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * Math.max(0, Math.min(1, t));
}

// ── Orb cell ───────────────────────────────────────────────────────────────
function renderCell(col: number, row: number, t: number): string {
	// Normalised position: dx/dy ∈ [-1, 1], corrected for terminal aspect ratio.
	const dx = (col - CX) / H_RADIUS;
	const dy = (row - CY) / V_RADIUS;
	const r2 = dx * dx + dy * dy;

	if (r2 > 1.02) return " "; // outside orb

	const r = Math.sqrt(r2); // 0 = center, 1 = edge

	// Ripple: concentric rings propagating outward.
	const ripple = (Math.sin(r * Math.PI * 6 - t * 2.5) + 1) / 2;

	// Spatial noise for organic variation within each ring.
	const n = noise(dx * 3.2, dy * 3.2, t * 0.55);

	// Combined value — ripple-dominant so rings are clearly visible.
	const val = lerp(n, ripple, 0.62);

	// Edge taper: boundary characters stay sparse (·).
	const edgeMask = Math.max(0, Math.min(1, (1 - r) / 0.18));
	const charIdx = Math.round(val * (CHARS.length - 1) * Math.max(0.01, edgeMask));
	const ch = CHARS[Math.max(0, Math.min(CHARS.length - 1, charIdx))];

	// Sphere brightness: brightest at center (simple lambertian).
	const sphereLight = 1 - r2 * 0.75;

	// Color: green (145°) → cyan (190°), driven by the same val.
	const hue = lerp(145, 190, val);
	const sat = lerp(0.75, 0.95, val);
	const lit = lerp(0.15, 0.70, sphereLight * (0.35 + val * 0.65));

	const [rr, g, b] = hslToRgb(hue, sat, Math.max(0.08, lit));
	return `\x1b[38;2;${rr};${g};${b}m${ch}\x1b[0m`;
}

// ── Text helpers ───────────────────────────────────────────────────────────
function splitQuote(text: string): { body: string; author: string } {
	const m = text.match(/^(.+?)\s*\u2014\s*(.+)$/);
	if (m) return { body: m[1], author: "\u2014 " + m[2] };
	return { body: text, author: "" };
}

function wrapText(text: string, maxWidth: number): string[] {
	if (text.length <= maxWidth) return [text];
	const words = text.split(" ");
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		if (current.length + word.length + 1 > maxWidth && current.length > 0) {
			lines.push(current);
			current = word;
		} else {
			current = current ? current + " " + word : word;
		}
	}
	if (current) lines.push(current);
	return lines;
}

const dim = (s: string) => `\x1b[38;2;100;100;100m${s}\x1b[0m`;
const accentC = (s: string) => `\x1b[38;2;86;182;194m${s}\x1b[0m`;
const boldT = (s: string) => `\x1b[1m${s}\x1b[22m`;
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export default function (pi: ExtensionAPI) {
	let ctx_ref: ExtensionContext | null = null;
	let splashActive = false;
	let animTimer: ReturnType<typeof setInterval> | null = null;
	let tuiRef: TUI | null = null;
	let t = 0;

	function stopAnim() {
		if (animTimer) {
			clearInterval(animTimer);
			animTimer = null;
		}
	}

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI || _event.reason !== "startup") return;

		ctx_ref = ctx;
		splashActive = true;
		t = 0;
		const quote = pick(QUOTES);
		const { body, author } = splitQuote(quote);

		// Suppress powerline's default welcome header
		ctx.ui.setHeader(undefined);
		setTimeout(() => ctx.ui.setHeader(undefined), 100);

		ctx.ui.setWidget("splash", (tui, _theme) => {
			tuiRef = tui;

			// ~12 fps — small t step for a slow, meditative animation
			animTimer = setInterval(() => {
				t += 0.04;
				tui.requestRender(true);
			}, 80);

			return {
				dispose() {
					stopAnim();
					tuiRef = null;
				},
				invalidate() {},
				render(width: number): string[] {
					const lines: string[] = [];
					lines.push("");

					const sideBySide = width >= 80;
					const rightColWidth = sideBySide
						? Math.min(45, width - ORB_COLS - 8)
						: Math.min(width - 4, 60);
					const quoteLines = [
						...wrapText(body, rightColWidth).map((l) => dim(l)),
						...(author ? [dim(author)] : []),
					];

					if (sideBySide) {
						const leftPad = Math.max(2, Math.floor((width - ORB_COLS - 4 - rightColWidth) / 2));
						const midStart = Math.floor(ORB_ROWS * 0.3);
						const rightContent: string[] = [];
						rightContent[midStart] = accentC(boldT("Welcome to Pi"));
						for (let q = 0; q < quoteLines.length; q++) {
							rightContent[midStart + 2 + q] = quoteLines[q];
						}
						for (let row = 0; row < ORB_ROWS; row++) {
							let orbLine = "";
							for (let col = 0; col < ORB_COLS; col++) {
								orbLine += renderCell(col, row, t);
							}
							const right = rightContent[row] || "";
							lines.push(truncateToWidth(" ".repeat(leftPad) + orbLine + "    " + right, width));
						}
					} else {
						for (let row = 0; row < ORB_ROWS; row++) {
							let orbLine = "";
							for (let col = 0; col < ORB_COLS; col++) {
								orbLine += renderCell(col, row, t);
							}
							const pad = Math.max(0, Math.floor((width - ORB_COLS) / 2));
							lines.push(truncateToWidth(" ".repeat(pad) + orbLine, width));
						}
						lines.push("");
						const cp = (len: number) =>
							" ".repeat(Math.max(0, Math.floor((width - len) / 2)));
						lines.push(cp(14) + accentC(boldT("Welcome to Pi")));
						lines.push("");
						for (const ql of quoteLines) {
							lines.push(truncateToWidth(cp(rightColWidth) + ql, width));
						}
					}

					lines.push("");
					return lines;
				},
			};
		});
	});

	pi.on("agent_start", (_event, ctx) => {
		if (splashActive) {
			splashActive = false;
			stopAnim();
			ctx.ui.setWidget("splash", undefined);
		}
	});

	pi.on("session_shutdown", () => {
		stopAnim();
		splashActive = false;
		ctx_ref = null;
	});
}
