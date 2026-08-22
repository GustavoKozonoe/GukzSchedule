// Coletor multi-esportes via The Odds API (v4).
// Doc: https://the-odds-api.com/liveapi/guides/v4/
//
// Autenticacao: query param ?apiKey=. Por isso este arquivo SO roda no GitHub
// Actions (server-side), nunca no navegador.
//
// Vantagem: os endpoints /sports e /sports/{key}/events NAO consomem a cota
// (a cota grátis, ~500 req/mês, só é gasta em odds/scores, que nao usamos).
//
// Cobre varios esportes. Comecamos pelo tenis, mas dá pra somar outros grupos
// (ex.: "Basketball", "Mixed Martial Arts", "Boxing") reaproveitando tudo aqui.

const BASE = "https://api.the-odds-api.com/v4";

// Grupos (categorias) que viram "jogos" na interface. Cada um tem slug/label proprios.
export const ODDS_GAMES = [
  { slug: "tennis", label: "Tênis", group: "Tennis" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function requireKey(apiKey) {
  if (!apiKey) throw new Error("ODDS_API_KEY nao definido.");
}

async function get(path, apiKey) {
  requireKey(apiKey);
  const url = new URL(BASE + path);
  url.searchParams.set("apiKey", apiKey);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`the-odds-api ${res.status} em ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Chaves de esporte ativas de um grupo (ex.: torneios de tenis rolando agora).
async function activeKeysForGroup(apiKey, group) {
  const sports = await get(`/sports/`, apiKey);
  return sports
    .filter((s) => s.group === group && s.active)
    .map((s) => ({ key: s.key, title: s.title }));
}

// Junta os eventos (jogos) futuros de todas as chaves ativas de um grupo.
export async function fetchEventsByGroup(apiKey, group) {
  const keys = await activeKeysForGroup(apiKey, group);
  const out = [];
  for (const { key, title } of keys) {
    const events = await get(`/sports/${key}/events`, apiKey);
    for (const e of events) out.push({ ...e, sport_title: e.sport_title || title });
    await sleep(200);
  }
  return out;
}

// Participantes unicos (jogadores/times) a partir dos eventos → catalogo do picker.
// Como a API identifica por nome, usamos o proprio nome como id.
export function participantsFromEvents(events) {
  const seen = new Set();
  const list = [];
  for (const e of events) {
    for (const name of [e.home_team, e.away_team]) {
      if (name && !seen.has(name)) {
        seen.add(name);
        list.push({ id: name, name, acronym: null, image_url: null });
      }
    }
  }
  list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return list;
}

// Converte um evento cru do The Odds API para o formato de evento comum.
export function oddsEventToEvent(e, gameSlug, gameLabel) {
  const home = e.home_team;
  const away = e.away_team;
  return {
    id: `odds-${e.id}`, // prefixo evita colisao de UID com outros coletores
    game: gameSlug,
    gameLabel,
    teams: [home || "A definir", away || "A definir"],
    teamLogos: [null, null],
    opponentIds: [home, away].filter(Boolean), // nomes (a API identifica por nome)
    league: e.sport_title || null,
    serie: null,
    tournament: e.sport_title || null,
    matchName: `${home || "?"} x ${away || "?"}`,
    numberOfGames: null,
    startsAt: e.commence_time || null, // ISO 8601 em UTC
    streamUrl: null,
  };
}
