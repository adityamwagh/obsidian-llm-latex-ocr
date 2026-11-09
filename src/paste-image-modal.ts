import { App, Editor, Modal } from "obsidian";
import type LLMLatexOCR from "./main";
import type { PastedImage } from "./paste-ocr";

/**
 * Shown when an image is pasted and the user chose "Ask each time".
 */
export class PasteImageModal extends Modal {
	private readonly plugin: LLMLatexOCR;
	private readonly image: PastedImage;
	private readonly editor: Editor;
	private objectUrl: string | null = null;

	constructor(app: App, plugin: LLMLatexOCR, image: PastedImage, editor: Editor) {
		super(app);
		this.plugin = plugin;
		this.image = image;
		this.editor = editor;
	}

	onOpen() {
		const { contentEl } = this;
		this.modalEl.addClass("llm-latex-ocr-modal");
		this.titleEl.setText("Pasted image");

		contentEl.createEl("p", {
			text: "Convert this image to LaTeX, or insert it into the note as an image.",
		});
		contentEl.createEl("p", {
			cls: "setting-item-description",
			text: this.image.name,
		});

		const imageContainer = contentEl.createDiv({ cls: "image-container" });
		const imageEl = imageContainer.createEl("img");
		this.objectUrl = URL.createObjectURL(this.image.blob);
		imageEl.src = this.objectUrl;

		const toolbar = contentEl.createDiv({ cls: "toolbar" });
		const convertButton = toolbar.createEl("button", {
			cls: "mod-cta",
			text: "Convert to LaTeX",
		});
		const insertButton = toolbar.createEl("button", { text: "Insert image" });
		toolbar.createEl("button", { text: "Cancel" }).addEventListener("click", () => {
			this.close();
		});

		convertButton.addEventListener("click", () => {
			this.close();
			void this.plugin.insertLatexFromBlob(this.image.blob, this.editor);
		});

		insertButton.addEventListener("click", () => {
			this.close();
			void this.plugin.insertImageFromBlob(this.image.blob, this.editor, this.image.name);
		});
	}

	onClose() {
		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = null;
		}
		this.contentEl.empty();
	}
}
