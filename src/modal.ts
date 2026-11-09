import { App, Modal, Notice } from "obsidian";
import { formatLatex } from "./api";
import { copyTextToClipboard, readClipboardImage } from "./image";
import type LLMLatexOCR from "./main";

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

export class LLMLatexOCRModal extends Modal {
	private readonly plugin: LLMLatexOCR;
	private blob: Blob | null = null;
	private objectUrl: string | null = null;
	private imageEl!: HTMLImageElement;
	private placeholderEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private resultEl!: HTMLTextAreaElement;
	private convertButton!: HTMLButtonElement;

	constructor(app: App, plugin: LLMLatexOCR) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		this.modalEl.addClass("llm-latex-ocr-modal");
		this.titleEl.setText("LLM LaTeX OCR");

		const imageContainer = contentEl.createDiv({ cls: "image-container" });
		this.imageEl = imageContainer.createEl("img");
		this.imageEl.hide();
		this.placeholderEl = imageContainer.createDiv({
			cls: "image-placeholder",
			text: "No image selected. Paste from the clipboard or choose a file.",
		});

		const toolbar = contentEl.createDiv({ cls: "toolbar" });
		const pasteButton = toolbar.createEl("button", { text: "Paste from clipboard" });
		const chooseButton = toolbar.createEl("button", { text: "Choose image…" });
		this.convertButton = toolbar.createEl("button", {
			cls: "mod-cta",
			text: "Convert to LaTeX",
		});

		const fileInput = contentEl.createEl("input");
		fileInput.type = "file";
		fileInput.accept = "image/*";
		fileInput.hide();

		this.statusEl = contentEl.createDiv({ cls: "status", text: "" });
		contentEl.createEl("label", { cls: "result-label", text: "LaTeX" });
		this.resultEl = contentEl.createEl("textarea", { cls: "result" });
		this.resultEl.rows = 7;
		this.resultEl.placeholder = "The generated LaTeX will appear here.";

		const actions = contentEl.createDiv({ cls: "toolbar" });
		const copyButton = actions.createEl("button", { text: "Copy LaTeX" });
		const insertButton = actions.createEl("button", { text: "Insert at cursor" });

		pasteButton.addEventListener("click", () => {
			void this.loadFromClipboard();
		});

		chooseButton.addEventListener("click", () => {
			fileInput.click();
		});

		fileInput.addEventListener("change", () => {
			const file = fileInput.files?.[0];
			if (file) {
				this.setBlob(file, file.name);
			}
			fileInput.value = "";
		});

		this.convertButton.addEventListener("click", () => {
			void this.convert();
		});

		copyButton.addEventListener("click", () => {
			void this.copyResult(copyButton);
		});

		insertButton.addEventListener("click", () => {
			this.insertResult();
		});

		void this.loadFromClipboard(true);
	}

	private async loadFromClipboard(quiet = false) {
		try {
			const blob = await readClipboardImage();
			this.setBlob(blob, "Clipboard image");
		} catch (error) {
			if (!quiet) {
				this.setStatus(getErrorMessage(error), true);
			}
		}
	}

	private setBlob(blob: Blob, label: string) {
		this.blob = blob;

		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
		}
		this.objectUrl = URL.createObjectURL(blob);

		this.imageEl.src = this.objectUrl;
		this.imageEl.show();
		this.placeholderEl.hide();
		this.resultEl.value = "";
		this.setStatus(`${label} ready.`);
	}

	private setStatus(message: string, isError = false) {
		this.statusEl.textContent = message;
		this.statusEl.classList.toggle("error", isError);
	}

	private async convert() {
		if (!this.blob) {
			new Notice("Select or paste an image first.");
			return;
		}

		this.convertButton.disabled = true;
		this.setStatus(`Converting image to LaTeX with ${this.plugin.getActiveProvider().name}…`);

		try {
			const latex = await this.plugin.recognize(this.blob);
			this.resultEl.value = formatLatex(latex, this.plugin.settings.delimiters);
			this.setStatus("Done. Copy the result or insert it at the cursor.");
		} catch (error) {
			this.setStatus(getErrorMessage(error), true);
			new Notice(`LaTeX OCR failed: ${getErrorMessage(error)}`, 10000);
			console.error("llm-latex-ocr:", error);
		} finally {
			this.convertButton.disabled = false;
		}
	}

	private async copyResult(button: HTMLButtonElement) {
		const text = this.resultEl.value.trim();
		if (!text) {
			new Notice("Convert an image first.");
			return;
		}

		const originalLabel = button.textContent;
		try {
			await copyTextToClipboard(this.resultEl.value);
			button.textContent = "Copied!";
			window.setTimeout(() => {
				button.textContent = originalLabel;
			}, 1200);
			new Notice("LaTeX copied to the clipboard.");
		} catch (error) {
			new Notice(`Could not copy: ${getErrorMessage(error)}`);
		}
	}

	private insertResult() {
		const text = this.resultEl.value.trim();
		if (!text) {
			new Notice("Convert an image first.");
			return;
		}

		if (this.plugin.insertTextAtCursor(this.resultEl.value)) {
			new Notice("LaTeX inserted.");
			this.close();
		} else {
			new Notice("No active note. Copy the LaTeX instead.");
		}
	}

	onClose() {
		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = null;
		}
		this.contentEl.empty();
	}
}
