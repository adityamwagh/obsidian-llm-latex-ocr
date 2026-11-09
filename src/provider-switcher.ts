import { App, Notice, SuggestModal } from "obsidian";
import type LLMLatexOCR from "./main";
import type { ProviderProfile } from "./settings";

export class ProviderSuggestModal extends SuggestModal<ProviderProfile> {
	private readonly plugin: LLMLatexOCR;

	constructor(app: App, plugin: LLMLatexOCR) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		await super.onOpen();
		this.setPlaceholder("Select the provider to use for OCR…");
		this.emptyStateText = "No provider profiles configured.";
	}

	getSuggestions(query: string): ProviderProfile[] {
		const needle = query.toLowerCase();
		return this.plugin.settings.providers.filter((provider) => {
			const haystack = `${provider.name} ${provider.model} ${provider.baseUrl}`.toLowerCase();
			return haystack.includes(needle);
		});
	}

	renderSuggestion(provider: ProviderProfile, el: HTMLElement) {
		el.createDiv({ text: provider.name || "Unnamed provider" });
		el.createEl("small", {
			text: `${provider.model || "No model"} — ${provider.baseUrl || "No base URL"}`,
			cls: "setting-item-description",
		});
	}

	onChooseSuggestion(provider: ProviderProfile, _evt: MouseEvent | KeyboardEvent) {
		this.plugin.settings.activeProviderId = provider.id;
		void this.plugin.saveSettings();
		new Notice(`Active OCR provider: ${provider.name || "Unnamed provider"}`);
	}
}
