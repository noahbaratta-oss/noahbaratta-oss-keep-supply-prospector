# Keep Supply Prospector

Western U.S. industrial-refrigeration prospecting engine (Next.js on Vercel, `main` = production).

## Qualification rules

- Industrial refrigeration is the primary qualification. Ammonia is a signal, not a requirement.
- The 10,000-lb threshold applies **only when ammonia is present** and a public document states the quantity.
- Ammonia is `Confirmed` only with public evidence (EPA RMP registration, EPA TRI ammonia report, a government page, or the company's own page). Seed-list NH3 = `Likely`.
- "10,000+ lb" is shown only when a quantity is documented — normally the EPA RMP registration, which lists pounds of ammonia per process.
- Nothing is invented: unknown fields show `Unknown`, `Not found` or `Needs verification`.

## Data pipeline

```
Deep Search plan (territory × target filters × depth)
  → research packs (/api/research mode "task"), run 4 at a time by the browser
      EPA RMP — every Western facility registered for ammonia (registration = 10,000+ lb anhydrous in a
        process), with pounds per process; FOIA copy published by the Data Liberation Project (CC BY-SA 4.0)
      USDA FSIS MPI Directory (meat/poultry establishments + import cold storages, per state;
        live download, falling back to the bundled Western snapshot lib/fsis-west.json because FSIS returns 403 to Vercel)
      EPA TRI basic data — ammonia (CAS 7664-41-7) reporters, per state
      EPA ECHO facility search — by NAICS codes mapped from target filters
      OpenStreetMap (Overpass) — mapped facilities by tag (queried from your browser; server fallback)
      Public web discovery — Bing, DuckDuckGo, Yahoo, Mojeek, Startpage (+ optional Brave / Google CSE keys)
  → DISCOVERY RECORDS  → Search Results (every record, 100 per page, no cap)
  → normalize + dedupe by facility → LIFETIME (IndexedDB)
      same facility = same name+city+state, OR shared EPA FRS / TRI / FSIS id,
      OR same ZIP + street number with a distinctive name word in common
```

Each provider is independent: failures are logged in the **Sources** panel and never stop a sweep. A source that keeps failing during a sweep (OpenStreetMap after 2 packs, EPA ECHO after 5, web engines after 10 empty packs) is skipped for the rest of that sweep. From Vercel, Bing and Marginalia answer; DuckDuckGo/Mojeek return 403 and Yahoo/Startpage/Google return nothing usable. Web results must mention an industrial-refrigeration market or facility in their own title/snippet, must name a Western state themselves (the searched state is never assigned to a result that does not say where it is), and restaurant / retail / tourism pages are dropped. When a web result merges with a registry or Keep Supply record, the registry name becomes the primary name. EPA RMP keeps anhydrous-ammonia registrations for food/cold-chain industries and aqueous ammonia only for food/refrigerated-warehouse NAICS; EPA TRI skips chemical and petroleum wholesalers (NAICS 4246/4247).

**Research Now** (dossier) runs the recursive pass: `"Company" refrigeration / ammonia / cold storage / facility / plant / permit / RMP / PSM / expansion / PDF`, plus EPA ECHO, EPA TRI and USDA FSIS name lookups and a scan of relevant public pages. Other facilities found for the same company are added to Lifetime.

## Tabs

- **Deep Search** — every discovery record from the latest sweep (toggle "Unique facilities only").
- **Lifetime** — everything ever discovered, deduplicated, with merged evidence.
- **New From Last Search** — facilities first discovered in the latest sweep.
- **Saved** — prospects you starred.

## Persistence

Lifetime, Saved, the latest search and search memory are stored in the browser (IndexedDB database `keep-supply-prospector-db-v2`, stores `lifetime`, `saved`, `meta`). Data from the previous snapshot format and older localStorage keys is migrated automatically and left in place. Use **Data tools → Download backup** to move Lifetime between browsers until a server-side datastore is added.

## Keep Supply seed list

`lib/external-prospects.ts` is the imported Keep Supply list. Western-territory rows are merged into Lifetime (duplicates combined); discoveries that match a seed account inherit its sales fields (buyer type, parts opportunity, OEMs, cold-call priority, sales approach). Out-of-territory rows stay in the file untouched.

## Target Filters

`lib/target-filters.ts` defines every target type → web search terms, NAICS codes (EPA), USDA FSIS inclusion and OpenStreetMap tags. Add new types there, or add custom types in the Target Filters workspace.

## Cloud sync (optional)

Connect a Postgres database to the Vercel project (Storage → Neon, free plan; sets `DATABASE_URL`) and add `APP_PASSCODE`. Then **Data tools → Cloud sync → Connect** with that passcode: Lifetime, Saved and search memory sync to the database and follow you to any browser. IndexedDB stays the fast local copy.

## Screenshot import

**Data tools → Import screenshot** (or paste an image into the list box). Without configuration the browser runs free on-device OCR (Tesseract.js). With `ANTHROPIC_API_KEY` set, Claude's vision model reads the listings instead (a few cents per image). The extracted lines are shown for review before anything is added.

## Data refresh

`.github/workflows/refresh-data.yml` runs `scripts/refresh-data.mjs` on the 3rd of each month (or manually from the Actions tab) and commits updated snapshots (`lib/rmp-west.json`, `lib/fsis-west.json`) when the source data changed. Vercel redeploys automatically.

## Optional environment variables (Vercel)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` (or `POSTGRES_URL`) + `APP_PASSCODE` | Cloud sync of Lifetime across browsers |
| `BRAVE_SEARCH_API_KEY` | Brave Search API for reliable web discovery ($5/month credit ≈ 1,000 searches) |
| `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`) | AI reading of screenshots |

No paid service is required. `GET /api/research?probe=1` runs a live health check of every source from the server.
