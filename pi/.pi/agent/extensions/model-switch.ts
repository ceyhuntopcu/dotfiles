/**
 * Model Switch Extension
 *
 * Cycle between a small set of named models with Tab.
 *
 *   Shift+Tab      -> next model in the cycle
 *   /m             -> show the cycle / pick directly (/m Fable)
 *
 * A status indicator shows the active label (e.g. "Opus").
 * Edit CYCLE below to change the models or labels.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

interface CycleEntry {
	label: string;
	provider: string;
	model: string;
}

const CYCLE: CycleEntry[] = [
	{ label: "Opus", provider: "github-copilot", model: "claude-opus-4.8" },
	{ label: "Fable", provider: "github-copilot", model: "claude-fable-5" },
	{ label: "Codex", provider: "github-copilot", model: "gpt-5.5" },
];

export default function modelSwitchExtension(pi: ExtensionAPI) {
	function currentIndex(ctx: ExtensionContext): number {
		const m = ctx.model;
		if (!m) return -1;
		return CYCLE.findIndex((e) => e.provider === m.provider && e.model === m.id);
	}

	function updateStatus(ctx: ExtensionContext) {
		const idx = currentIndex(ctx);
		const label = idx >= 0 ? CYCLE[idx].label : undefined;
		ctx.ui.setStatus("model-switch", label ? ctx.ui.theme.fg("accent", label) : undefined);
	}

	async function applyEntry(entry: CycleEntry, ctx: ExtensionContext): Promise<void> {
		const model = ctx.modelRegistry.find(entry.provider, entry.model);
		if (!model) {
			ctx.ui.notify(`Model ${entry.provider}/${entry.model} not found`, "warning");
			return;
		}
		const ok = await pi.setModel(model);
		if (!ok) {
			ctx.ui.notify(`No auth for ${entry.provider}/${entry.model}. Run /login ${entry.provider}.`, "warning");
			return;
		}
		ctx.ui.setStatus("model-switch", ctx.ui.theme.fg("accent", entry.label));
		ctx.ui.notify(`Model: ${entry.label} (${entry.model})`, "info");
	}

	async function cycle(ctx: ExtensionContext): Promise<void> {
		const idx = currentIndex(ctx);
		const next = CYCLE[(idx + 1) % CYCLE.length]; // idx === -1 -> starts at 0
		await applyEntry(next, ctx);
	}

	pi.registerShortcut("shift+tab", {
		description: "Cycle model (Opus / Fable / Codex)",
		handler: cycle,
	});

	pi.registerCommand("m", {
		description: "Switch model (Opus / Fable / Codex)",
		handler: async (args, ctx) => {
			const arg = args?.trim().toLowerCase();
			if (arg) {
				const entry = CYCLE.find((e) => e.label.toLowerCase() === arg);
				if (!entry) {
					ctx.ui.notify(`Unknown "${arg}". Options: ${CYCLE.map((e) => e.label).join(", ")}`, "error");
					return;
				}
				await applyEntry(entry, ctx);
				return;
			}
			await cycle(ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		updateStatus(ctx);
	});
}
