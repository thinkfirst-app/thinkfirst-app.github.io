# Launch checklist

Part 1 is done. The site is live and anyone can install Think First. Parts 2 and 3 make installation one click and take a few days of store review.

## Part 1: Website and downloads on GitHub (done)

- Repository: https://github.com/thinkfirst-app/thinkfirst-app.github.io
- Website: https://thinkfirst-app.github.io/
- Release: https://github.com/thinkfirst-app/thinkfirst-app.github.io/releases/latest
- Privacy contact: kovacevicc.ema@gmail.com in `PRIVACY.md` and `docs/privacy.html`

The download buttons on the website read the latest GitHub release, so publishing a new release updates the site automatically.

## Part 2: Chrome Web Store ($5 one-time, review takes a few days)

This lets people install the extension with one click instead of Developer mode.

1. Go to the Chrome Web Store Developer Dashboard, sign in, pay the $5 registration fee, and verify your email.
2. Click **New item** and upload the `Think-First-Chrome-<version>.zip` from the latest release.
3. Fill in every tab using `store/chrome-web-store-listing.md` (the URLs are already filled in), and upload the images from the `store` folder.
4. Click **Submit for review**.
5. When it's approved, paste the store link into `chromeStoreUrl` near the top of `docs/site.js` and commit. The website button switches to "Add to Chrome".

The same zip also works in the Microsoft Edge Add-ons store, which is free to join.

## Part 3: VS Code Marketplace and Open VSX (free)

1. Sign in at the Visual Studio Marketplace publisher management page and create a publisher with the ID `thinkfirst`, which the package already uses.
2. If `thinkfirst` is taken, change `publisher` in `vscode-extension/package.json`, rebuild with `scripts/build.sh`, and use the new file.
3. Choose **New extension › Visual Studio Code** and upload the `.vsix` from the latest release.
4. For Cursor and other VS Code-based editors, sign in to open-vsx.org with GitHub, create the same namespace, and upload the same file.
5. Paste the Marketplace link into `vscodeUrl` in `docs/site.js` and commit.

## Part 4: Later, when people are using it

- **Sign the Mac app** so it opens without the "can't verify" warning. This needs an Apple Developer account ($99 a year).
- **Set a social preview image** for the repository under Settings › General › Social preview, using `docs/dashboard.png`. GitHub has no API for this, so it's a one-time click.
- **Collect feedback** through GitHub Issues, which the website and issue templates already point to.
- **Announce it** where your audience is: Product Hunt, Reddit communities for students or developers, and short videos of the guess box in action.

## Releasing an update

```sh
scripts/bump-version.sh 1.0.1
# move the Unreleased notes in CHANGELOG.md under a new [1.0.1] heading
git commit -am "Release 1.0.1"
git tag v1.0.1 && git push origin main v1.0.1
```

GitHub Actions builds the packages and publishes the release with checksums. The website picks it up within a minute. Upload the new zip and `.vsix` to the stores by hand.
