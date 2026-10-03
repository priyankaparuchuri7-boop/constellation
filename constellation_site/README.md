# Constellation

A simple habit tracker. Static site, no build step, no backend, no account.

- **Today**: add as many habits as you like. Each check-in records whether you did it (Done or Not today), how you feel (five moods) and an optional note.
- **Constellation**: your last 28 days drawn as a night sky. Days you did it light a star (bigger and brighter when you felt good), days you didn't leave an empty ring, and threads join the lit days.
- **Analytics**: streaks, 30-day completion, a 12-week heatmap, a 30-day mood trend, mood per habit and a plain-language insight about which habits lift your mood. Filter by one habit or see all.
- **Data**: stored in the browser (`localStorage`). Export CSV, download or restore a JSON backup, or delete everything, all from the bottom of Analytics.

## Run locally

```
python3 -m http.server 8080
```

Open http://localhost:8080.

## Deploy to Vercel

Import the repository, set Framework Preset to Other, leave Build Command and Output Directory empty, and set the Root Directory to `constellation-site`. `vercel.json` adds security headers and a content security policy.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The only page |
| `js/app.js` | All app logic and charts |
| `css/site.css` | Styles |
| `sw.js`, `manifest.webmanifest` | Offline use and install to home screen |
