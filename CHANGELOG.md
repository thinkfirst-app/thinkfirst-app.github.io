# Changelog

All notable changes to Think First are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- The VS Code extension's package metadata now links to the real repository, website, and issue tracker instead of a placeholder address. The 1.0.0 package still carries the placeholder; it is corrected in the next release.

### Added

- `homepage_url` in the browser extension manifest.
- A build script, a version helper, and GitHub Actions workflows that check every push and publish releases from tags.
- The Mac app's `Info.plist` is now part of the source tree.

## [1.0.0] - 2026-09-28

First public release.

### Added

- **Browser extension** for Chrome, Edge, Brave, and Arc: a guess box before messages to Claude, ChatGPT, and Gemini, automatic comparison of your guess with the answer, prompt counting and task sorting on nine AI sites, and active-time tracking.
- **Mac app**: a background tracker and dashboard covering AI desktop apps and the Claude Code, Codex, and Gemini command-line tools, with goals, daily and weekly limits, AI-free hours, and alerts.
- **VS Code extension**, also for Cursor and Windsurf: estimates the share of your code that comes from AI suggestions, shows it in the status bar, and warns past a threshold you choose.
- Everything is stored on your own computer. There is no server, no account, and no analytics.

[Unreleased]: https://github.com/thinkfirst-app/thinkfirst-app.github.io/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/thinkfirst-app/thinkfirst-app.github.io/releases/tag/v1.0.0
