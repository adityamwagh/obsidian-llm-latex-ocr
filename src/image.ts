import { App, Platform, TFile } from "obsidian";
import type { ImagePayload } from "./api";
import { getDesktopClipboard } from "./desktop-clipboard";

const MIME_BY_EXTENSION: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	bmp: "image/bmp",
	svg: "image/svg+xml",
	avif: "image/avif",
	tif: "image/tiff",
	tiff: "image/tiff",
};

const IMAGE_EXTENSIONS = new Set(Object.keys(MIME_BY_EXTENSION));

export function isImageFile(file: TFile): boolean {
	return IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}

export function mimeTypeForFile(file: TFile): string {
	return MIME_BY_EXTENSION[file.extension.toLowerCase()] ?? "image/png";
}

function normalizeMediaType(type: string): string {
	const lower = type.toLowerCase();
	if (lower === "image/jpg") return "image/jpeg";
	if (lower.startsWith("image/")) return lower;
	return "image/png";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const chunkSize = 0x8000;
	let binary = "";
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

async function blobToBase64(blob: Blob): Promise<string> {
	return arrayBufferToBase64(await blob.arrayBuffer());
}

/**
 * Return the image currently on the clipboard, or null when there is none.
 * Never throws, so it is safe to call from a polling loop.
 */
export async function tryReadClipboardImage(): Promise<Blob | null> {
	const desktop = getDesktopClipboard();
	if (desktop) {
		try {
			const image = desktop.readImage();
			if (image.isEmpty()) return null;
			return new Blob([new Uint8Array(image.toPNG())], { type: "image/png" });
		} catch (error) {
			console.debug("llm-latex-ocr: desktop clipboard read failed", error);
			return null;
		}
	}

	if (
		typeof navigator !== "undefined" &&
		navigator.clipboard &&
		typeof navigator.clipboard.read === "function"
	) {
		try {
			const items = await navigator.clipboard.read();
			for (const item of items) {
				const imageType = item.types.find((type) => type.startsWith("image/"));
				if (imageType) {
					return await item.getType(imageType);
				}
			}
		} catch (error) {
			console.debug("llm-latex-ocr: browser clipboard read failed", error);
		}
	}

	return null;
}

/**
 * Stable fingerprint of an image, used to avoid processing the same clipboard
 * contents repeatedly.
 */
export async function hashBlob(blob: Blob): Promise<string> {
	const buffer = await blob.arrayBuffer();

	if (typeof crypto !== "undefined" && crypto.subtle) {
		try {
			const digest = await crypto.subtle.digest("SHA-256", buffer);
			return Array.from(new Uint8Array(digest))
				.map((byte) => byte.toString(16).padStart(2, "0"))
				.join("");
		} catch {
			// Fall through to the simple hash below.
		}
	}

	const bytes = new Uint8Array(buffer);
	let hash = 2166136261;
	for (let i = 0; i < bytes.length; i++) {
		hash ^= bytes[i] ?? 0;
		hash = Math.imul(hash, 16777619);
	}
	return `${bytes.length}-${(hash >>> 0).toString(16)}`;
}

/**
 * Read an image from the system clipboard.
 */
export async function readClipboardImage(): Promise<Blob> {
	const image = await tryReadClipboardImage();
	if (image) return image;

	throw new Error(
		Platform.isMobileApp
			? "Couldn't read an image from the clipboard. On mobile, use the image OCR window or paste the image into a note."
			: "No image found in the clipboard. Take a screenshot first, then run the command.",
	);
}

/**
 * Read an image stored in the vault as a Blob.
 */
export async function readFileAsBlob(app: App, file: TFile): Promise<Blob> {
	const buffer = await app.vault.readBinary(file);
	return new Blob([buffer], { type: mimeTypeForFile(file) });
}

async function downscale(blob: Blob, maxDimension: number): Promise<Blob> {
	if (maxDimension <= 0 || typeof createImageBitmap !== "function") {
		return blob;
	}

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(blob);
	} catch {
		// Unsupported format; let the API decide what to do with it.
		return blob;
	}

	const longestSide = Math.max(bitmap.width, bitmap.height);
	const scale = longestSide > maxDimension ? maxDimension / longestSide : 1;
	if (scale >= 1) {
		bitmap.close();
		return blob;
	}

	const canvas = activeDocument.body.createEl("canvas");
	canvas.hide();
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));

	try {
		const context = canvas.getContext("2d");
		if (!context) {
			bitmap.close();
			return blob;
		}

		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();

		const resized = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, "image/png");
		});

		return resized ?? blob;
	} finally {
		canvas.remove();
	}
}

/**
 * Turn a Blob into the base64 payload expected by vision APIs.
 */
export async function blobToImagePayload(blob: Blob, maxDimension: number): Promise<ImagePayload> {
	const prepared = await downscale(blob, maxDimension);
	return {
		data: await blobToBase64(prepared),
		mediaType: normalizeMediaType(prepared.type),
	};
}

/**
 * Copy text to the system clipboard, using the browser API first and
 * Electron's clipboard as a fallback.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
	if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
		try {
			await navigator.clipboard.writeText(text);
			return;
		} catch (error) {
			console.debug("llm-latex-ocr: browser clipboard write failed, trying Electron", error);
		}
	}

	const clipboard = getDesktopClipboard();
	if (clipboard) {
		try {
			clipboard.writeText(text);
			return;
		} catch (error) {
			console.debug("llm-latex-ocr: desktop clipboard write failed", error);
		}
	}

	throw new Error("The clipboard is not available.");
}
