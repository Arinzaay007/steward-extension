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
  actually "see" what you're looking at (uses a **vision** model for images).
- **Context menu** — right-click any page/selection/image → *"Ask Steward to explain this."*
- **Keyboard shortcut** — `Ctrl/Cmd + Shift + S`.
- **On-demand only** — no auto-triggering, no page scanning until you ask.
- **Settings** — paste your free Groq key, pick text/vision models, toggle screenshot & text capture.

---

## 🔀 How it works

```
                  ┌───────────────────────────────────────────────┐
                  │                  YOUR CHROME                  │
                  │                                               │
   You click /    │   ┌──────────┐   text + screenshot   ┌──────┐ │
   type a         │   │  panel    │ ───────────────────► │background│
   question ─────►│   │ (UI)      │◄──────────────────── │worker│  │
                  │   └──────────┘   reply (plain text)  └──┬───┘  │
                  │        │                                │      │
                  └────────┼────────────────────────────────┼──────┘
                           │ chrome messaging               │
                           ▼                                ▼
                  1) reads page text +                3) calls Groq API
                     captures screenshot            (OpenAI-compatible)
                           │                                │
                           └─────────► 2) sends context ────┘
                                              │
                                              ▼
                                       ┌──────────────┐
                                       │   GROQ (AI)   │
                                       │  text model    │  → answers text questions
                                       │  vision model  │  → "sees" screenshots/pics
                                       └──────────────┘
```

**In plain steps:**
1. You open a page and ask Steward (type or tap a quick question).
2. Steward reads the page's readable text and captures a screenshot of what you see.
3. It sends that context **plus** your question to Groq.
4. Groq's model answers; Steward replies in plain, skimmable language.

> Text questions use a fast **text model**; when a screenshot/image is present, Steward
> automatically switches to a **vision model** that can actually see it.

---

## 🔧 The AI: Groq
Steward calls **Groq** — OpenAI-compatible, with a **free tier and no credit card**:
- Base URL: `https://api.groq.com/openai/v1/chat/completions`
- **Text model** (default): `llama-3.3-70b-versatile`
- **Vision model** (default): `meta-llama/llama-4-scout-17b-16e-instruct`

Get a free key: **https://console.groq.com/keys**

---

## 🚀 Install & use (in your own Chrome)

### 1. Load the extension (unpacked)
1. Download this repo as a ZIP → **Code ▾ → Download ZIP** (or `git clone`).
2. Unzip it so you have a folder named `steward-extension` containing `manifest.json`.
3. Open Chrome and go to **`chrome://extensions/`**.
4. Toggle **Developer mode** ON (top-right corner).
5. Click **Load unpacked** and select the **`steward-extension`** folder.
6. Steward's icon appears in your toolbar — click the puzzle-piece (Extensions) icon and **pin 📌** it.

### 2. Connect your key
1. Click the **Steward** icon (or press `Ctrl/Cmd + Shift + S`) to open the side panel.
2. It opens **Settings** the first time — paste your free Groq key from console.groq.com/keys.
3. Click **Test connection** → then **Save**.

### 3. Grant page access (first use on a site)
The first time you ask on a new site, Chrome asks permission for Steward to *"read and change all
your data on the websites you visit"* — this is required to read page text and capture the screen.
Click **Allow**.

### 4. Start asking 🎉
Open any page, then type a question or tap a quick button:
- **Explain this page** — what it is & what to know
- **What can I do here?** — walkthrough of actions
- **Any red flags?** — paywalls, sign-up tricks, misleading claims, tracking
- **Summarize** — the key points

You can also **right-click** any page/selection/image → *Ask Steward to explain this.*

---

## 📤 Sharing with others
- **Repo URL:** `https://github.com/Arinzaay007/steward-extension`
- Others just need to: clone/download → **Load unpacked** → paste **their own** free Groq key.
  *(No shared key is baked in — each user brings their own free key. See security policy below.)*

---

## 🔐 Security policy (important for contributors)
- **No API keys live in this repo.** Users paste their own key into the extension's Settings;
  it is stored only in `chrome.storage.local` and never committed.
- Do **not** commit any `gsk_...` or `github_pat_...` key. A leaked key can be used by anyone, so
  treat keys as revocable secrets (regenerate at console.groq.com/keys if ever exposed).
- The extension phones out to Groq **only** when you ask a question. There is no tracking or
  third-party analytics. This is a steward, not a spy. 🙂

---

## 🔒 Privacy
- Your **API key is stored only** in `chrome.storage.local` (sent nowhere except directly to Groq with your request).
- Page text + screenshot are sent **only when you ask**, and only to Groq. No third-party server in between.
- Screenshots can be disabled in Settings if you prefer text-only explanations.

---

## 📁 Project structure
```
steward-extension/
├── manifest.json      # MV3 extension manifest
├── background.js      # service worker: capture, Groq calls, settings, context menu
├── panel.html         # side panel UI markup
├── panel.js           # side panel logic
├── icons/             # toolbar / store icons (16, 48, 128, 512)
├── LICENSE            # MIT
└── README.md
```

## ⚙️ Model notes
- If a **vision model** rejects an image or is unavailable, pick another in Settings, or disable
  "Send a screenshot" to fall back to text-only.
- Groq's free tier is rate-limited (~30 req/min). If you hit **429**, wait a moment and retry.

---

Made with ☕. A "steward," not a spy — it explains what you're looking at, only when you ask.
