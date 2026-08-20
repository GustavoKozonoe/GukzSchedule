// Gera public/agenda.ics (pro Calendario do iPhone) e public/agenda.json (pra pagina web),
// a partir dos times marcados em data/favorites.json. Roda no GitHub Actions.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES, fetchUpcoming, matchToEvent } from "../src/pandascore.mjs";
import { buildCalendar } from "../src/ics.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAVORITES = resolve(__dirname, "../data/favorites.json");
const OUT_ICS = resolve(__dirname, "../public/agenda.ics");
const OUT_JSON = resolve(__dirname, "../public/agenda.json");
const OUT_FAV = resolve(__dirname, "../public/favorites.json");

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
