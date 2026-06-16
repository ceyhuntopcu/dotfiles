/**
 * GitHub Copilot Provider Extension
 *
 * Exposes the OpenAI *and* Anthropic models available through your GitHub
 * Copilot subscription as a pi provider named "github-copilot".
 *
 * How it works:
 *   1. GitHub device-code OAuth -> long-lived GitHub token (ghu_...)
 *   2. Exchange that token for a short-lived Copilot token (cached/auto-renewed)
 *   3. Stream against api.githubcopilot.com (OpenAI-compatible) for every model
 *
 * Usage:
 *   /login github-copilot      (device flow: open the URL, enter the code)
 *   /model                     (pick a github-copilot model)
 *
 * You can also set GH_COPILOT_TOKEN=ghu_... to skip /login.
 *
 * Requires an active GitHub Copilot subscription (Individual/Business/Enterprise).
 */

import {
	type Api,
	type AssistantMessageEventStream,
	type Context,
	createAssistantMessageEventStream,
	type Model,
	type OAuthCredentials,
	type OAuthLoginCallbacks,
	type SimpleStreamOptions,
	streamSimpleOpenAICompletions,
	streamSimpleOpenAIResponses,
	type ThinkingLevelMap,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// =============================================================================
// Constants
// =============================================================================

// Well-known GitHub Copilot OAuth client id used by editor integrations.
const COPILOT_CLIENT_ID = "Iv1.b507a08c87ecfe98";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";
const DEFAULT_API_BASE = "https://api.githubcopilot.com";

const OAUTH_SCOPE = "read:user";

// Headers Copilot expects on every chat request.
const COPILOT_HEADERS: Record<string, string> = {
	"Copilot-Integration-Id": "vscode-chat",
	"Editor-Version": "vscode/1.95.0",
	"Editor-Plugin-Version": "copilot-chat/0.23.0",
};

// =============================================================================
// Models
// =============================================================================

interface CopilotModel {
	id: string;
	name: string;
	/** Override the API for this model. Codex models require the Responses API. */
	api?: Api;
	reasoning: boolean;
	thinkingLevelMap?: ThinkingLevelMap;
	input: ("text" | "image")[];
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	contextWindow: number;
	maxTokens: number;
}

// Curated set of OpenAI + Anthropic models commonly available via Copilot.
// Costs are best-effort reference values for usage display only — Copilot
// billing is per-subscription, not per-token.
export const MODELS: CopilotModel[] = [
	// --- Anthropic ---
	{
		id: "claude-opus-4.8",
		name: "Claude Opus 4.8 (Copilot)",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
		contextWindow: 264000,
		maxTokens: 64000,
	},
	{
		id: "claude-opus-4.5",
		name: "Claude Opus 4.5 (Copilot)",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
		contextWindow: 200000,
		maxTokens: 32000,
	},
	{
		id: "claude-sonnet-4.6",
		name: "Claude Sonnet 4.6 (Copilot)",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
		contextWindow: 264000,
		maxTokens: 64000,
	},
	{
		id: "claude-sonnet-4.5",
		name: "Claude Sonnet 4.5 (Copilot)",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
		contextWindow: 200000,
		maxTokens: 32000,
	},
	{
		id: "claude-haiku-4.5",
		name: "Claude Haiku 4.5 (Copilot)",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
		contextWindow: 200000,
		maxTokens: 64000,
	},
	{
		id: "claude-fable-5",
		name: "Claude Fable 5 (Copilot)",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
		contextWindow: 264000,
		maxTokens: 64000,
	},
	// --- OpenAI ---
	{
		id: "gpt-5.5",
		name: "GPT-5.5 (Copilot)",
		api: "openai-responses",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
		contextWindow: 400000,
		maxTokens: 128000,
	},
	{
		id: "gpt-5.4",
		name: "GPT-5.4 (Copilot)",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
		contextWindow: 400000,
		maxTokens: 128000,
	},
	{
		id: "gpt-5.3-codex",
		name: "GPT-5.3 Codex (Copilot)",
		api: "openai-responses",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
		contextWindow: 400000,
		maxTokens: 128000,
	},
	{
		id: "gpt-4.1",
		name: "GPT-4.1 (Copilot)",
		reasoning: false,
		input: ["text", "image"],
		cost: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
	},
	{
		id: "gpt-4o",
		name: "GPT-4o (Copilot)",
		reasoning: false,
		input: ["text"],
		cost: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
	},
];

// =============================================================================
// Copilot token cache (short-lived bearer derived from the GitHub token)
// =============================================================================

interface CopilotToken {
	token: string;
	apiBase: string;
	expiresAt: number; // ms epoch
}

let cachedCopilotToken: CopilotToken | null = null;

function invalidateCopilotToken() {
	cachedCopilotToken = null;
}

async function getCopilotToken(githubToken: string): Promise<CopilotToken> {
	const now = Date.now();
	if (cachedCopilotToken && cachedCopilotToken.expiresAt > now) {
		return cachedCopilotToken;
	}

	const response = await fetch(COPILOT_TOKEN_URL, {
		method: "GET",
		headers: {
			Authorization: `token ${githubToken}`,
			Accept: "application/json",
			"User-Agent": "GitHubCopilotChat/0.23.0",
			"Editor-Version": COPILOT_HEADERS["Editor-Version"],
			"Editor-Plugin-Version": COPILOT_HEADERS["Editor-Plugin-Version"],
		},
	});

	if (!response.ok) {
		const errorText = await response.text();
		if (response.status === 401 || response.status === 403) {
			throw new Error(
				`GitHub Copilot access denied (${response.status}). Ensure your account has an active Copilot subscription, then run /login github-copilot. ${errorText}`,
			);
		}
		throw new Error(`Failed to get Copilot token: ${response.status} ${errorText}`);
	}

	const data = (await response.json()) as {
		token: string;
		expires_at: number; // unix seconds
		endpoints?: { api?: string };
	};

	cachedCopilotToken = {
		token: data.token,
		apiBase: data.endpoints?.api ?? DEFAULT_API_BASE,
		// Renew a couple minutes early.
		expiresAt: data.expires_at * 1000 - 2 * 60 * 1000,
	};
	return cachedCopilotToken;
}

// =============================================================================
// OAuth (GitHub device-code flow)
// =============================================================================

interface DeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	expires_in: number;
	interval: number;
}

async function loginCopilot(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
	const deviceResponse = await fetch(DEVICE_CODE_URL, {
		method: "POST",
		headers: { Accept: "application/json", "Content-Type": "application/json" },
		body: JSON.stringify({ client_id: COPILOT_CLIENT_ID, scope: OAUTH_SCOPE }),
	});
	if (!deviceResponse.ok) {
		throw new Error(`Failed to start device flow: ${await deviceResponse.text()}`);
	}
	const device = (await deviceResponse.json()) as DeviceCodeResponse;

	callbacks.onDeviceCode({
		userCode: device.user_code,
		verificationUri: device.verification_uri,
		intervalSeconds: device.interval,
		expiresInSeconds: device.expires_in,
	});

	const deadline = Date.now() + device.expires_in * 1000;
	let intervalMs = Math.max(device.interval, 1) * 1000;

	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, intervalMs));

		const tokenResponse = await fetch(ACCESS_TOKEN_URL, {
			method: "POST",
			headers: { Accept: "application/json", "Content-Type": "application/json" },
			body: JSON.stringify({
				client_id: COPILOT_CLIENT_ID,
				device_code: device.device_code,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			}),
		});

		const data = (await tokenResponse.json()) as {
			access_token?: string;
			error?: string;
			interval?: number;
		};

		if (data.access_token) {
			invalidateCopilotToken();
			return {
				// GitHub OAuth tokens from this flow are long-lived with no refresh
				// token, so store the same value and treat it as effectively durable.
				refresh: data.access_token,
				access: data.access_token,
				expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
			};
		}

		if (data.error === "authorization_pending") continue;
		if (data.error === "slow_down") {
			intervalMs += 5000;
			continue;
		}
		throw new Error(`Device authorization failed: ${data.error ?? "unknown error"}`);
	}

	throw new Error("Device authorization timed out. Run /login github-copilot to try again.");
}

async function refreshCopilotToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
	// The GitHub token does not expire; just refresh the derived Copilot token.
	invalidateCopilotToken();
	return credentials;
}

// =============================================================================
// Stream function
// =============================================================================

export function streamGitHubCopilot(
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();

	(async () => {
		try {
			const githubToken = options?.apiKey;
			if (!githubToken) {
				throw new Error("No GitHub token. Run /login github-copilot or set GH_COPILOT_TOKEN.");
			}

			const copilot = await getCopilotToken(githubToken);

			const headers: Record<string, string> = { ...COPILOT_HEADERS };
			if (model.input?.includes("image")) {
				headers["Copilot-Vision-Request"] = "true";
			}

			const streamOptions = {
				...options,
				apiKey: copilot.token,
				headers: { ...options?.headers, ...headers },
			};

			// Codex and other Responses-only models must use /responses; the rest
			// go through the chat-completions gateway.
			const innerStream =
				model.api === "openai-responses"
					? streamSimpleOpenAIResponses(
							{ ...(model as Model<"openai-responses">), baseUrl: copilot.apiBase },
							context,
							streamOptions,
						)
					: streamSimpleOpenAICompletions(
							{
								...(model as Model<"openai-completions">),
								baseUrl: copilot.apiBase,
								compat: {
									...(model as Model<"openai-completions">).compat,
									// Copilot's chat-completions gateway manages reasoning
									// internally and rejects `reasoning_effort` (Claude rejects it
									// outright; GPT-5.x rejects it alongside tool calls).
									supportsDeveloperRole: false,
									supportsReasoningEffort: false,
								},
							},
							context,
							streamOptions,
						);

			for await (const event of innerStream) stream.push(event);
			stream.end();
		} catch (error) {
			stream.push({
				type: "error",
				reason: "error",
				error: {
					role: "assistant",
					content: [],
					api: model.api,
					provider: model.provider,
					model: model.id,
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: "error",
					errorMessage: error instanceof Error ? error.message : String(error),
					timestamp: Date.now(),
				},
			});
			stream.end();
		}
	})();

	return stream;
}

// =============================================================================
// Extension entry point
// =============================================================================

export default function (pi: ExtensionAPI) {
	pi.registerProvider("github-copilot", {
		name: "GitHub Copilot",
		baseUrl: DEFAULT_API_BASE,
		apiKey: "$GH_COPILOT_TOKEN",
		api: "openai-completions",
		models: MODELS.map(
			({ id, name, api, reasoning, thinkingLevelMap, input, cost, contextWindow, maxTokens }) => ({
				id,
				name,
				api,
				reasoning,
				thinkingLevelMap,
				input,
				cost,
				contextWindow,
				maxTokens,
			}),
		),
		oauth: {
			name: "GitHub Copilot",
			login: loginCopilot,
			refreshToken: refreshCopilotToken,
			getApiKey: (cred) => cred.access,
		},
		streamSimple: streamGitHubCopilot,
	});
}
