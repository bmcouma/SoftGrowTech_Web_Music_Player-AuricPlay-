# 🎵 AuricPlay

**AuricPlay** is a premium, locally-hosted web music player. It delivers a modern, production-grade streaming interface that runs directly in your browser. With immersive dynamic visuals, customized crossfading, and a fully interactive interface, AuricPlay turns your local `.mp3` files into a flagship streaming experience.

---

## ✨ Features

- **Local Music Library:** Place your `.mp3` files in the `assets/music/` directory, and AuricPlay automatically serves them as a premium streaming experience.
- **Dynamic Atmosphere:** The application background smoothly transitions to a blurred ambient glow based on the currently playing track's artwork.
- **Settings & Customization:** Just like Boomplay or VLC, AuricPlay features a dedicated **Settings** menu.
  - **Crossfade Duration:** Seamlessly bridge tracks with a custom fade duration (0s to 10s).
  - **Advanced Sorting:** Organize your library by Title (A-Z/Z-A), Artist, or Date Added.
- **Rich Audio Visualizer:** Experience your music visually with beautifully rendered Canvas-based analyzers (Circular Ring and Bar Spectrum).
- **Immersive Fullscreen:** A distraction-free, full-viewport mode combining deep blur backgrounds, visualizers, and an interactive queue.
- **Smart Queue & History:** Your play history and newly queued tracks are managed automatically. 
- **Keyboard Navigation:** Full keyboard shortcut support for a native-app feel.
- **Smooth Audio Engine:** Features intelligent crossfading and volume easing for a polished listening experience.

---

## 🚀 Quick Start

AuricPlay is incredibly easy to set up. It requires no backend, no databases, and no complex build tools.

### 1. Add Your Music
1. Place any `.mp3` files into the `assets/music/` folder.
2. (Optional) Place corresponding cover art into the `assets/images/` folder.
3. Update the `LOCAL_TRACKS` array in `js/api.js` to reference your specific filenames.

### 2. Run the App
**Option A: Direct Open (Simplest)**
Double-click `index.html` to open it directly in any modern web browser.

**Option B: Local Web Server (Recommended)**
Run a lightweight local server from the project root directory:
```bash
# Python 3
python -m http.server 8080

# Node.js
npx serve .
```
Then visit `http://localhost:8080` in your browser.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `←` | Seek back 10 seconds |
| `→` | Seek forward 10 seconds |
| `↑` | Volume up |
| `↓` | Volume down |
| `M` | Mute / Unmute |
| `N` | Next track |
| `P` | Previous track |
| `S` | Toggle shuffle |
| `R` | Cycle repeat mode |
| `L` | Like / Unlike current track |
| `F` | Toggle fullscreen |
| `V` | Toggle visualizer mode |
| `Esc` | Close fullscreen |

---

## 🛠️ Tech Stack

AuricPlay is built using modern browser APIs without relying on heavy frameworks.

| Technology | Purpose |
|---|---|
| **HTML5 & CSS3** | Semantic structure, CSS variables, Grid/Flexbox layouts, glassmorphism, animations |
| **Vanilla JS (ES6+)** | State management, highly decoupled pub/sub event bus, DOM rendering |
| **Web Audio API** | Real-time audio routing, frequency analysis, gain manipulation, crossfading |
| **Canvas 2D API** | High-performance, frame-synced audio visualizer rendering |

---

## 📁 Project Structure

```text
AuricPlay/
├── assets/
│   ├── images/        ← Track cover art
│   └── music/         ← Local .mp3 audio files
├── css/
│   ├── animations.css ← Keyframes and transitions
│   └── style.css      ← Design variables and UI layout
├── js/
│   ├── api.js         ← Local track data provider
│   ├── app.js         ← Core logic, state, and event bus
│   ├── player.js      ← Web Audio API engine
│   ├── ui.js          ← DOM manipulation and dynamic visuals
│   └── visualizer.js  ← Canvas rendering engine
└── index.html         ← Main application entry
```

---

## 📄 License

This open-source project is available under the MIT License. Feel free to fork, modify, and build upon it!
