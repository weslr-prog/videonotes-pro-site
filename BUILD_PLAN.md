# Chrome Extension

## VideoNotes Pro — Chrome Extension Build Plan
A Timestamp Note-Taker for YouTube (and beyond)
Your guide for VSCode + GitHub Copilot

---

## Why This Extension Was Chosen

| Criteria | Assessment |
|----------|------------|
| Build Complexity | Low–Medium. No backend server. All data lives in the browser. |
| Maintenance Load | Very Low. No external APIs to break. YouTube's video player (<video> tag) has been stable for years. |
| API Costs | $0. Zero ongoing operating costs. |
| Monetization Potential | High. Students, researchers, content creators, and professionals all watch video content and take notes. |
| Market Size | YouTube alone has 2B+ monthly users. Even 0.001% = 20,000 potential users. |
| Competition | Exists, but sparse. Most competitors are clunky or abandoned. Quality wins here. |

### Revenue Target Reality Check
- Goal: ~$8,000/year from this extension
- At $3.99/month → needs ~167 paying subscribers
- At $24.99/year → needs ~320 annual subscribers
- This is genuinely achievable within 6–12 months with active promotion.

---

## What It Does (Feature Scope)

### Free Tier (always free — drives installs)
- Capture the current video timestamp + auto-fill the video title with one click
- Add a text note to any timestamp
- Click a saved timestamp to jump back to that exact moment in the video
- Store up to 3 videos worth of notes locally (no account needed)
- Works on YouTube

### Pro Tier ($3.99/month or $24.99/year via ExtensionPay)
- Unlimited videos and notes
- Export notes as Markdown or plain .txt file
- Organize notes with tags (e.g., "study", "work", "ideas")
- Works on additional video platforms (Vimeo, Udemy, Coursera, Loom)
- Search across all your notes

---

## Tech Stack (All Free)

| Tool | Purpose | Cost |
|------|---------|------|
| VSCode + GitHub Copilot | Writing all code | Already have it |
| Chrome Manifest V3 | Extension framework | Free |
| chrome.storage.local | Storing notes on user's device | Free |
| Plain CSS | Styling the side panel | Free |
| ExtensionPay | Payment processing (Stripe-backed) | Free until you earn |
| Canva (free tier) | Icons, store screenshots | Free |
| GitHub Pages | Landing page | Free |
| Termly.io | Privacy policy generator | Free |

**Note:** No Node.js build step required for MVP. You can add it later if you want Tailwind. For now, plain CSS keeps the setup simple.

---

## Project File Structure

Create this folder on your computer. Name it `videonotes-pro`.

```
videonotes-pro/
├── manifest.json          ← The extension's "ID card" — Chrome reads this first
├── background.js          ← Runs silently in background, manages side panel
├── content.js             ← Injected into YouTube — reads the video timestamp
├── sidepanel.html         ← The visible UI panel the user interacts with
├── sidepanel.js           ← All the logic for the side panel
├── styles.css             ← All your styling
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png        ← The one shown in the Chrome Web Store
```

---

## Phase 1: Setup (30 minutes)

### Step 1 — Create the folder and open in VSCode
1. Create a new folder called "videonotes-pro" anywhere on your computer
2. Open VSCode
3. File → Open Folder → select "videonotes-pro"
4. Create an "icons" subfolder inside it

### Step 2 — Create placeholder icons (temporary)
Use Canva to make a simple 128x128 image with a play button and a pencil icon. Export three sizes: 16x16, 48x48, 128x128. Put them in the icons/ folder. You can polish this later — you just need something to load the extension.

---

## Phase 2: Build the Manifest (15 minutes)

Create `manifest.json`. Then use this exact Copilot prompt:

> "Generate a Chrome Manifest V3 JSON file for an extension called VideoNotes Pro. It needs: side_panel permission, storage permission, activeTab permission, scripting permission. The side panel default path is sidepanel.html. The background service worker is background.js. Icons are at icons/icon16.png, icons/icon48.png, icons/icon128.png. The extension should be able to inject a content script into youtube.com URLs."

After Copilot generates it, verify these fields exist:
```json
"manifest_version": 3,
"permissions": ["sidePanel", "storage", "activeTab", "scripting"],
"side_panel": { "default_path": "sidepanel.html" },
"content_scripts": [
  {
    "matches": ["*://*.youtube.com/*"],
    "js": ["content.js"]
  }
]
```

---

## Phase 3: Build the Background Script (20 minutes)

Create `background.js`. Use this Copilot prompt:

> "Write a Chrome Manifest V3 background service worker script. When the extension's action icon is clicked on any tab, open the side panel for that tab using chrome.sidePanel.open(). Also set the side panel behavior to open on action click using chrome.sidePanel.setPanelBehavior."

This is short — probably 8–12 lines. It just tells Chrome: "when the user clicks my icon, open the side panel."

---

## Phase 4: Build the Content Script (45 minutes)

This is the most important file. It runs inside the YouTube page and reads the video timestamp.

Create `content.js`. Use this Copilot prompt:

> "Write a Chrome extension content script for YouTube. It should:
> 1. Listen for a message from the extension with the type 'GET_TIMESTAMP'
> 2. When that message is received, find the HTML video element on the page using document.querySelector('video')
> 3. Return the video's currentTime in seconds and the page's document.title as a response Use chrome.runtime.onMessage.addListener to receive messages and sendResponse to reply."

Test this works before moving on. Load the extension unpacked, go to any YouTube video, open the browser console, and manually send a test message.

---

## Phase 5: Build the Side Panel UI (1–2 hours)

### 5A — Create sidepanel.html
Use this Copilot prompt:

> "Create an HTML file for a Chrome extension side panel. It should have:
> * A header with the text 'VideoNotes Pro' and a small settings icon
> * A large 'Capture Timestamp' button at the top
> * A text area below it labeled 'Add a note...'
> * A 'Save Note' button
> * A scrollable list area below that will show saved notes
> * A footer with an 'Export Notes' button and an 'Upgrade to Pro' link Do not use any CDN links. Link to styles.css and sidepanel.js using relative paths."

### 5B — Create styles.css
Use this Copilot prompt:

> "Write clean, minimal CSS for a Chrome extension side panel. The panel is 400px wide. Use a dark theme with a background color of #1a1a2e, accent color of #e94560, and white text. Style: a header bar, a primary button (full width, accent color, rounded), a textarea (dark background, white text, rounded border), a list of note cards (each showing a timestamp badge in accent color and note text below it), and a footer with two small action links. No external fonts — use the system font stack."

---

## Phase 6: Build the Side Panel Logic (2–3 hours)

This is the brain of the extension. Create `sidepanel.js`.

Break this into three separate Copilot prompts — don't ask for it all at once.

### Prompt A — Capture the timestamp:
> "Write a JavaScript function called captureTimestamp(). It should use chrome.tabs.query to get the current active tab, then use chrome.scripting.executeScript OR chrome.tabs.sendMessage to send a message with type 'GET_TIMESTAMP' to the content script. When the content script responds with the currentTime and title, display the timestamp in the format MM:SS in the HTML element with id 'current-timestamp', and store the title in a variable called currentVideoTitle. Also store the currentTime value in a variable called currentTimestampSeconds."

### Prompt B — Save and display notes:
> "Write JavaScript functions for a Chrome extension side panel note-taking app. I need:
> 1. saveNote() — takes the currentTimestampSeconds, currentVideoTitle, and the text from the textarea with id 'note-input'. Creates a note object with an id (Date.now()), videoTitle, timestampSeconds, timestampFormatted (MM:SS string), noteText, and url of the current tab. Saves it to chrome.storage.local under a key based on the videoTitle.
> 2. loadNotes() — retrieves all notes from chrome.storage.local for the current video and renders them into the div with id 'notes-list'. Each note should show the timestamp as a clickable badge and the note text below it.
> 3. jumpToTimestamp(seconds) — sends a message to the content script with type 'JUMP_TO_TIME' and the seconds value, so the video seeks to that timestamp."

### Prompt C — Wire up the buttons:
> "Add event listeners to my side panel. When the DOM loads: call loadNotes(). When the button with id 'capture-btn' is clicked: call captureTimestamp(). When the button with id 'save-btn' is clicked: call saveNote() then clear the textarea and call loadNotes() to refresh the list. When any timestamp badge in the notes list is clicked: call jumpToTimestamp() with the seconds value stored in its data-seconds attribute."

---

## Phase 7: Add the Jump-to-Timestamp Handler in content.js (20 minutes)

Go back to `content.js` and add a second message handler. Use this Copilot prompt:

> "Add a second message handler to my existing Chrome content script. If it receives a message with type 'JUMP_TO_TIME' and a seconds value, it should find the video element with document.querySelector('video') and set its currentTime to the seconds value."

---

## Phase 8: Local Testing Checklist

Before touching monetization, verify every feature works:

- [ ] Go to chrome://extensions — enable Developer Mode
- [ ] Click "Load Unpacked" — select your videonotes-pro folder
- [ ] Open a YouTube video
- [ ] Click the extension icon — side panel opens
- [ ] Click "Capture Timestamp" — does it show the correct time?
- [ ] Type a note and click "Save Note" — does it appear in the list?
- [ ] Click a saved timestamp badge — does the video jump to that time?
- [ ] Close and reopen the side panel — do your notes persist?
- [ ] Open a different YouTube video — is the notes list empty (correct behavior)?

### Common issues and fixes:
- **"Cannot read properties of null (reading 'currentTime')"** → The content script ran before the video loaded. Add a small delay or check that the video element exists first.
- **Notes not persisting** → Check that you're using chrome.storage.local not localStorage. They are different.
- **Side panel not opening** → Verify sidePanel is in your permissions array in manifest.json (capital P matters).

---

## Phase 9: Add the Freemium Gate (1 hour)

This is where free users hit a limit and get prompted to upgrade.

### Step 1 — Sign up for ExtensionPay
Go to extensionpay.com → create a free account → create a new extension → connect your Stripe account (also free to set up, you only pay fees on sales).

### Step 2 — Add ExtensionPay to your project
Download extensionpay.js from their GitHub repo and place it in your project folder. Add it to your manifest's web_accessible_resources.

### Step 3 — Add the paywall logic
Use this Copilot prompt:

> "Using the ExtensionPay library (already loaded as extpay), write a function checkProStatus() that calls extpay.getUser() and returns whether the user has paid. In my saveNote() function, before saving, I want to count the total number of unique video titles in chrome.storage.local. If the user is not Pro and has notes for more than 3 videos already, show a modal or alert that says 'You've reached the free limit of 3 videos. Upgrade to Pro for unlimited notes.' and link to the ExtensionPay payment page using extpay.openPaymentPage(). If the user is Pro or has fewer than 3 videos, proceed with saving normally."

---

## Phase 10: Export Feature — Pro Only (45 minutes)

Use this Copilot prompt:

> "Write a function exportNotes() for my Chrome extension side panel. It should:
> 1. Retrieve ALL notes from chrome.storage.local (not just the current video)
> 2. Format them as a Markdown string. Each video gets a heading (## Video Title), and each note becomes a bullet point with the timestamp in bold followed by the note text, like: '- 2:34 — Note text here'
> 3. Create a Blob from that string with type 'text/markdown'
> 4. Create a temporary download link using URL.createObjectURL and programmatically click it to trigger a download of 'videonotes-export.md' Before doing any of this, call checkProStatus() and if the user is not Pro, call extpay.openPaymentPage() instead."

---

## Phase 11: Create Store Assets (1–2 hours)

### Icons
In Canva (free), create a 1000x1000 image. Design a simple icon: dark background, a play button triangle overlapping a small notepad or pencil. Export as PNG, then resize copies to 128x128, 48x48, and 16x16.

### Screenshots (Required — minimum 1, aim for 3)
**Size:** 1280x800 pixels (Chrome Web Store requirement)

**Suggested screenshots:**
1. The side panel open next to a YouTube video, showing saved notes
2. A close-up of the note capture flow
3. The export feature output in a text editor

In Canva: create a 1280x800 canvas, take real screenshots of your extension working, paste them in, add a headline like "Take notes at any moment. Jump back instantly."

### Promotional tile (optional but boosts store visibility)
**Size:** 440x280 pixels — a simple graphic with your extension name and a one-line value proposition.

---

## Phase 12: Privacy Policy & Legal (30 minutes)

Google requires a privacy policy if your extension uses storage.

1. Go to termly.io (free)
2. Generate a privacy policy for a Chrome browser extension
3. Key points to include: you store data locally on the user's device, you do not collect personal data, you do not share data with third parties
4. Host it on your GitHub Pages landing page (see next step)

---

## Phase 13: Landing Page on GitHub Pages (1–2 hours)

This is optional for launch but important for growth. A landing page increases trust, improves conversion, and gives you a URL for your privacy policy.

### Setup
1. Create a free GitHub account if you don't have one
2. Create a new repository called videonotes-pro
3. Go to Settings → Pages → set source to main branch

Your page will be live at: `https://yourusername.github.io/videonotes-pro`

### Content for the page (ask Copilot to write the HTML)
Use this Copilot prompt:

> "Write a single-file HTML landing page for a Chrome extension called VideoNotes Pro. The tagline is 'Capture any moment. Never lose your place.' The page should have: a hero section with the tagline and a 'Add to Chrome — Free' button, a 3-feature section (Instant Capture, Jump Back Anytime, Export Your Notes), a pricing section (Free tier with 3 video limit, Pro at $3.99/month or $24.99/year), and a footer with a Privacy Policy link. Dark theme, accent color #e94560. No external CSS frameworks."

---

## Phase 14: Publishing to the Chrome Web Store (1 hour)

1. Zip your folder — select all files inside videonotes-pro/, zip them (not the folder itself — the files directly)
2. Go to chrome.google.com/webstore/devconsole
3. Pay the one-time $5 developer fee
4. Click "New Item" → upload your zip
5. Fill out the listing:
   - **Name:** VideoNotes Pro
   - **Short description (132 chars):** "Take timestamped notes on any YouTube video. Click any note to jump back instantly. For students, researchers & creators."
   - **Category:** Productivity
   - **Language:** English
6. Upload your screenshots and icon
7. Add your privacy policy URL (your GitHub Pages link)
8. Submit for review

**Expected review time:** 1–5 business days for a first submission.

---

## Full Timeline

| Phase | Task | Estimated Time |
|-------|------|-----------------|
| 1–2 | Setup + Manifest | 45 minutes |
| 3–4 | Background + Content scripts | 1 hour |
| 5–6 | UI + Side panel logic | 3–5 hours |
| 7 | Jump-to-time handler | 20 minutes |
| 8 | Testing & bug fixing | 1–2 hours |
| 9–10 | Freemium gate + Export | 1.5 hours |
| 11 | Store assets (Canva) | 1–2 hours |
| 12 | Privacy policy | 30 minutes |
| 13 | Landing page | 1–2 hours |
| 14 | Publishing | 1 hour |
| — | Google review | 1–5 days |
| **Total** | **Working MVP to live** | **~12–16 hours over 2 weeks** |

---

## Growth & Promotion Plan (the part most developers skip)

Building it is 30% of the work. Getting users is the other 70%.

### Week 1–2 after launch (free)
- Post in r/productivity, r/GetStudying, r/college, r/YoutubeUniversity
- Post a short demo video on LinkedIn showing it solving a real problem
- Comment in YouTube-related subreddits when people ask "how do you take notes on videos?"

### Ongoing (1 hour/week)
- Respond to all Chrome Web Store reviews — this builds trust visibly
- When users ask for features, add the realistic ones — this keeps your rating high
- Consider a simple email capture on your landing page (Mailchimp free tier) so you can notify users of updates

### When you hit 500+ users
- Write a short blog post: "How I built a Chrome extension in a weekend"
- Post it to Hacker News (Show HN) and Dev.to
- This alone can generate hundreds of installs in 48 hours

---

## Revenue Projection

| Month | Paying Users (est.) | Monthly Revenue |
|-------|---------------------|-----------------|
| 1–2 | 5–15 | $20–$60 |
| 3–4 | 20–50 | $80–$200 |
| 6 | 80–150 | $320–$600 |
| 12 | 150–250 | $600–$1,000 |
| 18–24 | 300–500 | $1,200–$2,000 |

**$8,000/year is realistic by month 12–18 with consistent promotion.** Most extensions fail not because of the product but because the developer stopped promoting after the first week.

---

## Maintenance Expectations

Once launched, expect to spend roughly 1–2 hours per month on:
- Responding to reviews
- Fixing any YouTube player changes (rare — maybe once a year)
- Small feature additions based on user feedback

**There are no servers to maintain, no API keys to rotate, no databases to manage.** This is the primary reason this extension type was recommended.

---

## Next Extensions to Build After This One

Once VideoNotes Pro is generating income, these are natural follow-ons that reuse skills you'll have learned:

1. **PDF Timestamp Highlighter** — same concept, for PDF documents instead of video. Reuses most of your storage and UI code.
2. **Podcast Notes** — extend VideoNotes to work on Spotify and Apple Podcasts web players.
3. **Meeting Notes for Google Meet / Teams** — captures timestamps during live meetings. Higher willingness to pay (business users).
4. **Reading Progress Tracker** — saves your place and notes in any long-form article or documentation page.
5. **Tab Research Organizer** — group open tabs by project and add notes to each. Very high demand, very low maintenance.

Each of these builds on what you already know and can share large parts of your codebase.
