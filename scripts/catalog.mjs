// Gera public/teams.json: o catalogo de times por jogo que a pagina web (aba "Meus times")
// usa pra voce escolher os favoritos. Roda no GitHub Actions (precisa do PANDASCORE_TOKEN).

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES, fetchTeams } from "../src/pandascore.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../public/teams.json");

async function main() {
  const token = process.env.PANDASCORE_TOKEN;
  const catalog = {};

  for (const game of GAMES) {
    process.stdout.write(`Buscando times de ${game.label}... `);
    const teams = await fetchTeams(game.slug, token);
    catalog[game.slug] = teams;
    console.log(`${teams.length} times`);
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), games: GAMES, teams: catalog }, null, 0)
  );
  console.log(`\nOK -> ${OUT}`);
}

main().catch((err) => {
  console.error("\nErro ao gerar o catalogo:", err.message);
  process.exit(1);
});
