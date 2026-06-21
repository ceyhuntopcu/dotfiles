import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// Auto-switch pi's theme with macOS appearance: twilight (dark) / twilight_light (light).
// pi has no native dark:/light: theme syntax, so this polls the system appearance and
// applies the matching named theme via the extension UI API.

const execAsync = promisify(exec);
const POLL_MS = 2000;
const DARK_THEME = "twilight";
const LIGHT_THEME = "twilight_light";

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

export default function (pi: ExtensionAPI) {
	let intervalId: ReturnType<typeof setInterval> | null = null;
	let lastTheme: string | undefined;

	const makeApply = (ctx: ExtensionContext) => async () => {
		if (!ctx.hasUI) return;
		const theme = (await isMacDarkMode()) ? DARK_THEME : LIGHT_THEME;
		if (theme === lastTheme) return;
		const result = ctx.ui.setTheme(theme);
		if (result.success) lastTheme = theme;
	};

	pi.on("session_start", async (_event, ctx) => {
		// Force a re-apply: pi reloads the configured theme from settings.json on
		// start/reload, which would otherwise win over our dynamic theme.
		lastTheme = undefined;
		const applyOnce = makeApply(ctx);

		await applyOnce();
		setTimeout(() => {
			lastTheme = undefined;
			void applyOnce();
		}, 100);

		if (!intervalId) {
			intervalId = setInterval(() => {
				void applyOnce();
			}, POLL_MS);
		}
	});

	pi.on("session_shutdown", () => {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	});
}
