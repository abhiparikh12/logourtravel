# Log Our Travel — logourtravel.com

A static, multi-trip travel blog. No backend, no build step, no cost. Each trip is
one HTML page that reads a JSON data file. The public site is read-only; you log
expenses live through a Google Form, and the site reads the resulting Google Sheet.

```
(flat — every file at the top level, no folders)
index.html                 landing page (trip cards + about)
trip-balkans-2026.html     the Balkan trip page (sidebar nav)
site.css                   all styling
trip.js                    itinerary rendering, map links, cost reader
balkans-2026.json          all content + cost config for the Balkan trip
CNAME                      your custom domain (logourtravel.com)
.nojekyll                  tells GitHub Pages to serve files as-is
```

--------------------------------------------------------------------------------
## 1. Connecting the live expense log (Google Form → Sheet → site)

The two of you log expenses on your phones with a Google Form. The Form feeds a
Google Sheet. The site reads that Sheet. Do this once per trip.

### A. Create the Google Form
1. Go to https://forms.google.com → blank form. Title it e.g. "Balkans 2026 — Expenses".
2. Add these questions **with these exact titles** (the site matches on the words
   day / description / category / amount / paid, so keep those words in the title):

   | Question title            | Type              | Options / notes                                   |
   |---------------------------|-------------------|---------------------------------------------------|
   | `Which day?`              | Dropdown          | Day 1, Day 2, … Day 15                             |
   | `Description`             | Short answer      | e.g. "Dinner at Vojsava"                           |
   | `Category`                | Multiple choice   | Food, Entry, Transport, Lodging, Boat, Shopping, Other |
   | `Amount (€)`              | Short answer      | Response validation → Number → "is number"        |
   | `Paid by`                 | Multiple choice   | Parikh, Desai, Split                              |

   Using dropdown/multiple-choice for day, category and paid-by means clean data
   and pure-tapping on the phone — no typing except the amount and description.

3. Top-right → **Send** → link icon → copy the form link. Bookmark it on both
   phones (Add to Home Screen for an app-like icon).

### B. Link the Form to a Sheet
1. In the Form, open the **Responses** tab → green Sheets icon → **Create new
   spreadsheet**. This makes a Sheet where every submission appears as a row.
   (Google adds a `Timestamp` column automatically — that's fine, the site ignores it.)
2. Set the Sheet timezone so timestamps match your trip: in the Sheet,
   **File → Settings → Time zone** → pick your travel region → Save.

### C. Publish the Sheet as CSV
1. In the Sheet: **File → Share → Publish to web**.
2. In the dialog: choose the **specific response sheet tab** (not "Entire Document"),
   and format **Comma-separated values (.csv)**. Click **Publish**.
3. Copy the URL it gives you. It looks like:
   `https://docs.google.com/spreadsheets/d/e/XXXX/pub?gid=0&single=true&output=csv`

   ⚠️ This URL is world-readable. That's fine — it's public cost data by design.
   Never put anything private in this Sheet.

### D. Point the site at the Sheet
Open `balkans-2026.json`, find the `"costs"` block, and set:

```json
"costs": {
  "live": true,
  "sheetCsvUrl": "PASTE_THE_PUBLISHED_CSV_URL_HERE",
  "snapshotUrl": "",
  "seed": []
}
```

Commit and push. The Costs panel now shows live totals (Google caches the CSV for
up to ~5 minutes, so it's near-live, not instant).

### E. When the trip is over — freeze it (optional but recommended)
So the page stays fast forever and can't be changed by editing the Sheet later:
1. Open the published CSV URL in a browser, save the file as
   `balkans-2026-costs.csv`, commit it to the repo.
2. In the JSON, set `"live": false` and `"snapshotUrl": "balkans-2026-costs.csv"`.
   (Leave `sheetCsvUrl` as-is; when `live` is false the site reads the snapshot.)

--------------------------------------------------------------------------------
## 2. Adding a future trip

1. Copy `balkans-2026.json` → `<newtrip>.json`. Edit `meta`, `days`,
   `places`, `costs`. The data shape is:
   - `meta`: id, title, subtitle, dates, countries[], days_count, travelers, hero, summary
   - `days[]`: n, date, title, place, country (albania|bosnia|montenegro|transit), img, drive, items[], tips[]
   - `places{}`: "Name shown in text": "Google Maps query, City, Country"
   - `costs`: the block from section 1
2. Copy `trip-balkans-2026.html` → `trip-<newtrip>.html`. Change the `<title>`,
   the hero text, the overview route table, the "good to know" cards, and the last
   line: `LogOurTravel.initTrip("../<newtrip>.json")`.
3. Add a card to `index.html` in the `#tripGrid` (copy the live-trip card block).

That's it — no build step.

--------------------------------------------------------------------------------
## 3. Photos

Images load from Wikimedia Commons via the stable `Special:FilePath` endpoint, so
they work the moment the site is live. To self-host instead (faster, fully under
your control): download each image into `img/`, then set
`USE_LOCAL_IMAGES = true` in `trip.js`. Photos are CC BY-SA / public domain;
the footer carries a general credit line.

--------------------------------------------------------------------------------
## 4. Hosting on GitHub Pages — see the separate walkthrough in chat.

--------------------------------------------------------------------------------
## 5. The expense form (easiest setup)

Instead of hand-building the Google Form, use the generator:
1. Open `expense-form-generator.gs.txt`. Follow the steps at the top — paste it
   into script.google.com, Run, authorize, and it BUILDS the whole form for you
   (Day+Location dropdown, expense types, amount, currency, paid-by, comment)
   and creates the linked responses Sheet.
2. It prints a FORM link (bookmark on both phones) and the Sheet.
3. Publish the Sheet as CSV (README section 1C) and paste that link into
   `balkans-2026.json` → `costs.sheetCsvUrl`, set `costs.live` to `true`.
4. Optional: paste the FORM link into `costs.formUrl` to show a private
   "＋ Log an expense" button on the trip page.

## 6. Photos — use your own

Each day looks for `img/<slug>.jpg` first, then a Wikimedia fallback, then a
styled gradient tile. To use your own trip photos (recommended for the blog):
create a folder called `img` in the repo and add files named:
   img/gjirokaster.jpg, img/gjirokaster-castle.jpg, img/sarande.jpg,
   img/ksamil.jpg, img/dhermi.jpg, img/berat.jpg, img/komani-lake.jpg,
   img/theth.jpg, img/mostar.jpg, img/kotor.jpg, img/lovcen.jpg,
   img/perast.jpg, and img/hero.jpg
Wide landscape shots (roughly 1200×800) work best. Any you don't add simply
show the gradient tile — nothing breaks.
