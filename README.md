<p align="center"><img src="docs/img/icon128.png" width="96" alt=""></p>

<h1 align="center">Spoolghetti</h1>
<p align="center"><b>Check the math.</b><br>True price per kg on Amazon.com 3D printer filament searches, best deals sorted to the top, junk filtered out.</p>

<p align="center">
  <a href="https://wendsell.github.io/spoolghetti/">Website</a> ·
  <a href="https://wendsell.github.io/spoolghetti/privacy.html">Privacy</a> ·
  <a href="https://github.com/wendsell/spoolghetti/issues">Report a problem</a>
</p>

![Spoolghetti ranking filament listings by price per kg](docs/img/screenshot-1-sorted.png)

## What it does

- **Price per kg on every listing**, plus price per spool when spools aren't 1 kg. Handles packs, bundles, `4 x 1.1kg`, `250g x 8`, pounds, and listings that only show a per-ounce price (marked `~`).
- **Best deals on top.** The whole search sorts cheapest per kg first. #1 gets a gold outline, #2 and #3 green.
- **Whole search, not just page one.** Extra result pages load automatically in the background (up to 7 by default).
- **Junk filtered out.** Storage boxes, dryers, holders, 3D pen refills, sample packs, and tiny spools (250 g by default) are hidden.
- **Filters** for material (PLA, PLA+, PETG, ABS, ASA, TPU, Nylon, PC), brand, and spool-less refills. Settings sync across your Chrome devices.
- **Only on filament searches.** Search for anything else and it does nothing.
- **Private.** No tracking, no analytics, no servers.

## Install

**Chrome Web Store:** coming soon.

**From source (Chrome, Edge, Brave):**

1. Download or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `extension/` folder.
4. Search Amazon.com for filament.

If you used the old Tampermonkey userscript, turn it off first or every card gets two badges. Your userscript settings import automatically.

**Firefox:** planned. See [`store/firefox/`](store/firefox/README.md).

## Repo layout

| Path | What it is |
|---|---|
| `extension/` | The extension (Manifest V3). Load this folder unpacked. |
| `platforms/firefox/` | Firefox-only manifest keys, merged in at build time. |
| `scripts/build.sh` | Builds store zips into `dist/`: `chrome`, `firefox`, or both. |
| `store/chrome/` | Chrome Web Store listing copy, privacy answers, screenshots, promo tiles. |
| `store/firefox/` | Placeholder and checklist for a future addons.mozilla.org release. |
| `docs/` | GitHub Pages site (homepage and privacy policy). |
| `PRIVACY.md` | Privacy policy. |

## Build

```
scripts/build.sh          # Chrome + Firefox zips in dist/
scripts/build.sh chrome   # Chrome only
```

Needs `zip` and `python3`.

## When it breaks

Amazon changes its page markup a few times a year. If badges stop showing up, the selectors near the top of the DOM section in `extension/content.js` (`CARD_SEL`, `getPrice`, `getTitle`) are the usual suspects. Open an issue with the search URL and a screenshot.

---

Spoolghetti is an independent project and is not affiliated with or endorsed by Amazon.
