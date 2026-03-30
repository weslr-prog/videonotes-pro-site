# Wrong Project Handoff

This repo contains two different kinds of changes:

## 1. Changes caused by the wrong-project market/scraper work

These are the files that were added while working on the Chrome review/comment analysis idea inside VideoNotes Pro.

### New market analysis toolkit
- market-intel-mvp/README.md
- market-intel-mvp/ROADMAP.md
- market-intel-mvp/MVP_TEMPLATE.md
- market-intel-mvp/PLATFORM_TEMPLATE.json
- market-intel-mvp/HOW_TO_RUN_AND_INTERPRET.md
- market-intel-mvp/config/platform_profiles.json
- market-intel-mvp/config/priority_categories.md
- market-intel-mvp/scripts/analyze_reviews.py
- market-intel-mvp/scripts/build_dashboard.py
- market-intel-mvp/scripts/easy_run.py
- market-intel-mvp/scripts/run_pipeline.py
- market-intel-mvp/scripts/validate_reviews.py
- market-intel-mvp/scripts/validate_with_profile.py
- market-intel-mvp/data/raw/sample_reviews.ndjson
- market-intel-mvp/data/scored/weekly_opportunities.json
- market-intel-mvp/data/clean/chrome_gate_report.json
- market-intel-mvp/data/clean/edge_gate_report.json
- market-intel-mvp/data/clean/firefox_gate_report.json
- market-intel-mvp/outputs/weekly-opportunities/chrome_gate_report.md
- market-intel-mvp/outputs/weekly-opportunities/edge_gate_report.md
- market-intel-mvp/outputs/weekly-opportunities/firefox_gate_report.md
- market-intel-mvp/outputs/weekly-opportunities/weekly_opportunities.md
- market-intel-mvp/outputs/weekly-opportunities/pipeline_summary.json
- market-intel-mvp/outputs/weekly-opportunities/dashboard.html

### Generated Python cache files from running the toolkit
- market-intel-mvp/scripts/__pycache__/analyze_reviews.cpython-311.pyc
- market-intel-mvp/scripts/__pycache__/validate_reviews.cpython-311.pyc
- market-intel-mvp/scripts/__pycache__/validate_with_profile.cpython-311.pyc

### What this work does
- Validates scraped review datasets against platform rules
- Scores complaint clusters and opportunities
- Builds a static dashboard from pipeline results
- Includes sample Chrome Web Store review data

### Recommendation
- Move this whole folder only if you want the review-analysis toolkit in the Chrome comment scraper repo
- Do not move the generated __pycache__ files
- Do not move the generated output reports unless you want sample artifacts for reference

## 2. Changes that look like real VideoNotes Pro work

These are app and branding changes inside the actual VideoNotes product. They do not look related to the Chrome comment scraper.

### Tracked app files modified
- sidepanel.js
- sidepanel.html
- styles.css
- index.html
- icons/icon16.png
- icons/icon48.png
- icons/icon128.png

### What changed in VideoNotes Pro

#### sidepanel.js
- Added safer YouTube URL parsing for watch, shorts, embed, live, and youtu.be links
- Added guards for restricted browser pages before sendMessage or script injection
- Added cleaner fallback navigation when timestamp jumps cannot message the content script
- Started storing a normalized video URL for notes
- Added pinned note support
- Added note sorting that keeps pinned notes first
- Added copy button, pin button, and More or Less preview controls on note cards
- Added expanded notes mode state
- Improved jump-to-timestamp logic to reuse tracked tab when possible

#### sidepanel.html
- Added an expand or collapse button in the notes header

#### styles.css
- Added styles for expanded notes mode
- Added styles for note quick actions, pinned notes, and truncated note previews
- Adjusted notes section sizing for taller note browsing

#### index.html
- Updated landing-page headline and product marketing copy

#### icons
- Replaced the extension icon assets with the VideoNotes Pro branding set

### Recommendation
- Keep these in VideoNotes Pro unless you know they were accidental
- Do not move them to the Chrome comment scraper repo

## 3. Other untracked files present in this repo

These are not part of the core market-intel folder, but they also exist as untracked files right now:

- SEO_LAUNCH_GUIDE.md
- STORE_OVERVIEW.md
- TESTER_BETA_GUIDE.md
- chatgpt_layout.md
- gemini_layout_plan.md
- future_extensions.md
- icons/icon1024.jpg
- icons/icon1024.png
- mockups/index.html
- mockups/mockups.css

### Recommendation
- mockups/ and the icon1024 files look like VideoNotes design and listing work, not scraper work
- The markdown planning files also look like VideoNotes product or launch docs, not Chrome comment scraper code
- Leave these in VideoNotes Pro unless you know you created them for the scraper project

## 4. Bottom line

- Nothing appears broken solely because work happened in the wrong repo
- The main wrong-project addition is the market-intel-mvp folder and its generated outputs
- The modified sidepanel, styles, landing page, and icons look like actual VideoNotes Pro work and should probably stay here