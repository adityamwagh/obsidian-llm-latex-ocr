import { App, Notice, Platform, PluginSettingTab, Setting, TextAreaComponent } from "obsidian";
import type LLMLatexOCR from "./main";
import {
	DEFAULT_PROMPT,
	PROVIDER_LABELS,
	Provider,
	createProviderProfile,
} from "./settings";

export class LLMLatexOCRSettingsTab extends PluginSettingTab {
	plugin: LLMLatexOCR;
	private editingProviderId: string | null = null;

	constructor(app: App, plugin: LLMLatexOCR) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;

		containerEl.empty();

		const activeProvider =
			settings.providers.find((provider) => provider.id === settings.activeProviderId) ??
			settings.providers[0];

		if (!activeProvider) {
			containerEl.createEl("p", { text: "No provider profiles are configured." });
			return;
		}

		if (
			!this.editingProviderId ||
			!settings.providers.some((provider) => provider.id === this.editingProviderId)
		) {
			this.editingProviderId = activeProvider.id;
		}

		const editingProvider =
			settings.providers.find((provider) => provider.id === this.editingProviderId) ??
			activeProvider;

		new Setting(containerEl).setName("Active provider").setHeading();

		new Setting(containerEl)
			.setName("Use for OCR")
			.setDesc("All OCR requests use the selected provider profile.")
			.addDropdown((dropdown) => {
				for (const provider of settings.providers) {
					dropdown.addOption(provider.id, provider.name || "Unnamed provider");
				}
				dropdown.setValue(activeProvider.id).onChange(async (value) => {
					settings.activeProviderId = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName("Provider profiles").setHeading();

		new Setting(containerEl)
			.setName("Edit profile")
			.setDesc("Choose a profile to configure. The active profile above is the one used for OCR.")
			.addDropdown((dropdown) => {
				for (const provider of settings.providers) {
					dropdown.addOption(provider.id, provider.name || "Unnamed provider");
				}
				dropdown.setValue(editingProvider.id).onChange((value) => {
					this.editingProviderId = value;
					this.display();
				});
			})
			.addButton((button) =>
				button
					.setButtonText("Add")
					.setTooltip("Add a provider profile")
					.onClick(async () => {
						const profile = createProviderProfile();
						settings.providers.push(profile);
						this.editingProviderId = profile.id;
						await this.plugin.saveSettings();
						this.display();
					}),
			)
			.addButton((button) =>
				button
					.setButtonText("Delete")
					.setWarning()
					.setTooltip("Delete the selected provider profile")
					.onClick(async () => {
						if (settings.providers.length <= 1) {
							new Notice("At least one provider profile is required.");
							return;
						}

						settings.providers = settings.providers.filter(
							(provider) => provider.id !== editingProvider.id,
						);
						const nextProvider = settings.providers[0];
						if (!nextProvider) {
							new Notice("At least one provider profile is required.");
							return;
						}
						if (settings.activeProviderId === editingProvider.id) {
							settings.activeProviderId = nextProvider.id;
						}
						this.editingProviderId = nextProvider.id;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		new Setting(containerEl)
			.setName("Profile name")
			.setDesc("Shown in the provider dropdowns.")
			.addText((text) =>
				text.setValue(editingProvider.name).onChange(async (value) => {
					editingProvider.name = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("API format")
			.setDesc(
				"Use OpenAI-compatible for OpenAI, DeepSeek, LithosAI, OpenRouter, Ollama, LM Studio, and similar endpoints. " +
					"Use Anthropic-compatible for Claude and Anthropic-format proxies.",
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("openai", PROVIDER_LABELS.openai)
					.addOption("anthropic", PROVIDER_LABELS.anthropic)
					.setValue(editingProvider.provider)
					.onChange(async (value) => {
						editingProvider.provider = value as Provider;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Base URL")
			.setDesc(
				"API root such as https://api.deepseek.com/v1 or https://api.lithosai.cloud/v1. " +
					"You can also paste a full …/chat/completions or …/messages endpoint.",
			)
			.addText((text) =>
				text
					.setPlaceholder("https://api.example.com/v1")
					.setValue(editingProvider.baseUrl)
					.onChange(async (value) => {
						editingProvider.baseUrl = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("API key")
			.setDesc(
				"Leave empty only for local servers that do not require authentication. " +
					"The key is stored in plain text in this plugin's data.json.",
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("API key")
					.setValue(editingProvider.apiKey)
					.onChange(async (value) => {
						editingProvider.apiKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc("A vision-capable model ID exposed by this endpoint.")
			.addText((text) =>
				text
					.setPlaceholder("deepseek-v4-flash-vision-exp")
					.setValue(editingProvider.model)
					.onChange(async (value) => {
						editingProvider.model = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Extra request parameters")
			.setDesc(
				"Optional JSON object merged into the request body, e.g. {\"temperature\": 0}. " +
					"Use this for provider-specific options.",
			)
			.addTextArea((text) => {
				text.inputEl.rows = 3;
				text
					.setPlaceholder("{\"temperature\": 0}")
					.setValue(editingProvider.extraParams)
					.onChange(async (value) => {
						editingProvider.extraParams = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Extra request headers")
			.setDesc(
				"Optional JSON object merged into the request headers. " +
					"Useful for OpenRouter or proxy-specific headers.",
			)
			.addTextArea((text) => {
				text.inputEl.rows = 3;
				text
					.setPlaceholder("{\"HTTP-Referer\": \"https://obsidian.md\"}")
					.setValue(editingProvider.extraHeaders)
					.onChange(async (value) => {
						editingProvider.extraHeaders = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("Output").setHeading();

		new Setting(containerEl)
			.setName("Formatting")
			.setDesc("How the generated LaTeX is wrapped. Choose formula only if your note already provides math delimiters.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("", "Formula only")
					.addOption("$", "Inline — $…$")
					.addOption("$$", "Block — $$…$$")
					.setValue(settings.delimiters)
					.onChange(async (value) => {
						settings.delimiters = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Clipboard command action")
			.setDesc("What the main “Convert clipboard image to LaTeX” command should do with the result.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("copy", "Copy LaTeX to the clipboard")
					.addOption("insert", "Insert LaTeX at the cursor")
					.setValue(settings.clipboardAction)
					.onChange(async (value) => {
						settings.clipboardAction = value === "insert" ? "insert" : "copy";
						await this.plugin.saveSettings();
					}),
			);

		let promptArea: TextAreaComponent | null = null;

		new Setting(containerEl)
			.setName("Prompt")
			.setDesc("Instructions sent to the model together with the image. Ask for bare LaTeX so the output is easy to clean up.")
			.addTextArea((text) => {
				promptArea = text;
				text.inputEl.rows = 6;
				text.inputEl.addClass("llm-latex-ocr-prompt");
				text
					.setValue(settings.prompt)
					.onChange(async (value) => {
						settings.prompt = value;
						await this.plugin.saveSettings();
					});
			})
			.addButton((button) =>
				button
					.setButtonText("Reset")
					.setTooltip("Restore the default prompt")
					.onClick(async () => {
						settings.prompt = DEFAULT_PROMPT;
						promptArea?.setValue(DEFAULT_PROMPT);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Automation").setHeading();

		if (Platform.isDesktopApp) {
			new Setting(containerEl)
				.setName("Automatic clipboard OCR")
				.setDesc(
					"Watch the clipboard while the Obsidian window is focused and immediately convert any new image to LaTeX, replacing the clipboard contents. " +
						"Images already on the clipboard when this is enabled are ignored. " +
						"This will also process non-equation images, send them to your active provider, and may incur API costs. " +
						"Use the “Toggle automatic clipboard OCR” command to pause it quickly.",
				)
				.addToggle((toggle) =>
					toggle.setValue(settings.autoClipboardOcr).onChange(async (value) => {
						settings.autoClipboardOcr = value;
						await this.plugin.saveSettings();
						this.plugin.refreshAutoClipboardWatcher();
						new Notice(`Automatic clipboard OCR ${value ? "enabled" : "disabled"}.`);
					}),
				);
		} else {
			containerEl.createEl("p", {
				cls: "setting-item-description",
				text:
					"Automatic clipboard OCR is available in the desktop app only. " +
					"On mobile, use the image OCR window.",
			});
		}

		new Setting(containerEl).setName("Advanced").setHeading();

		new Setting(containerEl)
			.setName("Max output tokens")
			.setDesc("Upper bound for the model response. Set to 0 to omit the parameter (some providers require it, so 2048 is a safe default).")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.setValue(String(settings.maxTokens));
				text.onChange(async (value) => {
					const parsed = Number.parseInt(value, 10);
					if (!Number.isFinite(parsed) || parsed < 0) return;
					settings.maxTokens = parsed;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Max image dimension")
			.setDesc("Downscale images so their longest side is at most this many pixels before uploading. Set to 0 to disable resizing.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.setValue(String(settings.maxImageDimension));
				text.onChange(async (value) => {
					const parsed = Number.parseInt(value, 10);
					if (!Number.isFinite(parsed) || parsed < 0) return;
					settings.maxImageDimension = parsed;
					await this.plugin.saveSettings();
				});
			});

		containerEl.createEl("p", {
			cls: "setting-item-description",
			text:
				"API keys are stored per profile in this plugin's data.json inside your vault's " +
				`${this.app.vault.configDir} folder. ` +
				"Images are sent directly from Obsidian to the selected provider's endpoint; this plugin does not use an intermediary server.",
		});
	}
}
