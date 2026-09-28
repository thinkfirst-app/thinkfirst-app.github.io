# Contributing to Think First

Thanks for your interest. Think First is a small, dependency-free project, and contributions of every size are welcome: bug reports, ideas, wording fixes, and code.

## Reporting a bug or suggesting a feature

Open an issue using one of the templates. For bugs, say which part is involved (browser extension, Mac app, VS Code extension, or the website), what you expected, and what happened instead. Please never paste prompts or data you would not want public.

Security problems go to the address in [SECURITY.md](SECURITY.md), not to the issue tracker.

## Running from source

Everything runs without installing anything beyond Python 3 and a Chromium-based browser.

**The hub (dashboard and tracker)**

```sh
python3 hub/thinkfirst.py
```

The dashboard opens at http://127.0.0.1:47321. Data lives in `~/.thinkfirst/data.db`. Use `--install` to run it in the background and start at login, or `--uninstall` to remove that.

**The browser extension**

1. Open `chrome://extensions` and turn on Developer mode.
2. Click **Load unpacked** and choose the `browser-extension` folder.
3. Reload any open AI chat tabs. After editing a file, click the reload icon on the extension card.

**The VS Code extension**

Open the `vscode-extension` folder in VS Code and press F5 to launch an Extension Development Host. Or build the package with `scripts/build.sh` and install the `.vsix` with **Extensions: Install from VSIX**.

**The website**

Open `docs/index.html` in a browser. The download buttons point at the latest GitHub release.

## Building the packages

```sh
scripts/build.sh
```

This writes the three packages and a checksum file to `release/`. It needs `python3`, `zip`, and `node` (the VS Code package is built with the official `vsce` tool, fetched on demand). CI runs the same script on every push.

## Guidelines

- **Keep it private by default.** Nothing may send data off the device unless the person has explicitly turned that on. This is the project's core promise.
- **No dependencies.** The hub uses only the Python standard library. The extensions are plain JavaScript with no build step.
- **Plain language.** UI text and documentation avoid jargon. Read your wording out loud before committing it.
- **Test on a real AI site.** The guess box depends on the page structure of Claude, ChatGPT, and Gemini; check that it still appears and still sends.
- **One change per pull request.** Small, focused changes are reviewed quickly.

When you change something people will notice, add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md).

## Releasing a new version (maintainers)

```sh
scripts/bump-version.sh 1.0.1        # sets the number in every component
# move the Unreleased notes in CHANGELOG.md under a new [1.0.1] heading
git commit -am "Release 1.0.1"
git tag v1.0.1 && git push origin main v1.0.1
```

The release workflow builds the packages, adds SHA-256 checksums, and publishes the GitHub release. The website picks up the new version automatically. Store listings (Chrome Web Store, VS Code Marketplace) are updated by hand from the files in `release/`.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind.
