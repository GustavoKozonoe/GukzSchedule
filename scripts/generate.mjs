// Gera public/agenda.ics (pro Calendario do iPhone) e public/agenda.json (pra pagina web),
// a partir dos times marcados em data/favorites.json. Roda no GitHub Actions.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES, fetchUpcoming, matchToEvent } from "../src/pandascore.mjs";
import { fetchFootballUpcoming, footballMatchToEvent } from "../src/footballdata.mjs";
import { fetchCupFixtures } from "../src/apifootball.mjs";
import { ODDS_GAMES, fetchEventsByGroup, oddsEventToEvent } from "../src/oddsapi.mjs";
import { buildCalendar } from "../src/ics.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAVORITES = resolve(__dirname, "../data/favorites.json");
const TEAMS = resolve(__dirname, "../public/teams.json");
const OUT_ICS = resolve(__dirname, "../public/agenda.ics");
const OUT_JSON = resolve(__dirname, "../public/agenda.json");
const OUT_FAV = resolve(__dirname, "../public/favorites.json");

// Normaliza nome (sem acento/maiuscula) para casar times/jogadores entre fontes.
const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Nomes (normalizados) dos times de futebol favoritos, lidos do catalogo (teams.json).
// Usado para casar as copas da API-Football (que tem IDs proprios) por nome.
async function footballFavoriteNames(favIds) {
  if (!favIds.size) return new Set();
  try {
    const cat = JSON.parse(await readFile(TEAMS, "utf8"));
    const names = new Set();
    for (const t of cat.teams?.football || []) {
      if (!favIds.has(Number(t.id))) continue;
      if (t.name) names.add(norm(t.name));
      if (t.shortName) names.add(norm(t.shortName));
    }
    return names;
  } catch {
    return new Set();
  }
}

async function loadFavorites() {
  try {
    const raw = await readFile(FAVORITES, "utf8");
    return JSON.parse(raw);
  } catch {
    console.warn("Aviso: data/favorites.json nao encontrado ou invalido. Usando vazio.");
    return {};
  }
}

async function main() {
  const token = process.env.PANDASCORE_TOKEN;
  const favorites = await loadFavorites();

  const events = [];

  for (const game of GAMES) {
    const favIds = new Set((favorites[game.slug] || []).map(Number));
    if (favIds.size === 0) {
      console.log(`${game.label}: nenhum time favorito, pulando.`);
      continue;
    }

    process.stdout.write(`${game.label}: buscando proximos jogos... `);
    const matches = await fetchUpcoming(game.slug, token);

    const mine = matches.filter((m) =>
      (m.opponents || []).some((o) => o.opponent && favIds.has(Number(o.opponent.id)))
    );
    console.log(`${matches.length} no total, ${mine.length} dos seus times`);

    for (const m of mine) events.push(matchToEvent(m, game.slug));
  }

  // Futebol (football-data.org) — opcional, so se o token existir
  const fdToken = process.env.FOOTBALL_DATA_TOKEN;
  const footFavs = new Set((favorites.football || []).map(Number));
  if (footFavs.size === 0) {
    console.log("Futebol: nenhum time favorito, pulando.");
  } else if (!fdToken) {
    console.log("Futebol: FOOTBALL_DATA_TOKEN nao definido, pulando.");
  } else {
    console.log("Futebol: buscando proximos jogos...");
    const matches = await fetchFootballUpcoming(fdToken);
    const mine = matches.filter(
      (m) => footFavs.has(Number(m.homeTeam?.id)) || footFavs.has(Number(m.awayTeam?.id))
    );
    console.log(`Futebol: ${matches.length} no total, ${mine.length} dos seus times`);
    for (const m of mine) events.push(footballMatchToEvent(m));
  }

  // Copas de futebol (API-Football) — complementa a football-data (que so tem ligas).
  // Opcional; casa os jogos das copas com seus times de futebol favoritos por nome.
  const afKey = process.env.API_FOOTBALL_KEY;
  if (footFavs.size === 0) {
    // sem favoritos de futebol, nao ha o que casar
  } else if (!afKey) {
    console.log("Copas: API_FOOTBALL_KEY nao definido, pulando.");
  } else {
    const favNames = await footballFavoriteNames(footFavs);
    if (favNames.size === 0) {
      console.log("Copas: nao consegui os nomes dos times favoritos (teams.json), pulando.");
    } else {
      console.log("Copas: buscando jogos...");
      const cupEvents = await fetchCupFixtures(afKey, favNames);
      console.log(`Copas: ${cupEvents.length} jogos dos seus times`);
      events.push(...cupEvents);
    }
  }

  // The Odds API (tenis e outros) — opcional, so se o token existir
  const oddsKey = process.env.ODDS_API_KEY;
  for (const g of ODDS_GAMES) {
    const favs = new Set(favorites[g.slug] || []); // ids sao nomes (strings)
    if (favs.size === 0) {
      console.log(`${g.label}: nenhum favorito, pulando.`);
    } else if (!oddsKey) {
      console.log(`${g.label}: ODDS_API_KEY nao definido, pulando.`);
    } else {
      console.log(`${g.label}: buscando proximos jogos...`);
      const evs = await fetchEventsByGroup(oddsKey, g.group);
      // Compara por nome normalizado (sem acento/maiuscula) para casar nomes
      // adicionados manualmente com a grafia da API.
      const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
      const favNorm = new Set([...favs].map(norm));
      const mine = evs.filter((e) => favNorm.has(norm(e.home_team)) || favNorm.has(norm(e.away_team)));
      console.log(`${g.label}: ${evs.length} no total, ${mine.length} dos seus favoritos`);
      for (const e of mine) events.push(oddsEventToEvent(e, g.slug, g.label));
    }
  }

  // Ordena por data de inicio (mais proximo primeiro).
  events.sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0));

  const ics = buildCalendar(events);
  const json = {
    generatedAt: new Date().toISOString(),
    count: events.length,
    events,
  };

  await mkdir(dirname(OUT_ICS), { recursive: true });
  await writeFile(OUT_ICS, ics);
  await writeFile(OUT_JSON, JSON.stringify(json, null, 0));
  // Copia os favoritos para public/ para a pagina saber o que ja esta marcado (sem precisar de token).
  await writeFile(OUT_FAV, JSON.stringify(favorites, null, 0));

  console.log(`\nOK -> ${events.length} jogos`);
  console.log(`  ${OUT_ICS}`);
  console.log(`  ${OUT_JSON}`);
  console.log(`  ${OUT_FAV}`);
}

main().catch((err) => {
  console.error("\nErro ao gerar a agenda:", err.message);
  process.exit(1);
});
