import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Theme, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

const execAsync = promisify(exec);
const SETTINGS_PATH = path.join(os.homedir(), ".warp", "settings.toml");
const STATUS_KEY = "warp-theme";
const POLL_MS = 2000;

type WarpPalette = {
	accent: string;
	background: string;
	foreground: string;
	details?: "lighter" | "darker";
	normal: Record<string, string>;
	bright: Record<string, string>;
};

type ResolvedWarpTheme = {
	path: string;
	mode: "dark" | "light";
};

async function isMacDarkMode(): Promise<boolean> {
	try {
		const { stdout } = await execAsync(
			"osascript -e 'tell application \"System Events\" to tell appearance preferences to return dark mode'",
		);
		return stdout.trim() === "true";
	} catch {
		return false;
	}
}

function expandHome(filePath: string): string {
	return filePath.startsWith("~/") ? path.join(os.homedir(), filePath.slice(2)) : filePath;
}

function getBooleanSetting(toml: string, key: string): boolean {
	const match = toml.match(new RegExp(`(^|\\n)\\s*${key}\\s*=\\s*(true|false)\\s*($|\\n)`));
	return match?.[2] === "true";
}

function getInlineCustomThemePath(toml: string, key: "theme" | "dark" | "light"): string | undefined {
	const match = toml.match(new RegExp(`${key}\\s*=\\s*\\{\\s*custom\\s*=\\s*\\{[^}]*path\\s*=\\s*"([^"]+)"`, "m"));
	return match?.[1] ? expandHome(match[1]) : undefined;
}

async function resolveWarpTheme(): Promise<ResolvedWarpTheme | null> {
	if (!existsSync(SETTINGS_PATH)) return null;

	const toml = await readFile(SETTINGS_PATH, "utf8");
	const systemTheme = getBooleanSetting(toml, "system_theme");

	if (systemTheme) {
		const dark = await isMacDarkMode();
		const mode = dark ? "dark" : "light";
		const selectedPath = getInlineCustomThemePath(toml, mode);
		const fallbackPath = getInlineCustomThemePath(toml, "theme");
		const themePath = selectedPath ?? fallbackPath;
		return themePath ? { path: themePath, mode } : null;
	}

	const themePath = getInlineCustomThemePath(toml, "theme");
	if (!themePath) return null;

	return {
		path: themePath,
		mode: themePath.toLowerCase().includes("light") ? "light" : "dark",
	};
}

function getYamlString(yaml: string, key: string): string | undefined {
	const match = yaml.match(new RegExp(`^${key}:\\s*['\"]?([^'\"\\n]+)['\"]?\\s*$`, "m"));
	return match?.[1]?.trim();
}

function getYamlSectionColor(yaml: string, section: "normal" | "bright", key: string): string | undefined {
	const sectionMatch = yaml.match(new RegExp(`\\n\\s{2}${section}:\\n([\\s\\S]*?)(?=\\n\\s{2}\\S|$)`));
	const body = sectionMatch?.[1] ?? "";
	const colorMatch = body.match(new RegExp(`\\n?\\s{4}${key}:\\s*['\"]?([^'\"\\n]+)['\"]?\\s*`));
	return colorMatch?.[1]?.trim();
}

async function readWarpPalette(themePath: string): Promise<WarpPalette> {
	const yaml = await readFile(themePath, "utf8");
	const normal: Record<string, string> = {};
	const bright: Record<string, string> = {};

	for (const key of ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"]) {
		normal[key] = getYamlSectionColor(yaml, "normal", key) ?? "#888888";
		bright[key] = getYamlSectionColor(yaml, "bright", key) ?? normal[key];
	}

	return {
		accent: getYamlString(yaml, "accent") ?? normal.blue ?? "#7aa2f7",
		background: getYamlString(yaml, "background") ?? "#000000",
		foreground: getYamlString(yaml, "foreground") ?? "#ffffff",
		details: getYamlString(yaml, "details") as WarpPalette["details"],
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

function buildPiTheme(palette: WarpPalette, mode: "dark" | "light", sourcePath: string): Theme {
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
		{ name: "warp_current", sourcePath },
	);
}

async function getSignature(themePath: string, mode: string): Promise<string> {
	const [settingsStat, themeStat] = await Promise.all([stat(SETTINGS_PATH), stat(themePath)]);
	return `${mode}:${themePath}:${settingsStat.mtimeMs}:${themeStat.mtimeMs}`;
}

async function syncWarpTheme(ctx: ExtensionContext, previousSignature?: string): Promise<string | undefined> {
	if (!ctx.hasUI) return previousSignature;

	const resolved = await resolveWarpTheme();
	if (!resolved) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return previousSignature;
	}

	const signature = await getSignature(resolved.path, resolved.mode);
	if (signature === previousSignature) return previousSignature;

	const palette = await readWarpPalette(resolved.path);
	ctx.ui.setTheme(buildPiTheme(palette, resolved.mode, resolved.path));
	ctx.ui.setStatus(STATUS_KEY, undefined);
	return signature;
}

export default function (pi: ExtensionAPI) {
	let intervalId: ReturnType<typeof setInterval> | null = null;
	let signature: string | undefined;

	pi.on("session_start", async (event, ctx) => {
		// Force re-apply on reload because pi reloads themes from settings.json after
		// resources_discover, which would otherwise win over our dynamic theme.
		if (event.reason !== "startup") {
			signature = undefined;
		}

		const applyOnce = async () => {
			try {
				signature = await syncWarpTheme(ctx, signature);
			} catch (error) {
				if (ctx.hasUI) {
					ctx.ui.notify(
						`Warp theme sync failed: ${error instanceof Error ? error.message : String(error)}`,
						"warning",
					);
				}
			}
		};

		await applyOnce();
		// Re-apply shortly after to win against pi loading the configured theme from settings.json.
		setTimeout(() => {
			signature = undefined;
			void applyOnce();
		}, 100);

		intervalId = setInterval(() => {
			void syncWarpTheme(ctx, signature)
				.then((nextSignature) => {
					signature = nextSignature;
				})
				.catch(() => {
					// Keep polling; transient read errors happen while Warp writes settings.
				});
		}, POLL_MS);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}
