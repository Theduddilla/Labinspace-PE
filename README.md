# OmniTest CDN v2 — Global Performance Testing + Open Source AI

A modernized CDN testing platform with **real open-source LLM integration** via multiple providers.

## What's New in v2

- 🧠 **Multi-provider LLM support** — Groq (free Llama3), Ollama (local), OpenAI, Claude
- 💬 **Interactive AI chat** on the Dashboard — ask follow-up questions about your test results
- ⚡ **Streaming AI responses** — tokens stream in real time
- 🎨 **Modernized UI** — JetBrains Mono + Syne, glassmorphism panels, animated stats
- 📊 **Richer metrics** — P50/P95/P99, TTFB, bandwidth per region
- 🔧 **Fixed Netlify 404** — correct `publish` path, proper `_redirects` file

## Quick Start

```bash
# Serve locally
npx http-server -p 8080

# Or with Netlify Dev
npm install -g netlify-cli
netlify dev
```

## LLM Setup (pick one)

### Option 1: Groq — Free & Fastest (Recommended)
1. Get a free API key at https://console.groq.com
2. Open Settings → select Groq → paste key → Save
3. Uses **Llama3-8B** at 600+ tokens/sec

### Option 2: Ollama — Local & Private
```bash
# Install Ollama
brew install ollama   # macOS

# Pull a model
ollama pull llama3:8b

# Serve with CORS enabled (required for browser access)
OLLAMA_ORIGINS=* ollama serve
```
Then in Settings → select Ollama → URL: `http://localhost:11434`

### Option 3: OpenAI / Claude
Add your API key in Settings. GPT-4o-mini or Claude Haiku are cost-effective choices.

## Deploy to Netlify

**Important:** The `netlify.toml` must be at the **repo root** with `publish = "."` (or the subdirectory path if nested).

```bash
netlify deploy --prod
```

## Project Structure

```
omnitest-cdn/
├── index.html        # Dashboard + AI chat
├── mesh.html         # Hop-by-hop trace + AI analysis
├── recorder.html     # Session recorder + AI analysis
├── settings.html     # LLM provider configuration
├── css/styles.css    # Design system
├── js/
│   ├── shared.js     # LLM client, CDN simulator, utilities
│   ├── sidebar.js    # Shared navigation
│   ├── dashboard.js  # Dashboard logic
│   ├── mesh.js       # Mesh trace logic
│   ├── recorder.js   # Session recorder logic
│   └── settings.js   # Settings page logic
├── _redirects        # Netlify SPA routing (no extension!)
└── netlify.toml
```
