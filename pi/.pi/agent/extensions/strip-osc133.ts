import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// pi's own renderer (dist/modes/interactive/components/{user,assistant}-message.js)
// unconditionally wraps every user/assistant message with OSC 133 semantic
// prompt marks (A = zone start, B = zone end, C = command-output start).
// Otty recognizes these and renders a "jump between turns" popover on scroll,
// which we don't want. There's no pi setting to disable emitting them, and
// patching pi's own dist files would get wiped on every `pi update` — so
// instead we strip the sequences at the stdout layer, which survives updates.
const OSC133_RE = /\x1b\]133;[ABC]\x07/g;

export default function (_pi: ExtensionAPI) {
	const write = process.stdout.write.bind(process.stdout);
	process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
		if (typeof chunk === "string" && chunk.includes("\x1b]133;")) {
			chunk = chunk.replace(OSC133_RE, "");
		}
		return (write as (...a: unknown[]) => boolean)(chunk, ...rest);
	}) as typeof process.stdout.write;
}
