import { Notice, Platform } from "obsidian";
import { formatLatex } from "./api";
import { copyTextToClipboard, hashBlob, tryReadClipboardImage } from "./image";
import type { LLMLatexOCRSettings, ProviderProfile } from "./settings";

export interface AutoClipboardHost {
	settings: LLMLatexOCRSettings;
	getActiveProvider(): ProviderProfile;
	recognize(blob: Blob): Promise<string>;
}

const POLL_INTERVAL_MS = 1000;

/**
 * Watches the desktop clipboard for new images and replaces them with LaTeX.
 *
 * Clipboard image access without a user gesture requires Electron, so this
 * feature is desktop-only. On mobile, the paste handler provides the automatic
 * path instead.
 */
export class AutoClipboardController {
	private readonly host: AutoClipboardHost;
	private timer: number | null = null;
	private inFlight = false;
	private priming = false;
	private lastHash: string | null = null;
	private generation = 0;

	constructor(host: AutoClipboardHost) {
		this.host = host;
	}

	/**
	 * Re-read the setting and restart the watcher. Whatever is already on the
	 * clipboard is treated as handled so a stale image is never uploaded.
	 */
	refresh() {
		this.stop();

		if (!this.host.settings.autoClipboardOcr || !Platform.isDesktopApp) {
			return;
		}

		const generation = this.generation;
		this.priming = true;
		void (async () => {
			try {
				const existing = await tryReadClipboardImage();
				if (generation !== this.generation) return;
				this.lastHash = existing ? await hashBlob(existing) : null;
			} catch (error) {
				console.debug("llm-latex-ocr: could not prime clipboard state", error);
			} finally {
				if (generation === this.generation) {
					this.priming = false;
				}
			}
		})();

		if (this.isFocused()) {
			this.startTimer();
			window.setTimeout(() => {
				void this.poll();
			}, 250);
		}
	}

	stop() {
		this.generation += 1;
		this.priming = false;
		this.lastHash = null;
		if (this.timer !== null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
	}

	handleFocus() {
		if (!this.host.settings.autoClipboardOcr || !Platform.isDesktopApp) return;
		this.startTimer();
		void this.poll();
	}

	handleBlur() {
		if (this.timer !== null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
	}

	handleVisibilityChange() {
		if (!this.host.settings.autoClipboardOcr || !Platform.isDesktopApp) return;
		if (activeDocument.visibilityState === "visible") {
			this.startTimer();
			void this.poll();
		} else {
			this.handleBlur();
		}
	}

	private startTimer() {
		if (this.timer !== null) return;
		this.timer = window.setInterval(() => {
			void this.poll();
		}, POLL_INTERVAL_MS);
	}

	private isFocused(): boolean {
		return activeDocument.hasFocus() && activeDocument.visibilityState === "visible";
	}

	private async poll() {
		if (!this.host.settings.autoClipboardOcr || !Platform.isDesktopApp) return;
		if (this.inFlight || this.priming || !this.isFocused()) return;

		this.inFlight = true;
		const generation = this.generation;
		let notice: Notice | null = null;

		try {
			const blob = await tryReadClipboardImage();
			if (generation !== this.generation) return;
			if (!blob) {
				this.lastHash = null;
				return;
			}

			const hash = await hashBlob(blob);
			if (generation !== this.generation) return;
			if (hash === this.lastHash) return;

			this.lastHash = hash;
			notice = new Notice(
				`Auto OCR: converting with ${this.host.getActiveProvider().name}…`,
				0,
			);

			const latex = await this.host.recognize(blob);
			const formatted = formatLatex(latex, this.host.settings.delimiters);

			if (
				generation !== this.generation ||
				!this.host.settings.autoClipboardOcr
			) {
				notice.hide();
				return;
			}

			// If focus was lost during the request, allow the same image to be
			// retried when the user returns to Obsidian.
			if (!this.isFocused()) {
				this.lastHash = null;
				notice.hide();
				return;
			}

			// Do not clobber a different clipboard item copied meanwhile.
			const current = await tryReadClipboardImage();
			if (!current || (await hashBlob(current)) !== hash) {
				notice.hide();
				return;
			}

			await copyTextToClipboard(formatted);
			notice.hide();
			new Notice("LaTeX copied to the clipboard (auto).", 1500);
		} catch (error) {
			notice?.hide();
			new Notice(`Auto LaTeX OCR failed: ${errorMessage(error)}`, 8000);
			console.error("llm-latex-ocr auto:", error);
		} finally {
			this.inFlight = false;
		}
	}
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
