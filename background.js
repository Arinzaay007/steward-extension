// ===== Steward - background service worker =====
// Responsibilities:
//  - Maintain chat history + settings in chrome.storage
//  - Capture page text + a screenshot of the current page (on demand)
//  - Talk to the Groq API (OpenAI-compatible chat completions)

const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";

// Default text model. Fast + generous free tier.
const DEFAULT_TEXT_MODEL = "llama-3.3-70b-versatile";
// Default vision model (can "see" screenshots/images).
const DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const SYSTEM_PROMPT =
  "You are 'Steward', a warm, patient and clear-minded assistant embedded in the user's " +
  "browser. You act like a knowledgeable friend who looks at whatever web page or image the " +
  "user is currently viewing and explains it in plain language. " +
  "Guidelines:\n" +
  "- Be friendly and concise. Explain simply, but don't dumb things down unnecessarily.\n" +
  "- When a page is shown, summarize what it is, what it's for, and the key things to know. " +
  "Flag anything that seems like ads, paywalls, sign-up tricks, misleading claims, or tracking " +
  "so the user can browse safely.\n" +
  "- When you only receive text about a page, base your answer on that text.\n" +
  "- When you also receive an image (a screenshot or a picture), use it to help you understand " +
  "layout and visuals, and describe what is shown if asked.\n" +
  "- If you are genuinely unsure or lack context, say so instead of guessing.\n" +
  "- Keep answers skimmable: short paragraphs, and lists where helpful. No need to echo back " +
  "long raw page content.";

// ---------- Default settings ----------
const DEFAULT_SETTINGS = {
  apiKey: "",
  textModel: DEFAULT_TEXT_MODEL,
  visionModel: DEFAULT_VISION_MODEL,
  includeScreenshot: true, // send a screenshot of the page with questions
  includePageText: true, // also send extracted readable text of the page
  maxChars: 8000, // cap on how much page text we send
};

chrome.runtime.onInstalled.addListener(() => {
  // Ensure default settings exist once.
  chrome.storage.local.get(["settings"], ({ settings }) => {
    if (!settings) {
      chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS } });
    }
  });
  // Set up context menu item.
  chrome.contextMenus.create({
    id: "steward-explain",
    title: "Ask Steward to explain this",
    contexts: ["page", "selection", "image", "link"],
  });
});

// Context menu click -> open the side panel focused on this page.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "steward-explain") {
    openSidePanel(tab);
  }
});

// Toolbar icon click -> open the side panel.
chrome.action.onClicked.addListener((tab) => {
  openSidePanel(tab);
});

// Keyboard shortcut -> open the side panel.
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-steward") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) openSidePanel(tab);
  }
});

async function openSidePanel(tab) {
  await chrome.sidePanel.setOptions({ tabId: tab.id, path: "panel.html", enabled: true });
  await chrome.sidePanel.open({ tabId: tab.id });
}

// Listen for messages from the panel or content scripts.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "GET_SETTINGS": {
        sendResponse({ settings: (await getSettings()).public });
        break;
      }
      case "SAVE_SETTINGS": {
        await saveSettings(msg.settings);
        sendResponse({ ok: true });
        break;
      }
      case "GET_HISTORY": {
        const h = await chrome.storage.local.get(["history"]);
        sendResponse({ history: h.history || [] });
        break;
      }
      case "CLEAR_HISTORY": {
        await chrome.storage.local.set({ history: [] });
        sendResponse({ ok: true });
        break;
      }
      case "CAPTURE_PAGE": {
        // Collect page text + screenshot for the given (or active) tab.
        const tabId = msg.tabId ?? sender?.tab?.id;
        const res = await capturePage(tabId);
        sendResponse(res);
        break;
      }
      case "ASK_STEWARD": {
        // msg: { tabId?, userText, capture }  (capture = page text + screenshot object)
        const reply = await askSteward(msg);
        sendResponse(reply);
        break;
      }
      case "PING": {
        sendResponse({ ok: true });
        break;
      }
      case "APPEND_HISTORY": {
        const h = await chrome.storage.local.get(["history"]);
        const list = h.history || [];
        list.push(msg.turn);
        await chrome.storage.local.set({ history: list.slice(-100) });
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  })().catch((e) => {
    console.error("Steward background error:", e);
    sendResponse({ ok: false, error: String(e?.message || e) });
  });
  return true; // async response
});

// ---------- Settings helpers ----------
async function getSettings() {
  const { settings } = await chrome.storage.local.get(["settings"]);
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function saveSettings(partial) {
  const cur = await getSettings();
  const next = { ...cur, ...partial };
  await chrome.storage.local.set({ settings: next });
}

function publicSettings(s) {
  return { ...s, apiKey: "" }; // never expose the key back to the panel UI
}

// ---------- Page capture ----------
async function capturePage(tabId) {
  if (tabId == null) return { ok: false, error: "No tab context." };

  const settings = await getSettings();
  const result = { ok: true, url: "", title: "", text: "", screenshotDataUrl: null };

  try {
    const tab = await chrome.tabs.get(tabId);
    result.url = tab.url || "";
    result.title = tab.title || "";
  } catch (e) {
    // tab may have closed; continue best-effort
  }

  // Restricted pages (chrome://, chrome web store, PDF viewer) can't be scripted.
  const url = result.url;
  const restricted = !url || /^(chrome|edge|about|chrome-extension|chrome-search|view-source):/.test(url) ||
                    url.startsWith("https://chrome.google.com/webstore");

  if (settings.includePageText && !restricted) {
    try {
      const [{ result: text }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractPageText,
      });
      // clip to maxChars
      const limit = settings.maxChars || 8000;
      result.text = (text || "").slice(0, limit);
    } catch (e) {
      result.text = "";
    }
  }

  if (settings.includeScreenshot) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 60 });
      result.screenshotDataUrl = dataUrl;
    } catch (e) {
      result.screenshotDataUrl = null; // not allowed on some tabs
    }
  }

  return result;
}

// Runs in the PAGE world via executeScript. Must be self-contained.
function extractPageText() {
  try {
    const doc = document;
    // Prefer the main article if it exists.
    const main =
      doc.querySelector("article") ||
      doc.querySelector("main") ||
      doc.body;

    // Grab headings + paragraphs, plus metadata.
    const parts = [];
    if (doc.title) parts.push("TITLE: " + doc.title);
    const h = doc.querySelector("h1");
    if (h && h.textContent.trim()) parts.push("H1: " + h.textContent.trim());

    const walker = doc.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const seen = [];
    const blocks = new Set();
    let node;
    while ((node = walker.nextNode())) {
      const t = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!t) continue;
      // Only take text inside recognizable block elements to avoid nav cruft.
      let p = node.parentElement;
      if (!p) continue;
      const tag = p.tagName ? p.tagName.toLowerCase() : "";
      if (["p", "h1", "h2", "h3", "h4", "li", "blockquote", "td", "th", "summary", "label", "caption"].includes(tag)) {
        if (blocks.has(p)) continue;
        blocks.add(p);
        seen.push((tag === "li" ? "• " : "") + t);
      }
    }
    // Heuristic: too much text means we scraped menus/scripts noise; keep last chunk.
    let joined = seen.join("\n");
    if (joined.length > 20000) {
      joined = joined.slice(-18000);
    }
    if (!joined) joined = doc.body ? (doc.body.innerText || "").slice(0, 2000) : "";
    return joined;
  } catch (e) {
    return "";
  }
}

// ---------- Chat with Groq ----------
async function askSteward({ tabId, userText, capture, history }) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    return { ok: false, error: "no_api_key" };
  }

  // Build the system + user content.
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  // Previous turns (keep it bounded).
  const hist = Array.isArray(history) ? history.slice(-12) : [];
  for (const turn of hist) {
    messages.push({ role: "user", content: turn.user || "" });
    messages.push({ role: "assistant", content: turn.assistant || "" });
  }

  // This turn's content.
  let content = [];
  const cap = capture || {};
  let hasImage = false;

  if (cap.url) content.push({ type: "text", text: `[Current page URL: ${cap.url}]` });
  if (cap.title) content.push({ type: "text", text: `[Page title: ${cap.title}]` });

  if (cap.text) {
    content.push({ type: "text", text: `[Readable text from the current page follows]\n${cap.text}` });
  }

  if (cap.screenshotDataUrl) {
    hasImage = true;
    content.push({ type: "text", text: "[This is a screenshot of the current page you are viewing — use it to understand layout/visuals.]" });
    content.push({ type: "image_url", image_url: { url: cap.screenshotDataUrl } });
  }

  if (userText) {
    content.push({ type: "text", text: `[The user asks you:]\n${userText}` });
  } else {
    content.push({ type: "text", text: "Please give me a clear plain-language explanation of this page." });
  }

  messages.push({ role: "user", content });

  const model = hasImage ? settings.visionModel : settings.textModel;

  const body = {
    model,
    messages,
    temperature: 0.5,
    max_tokens: 900,
  };

  let res;
  try {
    res = await fetch(GROQ_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + settings.apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: "network", detail: String(e?.message || e) };
  }

  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = j?.error?.message || JSON.stringify(j); } catch (_) {}
    return { ok: false, error: "http_" + res.status, detail };
  }

  const data = await res.json();
  const answer = data?.choices?.[0]?.message?.content?.trim() || "";
  if (!answer) return { ok: false, error: "empty" };
  return { ok: true, answer, model: data.model };
}

// Keep service worker alive long enough for the awaited fetch to complete is
// handled automatically because the onMessage listener returned true.
