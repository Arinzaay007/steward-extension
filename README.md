# 🧭 Steward — Your AI Browser Guide

A Chrome extension that acts as a gentle, personal **steward** while you browse. It
**reads the sites and pictures you're looking at** and explains them in plain language —
summarizing pages, telling you what you can do, and flagging anything to be careful about.

It only speaks **when you ask** (on-demand). Nothing is sent to any server until you click a
quick question or type something. Your Groq API key stays in your browser's local storage.

---

## ✨ Features
- **Side panel chat** — ask Steward anything about the current page.
- **Quick questions** — one-click *"Explain this page"*, *"What can I do here?"*, *"Any red flags?"*, *"Summarize"*.
- **Reads pages & pictures** — Steward grabs the page's readable text *and* a screenshot so it can
  actually "see" what you're looking at (needs a **vision** model for images).
- **Context menu** — right-click any page/selection/image → *"Ask Steward to explain this."*
- **Keyboard shortcut** — `Ctrl/Cmd + Shift + S`.
- **On-demand only** — no auto-triggering, no page scanning until you ask.
- **Settings** — paste your free Groq key, pick text/vision models, toggle screenshot & text capture.

---

## 🔧 How the AI works
Steward calls **Groq** (OpenAI-compatible API, **free tier, no credit card**):
- Base URL: `https://api.groq.com/openai/v1/chat/completions`
- **Text model** (page text questions): default `llama-3.3-70b-versatile`
- **Vision model** (can see screenshots/images): default `meta-llama/llama-4-scout-17b-16e-instruct`

Get a free key here: **https://console.groq.com/keys**

---

## 🔐 Security policy (important for contributors)
- **No API keys live in this repo.** Users paste their own key into the extension's Settings;
  it is stored only in `chrome.storage.local` and never committed.
- Do **not** commit any `gsk_...` key or add it to `.gitignore`-bypassing files. A leaked key can be
  used by anyone, so treat keys as revocable secrets (regenerate at console.groq.com/keys if ever exposed).
- The extension phones out to Groq **only** when you ask a question. There is no tracking or
  third-party analytics. This is a steward, not a spy. 🙂

## 📦 Install (developer mode)
1. Open Chrome and go to `chrome://extensions/`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the **`steward-extension`** folder.
4. Pin Steward to the toolbar.
5. Open the extension → add your Groq key in **Settings** → click **Test connection** → **Save**.

> The first time you use it on a new page, Chrome may ask you to grant "Read and change all your
> data on the websites you visit" (needed so Steward can read page text and capture the screen).

---

## 🔒 Privacy
- Your **API key is stored only** in `chrome.storage.local` (never sent anywhere except directly to Groq with your requests).
- Page text + screenshot are sent **only when you ask a question**, and only to Groq (not to us — there's no third-party server).
- Screenshots can be disabled in Settings if you only want text-based explanations.

---

## 📁 Project structure
```
steward-extension/
├── manifest.json      # MV3 extension manifest
├── background.js      # service worker: capture, Groq calls, settings, context menu
├── panel.html         # side panel UI markup
├── panel.js           # side panel logic
├── icons/             # toolbar / store icons (16, 48, 128, 512)
└── README.md
```

## ⚙️ Model notes
- If the **vision model** rejects an image or is unavailable, pick another from Settings, or disable
  "Send a screenshot" to fall back to text-only.
- Groq's free tier is rate-limited (~30 req/min). If you hit **429**, wait a moment and retry.

---

Made with ☕. A "steward," not a spy — it explains what you're looking at, only when you ask.
