import type { Editor } from "obsidian";
import type LLMLatexOCR from "./main";
import { PasteImageModal } from "./paste-image-modal";

export interface PastedImage {
	blob: Blob;
	name: string;
}

function getPastedImage(event: ClipboardEvent): PastedImage | null {
	const items = event.clipboardData?.items;
	if (items) {
		for (let index = 0; index < items.length; index++) {
			const item = items[index];
			if (item?.kind === "file" && item.type.startsWith("image/")) {
				const file = item.getAsFile();
				if (file) {
					return { blob: file, name: file.name || "Pasted image.png" };
				}
			}
		}
	}

	const files = event.clipboardData?.files;
	if (files) {
		for (let index = 0; index < files.length; index++) {
			const file = files[index];
			if (file?.type.startsWith("image/")) {
				return { blob: file, name: file.name || "Pasted image.png" };
			}
		}
	}

	return null;
}

/**
 * Handle images pasted directly into a Markdown editor. The user chooses
 * whether to convert them to LaTeX, insert them as normal attachments, or ask
 * each time.
 */
export function registerPasteImageHandler(plugin: LLMLatexOCR) {
	plugin.registerEvent(
		plugin.app.workspace.on(
			"editor-paste",
			(event: ClipboardEvent, editor: Editor) => {
				if (event.defaultPrevented) return;

				const mode = plugin.settings.pasteImageMode;
				if (mode === "off") return;

				const image = getPastedImage(event);
				if (!image) return;

				event.preventDefault();

				if (mode === "convert") {
					void plugin.insertLatexFromBlob(image.blob, editor);
					return;
				}

				new PasteImageModal(plugin.app, plugin, image, editor).open();
			},
		),
	);
}
