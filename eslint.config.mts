import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			// The sentence-case rule lowercases acronyms (OCR, LaTeX) and model
			// IDs, which produces incorrect UI text for this plugin.
			'obsidianmd/ui/sentence-case': 'off',
			// The declarative settings API requires Obsidian 1.13+. This plugin
			// keeps the classic settings tab for compatibility with older apps.
			'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
			// display() and setWarning() are retained for the same compatibility
			// reason; their replacements require newer Obsidian versions.
			'@typescript-eslint/no-deprecated': 'off',
		},
	},
);
