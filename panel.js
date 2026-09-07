// ===== Steward - side panel UI logic =====

// Send a message to the background and resolve with the response.
function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) resolve({ ok: false, error: err.message });
      else resolve(resp || { ok: false, error: "No response" });
    });
  });
}

const $ = (sel) => document.querySelector(sel);
const messagesEl = $("#messages");
const inputEl = $("#input");
const ctxText = $("#ctxText");
let settings = {};
let history = []; // current-session context (short)
let pendingTurn = false;

// ---------- Message rendering ----------
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdownish(text) {
  // Minimal safe formatting: paragraphs, bullet lists, bold, line breaks.
  const blocks = [];
  const raw = (text || "").split(/\n{2,}/);
  for (const block of raw) {
    const lines = block.split("\n").filter((l) => l.trim());
    let html = "";
    let inList = false;
    for (const line of lines) {
      const m = line.match(/^(\s*)[-*•]\s+(.*)$/) || line.match(/^(\d+)[.)]\s+(.*)$/);
      if (m) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += "<li>" + inline(m[2]) + "</li>";
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        html += "<p>" + inline(line) + "</p>";
      }
    }
    if (inList) html += "</ul>";
    blocks.push(html);
  }
  return blocks.join("");
}

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function addBubble(kind, text) {
  const div = document.createElement("div");
  div.className = "bubble " + kind;
  if (kind === "assistant" || kind === "err") {
    div.innerHTML = renderMarkdownish(text);
  } else {
    div.textContent = text;
  }
  messagesEl.appendChild(div);
  scrollBottom();
  return div;
}

function addSys(text) {
  const div = document.createElement("div");
  div.className = "sys";
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollBottom();
}

function addTyping() {
  const div = document.createElement("div");
  div.className = "typing";
  div.innerHTML = "<span class=\"spin\">◌</span> Arinzaay's Steward is looking…";
  messagesEl.appendChild(div);
  scrollBottom();
  return div;
}

function scrollBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---------- Capture + ask ----------
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function updateContext() {
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.title) {
      ctxText.textContent = "Ready — open any page to get started.";
      return;
    }
    let host = "";
    try { host = new URL(tab.url).hostname; } catch (_) {}
    ctxText.textContent = tab.title + (host ? " · " + host : "");
  } catch (_) {
    ctxText.textContent = "Ready — I'll explain whatever you're looking at.";
  }
}

async function ask(userText) {
  if (pendingTurn) return;
  if (!settings.hasApiKey) {
    addSys("Please add your free Groq API key in Settings first.");
    showSettings();
    return;
  }

  pendingTurn = true;
  setSendEnabled(false);
  if (userText) addBubble("user", userText);
  const typing = addTyping();

  const tab = await getActiveTab();
  let capture = { url: "", title: "", text: "", screenshotDataUrl: null };
  try {
    const res = await send({ type: "CAPTURE_PAGE", tabId: tab && tab.id });
    if (res && res.ok) capture = res;
  } catch (_) {}

  const reply = await send({
    type: "ASK_STEWARD",
    tabId: tab && tab.id,
    userText: userText || "Explain this page in simple terms.",
    capture,
    history,
  });

  typing.remove();
  pendingTurn = false;
  setSendEnabled(true);

  if (!reply || !reply.ok) {
    handleError(reply);
    return;
  }

  addBubble("assistant", reply.answer);

  // store turn
  const turn = {
    user: userText || "Explain this page in simple terms.",
    assistant: reply.answer,
  };
  history.push(turn);
  history = history.slice(-12);
  send({ type: "APPEND_HISTORY", turn });
}

function handleError(reply) {
  const code = reply && reply.error;
  let msg = "Something went wrong.";
  if (code === "no_api_key") msg = "No API key yet. Open Settings and paste your free Groq key.";
  else if (code === "network") msg = "Couldn't reach the network. Check your internet and try again.";
  else if (code === "http_401" || code === "http_403") msg = "Your API key was rejected. Double-check it in Settings.";
  else if (code === "http_429") msg = "Rate limit hit (Groq free tier). Wait a moment and retry.";
  else if (code === "http_404") msg = "The chosen model isn't available. Pick a different model in Settings.";
  else if ((reply?.detail || "").includes("image")) msg = "That model may not accept images. Choose a vision model in Settings.";
  else if (code) msg = (reply.detail || msg) + " (" + code + ")";
  addBubble("err", msg);
}

// ---------- Composer ----------
function setSendEnabled(v) {
  $("#send").disabled = !v;
  inputEl.disabled = !v;
}

function submitFromInput() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  autoGrow();
  ask(text);
}

function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
}

// ---------- Settings ----------
function showSettings() {
  document.body.classList.add("show-settings");
}
function hideSettings() {
  document.body.classList.remove("show-settings");
}

const TEXT_MODELS = [
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-120b",
];
const VISION_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
];

function populateSelect(sel, models, current) {
  sel.innerHTML = "";
  for (const m of models) {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    if (m === current) o.selected = true;
    sel.appendChild(o);
  }
}

async function loadSettings() {
  const res = await send({ type: "GET_SETTINGS" });
  if (res && res.settings) settings = res.settings;
  populateSelect($("#textModel"), TEXT_MODELS, settings.textModel);
  populateSelect($("#visionModel"), VISION_MODELS, settings.visionModel);
  // checkbox states
  if (settings.includeScreenshot != null) $("#includeScreenshot").checked = settings.includeScreenshot;
  else $("#includeScreenshot").checked = true;
  if (settings.includePageText != null) $("#includePageText").checked = settings.includePageText;
  else $("#includePageText").checked = true;
}

async function saveSettings() {
  const keyEntered = $("#apiKey").value.trim();
  // Only include the key if the user typed one (so we never wipe a saved key).
  const partial = {
    textModel: $("#textModel").value,
    visionModel: $("#visionModel").value,
    includeScreenshot: $("#includeScreenshot").checked,
    includePageText: $("#includePageText").checked,
  };
  if (keyEntered) partial.apiKey = keyEntered;

  if (!keyEntered && !settings.hasApiKey) {
    setStatus("Enter your Groq API key first.", "bad");
    return;
  }

  await send({ type: "SAVE_SETTINGS", settings: partial });
  setStatus("Saved ✓", "ok");
  await loadSettings();
  $("#apiKey").value = "";
  setTimeout(() => hideSettings(), 700);
}

function setStatus(text, cls) {
  const el = $("#status");
  el.className = cls ? "status-" + cls : "";
  el.textContent = text;
}

async function testConnection() {
  const key = $("#apiKey").value.trim();
  if (!key && !settings.hasApiKey) {
    setStatus("Enter a key first.", "bad");
    return;
  }
  setStatus("Testing…", "neutral");
  // If the user typed a key, save it so the background can test with it.
  if (key) {
    await send({ type: "SAVE_SETTINGS", settings: { apiKey: key } });
    $("#apiKey").value = "";
    await loadSettings();
  }
  const reply = await send({ type: "TEST_CONNECTION" });
  if (reply && reply.ok) setStatus("Connection works ✓  (" + (reply.model || "") + ")", "ok");
  else handleError(reply);
}

// ---------- Events ----------
function initEvents() {
  $("#settingsBtn").addEventListener("click", showSettings);
  $("#backBtn").addEventListener("click", hideSettings);
  $("#saveBtn").addEventListener("click", saveSettings);
  $("#testBtn").addEventListener("click", testConnection);

  $("#newChatBtn").addEventListener("click", () => {
    history = [];
    messagesEl.innerHTML = "";
    addSys("New conversation. Ask me about the page you're on.");
  });

  $("#clearHistoryBtn").addEventListener("click", async () => {
    await send({ type: "CLEAR_HISTORY" });
    history = [];
    messagesEl.innerHTML = "";
    setStatus("History cleared.", "neutral");
  });

  $("#send").addEventListener("click", submitFromInput);

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitFromInput();
    }
  });
  inputEl.addEventListener("input", autoGrow);

  document.querySelectorAll(".quick").forEach((b) => {
    b.addEventListener("click", () => {
      ask(b.dataset.q);
    });
  });

  // Auto-open settings if no key yet.
  send({ type: "GET_SETTINGS" }).then((res) => {
    if (res && res.settings && !res.settings.hasApiKey) {
      addSys("Welcome! Add your free Groq API key to get started.");
      showSettings();
    } else {
      addSys("I'm ready. Ask me about the page you're viewing — or click a quick question below.");
    }
  });

  // update context as active tab changes
  updateContext();
  chrome.tabs.onActivated.addListener(updateContext);
  chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === "complete") updateContext(); });
  setInterval(updateContext, 8000);
}

// ---------- Boot ----------
(async function init() {
  await loadSettings();
  if (!settings.hasApiKey) {
    $("#apiKey").focus();
  }
  initEvents();
})();
