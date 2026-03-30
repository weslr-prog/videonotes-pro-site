# How To Run + View + Interpret Data (Simple Workflow)

This guide gives you a practical path from raw review files to decision-ready insights.

---

## 1) What files to prepare

Put raw NDJSON files in:

- `market-intel-mvp/data/raw/chrome_reviews.ndjson`
- `market-intel-mvp/data/raw/edge_reviews.ndjson`
- `market-intel-mvp/data/raw/firefox_reviews.ndjson`

Fallback:
- If profile-specific files are missing, scripts use `market-intel-mvp/data/raw/sample_reviews.ndjson`.

---

## 2) Easiest way to run everything

From project root:

```bash
python3 market-intel-mvp/scripts/easy_run.py --profiles chrome,edge,firefox --open
```

What it does:
1. Runs profile validation gates
2. Runs opportunity analysis for profiles that pass validation
3. Builds a simple static dashboard HTML
4. Opens dashboard (with `--open`)

---

## 3) Where results are saved

### Validation outputs
- `market-intel-mvp/data/clean/chrome_gate_report.json`
- `market-intel-mvp/data/clean/edge_gate_report.json`
- `market-intel-mvp/data/clean/firefox_gate_report.json`

### Opportunity outputs
- `market-intel-mvp/data/scored/chrome_opportunities.json`
- `market-intel-mvp/data/scored/edge_opportunities.json`
- `market-intel-mvp/data/scored/firefox_opportunities.json`

### Human-readable reports
- `market-intel-mvp/outputs/weekly-opportunities/chrome_opportunities.md`
- `market-intel-mvp/outputs/weekly-opportunities/edge_opportunities.md`
- `market-intel-mvp/outputs/weekly-opportunities/firefox_opportunities.md`

### Simplified UI
- `market-intel-mvp/outputs/weekly-opportunities/dashboard.html`

### Run summary
- `market-intel-mvp/outputs/weekly-opportunities/pipeline_summary.json`

---

## 4) How to read the dashboard

For each platform card:

- **Gate status**
  - `PASS`: data quality is good enough for analysis
  - `FAIL`: fix data pipeline issues first

- **Total rows**
  - Number of scraped review rows loaded

- **Errors / Warnings**
  - Errors block analysis
  - Warnings indicate data risk but may still proceed

- **Duplicate rows / Empty text rate**
  - Helps catch scraping loops, selector drift, or partial extraction bugs

- **Top opportunity clusters**
  - Ranked themes based on weighted score

---

## 5) How to make product decisions

Use this weekly rule:

1. Ignore platforms with failed validation gates.
2. Among passing platforms, look at top clusters with:
   - high opportunity score
   - enough review count
   - clear user pain in sample text
3. Pick one cluster only.
4. Build one MVP around that cluster in 1–2 weeks.
5. Re-run next week and compare movement.

---

## 6) Bug-catching checklist during build

When a run fails, check in this order:

1. Domain leakage (`support.*` page in source URLs)
2. Missing required fields (schema drift)
3. Spikes in empty text (DOM selector breakage)
4. Duplicate spikes (pagination loop bug)
5. Record count below threshold (partial scrape)

---

## 7) Default profile settings currently used

From `config/platform_profiles.json`:

- Chrome: min 100 rows, max duplicate 5%, max empty text 10%
- Edge: min 80 rows, max duplicate 6%, max empty text 12%
- Firefox: min 80 rows, max duplicate 6%, max empty text 12%
- Language filter: `en`

---

## 8) Optional: run one platform only

```bash
python3 market-intel-mvp/scripts/easy_run.py --profiles chrome
```

---

## 9) Optional: run without opening browser

```bash
python3 market-intel-mvp/scripts/easy_run.py --profiles chrome,edge,firefox
```
