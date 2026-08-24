// Coletor de COPAS de futebol via API-Football (API-Sports).
// Doc: https://www.api-football.com/documentation-v3
//
// Autenticacao: header "x-apisports-key". Tier gratis PERMANENTE, porem com teto
// rigido de 100 requisicoes/DIA — por isso este coletor:
//   - roda so no generate (nao no catalog), e
//   - so busca as copas quando voce tem times de futebol favoritados.
//
// Cobre as copas que a football-data.org (gratis) NAO tem (ex.: Copa do Brasil).
// A Libertadores continua vindo da football-data (evita duplicar).
//
// Importante: a API-Football usa IDs de time proprios (diferentes da football-data).
// Como seus favoritos de futebol estao em IDs da football-data, o casamento aqui e
// feito por NOME (normalizado) do time — o generate passa os nomes dos favoritos.

const BASE = "https://v3.football.api-sports.io";

// Copas acompanhadas (IDs de liga da API-Football). calendarYear=true para
// competicoes de ano-calendario (Brasil/Sula); false para as que cruzam o ano (Europa).
export const CUPS = [
  { id: 73, name: "Copa do Brasil", calendarYear: true },
  { id: 11, name: "Copa Sudamericana", calendarYear: true },
  { id: 9, name: "Copa América", calendarYear: true },
  { id: 45, name: "FA Cup", calendarYear: false },
  { id: 143, name: "Copa del Rey", calendarYear: false },
  { id: 137, name: "Coppa Italia", calendarYear: false },
  { id: 81, name: "DFB Pokal", calendarYear: false },
];

const WINDOW_DAYS = 45;
const FINISHED = new Set(["FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const ymd = (d) => d.toISOString().slice(0, 10);

function seasonFor(cup, now) {
  const y = now.getUTCFullYear();
  if (cup.calendarYear) return y;
  return now.getUTCMonth() >= 6 ? y : y - 1; // temporada europeia comeca em ~agosto
}

// GET resiliente: retry em 5xx/rede; em erro persistente (ou limite diario), pula.
async function afFetch(path, apiKey) {
  const url = BASE + path;
  for (let attempt = 0; attempt <= 3; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { "x-apisports-key": apiKey, Accept: "application/json" } });
    } catch (err) {
      if (attempt < 3) { await sleep(1500 * (attempt + 1)); continue; }
      console.warn(`  (rede falhou na API-Football em ${path}) — pulando`);
      return null;
    }
    if (res.status >= 500 && attempt < 3) { await sleep(1500 * (attempt + 1)); continue; }
    if (!res.ok) {
      console.warn(`  API-Football ${res.status} em ${path} — pulando`);
      return null;
    }
    const data = await res.json().catch(() => null);
    // A API responde 200 com mensagens de erro/limite dentro de "errors".
    if (data && data.errors && Object.keys(data.errors).length) {
      console.warn(`  API-Football avisou: ${JSON.stringify(data.errors).slice(0, 150)} — pulando`);
      return null;
    }
    return data;
  }
  return null;
}

function fixtureToEvent(fx) {
  const home = fx.teams?.home || {};
  const away = fx.teams?.away || {};
  return {
    id: `af-${fx.fixture?.id}`, // prefixo evita colisao de UID com outros coletores
    game: "football",
    gameLabel: "Futebol",
    teams: [home.name || "A definir", away.name || "A definir"],
    teamLogos: [home.logo || null, away.logo || null],
    opponentIds: [home.id, away.id].filter((x) => x != null),
    league: fx.league?.name || null,
    serie: fx.league?.round || null,
    tournament: fx.league?.name || null,
    matchName: `${home.name || "?"} x ${away.name || "?"}`,
    numberOfGames: null,
    startsAt: fx.fixture?.date || null, // ISO 8601 (pedimos timezone=UTC)
    streamUrl: null,
  };
}

// Busca os jogos das copas que envolvem os times favoritos (casados por nome).
// favNames: Set de nomes normalizados dos times favoritos de futebol.
export async function fetchCupFixtures(apiKey, favNames) {
  if (!favNames || favNames.size === 0) return [];
  const now = new Date();
  const from = ymd(now);
  const to = ymd(new Date(now.getTime() + WINDOW_DAYS * 86400000));

  const events = [];
  for (const cup of CUPS) {
    const season = seasonFor(cup, now);
    process.stdout.write(`  ${cup.name}… `);
    const data = await afFetch(
      `/fixtures?league=${cup.id}&season=${season}&from=${from}&to=${to}&timezone=UTC`,
      apiKey
    );
    if (!data) { console.log("pulado"); await sleep(300); continue; }

    let mine = 0;
    for (const fx of data.response || []) {
      const status = fx.fixture?.status?.short;
      if (FINISHED.has(status)) continue;
      const home = norm(fx.teams?.home?.name);
      const away = norm(fx.teams?.away?.name);
      if (favNames.has(home) || favNames.has(away)) {
        events.push(fixtureToEvent(fx));
        mine++;
      }
    }
    console.log(`${(data.response || []).length} jogos, ${mine} dos seus times`);
    await sleep(300);
  }
  return events;
}
