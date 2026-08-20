// Gera public/teams.json: o catalogo de times por jogo que a pagina web (aba "Meus times")
// usa pra voce escolher os favoritos. Roda no GitHub Actions (precisa do PANDASCORE_TOKEN).

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES, fetchTeams } from "../src/pandascore.mjs";
import { FOOTBALL_GAME, fetchFootballTeams } from "../src/footballdata.mjs";
import { ODDS_GAMES, fetchEventsByGroup, participantsFromEvents } from "../src/oddsapi.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../public/teams.json");

async function main() {
  const token = process.env.PANDASCORE_TOKEN;
  const catalog = {};
  const games = [...GAMES];

  // Esports (PandaScore)
  for (const game of GAMES) {
    process.stdout.write(`Buscando times de ${game.label}... `);
    const teams = await fetchTeams(game.slug, token);
    catalog[game.slug] = teams;
    console.log(`${teams.length} times`);
  }

  // Futebol (football-data.org) — opcional, so se o token existir
  const fdToken = process.env.FOOTBALL_DATA_TOKEN;
  if (fdToken) {
    console.log(`Buscando times de ${FOOTBALL_GAME.label}...`);
    catalog[FOOTBALL_GAME.slug] = await fetchFootballTeams(fdToken);
    games.push(FOOTBALL_GAME);
    console.log(`${FOOTBALL_GAME.label}: ${catalog[FOOTBALL_GAME.slug].length} times`);
  } else {
    catalog[FOOTBALL_GAME.slug] = [];
    console.log("Futebol: FOOTBALL_DATA_TOKEN nao definido, catalogo vazio.");
  }

  // The Odds API (tenis e outros) — opcional, so se o token existir
  const oddsKey = process.env.ODDS_API_KEY;
  for (const g of ODDS_GAMES) {
    if (oddsKey) {
      process.stdout.write(`Buscando ${g.label}... `);
      const events = await fetchEventsByGroup(oddsKey, g.group);
      catalog[g.slug] = participantsFromEvents(events);
      games.push({ slug: g.slug, label: g.label });
      console.log(`${catalog[g.slug].length} participantes`);
    } else {
      catalog[g.slug] = [];
      console.log(`${g.label}: ODDS_API_KEY nao definido, catalogo vazio.`);
    }
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), games, teams: catalog }, null, 0)
  );
  console.log(`\nOK -> ${OUT}`);
}

main().catch((err) => {
  console.error("\nErro ao gerar o catalogo:", err.message);
  process.exit(1);
});
