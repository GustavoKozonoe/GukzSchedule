// Coletor de futebol via football-data.org (API v4).
// Doc: https://docs.football-data.org
//
// Autenticacao: header "X-Auth-Token". Tier gratis: 10 requisicoes/minuto.
// Por isso este arquivo SO roda no GitHub Actions (server-side), nunca no navegador.
//
// Este coletor produz eventos no MESMO formato de matchToEvent (src/pandascore.mjs),
// entao o futebol vira so mais um "jogo" (game: "football") no .ics e na pagina.

const BASE = "https://api.football-data.org/v4";

// Competicoes acompanhadas. As que nao estiverem no seu plano sao puladas sem erro.
// Ligas: BSA=Brasileirao, PL=Premier League, PD=La Liga, SA=Serie A (ITA),
// BL1=Bundesliga, FL1=Ligue 1, DED=Eredivisie, PPL=Primeira Liga (POR), ELC=Championship.
// Copas/torneios: CL=Champions, CLI=Libertadores, WC=Copa do Mundo, EC=Eurocopa.
// Obs.: copas domesticas (Copa do Brasil, FA Cup, etc.) NAO existem no tier gratis
// da football-data.org — por isso nao aparecem.
export const COMPETITIONS = [
  "BSA", "PL", "PD", "SA", "BL1", "FL1", "DED", "PPL", "ELC", // ligas
  "CL", "CLI", "WC", "EC", // copas/torneios
];

export const FOOTBALL_GAME = { slug: "football", label: "Futebol" };

// Janela de dias a frente para buscar jogos (evita puxar a temporada toda).
const WINDOW_DAYS = 45;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET com throttle (tier gratis = 10/min → ~7s entre chamadas) e retry no 429.
async function fdFetch(path, token, { retries = 2 } = {}) {
  const url = BASE + path;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { "X-Auth-Token": token, Accept: "application/json" } });
    } catch (err) {
      if (attempt < retries + 2) {
        console.log(`  (rede falhou no futebol em ${path}, tentativa ${attempt + 1})`);
        await sleep(1500 * (attempt + 1));
        continue;
      }
      return { _skip: true, status: "rede" }; // desiste dessa competicao, nao derruba o build
    }

    if (res.status === 429 && attempt < retries) {
      console.log("  (rate limit do futebol, esperando 60s…)");
      await sleep(60_000);
      continue;
    }
    if (res.status === 403 || res.status === 404) {
      // Competicao fora do plano ou inexistente: sinaliza para pular.
      return { _skip: true, status: res.status };
    }
    if (res.status >= 500 && attempt < retries + 2) {
      console.log(`  (football-data ${res.status} em ${path}, tentativa ${attempt + 1})`);
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      // Erro persistente: pula essa competicao em vez de derrubar o build.
      const body = await res.text().catch(() => "");
      console.warn(`football-data ${res.status} em ${path}: ${body.slice(0, 150)} — pulando.`);
      return { _skip: true, status: res.status };
    }
    return res.json();
  }
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

// Lista de times das competicoes, normalizada para o catalogo do picker.
export async function fetchFootballTeams(token) {
  const seen = new Set();
  const teams = [];

  for (const code of COMPETITIONS) {
    process.stdout.write(`  ${code}… `);
    const data = await fdFetch(`/competitions/${code}/teams`, token);
    if (data._skip) {
      console.log(`pulado (${data.status})`);
    } else {
      for (const t of data.teams || []) {
        if (t.id == null || seen.has(t.id)) continue;
        seen.add(t.id);
        teams.push({
          id: t.id,
          name: t.name,
          acronym: t.tla || t.shortName || null,
          image_url: t.crest || null,
        });
      }
      console.log(`${(data.teams || []).length} times`);
    }
    await sleep(7000); // respeita o limite de 10/min
  }

  teams.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return teams;
}

// Proximos jogos (janela de WINDOW_DAYS) das competicoes. Retorna matches "crus".
export async function fetchFootballUpcoming(token) {
  const now = new Date();
  const to = new Date(now.getTime() + WINDOW_DAYS * 86400000);
  const range = `dateFrom=${ymd(now)}&dateTo=${ymd(to)}`;

  const out = [];
  for (const code of COMPETITIONS) {
    process.stdout.write(`  ${code}… `);
    const data = await fdFetch(`/competitions/${code}/matches?${range}`, token);
    if (data._skip) {
      console.log(`pulado (${data.status})`);
    } else {
      const upcoming = (data.matches || []).filter((m) =>
        ["SCHEDULED", "TIMED"].includes(m.status)
      );
      out.push(...upcoming);
      console.log(`${upcoming.length} jogos futuros`);
    }
    await sleep(7000);
  }
  return out;
}

function stageLabel(m) {
  if (m.stage && m.stage !== "REGULAR_SEASON") {
    const map = {
      GROUP_STAGE: "Fase de grupos",
      LEAGUE_STAGE: "Fase de liga",
      PLAYOFFS: "Playoffs",
      LAST_16: "Oitavas",
      ROUND_OF_16: "Oitavas",
      QUARTER_FINALS: "Quartas",
      SEMI_FINALS: "Semifinal",
      FINAL: "Final",
      "1ST_LEG": "Ida",
      "2ND_LEG": "Volta",
    };
    return map[m.stage] || m.stage.replace(/_/g, " ").toLowerCase();
  }
  if (m.matchday) return `Rodada ${m.matchday}`;
  return null;
}

// Converte um match cru da football-data.org para o formato de evento comum.
export function footballMatchToEvent(m) {
  const home = m.homeTeam || {};
  const away = m.awayTeam || {};
  return {
    id: `fd-${m.id}`, // prefixo evita colisao de UID com ids de esports
    game: "football",
    gameLabel: "Futebol",
    teams: [home.name || "A definir", away.name || "A definir"],
    teamLogos: [home.crest || null, away.crest || null],
    opponentIds: [home.id, away.id].filter((x) => x != null),
    league: m.competition?.name || null,
    serie: stageLabel(m),
    tournament: m.competition?.name || null,
    matchName: `${home.name || "?"} x ${away.name || "?"}`,
    numberOfGames: null,
    startsAt: m.utcDate || null, // ISO 8601 em UTC
    streamUrl: null,
  };
}
