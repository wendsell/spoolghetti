# Chrome Web Store listing

Everything below maps to a field in the Chrome Web Store developer dashboard. Images are in this folder.

Build the upload zip with `scripts/build.sh chrome` (output in `dist/`).

---

## Store listing tab

**Name and summary** come from `extension/manifest.json`:

- Name: `Spoolghetti: Filament Price per kg`
- Summary: `Check the math. True price per kg on Amazon.com filament searches, best deals sorted to the top, junk filtered out.`

**Description**
```
Check the math.

Filament listings are a mess. A 4-pack here, a 1.1 kg spool there, a "bundle" with no weight in the title, and 250 g sample packs mixed in with real spools. Spoolghetti untangles it: it reads every listing on an Amazon.com filament search and shows you what you're actually paying per kilogram.

WHAT IT DOES
• Shows price per kg on every listing, plus price per spool when spools aren't 1 kg
• Understands packs, bundles, "4 x 1.1kg", "250g x 8", pounds, and listings that only show a per-ounce price
• Sorts the whole search cheapest per kg first
• Marks the best deal in gold and the runners-up in green, ranked #1, #2, #3
• Loads more result pages automatically, so the ranking covers the whole search, not just page one
• Clears out the noise: storage boxes, dryers, spool holders, 3D pen refills, and sample packs
• Hides tiny spools below a size you choose (250 g bundles are hidden by default)

FILTERS
• Material: PLA, PLA+, PETG, ABS, ASA, TPU, Nylon, PC
• Brand: show only the brands you trust
• Refills: show all, hide spool-less refills, or refills only
• Your settings sync across your Chrome devices

STAYS OUT OF THE WAY
Spoolghetti only switches on for filament searches. Shopping for anything else, it does nothing. Works in light and dark mode, including Dark Reader.

PRIVATE BY DESIGN
No tracking, no analytics, no accounts, no servers. Everything runs in your browser.

FREE SOFTWARE
Licensed under the GNU GPL v3 or later. Source code: https://github.com/wendsell/spoolghetti

A "~" means the weight was worked out from Amazon's unit price because the title didn't say. Always double-check the product page before you buy.

Spoolghetti is an independent tool and is not affiliated with or endorsed by Amazon.
```

**Category:** Shopping
**Language:** English (United States)

**Graphic assets**
| Field | File |
|---|---|
| Store icon (128x128) | `extension/icons/icon128.png` (comes from the zip) |
| Screenshots (1280x800) | `screenshot-1-sorted.png`, `screenshot-2-filters.png`, `screenshot-3-dark.png` |
| Small promo tile (440x280) | `promo-small-440x280.png` |
| Marquee promo tile (1400x560, optional) | `promo-marquee-1400x560.png` |

The screenshots show the real extension on a mock results page with placeholder product images. Real captures from Amazon (browser at 1280x800, after a filament search finishes loading) will sell it better.

**Homepage URL:** `https://wendsell.github.io/spoolghetti/`
**Support URL:** `https://github.com/wendsell/spoolghetti/issues`

---

## Privacy practices tab

**Single purpose description**
```
Spoolghetti shows the true price per kilogram of 3D printer filament listings on Amazon.com search results, and lets the user sort and filter those results to find the best value.
```

**storage justification**
```
Saves the user's filter and display settings (hidden brands and materials, minimum spool size, sorting, and page loading options) so they persist between searches and sync across the user's own Chrome devices. No other data is stored.
```

**Host permission justification**
```
The content script runs only on Amazon.com search result pages (https://www.amazon.com/s?*). It reads the listings on the page to calculate price per kilogram, then sorts and filters them. It also fetches the next pages of the same search from amazon.com so the ranking covers the full results. Nothing is sent anywhere else, and the extension does nothing on any other site or page.
```

**Remote code:** No, I am not using remote code.

**Data usage:** check **none** of the boxes (including Website content). Page content is processed locally and never leaves the browser. Tick all three certifications.

**Privacy policy URL:** `https://wendsell.github.io/spoolghetti/privacy.html`

---

## Account and distribution

- **Trader status:** Non-trader (free hobby project). Traders get their legal name, phone and address posted publicly on the listing.
- **Physical address field:** only required for items that sell something. Leave it blank.
- **Pricing:** Free
- **Visibility:** Unlisted to test the store install first, Public when ready
- **Regions:** United States (it only supports amazon.com)

## Things that can get it rejected

- **"Amazon" in the name, or Amazon logos** in screenshots or tiles.
- **Keyword stuffing**, like a list of filament brand names in the description.
- **Extra permissions** (`tabs`, `<all_urls>`, other hosts) without a feature that needs them.

## Shipping updates

1. Bump `version` in `extension/manifest.json`.
2. `scripts/build.sh chrome`
3. Dashboard > Package > Upload new package > Submit for review.
