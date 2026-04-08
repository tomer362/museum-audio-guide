# 🎨 Museum Audio Guide

A self-contained, offline-capable web app that turns any museum's collection data into a full audio guide — powered entirely by the browser's built-in Web Speech API. No server, no subscription, no internet connection required once loaded.

---

## ✨ Features

- **Audio narration** for every artwork — automatically reads the description aloud
- **Seekable progress bar** — click or drag to jump to any point in the narration (like Spotify)
- **Playback speed control** — 0.75×, 1×, 1.25×, 1.5× — resumes from the same position
- **Auto-advance** — automatically plays the next artwork when one finishes
- **Floor / wing tabs** — filter artworks by floor or highlight only the star pieces
- **Live search** — filter by title, artist, room, wing, or tags
- **AI prompt generator** — built-in tool to generate a guide JSON with ChatGPT, Claude, or Gemini
- **Mobile-first** — works as a PWA-style full-screen app on iOS and Android
- **Single HTML file** — the entire app is one `index.html` with no external dependencies

---

## 🚀 Getting Started

1. Open `index.html` in any modern browser (Chrome, Safari, Firefox, Edge).
2. Click **📂 Load Museum Guide** and pick a compatible `.json` file.
3. Tap the **▶** button on any artwork card to start listening.

> **Tip:** You can also drag a `.json` file onto the browser window on desktop.

---

## 📄 JSON Format

The guide expects a JSON file in `museum-audio-guide/v1` format:

```json
{
  "format": "museum-audio-guide/v1",
  "meta": {
    "name": "Museo del Prado",
    "city": "Madrid, Spain",
    "established": "1819",
    "description": "One of the world's finest collections of European art."
  },
  "floors": [
    { "id": 0, "name": "Ground Floor" },
    { "id": 1, "name": "First Floor" }
  ],
  "artworks": [
    {
      "id": "las-meninas",
      "title": "Las Meninas",
      "artist": "Diego Velázquez",
      "year": "1656",
      "floor": 1,
      "room": "12",
      "wing": "Spanish Golden Age",
      "medium": "Oil on canvas",
      "type": "painting",
      "highlight": true,
      "tags": ["baroque", "royal court", "masterpiece"],
      "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/9/99/Las_Meninas_01.jpg",
      "audioDescription": "Standing before Las Meninas is like stepping through a mirror..."
    }
  ]
}
```

### Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Unique kebab-case identifier |
| `title` | string | ✅ | Artwork title |
| `artist` | string | ✅ | Artist's full name |
| `year` | string | | Year or circa (e.g. `"c. 1503"`) |
| `floor` | number | | Floor number — used for tab filtering |
| `room` | string | | Room number or name |
| `wing` | string | | Wing or gallery name — used for section headings |
| `medium` | string | | Medium (e.g. `"Oil on canvas"`) |
| `type` | string | | `painting`, `sculpture`, `drawing`, or `other` |
| `highlight` | boolean | | `true` to appear in the ✨ Highlights tab |
| `tags` | string[] | | Searchable tags |
| `imageUrl` | string | | Direct image URL (Wikimedia Commons recommended) |
| `audioDescription` | string | ✅ | The text narrated aloud — aim for 150–200 words |

---

## 🤖 Generate a Guide with AI

Don't have a JSON file? Use the built-in AI prompt generator:

1. Click **🤖 Generate Guide with AI** on the start screen.
2. Enter the museum name.
3. Copy the generated prompt and paste it into ChatGPT, Claude, or Gemini.
4. Save the AI's response as a `.json` file and load it into the app.

---

## ⌨️ Player Controls

| Control | Action |
|---|---|
| **▶ / ⏸** (card button) | Play or pause a specific artwork |
| **▶ / ⏸** (player bar) | Toggle play/pause for the current artwork |
| **⏮ / ⏭** | Skip to previous / next artwork in the current list |
| **Progress bar** | Click or drag to seek to any position in the narration |
| **Speed button** | Cycle through 0.75×, 1×, 1.25×, 1.5× — resumes from current position |
| **Auto toggle** | Automatically advance to the next artwork when one ends |

---

## 🛠 Development

### Prerequisites

- Node.js 18+

### Install & run

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build

```bash
npm run build
```

This produces a single self-contained `index.html` in the project root (via `vite-plugin-singlefile`).

---

## ⚠️ Known Limitations

- **Seeking is approximate** — the Web Speech API does not expose precise playback position. Seeking jumps to the nearest estimated word, so the position may be off by a few seconds.
- **Voice quality varies** — the app automatically selects the best available voice on your device. Neural/cloud voices (Google, Microsoft) sound significantly better than local system voices.
- **iOS background audio** — iOS may pause speech synthesis when the screen locks. The app applies a periodic keep-alive workaround, but behaviour depends on the iOS version.
- **No offline voice download** — voice availability depends on the voices installed on the device.
