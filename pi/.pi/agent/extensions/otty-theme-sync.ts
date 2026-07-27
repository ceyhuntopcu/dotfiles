import { execFile } from "node:child_process";
import { access, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Theme, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);
const CONFIG_PATH = path.join(os.homedir(), ".config", "otty", "config.toml");
const THEMES_DIR = path.join(os.homedir(), ".config", "otty", "themes");
const STATUS_KEY = "otty-theme";
const POLL_MS = 2000;

type Mode = "dark" | "light";

type OttyPalette = {
	accent: string;
	background: string;
	foreground: string;
	normal: Record<string, string>;
	bright: Record<string, string>;
};

type ResolvedOttyTheme = {
	path: string;
	mode: Mode;
};

async function isMacDarkMode(): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync("osascript", [
			"-e",
			'tell application "System Events" to tell appearance preferences to return dark mode',
		]);
		return stdout.trim() === "true";
	} catch {
		return false;
	}
}

function getConfigValue(config: string, key: string): string | undefined {
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = config.match(
		new RegExp(`^\\s*${escapedKey}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^#\\r\\n]+))`, "m"),
	);
	return (match?.[1] ?? match?.[2] ?? match?.[3])?.trim();
}

function getBooleanConfig(config: string, key: string, fallback: boolean): boolean {
	const value = getConfigValue(config, key)?.toLowerCase();
	if (value === "true" || value === "on") return true;
	if (value === "false" || value === "off") return false;
	return fallback;
}

function normalizeThemeName(name: string): string {
	return name
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function expandPath(filePath: string): string {
	const withHome = filePath.startsWith("~/") ? path.join(os.homedir(), filePath.slice(2)) : filePath;
	return withHome.replace(/\$([A-Z_][A-Z0-9_]*)/gi, (match, name: string) => process.env[name] ?? match);
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function resolveThemePath(themeName: string): Promise<string | null> {
	const expanded = expandPath(themeName);
	if (path.isAbsolute(expanded) || expanded.includes(path.sep)) {
		return (await pathExists(expanded)) ? expanded : null;
	}

	const files = await readdir(THEMES_DIR);
	const target = normalizeThemeName(themeName);
	const fileName = files.find((file) => {
		if (!file.endsWith(".ottytheme")) return false;
		return normalizeThemeName(file.slice(0, -".ottytheme".length)) === target;
	});
	return fileName ? path.join(THEMES_DIR, fileName) : null;
}

async function resolveOttyTheme(): Promise<ResolvedOttyTheme | null> {
	if (!(await pathExists(CONFIG_PATH))) return null;

	const config = await readFile(CONFIG_PATH, "utf8");
	const followSystem = getBooleanConfig(config, "auto-theme-dark-mode", true);
	const darkMode = followSystem && (await isMacDarkMode());
	const themeName = darkMode
		? getConfigValue(config, "theme-dark") ?? "Nord"
		: getConfigValue(config, "theme") ?? "Paper";
	const themePath = await resolveThemePath(themeName);
	return themePath ? { path: themePath, mode: darkMode ? "dark" : "light" } : null;
}

function getTomlSection(toml: string, section: string): string {
	const escapedSection = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const header = new RegExp(`^\\[${escapedSection}\\][ \\t]*(?:#.*)?(?:\\r?\\n|$)`, "m").exec(toml);
	if (!header) return "";
	const start = header.index + header[0].length;
	const rest = toml.slice(start);
	const nextSection = rest.search(/^\[/m);
	return nextSection === -1 ? rest : rest.slice(0, nextSection);
}

function getTomlColor(section: string, key: string): string | undefined {
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = section.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*["'](#[0-9a-f]{6})(?:[0-9a-f]{2})?["']`, "im"));
	return match?.[1];
}

async function readOttyPalette(themePath: string, mode: Mode): Promise<OttyPalette> {
	const toml = await readFile(themePath, "utf8");
	const terminal = getTomlSection(toml, "terminal");
	const selection = getTomlSection(toml, "selection");
	const paletteBody = terminal.match(/^\s*palette\s*=\s*\[([\s\S]*?)\]/m)?.[1] ?? "";
	const colors = [...paletteBody.matchAll(/["'](#[0-9a-f]{6})(?:[0-9a-f]{2})?["']/gi)].map(
		(match) => match[1],
	);
	const fallbackBackground = mode === "dark" ? "#000000" : "#ffffff";
	const foreground = getTomlColor(terminal, "foreground") ?? (mode === "dark" ? "#ffffff" : "#000000");
	const background = getTomlColor(terminal, "background") ?? fallbackBackground;
	const fallbackPalette = [
		background,
		"#ff5555",
		"#50fa7b",
		"#f1fa8c",
		"#7aa2f7",
		"#ff79c6",
		"#8be9fd",
		foreground,
	];
	const normal: Record<string, string> = {};
	const bright: Record<string, string> = {};
	const names = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

	for (const [index, name] of names.entries()) {
		normal[name] = colors[index] ?? fallbackPalette[index];
		bright[name] = colors[index + 8] ?? normal[name];
	}

	return {
		accent:
			getTomlColor(terminal, "cursor") ??
			getTomlColor(selection, "background") ??
			normal.blue ??
			"#7aa2f7",
		background,
		foreground,
		normal,
		bright,
	};
}

function parseHexColor(color: string): { r: number; g: number; b: number } | null {
	const match = color.trim().match(/^#?([0-9a-f]{6})$/i);
	if (!match) return null;
	const value = match[1];
	return {
		r: Number.parseInt(value.slice(0, 2), 16),
		g: Number.parseInt(value.slice(2, 4), 16),
		b: Number.parseInt(value.slice(4, 6), 16),
	};
}

function toHex(value: number): string {
	return Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0");
}

function mixColor(base: string, overlay: string, amount: number): string {
	const a = parseHexColor(base);
	const b = parseHexColor(overlay);
	if (!a || !b) return base;
	return `#${toHex(a.r + (b.r - a.r) * amount)}${toHex(a.g + (b.g - a.g) * amount)}${toHex(a.b + (b.b - a.b) * amount)}`;
}

function inferMode(background: string, fallback: Mode): Mode {
	const color = parseHexColor(background);
	if (!color) return fallback;
	const luminance = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
	return luminance < 0.5 ? "dark" : "light";
}

function buildPiTheme(palette: OttyPalette, mode: Mode, sourcePath: string): Theme {
	const primary = palette.accent;
	const secondary = mode === "light" ? palette.bright.black : palette.normal.black;
	const text = palette.foreground;
	const red = palette.normal.red;
	const green = palette.normal.green;
	const yellow = palette.normal.yellow;
	const blue = palette.normal.blue;
	const magenta = palette.normal.magenta;
	const cyan = palette.normal.cyan;
	const panelBg = mode === "light"
		? mixColor(palette.background, primary, 0.035)
		: mixColor(palette.background, palette.foreground, 0.08);
	const selectedBg = mode === "light"
		? mixColor(palette.background, primary, 0.12)
		: mixColor(palette.background, palette.foreground, 0.16);

	return new Theme(
		{
			accent: primary,
			border: secondary,
			borderAccent: primary,
			borderMuted: secondary,
			success: green,
			error: red,
			warning: yellow,
			muted: secondary,
			dim: secondary,
			text,
			thinkingText: secondary,
			userMessageText: text,
			customMessageText: text,
			customMessageLabel: primary,
			toolTitle: primary,
			toolOutput: text,
			mdHeading: yellow,
			mdLink: primary,
			mdLinkUrl: secondary,
			mdCode: cyan,
			mdCodeBlock: text,
			mdCodeBlockBorder: secondary,
			mdQuote: secondary,
			mdQuoteBorder: secondary,
			mdHr: secondary,
			mdListBullet: cyan,
			toolDiffAdded: green,
			toolDiffRemoved: red,
			toolDiffContext: secondary,
			syntaxComment: secondary,
			syntaxKeyword: magenta,
			syntaxFunction: blue,
			syntaxVariable: yellow,
			syntaxString: green,
			syntaxNumber: magenta,
			syntaxType: cyan,
			syntaxOperator: primary,
			syntaxPunctuation: secondary,
			thinkingOff: secondary,
			thinkingMinimal: primary,
			thinkingLow: blue,
			thinkingMedium: cyan,
			thinkingHigh: magenta,
			thinkingXhigh: red,
			thinkingMax: red,
			bashMode: yellow,
		},
		{
			selectedBg,
			userMessageBg: panelBg,
			customMessageBg: panelBg,
			toolPendingBg: panelBg,
			toolSuccessBg: panelBg,
			toolErrorBg: panelBg,
		},
		"truecolor",
		{ name: "otty_current", sourcePath },
	);
}

async function getSignature(themePath: string, mode: Mode): Promise<string> {
	const [configStat, themeStat] = await Promise.all([stat(CONFIG_PATH), stat(themePath)]);
	return `${mode}:${themePath}:${configStat.mtimeMs}:${themeStat.mtimeMs}`;
}

async function syncOttyTheme(ctx: ExtensionContext, previousSignature?: string): Promise<string | undefined> {
	if (!ctx.hasUI) return previousSignature;

	const resolved = await resolveOttyTheme();
	if (!resolved) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return previousSignature;
	}

	const signature = await getSignature(resolved.path, resolved.mode);
	if (signature === previousSignature) return previousSignature;

	const palette = await readOttyPalette(resolved.path, resolved.mode);
	const mode = inferMode(palette.background, resolved.mode);
	ctx.ui.setTheme(buildPiTheme(palette, mode, resolved.path));
	ctx.ui.setStatus(STATUS_KEY, undefined);
	return signature;
}

/** Keeps Pi's active theme synchronized with Otty's light and dark theme slots. */
export default function ottyThemeSync(pi: ExtensionAPI): void {
	let intervalId: ReturnType<typeof setInterval> | null = null;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let signature: string | undefined;

	pi.on("session_start", async (event, ctx) => {
		if (event.reason !== "startup") signature = undefined;

		const applyOnce = async (): Promise<void> => {
			try {
				signature = await syncOttyTheme(ctx, signature);
			} catch (error) {
				if (ctx.hasUI) {
					ctx.ui.notify(
						`Otty theme sync failed: ${error instanceof Error ? error.message : String(error)}`,
						"warning",
					);
				}
			}
		};

		await applyOnce();
		timeoutId = setTimeout(() => {
			timeoutId = null;
			signature = undefined;
			void applyOnce();
		}, 100);

		intervalId = setInterval(() => {
			void syncOttyTheme(ctx, signature)
				.then((nextSignature) => {
					signature = nextSignature;
				})
				.catch(() => {
					// Keep polling; transient read errors happen while Otty writes its config.
				});
		}, POLL_MS);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}
