# Security policy

Think First is built around one promise: your data stays on your computer. Anything that breaks that promise is a security issue, and we want to hear about it.

## Reporting a vulnerability

Email **kovacevicc.ema@gmail.com** with "Think First security" in the subject. Please do not open a public issue for security problems.

Include what you found, how to reproduce it, and which part is affected (browser extension, Mac app or hub, VS Code extension, or website). You should hear back within a few days. Once a fix is released, you are welcome to publish your findings, and we will credit you in the changelog unless you prefer otherwise.

## Supported versions

Only the latest release receives fixes. Please update before reporting.

## How Think First is designed to protect data

Knowing the design helps you judge what counts as a break:

- The hub is a local web server bound to `127.0.0.1:47321`. It refuses requests whose Host or Origin is not local, so ordinary websites cannot read or write your data.
- The browser extension holds only the `storage` permission plus host access to the local hub and, for the optional API-key route, `api.anthropic.com`. It runs on a fixed list of AI chat sites and nowhere else.
- All records live in the browser's extension storage and in `~/.thinkfirst/data.db`. There is no remote server to breach.
- The only outbound connection is optional and explicit: if you add your own Anthropic API key, comparisons are sent to Anthropic under your account. The key is stored locally.

Reports we especially want: any way for a web page to reach the hub or the extension's data, any path by which prompts or statistics leave the device without an explicit opt-in, and anything that runs code from the network.
