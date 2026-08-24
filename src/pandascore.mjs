// Cliente minimo da API da PandaScore.
// Doc: https://developers.pandascore.co
//
// Autenticacao: o token vai como query param (?token=...). Por isso este arquivo
// SO roda no GitHub Actions (server-side), nunca no navegador.

const BASE = "https://api.pandascore.co";

// Jogos suportados nesta primeira entrega. O "slug" e o prefixo da URL na PandaScore.
// Obs.: CS2 usa o prefixo legado "/csgo/".
export const GAMES = [
  { slug: "csgo", label: "CS2" },
  { slug: "valorant", label: "Valorant" },
  { slug: "lol", label: "LoL" },
];

export const GAME_LABELS = Object.fromEntries(GAMES.map((g) => [g.slug, g.label]));

function requireToken(token) {
  if (!token) {
    throw new Error(
      "PANDASCORE_TOKEN nao definido. Defina a variavel de ambiente antes de rodar " +
        "(ex.: PANDASCORE_TOKEN=xxxxx node scripts/generate.mjs)."
    );
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// GET generico com paginacao. Junta todas as paginas ate uma vir com menos que perPage.
// Respeita o header X-Rate-Limit-Remaining: se estiver baixo, espera um pouco.
async function getAll(path, token, { perPage = 100, maxPages = 100, query = {} } = {}) {
  requireToken(token);
  const out = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(BASE + path);
    url.searchParams.set("token", token);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));

    // Busca a pagina com retry: 429 (rate limit), 5xx (erro passageiro do
    // servidor) e falhas de rede sao tentados de novo algumas vezes.
    let res = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        res = await fetch(url, { headers: { Accept: "application/json" } });
      } catch (err) {
        console.warn(`  rede falhou em ${path} (page ${page}), tentativa ${attempt}/5: ${err.message}`);
        res = null;
        await sleep(1500 * attempt);
        continue;
      }
      if (res.status === 429) {
        await sleep(20_000); // rate limit: espera e tenta de novo
        continue;
      }
      if (res.status >= 500) {
        console.warn(`  PandaScore ${res.status} em ${path} (page ${page}), tentativa ${attempt}/5`);
        await sleep(1500 * attempt);
        continue;
      }
      break; // sucesso ou erro 4xx (nao adianta repetir)
    }

    // Se nao conseguiu nem depois dos retries, segue com o que ja tem (nao derruba o build).
    if (!res || !res.ok) {
      const status = res ? res.status : "sem resposta";
      console.warn(`  Desisti de ${path} na page ${page} (${status}); seguindo com ${out.length} itens.`);
      break;
    }

    const batch = await res.json();
    out.push(...batch);

    if (batch.length < perPage) break; // ultima pagina

    // Se estamos chegando perto do limite de requisicoes, respira um pouco.
    const remaining = Number(res.headers.get("x-rate-limit-remaining"));
    if (Number.isFinite(remaining) && remaining < 5) await sleep(60_000);
    else await sleep(120); // gentileza entre paginas
  }

  return out;
}

// Proximos jogos de um jogo (game slug). Retorna os matches "crus" da PandaScore.
export async function fetchUpcoming(gameSlug, token, { maxPages = 20 } = {}) {
  return getAll(`/${gameSlug}/matches/upcoming`, token, {
    maxPages,
    query: { sort: "begin_at" },
  });
}

// Lista de times de um jogo, normalizada para o catalogo do picker.
export async function fetchTeams(gameSlug, token, { maxPages = 100 } = {}) {
  const raw = await getAll(`/${gameSlug}/teams`, token, { maxPages });
  const seen = new Set();
  const teams = [];
  for (const t of raw) {
    if (!t || t.id == null || seen.has(t.id)) continue;
    seen.add(t.id);
    teams.push({
      id: t.id,
      name: t.name,
      acronym: t.acronym || null,
      image_url: t.image_url || null,
    });
  }
  teams.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return teams;
}

// Extrai um "evento" simples e estavel a partir de um match cru da PandaScore.
// Usado tanto pelo .ics quanto pelo agenda.json (mesma fonte de verdade).
export function matchToEvent(match, gameSlug) {
  const opponents = (match.opponents || [])
    .map((o) => o.opponent)
    .filter(Boolean);

  const teams = opponents.map((o) => o.name || o.acronym || "TBD");
  const teamLogos = opponents.map((o) => o.image_url || null);

  const startsAt = match.begin_at || match.scheduled_at || null;

  const stream =
    (match.streams_list || []).find((s) => s.main && s.raw_url) ||
    (match.streams_list || []).find((s) => s.raw_url) ||
    null;

  return {
    id: match.id,
    game: gameSlug,
    gameLabel: GAME_LABELS[gameSlug] || gameSlug,
    teams: teams.length ? teams : ["A definir", "A definir"],
    teamLogos,
    opponentIds: opponents.map((o) => o.id),
    league: match.league?.name || null,
    serie: match.serie?.full_name || match.serie?.name || null,
    tournament: match.tournament?.name || null,
    matchName: match.name || null,
    numberOfGames: match.number_of_games || null,
    startsAt, // ISO 8601 em UTC
    streamUrl: stream?.raw_url || null,
  };
}
