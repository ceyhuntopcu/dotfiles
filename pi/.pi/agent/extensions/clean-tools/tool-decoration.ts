import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SourceToolDefinition } from "./tool-composition.js";

export const CLEAN_TOOL_DECORATION_EVENT = "pi-tidy-tools:decorate-tool";
export const CLEAN_TOOL_DECORATION_VERSION = 1;

export interface CleanToolDecorationRequest {
	version: typeof CLEAN_TOOL_DECORATION_VERSION;
	tool: SourceToolDefinition;
	decorated?: boolean;
}

/**
 * Let pi-tidy-tools decorate an extension-owned tool before it is registered.
 * Event delivery is synchronous, so a listening clean-tools instance can
 * replace `request.tool` before this function returns. Without a listener the
 * source definition is returned unchanged.
 */
export function requestCleanToolDecoration<T extends SourceToolDefinition>(pi: Pick<ExtensionAPI, "events">, tool: T): T {
	const request: CleanToolDecorationRequest = {
		version: CLEAN_TOOL_DECORATION_VERSION,
		tool,
	};
	pi.events.emit(CLEAN_TOOL_DECORATION_EVENT, request);
	return request.tool as T;
}

export function isCleanToolDecorationRequest(value: unknown): value is CleanToolDecorationRequest {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const request = value as Partial<CleanToolDecorationRequest>;
	return request.version === CLEAN_TOOL_DECORATION_VERSION
		&& !!request.tool
		&& typeof request.tool === "object"
		&& typeof request.tool.name === "string"
		&& typeof request.tool.execute === "function";
}
