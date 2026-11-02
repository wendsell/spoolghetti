# Firefox (addons.mozilla.org): not shipped yet

This folder is the placeholder for a future Firefox release. The build script can already produce a Firefox zip, but it hasn't been tested in Firefox.

```
scripts/build.sh firefox
```

That copies `extension/` and merges `platforms/firefox/manifest.overrides.json` into the manifest, which adds:

- `browser_specific_settings.gecko.id`: permanent add-on ID (`spoolghetti@wendsell.github.io`). Don't change it after the first AMO upload.
- `browser_specific_settings.gecko.data_collection_permissions` with `required: ["none"]`: Mozilla's data collection declaration, required for new extensions since November 2025. Spoolghetti collects nothing.

## Checklist before submitting

- [ ] **Test the page loading in Firefox.** In Firefox, `fetch()` inside a content script runs with the extension's identity, not the page's, so Amazon cookies may not be sent and later pages could come back different. If auto-load misbehaves, switch those requests to `content.fetch()` (the Firefox page-context fetch) when it exists.
- [ ] Confirm `chrome.storage.sync` works (Firefox supports the `chrome.*` namespace in MV3 and syncs through Firefox Sync).
- [ ] Load it temporarily: `about:debugging` > This Firefox > Load Temporary Add-on > pick `manifest.json` from an unzipped Firefox build.
- [ ] Optional: `npx web-ext lint` on the unzipped build to catch manifest problems before upload.
- [ ] Check which minimum Firefox version supports `data_collection_permissions` and add `strict_min_version` to the overrides if AMO asks for it.
- [ ] Create a developer account at addons.mozilla.org (free), submit the zip as a listed add-on.

## Listing

Reuse `store/chrome/LISTING.md`. The description, summary and privacy policy all apply as-is. AMO also asks:

- **Categories:** Shopping
- **License:** GNU General Public License v3.0 (pick "or later" if AMO offers it)
- **Support site:** https://github.com/wendsell/spoolghetti/issues
- **Homepage:** https://wendsell.github.io/spoolghetti/
- **Privacy policy:** paste the text from `PRIVACY.md`
- **Source code:** not needed. The code isn't minified or bundled, so reviewers can read it directly.
- **Screenshots:** reuse `store/chrome/screenshot-*.png`
