import { Platform } from "obsidian";

/**
 * Minimal surface of Electron's clipboard that this plugin uses. It is loaded
 * lazily and only on desktop; mobile builds never touch Electron or Node APIs.
 */
export interface DesktopClipboardImage {
	isEmpty(): boolean;
	toPNG(): Uint8Array;
}

export interface DesktopClipboard {
	readImage(): DesktopClipboardImage;
	writeText(text: string): void;
}

interface ElectronModule {
	clipboard?: DesktopClipboard;
}

let cachedClipboard: DesktopClipboard | null | undefined;

/**
 * Return Electron's clipboard on desktop, or undefined on mobile and in
 * environments where Electron is unavailable.
 */
export function getDesktopClipboard(): DesktopClipboard | undefined {
	if (!Platform.isDesktopApp) return undefined;
	if (cachedClipboard !== undefined) return cachedClipboard ?? undefined;

	const windowWithRequire = window as unknown as {
		require?: (module: string) => unknown;
	};
	if (typeof windowWithRequire.require !== "function") {
		return undefined;
	}

	try {
		const electron = windowWithRequire.require("electron") as ElectronModule;
		cachedClipboard = electron.clipboard ?? null;
	} catch {
		return undefined;
	}

	return cachedClipboard ?? undefined;
}
