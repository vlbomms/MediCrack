# MediCrack – Offline Question Bank Browser
*A lightweight, high-performance exam practice platform built with Electron (used to be Flutter). Intended to be utilized as the OS of Medcelerates moving forward.*

MediCrack is a modern desktop question-bank system that loads **local HTML question banks**, supports **timed and untimed exams**, saves **progress + analytics**, enables **rich review (flags, highlights)**, and uses a tiny **Node.js license server** for activation.

It is adapted from the Quail Question Bank Browser and optimized for personal use, local banks, and secure offline study.

---

## Key Features

### Licensing & Authentication
- Simple license-key login screen  
- Backed by a local **Express + LowDB** license server  
- Offline fallback mode if the server cannot be reached  
- Persistent per-user sessions via `electron-store`

### Local Question-Bank Support
Load any folder structured like:

```
001-q.html
001-s.html
002-q.html
002-s.html
```

On first load, MediCrack automatically generates:
- `index.json`
- `tagnames.json`
- `groups.json`
- `panes.json`

### Exam Blocks
- Custom question pools (unused, incorrects, flagged, custom)
- Timed/untimed blocks
- Sequential/random order
- Grouped questions stay together
- Saves answers, flags, highlights, timing, pause/resume

### Progress & Analytics
- Total questions answered
- Correct/incorrect percentages
- Flag counts
- Unused vs seen questions
- Completed vs paused blocks
- Time-spent analytics

### Rich Review Mode
- Two‑pane HTML question/solution viewer
- Auto‑rewritten paths for images/audio/video
- Highlight text (with removal)
- Flags + navigation tools
- Timer display and keyboard shortcuts

---

## Architecture Overview

```
MediCrack/
├── main.js
├── index.html / index.js
├── overview.html / overview.js
├── newblock.html / newblock.js
├── previousblocks.html / previousblocks.js
├── loadbank.html / loadbank.js
├── examview.html / examview.js
├── TextHighlighter.js
└── license-server/
    ├── server.js
    └── db.json
```

---

## Getting Started

### 1. Clone & Install
```bash
git clone https://github.com/vlbomms/MediCrack.git
cd MediCrack
npm install
```

### 2. Install license server
```bash
cd license-server
npm install
cd ..
```

---

## Configure Your Question Bank

In `index.js`, set:

```js
const fixedDatasetPath = "/path/to/your/questionbank";
ipcRenderer.send("load-fixed-dataset", fixedDatasetPath);
```

Folder format:

```
QID-q.html
QID-s.html
```

On first load, JSON metadata files are generated automatically.

---

## Running MediCrack

### 1. Start license server
```bash
cd license-server
npm start
```

### 2. Add a license key
```bash
curl -X POST http://localhost:3001/api/licenses   -H "Content-Type: application/json"   -d '{"licenseKey":"TEST-1234"}'
```

### 3. Launch app
```bash
npm start
```

---

## Packaging
Add to `package.json`:

```json
"build": "electron-builder -mwl"
```

Then:

```bash
npm run build
```

---

## Data Storage
User data stored locally under:

```
<app-data>/user_data/<userId>/user_data.json
```

Contains highlights, flags, block history, performance.

---

## Roadmap
- UI for setting dataset path  
- License admin panel  
- Dark mode  
- Import/export progress  
- Multi-bank support  

---

Enjoy practicing smarter with **MediCrack**!

