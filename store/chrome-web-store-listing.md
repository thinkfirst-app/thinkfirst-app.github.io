# Chrome Web Store listing: copy and paste

Upload `release/Think-First-Chrome-1.0.0.zip` in the Developer Dashboard, then fill in each tab with the text below.

## Store listing tab

**Name:** Think First

**Summary (132 characters max):**
Guess before AI answers, see how close you were, and track how much you rely on AI. Private and on-device.

**Category:** Productivity (Tools)

**Language:** English

**Description:**

Think First helps you keep thinking for yourself while using AI.

Before your message goes to ChatGPT, Claude, or Gemini, Think First asks for a quick guess (one line is plenty). When the answer finishes, it compares the two and shows what you got right and what you missed. Over time you learn where your instincts are strong and where AI really adds something.

It also keeps an honest record of your AI use:
• Every prompt is sorted into tasks like coding, emails, writing, or math
• See which tasks you rely on AI for most, marked when they become frequent
• Get a gentle note when you hit 5, 10, or 20 requests of one kind in a week
• Track active time on AI sites, and your guess accuracy by task
• Optionally, only be asked to guess on the tasks you use AI for most

Private by design:
• Everything is stored on your device. There is no Think First server and no account.
• Comparisons use the AI model built into Chrome, which runs locally and for free.
• If your computer can't run it, you can add your own Anthropic API key instead.

Works on: ChatGPT, Claude, Gemini, Perplexity, Microsoft Copilot, DeepSeek, Grok, Mistral Le Chat, and Poe. The guess box is tuned for ChatGPT, Claude, and Gemini.

Want the full picture? The free Think First Mac app and VS Code extension add time in AI desktop apps, AI command-line tools, AI-written code, goals, limits, and a detailed dashboard.

Free and open source.

**Screenshots (1280×800):** upload in this order
1. `screenshot-1-guess.png`: caption "Write a quick guess before AI answers"
2. `screenshot-2-compare.png`: caption "See what you got right and what you missed"
3. `screenshot-3-dashboard.png`: caption "An honest picture of your AI use"
4. `screenshot-4-tasks.png`: caption "Know which tasks you rely on AI for most"

**Small promo tile (440×280):** `promo-tile-440x280.png`

**Icon (128×128):** already inside the package (`icon128.png`)

**Official URL / Homepage:** `https://thinkfirst-app.github.io/`

**Support URL:** `https://github.com/thinkfirst-app/thinkfirst-app.github.io/issues`

## Privacy tab

**Single purpose description:**
Think First helps people reflect on their own use of AI chatbots: it asks for the user's own guess before a message is sent to an AI chat website, compares that guess with the AI's answer, and shows the user statistics about their AI use.

**Permission justifications:**

- **storage:** Saves the user's settings, their guesses, and their usage statistics on their own device.
- **Host permission `https://api.anthropic.com/*`:** Used only if the user chooses to add their own Anthropic API key, to compare their guess with the AI's answer when Chrome's on-device AI is unavailable.
- **Host permission `http://127.0.0.1:47321/*`:** Sends the user's records to the optional Think First desktop app running on the same computer. This address is local and never leaves the device.
- **Content scripts on AI chat websites (chatgpt.com, claude.ai, gemini.google.com, perplexity.ai, copilot.microsoft.com, chat.deepseek.com, grok.com, chat.mistral.ai, poe.com):** Shows the guess box when the user sends a message, reads the user's message and the AI's reply to compare them with the guess, and counts prompts and active time on these sites. It runs on no other websites.

**Are you using remote code?** No. All code is included in the package.

**Data usage:** check these boxes
- Website content (the user's messages and AI replies on supported sites, stored locally and compared on-device)
- User activity (prompt counts and active time on supported sites)

Then certify all three statements: data is not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used or transferred to determine creditworthiness or for lending.

**Privacy policy URL:** `https://thinkfirst-app.github.io/privacy.html`

## Distribution tab

Visibility: Public. Regions: All regions. Price: Free.
