# Think First privacy policy

Last updated: September 27, 2026

Think First is a set of tools (a browser extension, a Mac app, and a VS Code extension) that helps you track and reflect on your own AI use. This policy explains what they handle and where it goes.

## The short version

Everything Think First records stays on your computer. There is no Think First server, no account, no analytics, and no advertising. We never sell or share your data, and we couldn't if we wanted to, because we never receive it.

## What Think First records

- **Prompts you send on supported AI websites**: the text (which you can turn off), the site, the time, and a task category such as "Coding" or "Emails."
- **Your guesses** and the result of comparing each guess with the AI's answer.
- **Active time** on supported AI websites and in AI desktop apps you list, measured only while you're actively using them.
- **Prompts you send to AI command-line tools** (Claude Code, Codex CLI, Gemini CLI), read from the history files those tools keep on your computer.
- **Editing statistics** in VS Code: counts of characters typed, pasted, and inserted from AI suggestions, by programming language. The contents of your code are not recorded.

## Where it is stored

- Browser extension: in the browser's local extension storage on your device.
- Mac app and VS Code extension: in a database file at `~/.thinkfirst/data.db` on your computer.
- The browser and VS Code extensions send their records to the Mac app over a local connection (127.0.0.1) that never leaves your computer. The Mac app refuses connections from websites.

## When data leaves your device

Only in one case, and only if you choose it: if you add your own Anthropic API key to compare guesses or sort tasks, the question, your guess, and the AI's answer are sent to Anthropic's API under your account and governed by Anthropic's privacy policy. By default, Think First uses the AI model built into Chrome, which runs on your device.

## Your control

You can turn off saving prompt text, turn off any tracker, export your data, or delete all of it from the extension menu or the dashboard. Uninstalling the Mac app from its dashboard stops all tracking; deleting the `.thinkfirst` folder in your home folder removes the data.

## Children

Think First is not directed at children under 13.

## Changes and contact

If this policy changes, the new version will be posted here with a new date. Questions: kovacevicc.ema@gmail.com
