# KRY AI

A sleek AI chat assistant powered by Blackbox AI backend, deployable on Vercel.

## Features
- 💬 Full chat with history & memory per session
- 🔍 Web search toggle
- 📎 File upload + OCR/reading support
- 💾 Download responses as TXT, MD, JSON, HTML, CSV
- 📱 Responsive sidebar with hamburger menu
- ✨ Animated UI with AOS, particle effects, smooth transitions
- 🔒 CORS-safe backend via Vercel API routes

## Deploy to Vercel

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Clone or unzip this project, then:
```bash
cd kry-ai
vercel deploy
```

### 3. Follow prompts
- Link to your Vercel account
- Project name: `kry-ai` (or your choice)
- No build command needed
- Output directory: `public`

### 4. Done!
Your app will be live at `https://kry-ai.vercel.app` (or your chosen name).

## Local Development
```bash
vercel dev
```
Then open `http://localhost:3000`

## File Structure
```
kry-ai/
├── api/
│   └── chat.js       ← Backend proxy (no CORS)
├── public/
│   └── index.html    ← Frontend UI
├── vercel.json       ← Routing config
└── package.json
```

## Usage Tips
- **Upload files**: Click the paperclip icon — supports TXT, PDF, images, code files, CSV, JSON
- **Web search**: Toggle the globe button in the topbar
- **Download responses**: Click "Save" under any AI message, or the download icon in the topbar for the full conversation
- **Auto-download**: Ask "give me X as a markdown file" — it will auto-download
- **History**: All chats are saved locally, searchable in the sidebar
