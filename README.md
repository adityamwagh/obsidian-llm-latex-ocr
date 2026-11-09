# LLM LaTeX OCR for Obsidian

Turn equation screenshots and images into LaTeX using **any OpenAI- or Anthropic-compatible vision model** and your own API key.

This is a modern rewrite of [lucasvanmol/obsidian-latex-ocr](https://github.com/lucasvanmol/obsidian-latex-ocr). The original relied on the Hugging Face inference API and a local Python model; this version keeps the same clipboard-first workflow but talks directly to a vision LLM you configure.

## Features

- **Screenshot → LaTeX clipboard.** Snip an equation, run one command, and the clipboard contains the generated LaTeX source.
- **Or fully automatic.** Enable automatic clipboard OCR and a new screenshot is converted as soon as the Obsidian window is focused, with no command needed.
- **Cross-platform.** Works on Windows, macOS, Linux, Android, and iOS. Mobile uses the paste-to-LaTeX workflow; automatic clipboard watching is desktop-only.
- **Insert at cursor.** Optionally replace the screenshot workflow with direct insertion into the active note.
- **Paste handling.** Choose whether pasted images paste normally, convert to LaTeX, or show a preview asking which to do.
- **Multiple provider profiles.** Configure as many endpoints as you like and switch the active one with a dropdown or command.
- **Any compatible provider.** OpenAI, Anthropic, DeepSeek, LithosAI, OpenRouter, Ollama, LM Studio, vLLM, or any other OpenAI-compatible endpoint.
- **Vault image support.** Right-click an image in Obsidian and choose **Generate LaTeX with LLM OCR**.
- **Image OCR window.** Paste from the clipboard or choose a file, preview the image, inspect the result, then copy or insert it.
- **Configurable output.** Return bare LaTeX, `$inline$`, or `$$block$$`.
- **Editable prompt.** Tune the instructions sent to the model.
- **No intermediary server.** Images go straight from Obsidian to the endpoint you configure.

## Platform support

| Platform | Core commands and image window | Paste handling | Automatic clipboard OCR |
| --- | --- | --- | --- |
| Windows, macOS, Linux | Yes | Yes | Yes |
| Android, iOS | Yes | Yes | No |

Automatic clipboard watching is desktop-only because reading clipboard images without a user gesture requires Electron. On mobile, use **Pasted images → Ask each time** and paste a screenshot directly into a note.

## Installation

This plugin is not in the community catalogue. Install it manually. It requires [Bun](https://bun.sh) for development:

```bash
git clone <this-repository-url> obsidian-llm-latex-ocr
cd obsidian-llm-latex-ocr
bun install
bun run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` into your vault:

```bash
mkdir -p "/path/to/YourVault/.obsidian/plugins/llm-latex-ocr"
cp main.js manifest.json styles.css "/path/to/YourVault/.obsidian/plugins/llm-latex-ocr/"
```

For development, you can symlink the repository instead:

```bash
ln -s "$(pwd)" "/path/to/YourVault/.obsidian/plugins/llm-latex-ocr"
```

Finally, restart Obsidian (or reload plugins) and enable **LLM LaTeX OCR** under **Settings → Community plugins**.

## Configuration

Open **Settings → LLM LaTeX OCR**.

### Provider profiles

The plugin supports any number of provider profiles. Each profile has its own API format, base URL, API key, model, and extra request options.

- **Use for OCR** selects the active profile used for all requests.
- **Edit profile** selects which profile the fields below configure.
- **Add** creates a new profile and **Delete** removes the selected one. At least one profile must remain.

| Field | What to enter |
| --- | --- |
| Profile name | Label shown in the provider dropdowns |
| API format | OpenAI-compatible or Anthropic-compatible |
| Base URL | API root, or a full `…/chat/completions` / `…/messages` endpoint |
| API key | Your key. Leave empty only for an unauthenticated local server |
| Model | A **vision-capable** model ID |
| Extra request parameters | Optional JSON merged into the request body |
| Extra request headers | Optional JSON merged into the request headers |

The default configuration includes two profiles:

| Profile | Base URL | Default model |
| --- | --- | --- |
| LithosAI | `https://api.lithosai.cloud/v1` | `deepseek-ai/DeepSeek-V4.1-Flash` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-v4-flash-vision-exp` |

Other examples:

| Provider | Base URL | Model examples |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini`, `gpt-4o` |
| Anthropic | `https://api.anthropic.com/v1` | `claude-sonnet-4-5` |
| OpenRouter | `https://openrouter.ai/api/v1` | `google/gemini-2.5-flash`, `anthropic/claude-sonnet-4.5` |
| Ollama | `http://localhost:11434/v1` | `qwen2.5-vl`, `llama3.2-vision` |
| LM Studio | `http://localhost:1234/v1` | whatever model is loaded |

For OpenRouter, you may want extra headers in the profile's **Extra request headers**:

```json
{"HTTP-Referer": "https://obsidian.md", "X-Title": "Obsidian LLM LaTeX OCR"}
```

To switch providers without opening settings, run **LLM LaTeX OCR: Select active OCR provider**.

## Workflow

1. Snip or screenshot an equation so the image is in your system clipboard.
2. Run **LLM LaTeX OCR: Convert clipboard image to LaTeX**.
3. The clipboard now contains the LaTeX source. Paste it into your note with `Ctrl+V` / `Cmd+V`.

Bind the command to a hotkey such as `Ctrl+Alt+V` / `Cmd+Alt+V` under **Settings → Hotkeys** for a one-step workflow.

By default the main command **copies** the result to the clipboard. If you prefer direct insertion, either:

- change **Settings → LLM LaTeX OCR → Output → Clipboard command action** to **Insert LaTeX at the cursor**, or
- use the command **Convert clipboard image and insert LaTeX at cursor**.

### Available commands

| Command | Behavior |
| --- | --- |
| Convert clipboard image to LaTeX | Uses the configured clipboard action (copy by default) |
| Convert clipboard image and insert LaTeX at cursor | Inserts directly into the active note |
| Convert clipboard image and copy LaTeX | Always copies the result |
| Open image OCR window | Paste/choose an image, preview, copy or insert the result |
| Select active OCR provider | Quickly switch the active provider profile |
| Toggle automatic clipboard OCR | Pause or resume the clipboard watcher |

Images in the vault also get a **Generate LaTeX with LLM OCR** item in their right-click menu.

### Automatic mode (desktop)

Enable **Settings → LLM LaTeX OCR → Automation → Automatic clipboard OCR** to skip the command entirely:

1. Snip an equation.
2. Switch to Obsidian (or return focus to it after snipping).
3. The plugin detects the clipboard image, converts it, and replaces the clipboard with LaTeX.
4. Paste with `Ctrl+V` / `Cmd+V`.

The watcher only runs while the Obsidian window is focused. It processes any **new** clipboard image copied after auto mode starts (an image already on the clipboard when the plugin loads is ignored), so disable it when copying unrelated images. Use **LLM LaTeX OCR: Toggle automatic clipboard OCR** to pause/resume without opening settings. Conversion usually takes a few seconds; wait for the notification before pasting.

### Paste handling (all platforms)

Set **Settings → LLM LaTeX OCR → Automation → Pasted images** to one of:

- **Paste normally** — Obsidian handles image pastes as usual. This is the default.
- **Ask each time** — shows a preview with **Convert to LaTeX**, **Insert image**, and **Cancel**.
- **Convert to LaTeX** — converts every pasted image automatically.

This works on desktop and mobile and is the recommended automatic workflow on phones and tablets.

## Output formatting

Choose how the result is wrapped:

- **Formula only** — `\frac{a}{b}` (useful when your note already has math delimiters)
- **Inline** — `$\frac{a}{b}$`
- **Block** — `$$\frac{a}{b}$$` (default)

The plugin strips Markdown code fences, surrounding delimiters, and other wrapper text the model may add.

## Privacy and security

- API keys are stored **per profile** in plain text in `.obsidian/plugins/llm-latex-ocr/data.json`. Do not sync that file to an untrusted location, and do not commit it.
- Images are sent directly from Obsidian to the API endpoint configured in the settings. This plugin does not use an intermediary server or telemetry.
- On desktop, the plugin may use Electron's clipboard API to read clipboard images without a user gesture. On mobile, it uses the web Clipboard API, file picker, and paste events.
- Every OCR request is billed by your provider. Cost depends on the model and image size; the **Max image dimension** setting (default 1600 px) limits upload size.

## Limitations

- Automatic clipboard OCR is desktop-only; use the paste dialog or the image OCR window on mobile.
- The configured model must accept image input in OpenAI chat-completions or Anthropic Messages format.
- Very large images and long equations may need a higher **Max output tokens** value.
- OCR is probabilistic: check important equations before relying on them.

## Development

```bash
bun install
bun run dev     # watch mode, rebuilds main.js on change
bun run build   # type-check + production bundle
bun run lint    # ESLint with eslint-plugin-obsidianmd
```

The project scaffold follows the official [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin) (esbuild + ESLint + release workflow), with Bun used as the package manager and script runner.

Source layout:

```
src/
  main.ts               plugin lifecycle, commands, editor insertion
  api.ts                OpenAI/Anthropic request building and LaTeX cleanup
  auto-clipboard.ts     focused desktop clipboard watcher
  desktop-clipboard.ts  optional, lazily loaded Electron clipboard
  image.ts              clipboard/file reading, resizing, base64, clipboard writes
  modal.ts              image OCR window
  paste-image-modal.ts  preview dialog for pasted images
  paste-ocr.ts          paste handler for image conversion
  provider-switcher.ts  quick active-provider picker
  settings.ts           settings interface, defaults, and migration
  settings-tab.ts       settings UI
```

See the official Obsidian [Build a plugin](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin) and [Mobile development](https://docs.obsidian.md/Plugins/Getting+started/Mobile+development) documentation for the platform APIs used here.

## Attribution

This project is inspired by [obsidian-latex-ocr](https://github.com/lucasvanmol/obsidian-latex-ocr) by Lucas Van Mol, which is licensed under the GNU GPL v3. The clipboard workflow, context-menu behavior, and user experience were inspired by that plugin. The inference layer has been reimplemented for configurable OpenAI/Anthropic-compatible vision APIs.

The original project is GPLv3. This version is distributed under the MIT License as an independent rewrite; if you copy code from the original project, review its GPLv3 terms first.

Licensed under the **MIT License**. See [LICENSE](LICENSE).
