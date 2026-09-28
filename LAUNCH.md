# Launch checklist

Everything is built. What's left is publishing it under your own accounts. Do the parts in order; after Part 1 anyone can install Think First.

Before you start, replace the placeholder email `YOUR-EMAIL@example.com` in `PRIVACY.md` and `docs/privacy.html` with an address where people can reach you. Stores require it.

## Part 1: Website and downloads on GitHub (free, about 20 minutes)

1. Create a free account at github.com.
2. Click **New repository**. Name it `think-first`, set it to **Public**, and create it.
3. On the empty repository page, click **uploading an existing file**. Drag in everything from this folder **except** the `release` folder. Click **Commit changes**.
4. Go to **Settings > Pages**. Under "Build and deployment", choose **Deploy from a branch**, pick the branch `main` and the folder `/docs`, then **Save**.
5. Go back to the repository's main page, click **Releases > Create a new release**. Type `v1.0.0` as the tag, title it "Think First 1.0", and drag in the three files from the `release` folder. Click **Publish release**.

After a minute or two your site is live at `https://YOUR-GITHUB-USERNAME.github.io/think-first/`. The download buttons connect to your release automatically. Anyone can now install all three parts.

## Part 2: Chrome Web Store ($5 one-time, review takes a few days)

This lets people install the extension with one click instead of Developer mode.

1. Go to the Chrome Web Store Developer Dashboard (search "Chrome Web Store developer dashboard"), sign in, pay the $5 registration fee, and verify your email.
2. Click **New item** and upload `release/Think-First-Chrome-1.0.0.zip`.
3. Fill in every tab using `store/chrome-web-store-listing.md`, and upload the images from the `store` folder.
4. Click **Submit for review**.
5. When it's approved, open `docs/site.js` on GitHub, click the pencil icon, and paste your store link into `chromeStoreUrl` near the top. Commit. The website button switches to "Add to Chrome".

The same zip also works in the Microsoft Edge Add-ons store, which is free to join.

## Part 3: VS Code Marketplace and Open VSX (free)

1. Sign in at the Visual Studio Marketplace publisher management page (search "VS Code marketplace manage publishers") and create a publisher. Try the ID `thinkfirst`, because the package already uses it.
2. If `thinkfirst` is taken, pick another ID and ask Claude to rebuild the `.vsix` with it.
3. On your publisher page, choose **New extension > Visual Studio Code** and upload `release/think-first-tracker-1.0.0.vsix`.
4. For Cursor and other VS Code-based editors, sign in to open-vsx.org with GitHub, create the same namespace, and upload the same file.
5. Paste the Marketplace link into `vscodeUrl` in `docs/site.js`.

## Part 4: Later, when people are using it

- **Sign the Mac app** so it opens without the "can't verify" warning. This needs an Apple Developer account ($99 a year) and a Mac to sign and notarize the app.
- **Collect feedback** with GitHub Issues, which your site already links to.
- **Announce it** where your audience is: Product Hunt, Reddit communities for students or developers, and short videos of the guess box in action.

## Releasing an update

Change the version number in `browser-extension/manifest.json`, `vscode-extension/package.json`, and `VERSION` in `hub/thinkfirst.py`. Rebuild the packages (Claude can do this), upload the new zip to the Chrome Web Store, and create a new GitHub release with the new files. The website always links to the latest release.
