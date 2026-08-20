// GukzSchedule — logica da pagina (vanilla JS, sem dependencias).
// Duas abas: "Proximos jogos" (le agenda.json) e "Meus times" (le teams.json, salva favorites.json).

// ---------------------------------------------------------------------------
// Config: detecta owner/repo pela URL do GitHub Pages. Se estiver rodando fora
// do github.io (ex.: localhost), usa o FALLBACK abaixo — edite se precisar.
// ---------------------------------------------------------------------------
const FALLBACK = { owner: "SEU_USUARIO_GITHUB", repo: "GukzSchedule", branch: "main" };

function detectRepo() {
  const host = location.hostname;
  if (host.endsWith(".github.io")) {
    const owner = host.split(".")[0];
    const repo = location.pathname.split("/").filter(Boolean)[0] || FALLBACK.repo;
    return { owner, repo, branch: FALLBACK.branch };
  }
  return { ...FALLBACK };
}
const REPO = detectRepo();

const TOKEN_KEY = "gukz_pat";
const EXP_KEY = "gukz_pat_exp"; // validade do token (ISO), pra avisar quando for expirar
const GAME_LABELS = { csgo: "CS2", valorant: "Valorant", lol: "LoL", football: "Futebol" };
const GAME_ORDER = ["football", "csgo", "valorant", "lol"];

// Estado
let agendaEvents = [];
let teamsCatalog = {}; // { csgo: [...], valorant: [...], lol: [...] }
let favorites = { football: new Set(), csgo: new Set(), valorant: new Set(), lol: new Set() };
let agendaGameFilter = "all";
let teamsGameFilter = "football";

// Helper de fetch com cache-bust (Pages/CDN podem cachear)
async function loadJSON(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};

// ===========================================================================
// Tabs
// ===========================================================================
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(`#tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// ===========================================================================
// ABA: PROXIMOS JOGOS
// ===========================================================================
function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(date) {
  const now = new Date();
  const today = dayKey(now);
  const tmr = dayKey(new Date(now.getTime() + 86400000));
  const k = dayKey(date);
  if (k === today) return "Hoje";
  if (k === tmr) return "Amanhã";
  return date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" });
}

function renderAgenda() {
  const list = $("#agendaList");
  list.innerHTML = "";
  const q = $("#agendaSearch").value.trim().toLowerCase();

  const items = agendaEvents.filter((ev) => {
    if (agendaGameFilter !== "all" && ev.game !== agendaGameFilter) return false;
    if (!q) return true;
    const hay = [...ev.teams, ev.league, ev.serie, ev.tournament].join(" ").toLowerCase();
    return hay.includes(q);
  });

  if (items.length === 0) {
    const empty = el("div", "empty");
    if (agendaEvents.length === 0) {
      empty.innerHTML =
        "Nenhum jogo por aqui ainda.<br>Vá em <b>Meus times</b>, escolha seus favoritos e salve — " +
        "a lista aparece depois que o robô do GitHub atualiza (alguns minutos).";
    } else {
      empty.textContent = "Nada encontrado com esse filtro.";
    }
    list.appendChild(empty);
    return;
  }

  let lastDay = null;
  for (const ev of items) {
    const start = new Date(ev.startsAt);
    const dk = dayKey(start);
    if (dk !== lastDay) {
      lastDay = dk;
      list.appendChild(el("div", "day-header", dayLabel(start)));
    }
    list.appendChild(matchCard(ev, start));
  }
}

function matchCard(ev, start) {
  const card = el("div", "match");

  const time = el("div", "time");
  time.appendChild(el("div", "hh", start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })));
  time.appendChild(el("div", "dd", start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })));
  card.appendChild(time);

  const info = el("div", "info");
  const teamsRow = el("div", "teams-row");
  ev.teams.forEach((name, i) => {
    if (i > 0) teamsRow.appendChild(el("span", "vs", "×"));
    const team = el("div", "team");
    const logo = ev.teamLogos?.[i];
    if (logo) {
      const img = el("img");
      img.src = logo;
      img.alt = "";
      img.loading = "lazy";
      team.appendChild(img);
    }
    team.appendChild(el("span", null, name));
    teamsRow.appendChild(team);
  });
  info.appendChild(teamsRow);
  const sub = [ev.league, ev.serie].filter(Boolean).join(" • ");
  if (sub) info.appendChild(el("div", "sub", sub));
  card.appendChild(info);

  const right = el("div", "right");
  right.appendChild(el("span", `badge ${ev.game}`, ev.gameLabel || GAME_LABELS[ev.game]));
  if (ev.streamUrl) {
    const a = el("a", "stream", "▶ stream");
    a.href = ev.streamUrl;
    a.target = "_blank";
    a.rel = "noopener";
    right.appendChild(a);
  }
  card.appendChild(right);
  return card;
}

// ===========================================================================
// ABA: MEUS TIMES
// ===========================================================================
function renderTeams() {
  const list = $("#teamsList");
  list.innerHTML = "";
  const q = $("#teamSearch").value.trim().toLowerCase();
  const teams = teamsCatalog[teamsGameFilter] || [];

  const filtered = teams.filter((t) => !q || (t.name || "").toLowerCase().includes(q));
  const picked = favorites[teamsGameFilter];

  // Favoritos primeiro, depois alfabetico
  filtered.sort((a, b) => {
    const pa = picked.has(a.id), pb = picked.has(b.id);
    if (pa !== pb) return pa ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  if (filtered.length === 0) {
    list.appendChild(el("div", "empty", teams.length ? "Nenhum time encontrado." : "Catálogo ainda não gerado."));
    return;
  }

  for (const t of filtered.slice(0, 300)) {
    const row = el("div", "team-row" + (picked.has(t.id) ? " checked" : ""));
    if (t.image_url) {
      const img = el("img");
      img.src = t.image_url;
      img.alt = "";
      img.loading = "lazy";
      row.appendChild(img);
    }
    row.appendChild(el("div", "nm", t.name || `#${t.id}`));
    row.appendChild(el("div", "box", picked.has(t.id) ? "✓" : ""));
    row.addEventListener("click", () => {
      if (picked.has(t.id)) picked.delete(t.id);
      else picked.add(t.id);
      renderTeams();
      updateTeamsMeta();
    });
    list.appendChild(row);
  }
}

function updateTeamsMeta() {
  const total = GAME_ORDER.reduce((n, g) => n + favorites[g].size, 0);
  $("#teamsMeta").textContent = `${total} time(s) favoritado(s) no total.`;
}

function favoritesToObject() {
  const obj = {};
  for (const g of GAME_ORDER) obj[g] = [...(favorites[g] || [])];
  return obj;
}

// ===========================================================================
// Salvar favoritos (GitHub Contents API) + fallback download
// ===========================================================================
function b64utf8(str) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
}

function setSaveMsg(text, kind) {
  const m = $("#saveMsg");
  m.textContent = text;
  m.className = "save-msg" + (kind ? " " + kind : "");
}

// Grava/atualiza um arquivo no repo via GitHub Contents API. Reutilizado pelo
// "Salvar favoritos" e pelo botao "Atualizar".
async function putFile(path, content, message) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error("sem token");
  const api = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/contents/${path}`;

  // Pega o SHA atual (necessario pra atualizar um arquivo existente)
  let sha;
  const getRes = await fetch(`${api}?ref=${REPO.branch}&t=${Date.now()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (getRes.ok) sha = (await getRes.json()).sha;
  else if (getRes.status !== 404) throw new Error(`GET ${getRes.status}`);

  const putRes = await fetch(api, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify({
      message,
      content: b64utf8(content),
      branch: REPO.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!putRes.ok) {
    const body = await putRes.text().catch(() => "");
    throw new Error(`PUT ${putRes.status} ${body.slice(0, 120)}`);
  }
  // Bonus: se o GitHub expuser a validade do token no header, usa ela.
  const exp = putRes.headers.get("github-authentication-token-expiration");
  if (exp) { storeTokenExp(exp); refreshTokenStatus(); }
  return putRes;
}

async function saveFavorites() {
  if (!localStorage.getItem(TOKEN_KEY)) {
    openTokenModal();
    setSaveMsg("Configure um token do GitHub para salvar (ou use “Baixar favorites.json”).", "err");
    return;
  }
  if (REPO.owner === FALLBACK.owner) {
    setSaveMsg("Edite o owner/repo em app.js (FALLBACK) ou abra pela URL do GitHub Pages.", "err");
    return;
  }
  const content = JSON.stringify(favoritesToObject(), null, 2) + "\n";
  setSaveMsg("Salvando…");
  try {
    await putFile("data/favorites.json", content, "Atualiza favoritos (via GukzSchedule)");
    setSaveMsg("Salvo! O robô do GitHub vai atualizar a agenda em alguns minutos.", "ok");
  } catch (err) {
    setSaveMsg("Falha ao salvar: " + err.message, "err");
  }
}

// ---- Validade do token ------------------------------------------------------
function storeTokenExp(value) {
  let d = new Date(value);
  if (isNaN(d)) d = new Date(String(value).replace(" ", "T")); // formato do header do GitHub
  if (!isNaN(d)) localStorage.setItem(EXP_KEY, d.toISOString());
}

function tokenExpText() {
  if (!localStorage.getItem(TOKEN_KEY)) return { text: "Nenhum token configurado.", kind: "" };
  const raw = localStorage.getItem(EXP_KEY);
  if (!raw) return { text: "Token configurado (validade não informada).", kind: "ok" };
  const d = new Date(raw);
  const dateStr = d.toLocaleDateString("pt-BR");
  const days = Math.ceil((d - new Date()) / 86400000);
  if (days < 0) return { text: `⚠️ Token expirou em ${dateStr}. Gere um novo.`, kind: "err" };
  if (days === 0) return { text: `⚠️ Token expira hoje (${dateStr}).`, kind: "warn" };
  if (days <= 7) return { text: `⚠️ Token expira em ${dateStr} — faltam ${days} dia(s).`, kind: "warn" };
  return { text: `Token expira em ${dateStr} — faltam ${days} dias.`, kind: "ok" };
}

function refreshTokenStatus() {
  const { text, kind } = tokenExpText();
  const hasToken = !!localStorage.getItem(TOKEN_KEY);
  const inModal = $("#tokenStatus");
  if (inModal) { inModal.textContent = text; inModal.className = "token-status " + kind; }
  const inTab = $("#tokenExpiry");
  if (inTab) { inTab.textContent = hasToken ? text : ""; inTab.className = "token-status " + kind; }
}

// ---- Botao "Atualizar" ------------------------------------------------------
function setRefreshMsg(text, kind) {
  const m = $("#refreshMsg");
  m.textContent = text;
  m.className = "save-msg" + (kind ? " " + kind : "");
}

async function triggerRefresh() {
  const btn = $("#refreshBtn");
  btn.classList.add("spinning");
  setRefreshMsg("Atualizando…");

  // 1. Recarrega a lista ja publicada (rapido, sem token)
  try {
    const agenda = await loadJSON("agenda.json");
    agendaEvents = agenda.events || [];
    updateAgendaMeta(agenda.generatedAt);
    renderAgenda();
  } catch { /* placeholder ainda nao gerado */ }

  // 2. Se tiver token, forca o robo a rodar gravando data/.refresh
  const canPush = localStorage.getItem(TOKEN_KEY) && REPO.owner !== FALLBACK.owner;
  if (!canPush) {
    btn.classList.remove("spinning");
    setRefreshMsg(
      localStorage.getItem(TOKEN_KEY)
        ? "Lista recarregada."
        : "Lista recarregada. Configure o token (aba Meus times) para forçar uma busca nova de jogos.",
      "ok"
    );
    return;
  }
  try {
    await putFile("data/.refresh", new Date().toISOString() + "\n", "Forcar atualizacao (via GukzSchedule)");
    setRefreshMsg("Busca disparada! Os jogos novos aparecem em ~1–2 min — toque em 🔄 de novo para ver.", "ok");
  } catch (err) {
    setRefreshMsg("Recarregado, mas falhou ao disparar o robô: " + err.message, "err");
  } finally {
    btn.classList.remove("spinning");
  }
}

function updateAgendaMeta(generatedAt) {
  $("#agendaMeta").textContent = generatedAt
    ? `${agendaEvents.length} jogo(s) • atualizado ${new Date(generatedAt).toLocaleString("pt-BR")}`
    : `${agendaEvents.length} jogo(s)`;
}

function downloadFavorites() {
  const content = JSON.stringify(favoritesToObject(), null, 2) + "\n";
  const blob = new Blob([content], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "favorites.json";
  a.click();
  URL.revokeObjectURL(a.href);
  setSaveMsg("Baixado. Faça o commit em data/favorites.json no seu repositório.", "ok");
}

// ===========================================================================
// Modais (calendario e token)
// ===========================================================================
function calendarUrl() {
  if (REPO.owner !== FALLBACK.owner) {
    return `https://${REPO.owner}.github.io/${REPO.repo}/agenda.ics`;
  }
  return new URL("agenda.ics", location.href).href;
}
function openCalModal() {
  const url = calendarUrl();
  $("#calUrl").value = url;
  $("#webcalLink").href = url.replace(/^https?:/, "webcal:");
  $("#calModal").hidden = false;
}
function openTokenModal() {
  $("#tokenInput").value = localStorage.getItem(TOKEN_KEY) || "";
  // Pre-preenche a validade: a guardada, ou hoje + 90 dias como sugestao.
  const raw = localStorage.getItem(EXP_KEY);
  const d = raw ? new Date(raw) : new Date(Date.now() + 90 * 86400000);
  $("#tokenExp").value = isNaN(d) ? "" : d.toISOString().slice(0, 10);
  refreshTokenStatus();
  $("#tokenModal").hidden = false;
}

// ===========================================================================
// Chips (filtros de jogo)
// ===========================================================================
function buildChips(container, includeAll, current, onPick) {
  container.innerHTML = "";
  const games = includeAll ? ["all", ...GAME_ORDER] : GAME_ORDER;
  for (const g of games) {
    const chip = el("button", "chip" + (g === current ? " active" : ""), g === "all" ? "Todos" : GAME_LABELS[g]);
    chip.dataset.game = g;
    chip.addEventListener("click", () => {
      onPick(g);
      container.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.game === g));
    });
    container.appendChild(chip);
  }
}

// ===========================================================================
// Init
// ===========================================================================
async function init() {
  // Listeners
  $("#agendaSearch").addEventListener("input", renderAgenda);
  $("#teamSearch").addEventListener("input", renderTeams);
  $("#calBtn").addEventListener("click", openCalModal);
  $("#refreshBtn").addEventListener("click", triggerRefresh);
  $("#saveBtn").addEventListener("click", saveFavorites);
  $("#downloadBtn").addEventListener("click", downloadFavorites);
  $("#tokenBtn").addEventListener("click", openTokenModal);

  $("#closeCalBtn").addEventListener("click", () => ($("#calModal").hidden = true));
  $("#copyCalBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#calUrl").value); $("#copyCalBtn").textContent = "Copiado!"; }
    catch { $("#calUrl").select(); }
  });
  $("#closeTokenBtn").addEventListener("click", () => ($("#tokenModal").hidden = true));
  $("#saveTokenBtn").addEventListener("click", () => {
    const v = $("#tokenInput").value.trim();
    if (v) localStorage.setItem(TOKEN_KEY, v);
    const exp = $("#tokenExp").value;
    if (exp) storeTokenExp(exp);
    refreshTokenStatus();
    $("#tokenModal").hidden = true;
    setSaveMsg("Token guardado neste navegador.", "ok");
  });
  $("#clearTokenBtn").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXP_KEY);
    $("#tokenInput").value = "";
    refreshTokenStatus();
    setSaveMsg("Token apagado.", "ok");
  });

  buildChips($("#agendaFilters"), true, agendaGameFilter, (g) => { agendaGameFilter = g; renderAgenda(); });
  buildChips($("#teamFilters"), false, teamsGameFilter, (g) => { teamsGameFilter = g; renderTeams(); });

  // Carrega dados (cada um falha em silencio para nao quebrar a pagina toda)
  try {
    const agenda = await loadJSON("agenda.json");
    agendaEvents = agenda.events || [];
    updateAgendaMeta(agenda.generatedAt);
  } catch { /* placeholder ainda nao gerado */ }

  try {
    const fav = await loadJSON("favorites.json");
    for (const g of GAME_ORDER) favorites[g] = new Set((fav[g] || []).map(Number));
  } catch { /* sem favoritos ainda */ }

  try {
    const cat = await loadJSON("teams.json");
    teamsCatalog = cat.teams || {};
  } catch { /* catalogo ainda nao gerado */ }

  renderAgenda();
  renderTeams();
  updateTeamsMeta();
  refreshTokenStatus();
}

init();
