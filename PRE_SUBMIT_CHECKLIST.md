# VideoNotes Pro - Final Pre-Submit Checklist

## 1) Core Functionality
- [ ] Capture timestamp works on YouTube videos
- [ ] Save note works
- [ ] Clicking timestamp jumps video correctly
- [ ] Notes persist after closing/reopening sidebar
- [ ] Notes are isolated per video (video ID key)

## 2) Freemium + Pro
- [ ] Free tier allows unlimited note capture and save
- [ ] Free tier import/export/search are limited to most recent 5 video sessions
- [ ] Upgrade link opens ExtensionPay payment page
- [ ] Sandbox paid user unlocks Pro behavior

## 3) Export
- [ ] Unpaid user clicking Export gets upgrade flow
- [ ] Paid user clicking Export downloads `videonotes-export.md`
- [ ] Export file contains headings per video and bullet notes with timestamps

## 4) ExtensionPay + Stripe
- [ ] Real ExtensionPay ID set in `background.js`
- [ ] Real ExtensionPay ID set in `sidepanel.js`
- [ ] `ExtPay.js` is present at project root
- [ ] Stripe is connected in ExtensionPay dashboard
- [ ] At least one plan is active in sandbox/live mode as needed

## 5) UI + Attribution
- [ ] Sidebar has no horizontal overflow
- [ ] Footer actions are fully visible
- [ ] Textarea starts with cursor at beginning of line
- [ ] Settings button shows/opens Flaticon attribution link
- [ ] Attribution link included on landing page footer

## 6) Store Readiness
- [ ] Final icons in `/icons` are correct (16, 48, 128)
- [ ] Screenshots prepared (1280x800)
- [ ] Privacy policy URL is public
- [ ] Landing page URL is public

## 7) Packaging + Submit
- [ ] Reload extension and run final smoke test
- [ ] Zip extension contents (files inside folder, not parent folder)
- [ ] Upload to Chrome Web Store Developer Dashboard
- [ ] Fill listing details + screenshots + privacy policy URL
- [ ] Submit for review