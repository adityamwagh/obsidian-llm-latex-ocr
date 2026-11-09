export type Provider = "openai" | "anthropic";

export type ClipboardAction = "copy" | "insert";

export type PasteImageMode = "off" | "ask" | "convert";

export interface ProviderProfile {
	/** Stable identifier used by the active-provider setting. */
	id: string;

	/** Display name shown in the provider dropdown. */
	name: string;

	/** Which API dialect this profile speaks. */
	provider: Provider;

	/** API root (for example https://api.openai.com/v1) or a full endpoint. */
	baseUrl: string;

	/** API key. May be empty for a local unauthenticated server. */
	apiKey: string;

	/** Model name, for example deepseek-v4-flash-vision-exp. */
	model: string;

	/** Extra JSON merged into the request body, for provider-specific options. */
	extraParams: string;

	/** Extra JSON merged into the request headers. */
	extraHeaders: string;
}

export interface LLMLatexOCRSettings {
	/** Configured provider profiles. */
	providers: ProviderProfile[];

	/** ID of the profile used for OCR requests. */
	activeProviderId: string;

	/** String to put around the LaTeX, usually "" or "$" or "$$". */
	delimiters: string;

	/** Instruction sent alongside the image. */
	prompt: string;

	/** Maximum number of tokens in the response. 0 omits the parameter when possible. */
	maxTokens: number;

	/** Downscale images so their longest side is at most this many pixels. 0 disables resizing. */
	maxImageDimension: number;

	/** What the main clipboard command should do with the result. */
	clipboardAction: ClipboardAction;

	/** Automatically OCR new images placed on the clipboard. */
	autoClipboardOcr: boolean;

	/** What to do when an image is pasted into a note. */
	pasteImageMode: PasteImageMode;
}

export const DEFAULT_PROMPT =
	"Transcribe the mathematical expression in this image into LaTeX. " +
	"Return only the LaTeX source code, with no surrounding $ delimiters, no Markdown code fences, and no explanation. " +
	"Preserve the structure of multi-line equations (use aligned, cases, matrices, and similar environments where appropriate).";

export const PROVIDER_LABELS: Record<Provider, string> = {
	openai: "OpenAI-compatible",
	anthropic: "Anthropic-compatible",
};

export const PROVIDER_DEFAULT_BASE_URL: Record<Provider, string> = {
	openai: "https://api.openai.com/v1",
	anthropic: "https://api.anthropic.com/v1",
};

export const PROVIDER_DEFAULT_MODEL: Record<Provider, string> = {
	openai: "gpt-4.1-mini",
	anthropic: "claude-sonnet-4-5",
};

/**
 * Profiles matching the providers in the user's OpenCode configuration.
 * API keys are intentionally left empty here; they are stored in data.json
 * and never committed to the repository.
 */
export const DEFAULT_PROVIDERS: ProviderProfile[] = [
	{
		id: "lithosai",
		name: "LithosAI",
		provider: "openai",
		baseUrl: "https://api.lithosai.cloud/v1",
		apiKey: "",
		model: "deepseek-ai/DeepSeek-V4.1-Flash",
		extraParams: "",
		extraHeaders: "",
	},
	{
		id: "deepseek",
		name: "DeepSeek",
		provider: "openai",
		baseUrl: "https://api.deepseek.com/v1",
		apiKey: "",
		model: "deepseek-v4-flash-vision-exp",
		extraParams: "",
		extraHeaders: "",
	},
];

export const DEFAULT_SETTINGS: LLMLatexOCRSettings = {
	providers: DEFAULT_PROVIDERS,
	activeProviderId: "lithosai",
	delimiters: "$$",
	prompt: DEFAULT_PROMPT,
	maxTokens: 2048,
	maxImageDimension: 1600,
	clipboardAction: "copy",
	autoClipboardOcr: false,
	pasteImageMode: "off",
};

function newProviderId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createProviderProfile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
	return {
		id: newProviderId(),
		name: "New provider",
		provider: "openai",
		baseUrl: "",
		apiKey: "",
		model: "",
		extraParams: "",
		extraHeaders: "",
		...overrides,
	};
}

export function getActiveProvider(settings: LLMLatexOCRSettings): ProviderProfile {
	const active = settings.providers.find((provider) => provider.id === settings.activeProviderId);
	if (active) return active;

	const first = settings.providers[0];
	if (!first) {
		throw new Error("No provider configured. Add one in the plugin settings.");
	}
	return first;
}

function asString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function cloneProvider(provider: ProviderProfile, index: number): ProviderProfile {
	return {
		id: asString(provider.id) || `provider-${index}`,
		name: asString(provider.name) || `Provider ${index + 1}`,
		provider: provider.provider === "anthropic" ? "anthropic" : "openai",
		baseUrl: asString(provider.baseUrl),
		apiKey: asString(provider.apiKey),
		model: asString(provider.model),
		extraParams: asString(provider.extraParams),
		extraHeaders: asString(provider.extraHeaders),
	};
}

function normalizeProvider(raw: unknown, index: number): ProviderProfile {
	const provider = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	return cloneProvider(
		{
			id: asString(provider.id),
			name: asString(provider.name),
			provider: provider.provider === "anthropic" ? "anthropic" : "openai",
			baseUrl: asString(provider.baseUrl),
			apiKey: asString(provider.apiKey),
			model: asString(provider.model),
			extraParams: asString(provider.extraParams),
			extraHeaders: asString(provider.extraHeaders),
		},
		index,
	);
}

/**
 * Turn persisted data (including data from the single-provider version of
 * this plugin) into the current settings shape.
 */
export function normalizeSettings(data: unknown): LLMLatexOCRSettings {
	const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
	const rawProviders = Array.isArray(raw.providers) ? raw.providers : [];

	let providers = rawProviders.map((provider, index) => normalizeProvider(provider, index));

	if (providers.length === 0) {
		const legacyKeys = ["provider", "baseUrl", "apiKey", "model", "extraParams", "extraHeaders"];
		const hasLegacySettings = legacyKeys.some((key) => {
			const value = raw[key];
			return typeof value === "string" && value.trim().length > 0;
		});

		if (hasLegacySettings) {
			const provider: Provider = raw.provider === "anthropic" ? "anthropic" : "openai";
			providers = [
				cloneProvider(
					{
						id: "default",
						name: provider === "anthropic" ? "Anthropic" : "OpenAI-compatible",
						provider,
						baseUrl: asString(raw.baseUrl),
						apiKey: asString(raw.apiKey),
						model: asString(raw.model),
						extraParams: asString(raw.extraParams),
						extraHeaders: asString(raw.extraHeaders),
					},
					0,
				),
			];
		} else {
			providers = DEFAULT_PROVIDERS.map((provider, index) => cloneProvider(provider, index));
		}
	}

	// Ensure IDs are unique even if data.json was edited by hand.
	const seenIds = new Set<string>();
	providers = providers.map((provider, index) => {
		let id = provider.id || `provider-${index}`;
		while (seenIds.has(id)) {
			id = `${id}-${index}`;
		}
		seenIds.add(id);
		return { ...provider, id };
	});

	const requestedActive = asString(raw.activeProviderId);
	const activeProviderId = providers.some((provider) => provider.id === requestedActive)
		? requestedActive
		: (providers[0]?.id ?? "default");

	const maxTokens = raw.maxTokens;
	const maxImageDimension = raw.maxImageDimension;

	return {
		providers,
		activeProviderId,
		delimiters: typeof raw.delimiters === "string" ? raw.delimiters : DEFAULT_SETTINGS.delimiters,
		prompt: typeof raw.prompt === "string" ? raw.prompt : DEFAULT_SETTINGS.prompt,
		maxTokens:
			typeof maxTokens === "number" && Number.isFinite(maxTokens)
				? maxTokens
				: DEFAULT_SETTINGS.maxTokens,
		maxImageDimension:
			typeof maxImageDimension === "number" && Number.isFinite(maxImageDimension)
				? maxImageDimension
				: DEFAULT_SETTINGS.maxImageDimension,
		clipboardAction: raw.clipboardAction === "insert" ? "insert" : "copy",
		autoClipboardOcr: raw.autoClipboardOcr === true,
		pasteImageMode:
			raw.pasteImageMode === "ask" || raw.pasteImageMode === "convert"
				? raw.pasteImageMode
				: raw.convertPastedImages === true
					? "convert"
					: "off",
	};
}
