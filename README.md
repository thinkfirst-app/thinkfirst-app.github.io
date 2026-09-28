<p align="center"><img src="docs/icon.png" width="96" alt=""></p>

# Think First

**Think first. Then ask AI.**

Think First has you write a quick guess before AI answers, shows you how close you were, and keeps an honest record of how much you rely on AI across your browser, apps, and code editor. Everything stays on your computer.

![Think First dashboard](docs/dashboard.png)

## Install

Download the latest version from the [Releases page](../../releases/latest).

| Part | Download | What it does |
|---|---|---|
| Browser extension | `Think-First-Chrome-1.0.0.zip` | Guess box and prompt tracking on ChatGPT, Claude, Gemini, and 6 more AI sites |
| Mac app | `Think-First-Mac.zip` | Tracks AI desktop apps and AI command-line tools; goals, alerts, and the full dashboard |
| VS Code extension | `think-first-tracker-1.0.0.vsix` | Estimates how much of your code comes from AI |

Setup steps are on the project website.

## Privacy

There's no server and no account. Data is stored on your device in `~/.thinkfirst/data.db` and the browser's local storage. See [PRIVACY.md](PRIVACY.md).

## Project layout

- `browser-extension/`: Chrome extension (Manifest V3)
- `hub/`: the desktop tracker and dashboard (Python standard library only)
- `mac/`: the launcher inside the Mac app
- `vscode-extension/`: VS Code extension
- `docs/`: the website, served with GitHub Pages
- `store/`: Chrome Web Store listing text and images

Running the tracker from source: `python3 hub/thinkfirst.py`

## License

MIT
