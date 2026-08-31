/**
 * Suppresses pi's built-in footer.
 *
 * The composer frame (mode-colored-editor.ts) already carries model, mode,
 * thinking level, path, branch, and context budget in its top edge, so pi's
 * default two-line footer — cwd/branch plus cost/context/model — is pure
 * duplication under it. pi renders whatever footer component is installed, so
 * installing one that emits no lines is how an extension reclaims those rows.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";

class EmptyFooter implements Component {
    invalidate(): void {
        // Nothing is cached: this footer is intentionally blank.
    }

    render(): string[] {
        return [];
    }
}

export default function (pi: ExtensionAPI) {
    pi.on("session_start", (_event, ctx: ExtensionContext) => {
        if (!ctx.hasUI) return;
        ctx.ui.setFooter(() => new EmptyFooter());
    });
}
