import { Editor, MarkdownView, Notice, Platform, Plugin, TFile } from "obsidian";
import { extractLatex, formatLatex, recognizeImage } from "./api";
import { AutoClipboardController } from "./auto-clipboard";
import { blobToImagePayload, copyTextToClipboard, isImageFile, readClipboardImage, readFileAsBlob } from "./image";
import { LLMLatexOCRModal } from "./modal";
import { ProviderSuggestModal } from "./provider-switcher";
import { ClipboardAction, LLMLatexOCRSettings, ProviderProfile, getActiveProvider as getActiveProviderProfile, normalizeSettings } from "./settings";
import { LLMLatexOCRSettingsTab } from "./settings-tab";

const PLACEHOLDER = "⏳ LaTeX OCR…";

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

export default class LLMLatexOCR extends Plugin {
	settings!: LLMLatexOCRSettings;
	private autoClipboard!: AutoClipboardController;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new LLMLatexOCRSettingsTab(this.app, this));

		// Right-click "Generate LaTeX" on images inside the vault.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile) || !isImageFile(file)) return;

				menu.addItem((item) => {
					item
						.setTitle("Generate LaTeX with LLM OCR")
						.setIcon("sigma")
						.setSection("info")
						.onClick(() => {
							void this.convertFileToClipboard(file);
						});
				});
			}),
		);

		this.addRibbonIcon("sigma", "LLM LaTeX OCR", () => {
			new LLMLatexOCRModal(this.app, this).open();
		});

		// Main command: behavior controlled by the "Clipboard command action" setting.
		this.addCommand({
			id: "convert-clipboard-image",
			name: "Convert clipboard image to LaTeX",
			callback: () => {
				void this.convertClipboard(this.settings.clipboardAction);
			},
		});

		this.addCommand({
			id: "convert-clipboard-image-insert",
			name: "Convert clipboard image and insert LaTeX at cursor",
			editorCallback: (editor) => {
				void this.convertClipboardWithEditor("insert", editor);
			},
		});

		this.addCommand({
			id: "convert-clipboard-image-copy",
			name: "Convert clipboard image and copy LaTeX",
			callback: () => {
				void this.convertClipboard("copy");
			},
		});

		this.addCommand({
			id: "open-image-ocr-window",
			name: "Open image OCR window",
			callback: () => {
				new LLMLatexOCRModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "select-active-provider",
			name: "Select active OCR provider",
			callback: () => {
				new ProviderSuggestModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "toggle-auto-clipboard-ocr",
			name: "Toggle automatic clipboard OCR",
			checkCallback: (checking) => {
				if (!Platform.isDesktopApp) return false;
				if (!checking) {
					void this.toggleAutoClipboardOcr();
				}
				return true;
			},
		});

		this.autoClipboard = new AutoClipboardController(this);
		this.autoClipboard.refresh();

		// Only watch while Obsidian is the focused, visible window.
		this.registerDomEvent(activeWindow, "focus", () => {
			this.autoClipboard.handleFocus();
		});
		this.registerDomEvent(activeWindow, "blur", () => {
			this.autoClipboard.handleBlur();
		});
		this.registerDomEvent(activeDocument, "visibilitychange", () => {
			this.autoClipboard.handleVisibilityChange();
		});
	}

	onunload() {
		this.autoClipboard?.stop();
	}

	private async toggleAutoClipboardOcr() {
		this.settings.autoClipboardOcr = !this.settings.autoClipboardOcr;
		await this.saveSettings();
		this.autoClipboard.refresh();
		new Notice(
			`Automatic clipboard OCR ${this.settings.autoClipboardOcr ? "enabled" : "disabled"}.`,
		);
	}

	/**
	 * Restart the clipboard watcher after its setting changes.
	 */
	refreshAutoClipboardWatcher() {
		this.autoClipboard.refresh();
	}

	async loadSettings() {
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * The provider profile currently selected for OCR.
	 */
	getActiveProvider(): ProviderProfile {
		return getActiveProviderProfile(this.settings);
	}

	/**
	 * Send a Blob to the configured model and return cleaned, bare LaTeX.
	 */
	async recognize(blob: Blob): Promise<string> {
		const profile = this.getActiveProvider();
		const payload = await blobToImagePayload(blob, this.settings.maxImageDimension);
		const raw = await recognizeImage(profile, this.settings.prompt, this.settings.maxTokens, payload);
		const latex = extractLatex(raw);
		if (!latex) {
			throw new Error("The model returned an empty response.");
		}
		return latex;
	}

	/**
	 * Insert text into the currently active Markdown editor.
	 * Returns false when no editor is active.
	 */
	insertTextAtCursor(text: string): boolean {
		const editor = this.getActiveEditor();
		if (!editor) return false;
		editor.replaceSelection(text);
		return true;
	}

	private getActiveEditor(): Editor | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.editor ?? null;
	}

	private async convertClipboard(requestedAction: ClipboardAction) {
		await this.convertClipboardWithEditor(requestedAction, this.getActiveEditor());
	}

	private async convertClipboardWithEditor(requestedAction: ClipboardAction, editor: Editor | null) {
		let action: ClipboardAction = requestedAction;
		if (action === "insert" && !editor) {
			new Notice("No active note; copying the LaTeX to the clipboard instead.");
			action = "copy";
		}

		const notice = new Notice("Reading image from the clipboard…", 0);
		try {
			const blob = await readClipboardImage();

			if (action === "insert" && editor) {
				notice.hide();
				await this.insertLatexFromBlob(blob, editor);
				return;
			}

			notice.setMessage(`Converting image to LaTeX with ${this.getActiveProvider().name}…`);
			const latex = await this.recognize(blob);
			await copyTextToClipboard(formatLatex(latex, this.settings.delimiters));
			new Notice("LaTeX copied to the clipboard.");
		} catch (error) {
			new Notice(`LaTeX OCR failed: ${getErrorMessage(error)}`, 10000);
			console.error("llm-latex-ocr:", error);
		} finally {
			notice.hide();
		}
	}

	/**
	 * OCR a Blob and insert the result at the editor cursor, using a temporary
	 * placeholder while the request is in flight.
	 */
	async insertLatexFromBlob(blob: Blob, editor: Editor): Promise<void> {
		const fromLine = editor.getCursor("from").line;
		editor.replaceSelection(PLACEHOLDER);

		try {
			const latex = await this.recognize(blob);
			const formatted = formatLatex(latex, this.settings.delimiters);
			const replaced = this.replacePlaceholder(editor, formatted, fromLine);
			if (replaced) {
				new Notice("LaTeX inserted.");
			} else {
				editor.replaceSelection(formatted);
				new Notice("LaTeX inserted at the current cursor.");
			}
		} catch (error) {
			this.removePlaceholder(editor, fromLine);
			new Notice(`LaTeX OCR failed: ${getErrorMessage(error)}`, 10000);
			console.error("llm-latex-ocr:", error);
		}
	}

	private async convertFileToClipboard(file: TFile) {
		const notice = new Notice(`Converting ${file.name} to LaTeX with ${this.getActiveProvider().name}…`, 0);
		try {
			const blob = await readFileAsBlob(this.app, file);
			const latex = await this.recognize(blob);
			await copyTextToClipboard(formatLatex(latex, this.settings.delimiters));
			new Notice("LaTeX copied to the clipboard.");
		} catch (error) {
			new Notice(`LaTeX OCR failed: ${getErrorMessage(error)}`, 10000);
			console.error("llm-latex-ocr:", error);
		} finally {
			notice.hide();
		}
	}

	/**
	 * Replace the temporary marker with the final result. The document is
	 * searched because the editor may have been modified while the API call
	 * was in flight.
	 */
	private replacePlaceholder(editor: Editor, text: string, fromLine: number): boolean {
		const position = this.findPlaceholder(editor, fromLine);
		if (!position) return false;

		editor.replaceRange(
			text,
			position,
			{ line: position.line, ch: position.ch + PLACEHOLDER.length },
		);
		return true;
	}

	private removePlaceholder(editor: Editor, fromLine: number) {
		const position = this.findPlaceholder(editor, fromLine);
		if (!position) return;

		editor.replaceRange(
			"",
			position,
			{ line: position.line, ch: position.ch + PLACEHOLDER.length },
		);
	}

	private findPlaceholder(editor: Editor, fromLine: number): { line: number; ch: number } | null {
		const lineCount = editor.lineCount();
		if (lineCount === 0) return null;

		const startLine = Math.max(0, Math.min(fromLine, lineCount - 1));

		// Search from the original cursor line downwards, then from the top
		// of the document back to the cursor line.
		for (let line = startLine; line < lineCount; line++) {
			const ch = editor.getLine(line).indexOf(PLACEHOLDER);
			if (ch !== -1) return { line, ch };
		}
		for (let line = 0; line < startLine; line++) {
			const ch = editor.getLine(line).indexOf(PLACEHOLDER);
			if (ch !== -1) return { line, ch };
		}

		return null;
	}
}
