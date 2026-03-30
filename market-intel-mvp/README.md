# Market Intel MVP Kit

Reusable kit to discover what users want from top-tier products and turn those insights into focused extension MVPs.

## Files

- `ROADMAP.md` — step-by-step execution roadmap
- `MVP_TEMPLATE.md` — copy/paste product concept template
- `PLATFORM_TEMPLATE.json` — platform adapter config template
- `scripts/analyze_reviews.py` — dependency-free analyzer that scores opportunity clusters
- `scripts/validate_reviews.py` — dependency-free validator for schema/data quality/domain redirects
- `scripts/validate_with_profile.py` — profile-based validation gate for Chrome/Edge/Firefox
- `scripts/run_pipeline.py` — runs validation + analysis for one or more profiles
- `scripts/build_dashboard.py` — generates a simplified static HTML dashboard
- `scripts/easy_run.py` — one-command runner (pipeline + dashboard)
- `data/raw/sample_reviews.ndjson` — sample input file format
- `config/platform_profiles.json` — default production thresholds and domain rules
- `config/priority_categories.md` — categories mapped from your extension idea list
- `HOW_TO_RUN_AND_INTERPRET.md` — practical guide for running and understanding outputs

## Quick start

1. Copy `PLATFORM_TEMPLATE.json` and create one config per platform:
   - `platform.chrome_web_store.json`
   - `platform.edge_addons.json`
   - `platform.firefox_addons.json`
2. Fill selectors/navigation rules for each platform.
3. Collect review + metadata records into normalized JSON/CSV.
4. Follow `ROADMAP.md` for cleaning, clustering, and scoring.
5. Fill `MVP_TEMPLATE.md` for your top opportunity and ship a 2-week MVP.

## Run the analyzer

Use your normalized NDJSON file as input.

```bash
python3 market-intel-mvp/scripts/analyze_reviews.py \
  --input market-intel-mvp/data/raw/sample_reviews.ndjson \
  --output-json market-intel-mvp/data/scored/weekly_opportunities.json \
  --output-md market-intel-mvp/outputs/weekly-opportunities/weekly_opportunities.md \
  --top-n 20
```

Outputs:
- `data/scored/weekly_opportunities.json` (machine-readable scores)
- `outputs/weekly-opportunities/weekly_opportunities.md` (human-readable weekly report)

## Run the validator (recommended first)

Run this before analysis to catch bugs during data collection/build changes.

```bash
python3 market-intel-mvp/scripts/validate_reviews.py \
  --input market-intel-mvp/data/raw/sample_reviews.ndjson \
  --output-json market-intel-mvp/data/clean/validation_report.json \
  --output-md market-intel-mvp/outputs/weekly-opportunities/validation_report.md \
  --allowed-domains chromewebstore.google.com \
  --blocked-domains support.google.com
```

If errors are found, the script exits non-zero so it can fail CI/local build checks.

Suggested flow:
1. `validate_reviews.py`
2. `analyze_reviews.py`
3. publish weekly report

## Run validation with platform profiles (recommended)

This uses preselected defaults for Chrome + Edge + Firefox.

```bash
python3 market-intel-mvp/scripts/validate_with_profile.py \
  --profile chrome \
  --input market-intel-mvp/data/raw/sample_reviews.ndjson \
  --output-json market-intel-mvp/data/clean/chrome_gate_report.json \
  --output-md market-intel-mvp/outputs/weekly-opportunities/chrome_gate_report.md
```

Switch profile with `--profile edge` or `--profile firefox`.

Default thresholds currently set:
- Chrome: min records `100`, max duplicate `5%`, max empty text `10%`
- Edge: min records `80`, max duplicate `6%`, max empty text `12%`
- Firefox: min records `80`, max duplicate `6%`, max empty text `12%`

Default language filter: `en`

## Simplified one-command run + UI

```bash
python3 market-intel-mvp/scripts/easy_run.py --profiles chrome,edge,firefox --open
```

This command:
1. runs validation gates
2. runs opportunity scoring for passing profiles
3. generates `outputs/weekly-opportunities/dashboard.html`
4. opens dashboard (when `--open` is supplied)

For a full interpretation walkthrough, use `HOW_TO_RUN_AND_INTERPRET.md`.

### Input NDJSON contract (minimum)

Each line must be a valid JSON object with:

- `platform`
- `item_id`
- `item_name`
- `reviewer_name`
- `review_date`
- `star_rating` (1–5)
- `review_text`
- `helpful_count`
- `source_url`

## Real-world validation inputs to provide

For production validation, provide:

- Platform list (Chrome/Edge/Firefox/etc.)
- Allowed domains per platform
- Blocked domains per platform
- Expected minimum records per scrape batch
- Tolerable duplicate rate (%)
- Tolerable empty-text rate (%)
- Required language filters
- Category list and seed extension lists

With these values, validator thresholds can be locked and automated.

Already locked from your latest direction:
- Platforms: Chrome + Edge + Firefox
- Domain policy: safe defaults per profile (allow marketplace domains, block support/help redirects)
- Language filter: English (`en`) for fastest, stable startup
- Thresholds: pragmatic defaults for build-time bug catching
- Categories: selected from your `future_extensions.md` list in `config/priority_categories.md`

## Multi-platform adaptation notes

- Keep a common data contract for all platforms.
- Use platform-specific selectors only in config (not in core logic).
- Enforce allowed/blocked domains per platform to prevent policy-page detours.
- Keep `rating_count` and `review_count` separate in all reports.

## Suggested folder layout for implementation

```
market-intel-mvp/
  README.md
  ROADMAP.md
  MVP_TEMPLATE.md
  PLATFORM_TEMPLATE.json
  data/
    raw/
    clean/
    scored/
  outputs/
    weekly-opportunities/
```

## Weekly output target

Produce one report each week with:
- Top 20 complaint clusters
- Top 3 opportunities by weighted score
- One selected MVP concept with expected metric impact
