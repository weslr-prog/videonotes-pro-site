# Market Intelligence → Focused Extension Roadmap

This roadmap is designed to turn public marketplace feedback into high-confidence extension ideas.

---

## Phase 0 — Define the lane (Day 1)

### Goal
Pick one user problem space and avoid broad “build anything” drift.

### Actions
1. Pick **1 primary category** (example: Accessibility, Productivity, Dev Tools).
2. Define your **target user persona** in one sentence.
3. Define your **job-to-be-done** in one sentence.
4. Set one success metric for 30 days (example: 50 waitlist signups, 10 beta users, 20% weekly retention).

### Exit criteria
- You can clearly answer: “Who is this for and what painful task are we solving?”

---

## Phase 1 — Data collection foundation (Days 1–3)

### Goal
Collect structured market signals from top extensions in your chosen category.

### Actions
1. Build a seed list of top extensions (start with 50–100).
2. For each item, collect:
   - platform
   - item_name
   - item_id
   - category
   - install_count (if available)
   - avg_rating
   - rating_count
   - last_updated
3. Collect review-level fields:
   - reviewer_name
   - review_date
   - star_rating
   - review_text
   - helpful_count (if available)
   - language
   - source_url
4. Store raw records in newline-delimited JSON (`raw_reviews.ndjson`).

### Exit criteria
- You have at least 2,000 reviews in a normalized format.

---

## Phase 2 — Normalize and clean (Days 3–4)

### Goal
Create reliable, deduplicated data suitable for analysis.

### Actions
1. Normalize date formats to UTC ISO.
2. Normalize ratings to integer 1–5.
3. Lowercase + trim text for analysis copy.
4. Deduplicate using hash of `platform + item_id + reviewer_name + review_date + review_text`.
5. Exclude empty/non-informative review text.
6. Keep `rating_count` separate from `review_count`.

### Exit criteria
- Clean table with duplicate rate below 2%.

---

## Phase 3 — Pain-point extraction (Days 4–6)

### Goal
Identify repeated complaints and unmet demand.

### Actions
1. Prioritize 1–3 star reviews first.
2. Tag each review with one primary issue:
   - reliability/bugs
   - performance/lag
   - missing feature
   - UX confusion
   - trust/privacy/permissions
   - pricing/monetization friction
3. Generate top complaint clusters by frequency.
4. Weight clusters by:
   - frequency
   - helpful votes
   - extension install base

### Exit criteria
- Ranked list of top 20 unmet needs.

---

## Phase 4 — Opportunity scoring (Days 6–7)

### Goal
Convert review themes into build-worthy ideas.

### Scoring model (1–5 each)
- Pain severity
- Frequency
- Existing solution quality gap
- Build simplicity
- Monetization potential

`Opportunity Score = 0.30*Pain + 0.25*Frequency + 0.15*Gap + 0.15*Simplicity + 0.15*Monetization`

### Actions
1. Score top 20 themes.
2. Select top 3 opportunities.
3. Write one-page concept briefs for each.

### Exit criteria
- One selected opportunity with highest confidence score.

---

## Phase 5 — MVP definition (Week 2)

### Goal
Build only the smallest product that solves the core job.

### MVP scope rule
- 1 core job
- 2 supporting features
- 1 trust feature (clear permissions/privacy)

### Actions
1. Create feature list (must-have / later).
2. Define instrumentation events:
   - install
   - first_use
   - core_action
   - repeat_use_day_1/day_7
3. Write launch checklist and QA path.

### Exit criteria
- MVP spec fits in one page and can be built in <= 2 weeks.

---

## Phase 6 — Launch + feedback loop (Week 3+)

### Goal
Close the loop from real users back into the roadmap.

### Actions
1. Launch MVP to a small cohort.
2. Track retention + core-action conversion weekly.
3. Pull new reviews weekly and rerun clustering.
4. Ship one targeted improvement each week.

### Exit criteria
- Weekly insight → build cycle is running consistently.

---

## Weekly operating cadence (repeatable)

- Monday: ingest + clean new data
- Tuesday: update clusters + scores
- Wednesday: choose one improvement
- Thursday: build and test
- Friday: ship + measure

---

## Guardrails

- Do not chase categories outside your lane in the first 30 days.
- Do not add features that don’t map to a validated complaint cluster.
- Do not use total ratings as a proxy for review volume.
- Keep source/platform terms of service in view and collect only allowed/public data.
