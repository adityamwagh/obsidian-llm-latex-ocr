import { requestUrl } from "obsidian";
import type { ProviderProfile } from "./settings";

export interface ImagePayload {
	/** Base64-encoded image data, without a data: prefix. */
	data: string;
	/** MIME type such as image/png. */
	mediaType: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
	if (!raw.trim()) return {};

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(`${label} is not valid JSON: ${errorMessage(error)}`);
	}

	if (!isRecord(parsed)) {
		throw new Error(`${label} must be a JSON object.`);
	}
	return parsed;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function extractProviderError(value: unknown): string | undefined {
	if (!isRecord(value)) return undefined;

	const direct = value.message;
	if (typeof direct === "string" && direct.trim()) return direct;

	const nested = value.error;
	if (typeof nested === "string" && nested.trim()) return nested;
	if (isRecord(nested)) {
		const nestedMessage = nested.message;
		if (typeof nestedMessage === "string" && nestedMessage.trim()) return nestedMessage;
	}

	return undefined;
}

function bodyFromResponse(response: { json?: unknown; text?: string }): unknown {
	try {
		return response.json;
	} catch {
		if (typeof response.text === "string" && response.text.trim()) {
			return response.text;
		}
		return undefined;
	}
}

function formatHttpError(status: number, body: unknown): string {
	const providerMessage = extractProviderError(body);
	const suffix = providerMessage ? `: ${providerMessage}` : "";

	if (status === 401 || status === 403) {
		return `Authentication failed (HTTP ${status})${suffix}. Check your API key.`;
	}
	if (status === 404) {
		return `Endpoint or model not found (HTTP 404)${suffix}. Check the base URL and model name.`;
	}
	if (status === 429) {
		return `Rate limited or out of quota (HTTP 429)${suffix}.`;
	}
	if (status >= 500) {
		return `The provider returned HTTP ${status}${suffix}.`;
	}
	return `The provider returned HTTP ${status}${suffix}.`;
}

function buildEndpoint(baseUrl: string, path: string): string {
	const trimmed = baseUrl.trim().replace(/\/+$/, "");
	if (!trimmed) {
		throw new Error("Set a base URL in the plugin settings.");
	}
	if (trimmed.includes(path)) {
		return trimmed;
	}
	return `${trimmed}${path}`;
}

async function postJson(
	url: string,
	headers: Record<string, string>,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	let response;
	try {
		response = await requestUrl({
			url,
			method: "POST",
			headers,
			body: JSON.stringify(body),
			throw: false,
		});
	} catch (error) {
		// Some Obsidian versions throw before producing a response object.
		const responseLike = error as { status?: number; json?: unknown; text?: string; message?: string };
		if (typeof responseLike.status === "number") {
			throw new Error(formatHttpError(responseLike.status, bodyFromResponse(responseLike)));
		}
		throw new Error(`Could not reach the API: ${responseLike.message ?? errorMessage(error)}`);
	}

	if (response.status < 200 || response.status >= 300) {
		throw new Error(formatHttpError(response.status, bodyFromResponse(response)));
	}

	let json: unknown;
	try {
		json = response.json;
	} catch {
		throw new Error(`The API returned a non-JSON response: ${response.text.slice(0, 300)}`);
	}

	if (!isRecord(json)) {
		throw new Error("The API returned an unexpected response.");
	}
	return json;
}

function openAIEndpoint(baseUrl: string): string {
	return buildEndpoint(baseUrl, "/chat/completions");
}

function anthropicEndpoint(baseUrl: string): string {
	return buildEndpoint(baseUrl, "/messages");
}

function supportsMaxCompletionTokens(model: string): boolean {
	return /^(o[1-9]|gpt-5)/i.test(model.trim());
}

function extractOpenAIText(json: Record<string, unknown>): string {
	const choices: unknown = json.choices;
	if (!Array.isArray(choices) || choices.length === 0) {
		throw new Error("The API response did not contain any choices.");
	}

	const first: unknown = (choices as unknown[])[0];
	if (!isRecord(first)) {
		throw new Error("The API returned an unexpected choice format.");
	}

	const message = first.message;
	if (isRecord(message)) {
		const content = message.content;
		if (typeof content === "string") return content;
		if (Array.isArray(content)) {
			const parts = content
				.filter(isRecord)
				.map((part) => (typeof part.text === "string" ? part.text : ""))
				.join("");
			if (parts.trim()) return parts;
		}
	}

	// Fallback for legacy completions-style endpoints.
	if (typeof first.text === "string") return first.text;

	throw new Error("The API response did not contain any text.");
}

function extractAnthropicText(json: Record<string, unknown>): string {
	const content = json.content;
	if (!Array.isArray(content)) {
		throw new Error("The API response did not contain any content blocks.");
	}

	const text = content
		.filter(isRecord)
		.map((block) => (block.type === "text" && typeof block.text === "string" ? block.text : ""))
		.filter((part) => part.length > 0)
		.join("\n")
		.trim();

	if (!text) {
		throw new Error("The API response did not contain any text.");
	}
	return text;
}

async function recognizeOpenAI(
	profile: ProviderProfile,
	prompt: string,
	maxTokens: number,
	image: ImagePayload,
	extraParams: Record<string, unknown>,
	extraHeaders: Record<string, string>,
): Promise<string> {
	const body: Record<string, unknown> = {
		model: profile.model.trim(),
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: prompt },
					{
						type: "image_url",
						image_url: {
							url: `data:${image.mediaType};base64,${image.data}`,
						},
					},
				],
			},
		],
	};

	if (maxTokens > 0) {
		if (supportsMaxCompletionTokens(profile.model)) {
			body.max_completion_tokens = maxTokens;
		} else {
			body.max_tokens = maxTokens;
		}
	}

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	const apiKey = profile.apiKey.trim();
	if (apiKey) {
		headers.Authorization = `Bearer ${apiKey}`;
	}

	const json = await postJson(openAIEndpoint(profile.baseUrl), { ...headers, ...extraHeaders }, { ...body, ...extraParams });
	return extractOpenAIText(json);
}

async function recognizeAnthropic(
	profile: ProviderProfile,
	prompt: string,
	maxTokens: number,
	image: ImagePayload,
	extraParams: Record<string, unknown>,
	extraHeaders: Record<string, string>,
): Promise<string> {
	const body: Record<string, unknown> = {
		model: profile.model.trim(),
		max_tokens: maxTokens > 0 ? maxTokens : 2048,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "image",
						source: {
							type: "base64",
							media_type: image.mediaType,
							data: image.data,
						},
					},
					{ type: "text", text: prompt },
				],
			},
		],
	};

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"anthropic-version": "2023-06-01",
		"anthropic-dangerous-direct-browser-access": "true",
	};
	const apiKey = profile.apiKey.trim();
	if (apiKey) {
		headers["x-api-key"] = apiKey;
	}

	const json = await postJson(anthropicEndpoint(profile.baseUrl), { ...headers, ...extraHeaders }, { ...body, ...extraParams });
	return extractAnthropicText(json);
}

/**
 * Send an image to the selected vision model and return its raw text response.
 */
export async function recognizeImage(
	profile: ProviderProfile,
	prompt: string,
	maxTokens: number,
	image: ImagePayload,
): Promise<string> {
	if (!profile.model.trim()) {
		throw new Error(`Set a model name for the “${profile.name}” provider.`);
	}
	if (!profile.baseUrl.trim()) {
		throw new Error(`Set a base URL for the “${profile.name}” provider.`);
	}

	const extraParams = parseJsonObject(profile.extraParams, "Extra request parameters");
	const extraHeaders = parseJsonObject(profile.extraHeaders, "Extra request headers");
	const headers = Object.fromEntries(
		Object.entries(extraHeaders).map(([key, value]) => [key, String(value)]),
	);

	if (profile.provider === "anthropic") {
		return recognizeAnthropic(profile, prompt, maxTokens, image, extraParams, headers);
	}
	return recognizeOpenAI(profile, prompt, maxTokens, image, extraParams, headers);
}

/**
 * Remove Markdown fences, delimiters, or explanatory text that a model may add
 * around the actual LaTeX source.
 */
export function extractLatex(raw: string): string {
	let text = raw.trim();

	const fenced = text.match(/```(?:latex|tex|math)?\s*([\s\S]*?)```/i);
	if (fenced?.[1]) {
		text = fenced[1].trim();
	}

	// Some models wrap the answer in a display environment instead of using
	// bare math. Unwrap it so the plugin's own delimiters are not nested.
	const environment = text.match(
		/^\\begin\{(math|displaymath|equation\*?)\}([\s\S]*)\\end\{\1\}$/,
	);
	if (environment?.[2]) {
		text = environment[2].trim();
	}

	// Prefer a display-math block if the model wrapped its answer in prose.
	const displayBlock = text.match(/\\\[([\s\S]*?)\\\]/);
	const dollarBlock = text.match(/\$\$([\s\S]*?)\$\$/);
	if (displayBlock?.[1]) {
		text = displayBlock[1].trim();
	} else if (dollarBlock?.[1]) {
		text = dollarBlock[1].trim();
	}

	const delimiterPairs: Array<[string, string]> = [
		["$$", "$$"],
		["\\[", "\\]"],
		["\\(", "\\)"],
		["$", "$"],
	];

	for (const [open, close] of delimiterPairs) {
		if (text.startsWith(open) && text.endsWith(close) && text.length >= open.length + close.length) {
			const inner = text.slice(open.length, text.length - close.length).trim();
			if (inner) {
				text = inner;
				break;
			}
		}
	}

	text = text.replace(/^latex\s+/i, "").trim();
	return text;
}

/**
 * Wrap bare LaTeX in the user's chosen math delimiters.
 */
export function formatLatex(latex: string, delimiters: string): string {
	if (!delimiters) return latex;
	return `${delimiters}${latex}${delimiters}`;
}
