# GukzSchedule 🎮

Uma agenda dos jogos dos **seus times/jogadores** — esports (CS2, Valorant, LoL), **futebol** e
**tênis** — em um lugar só:

- **Página web** simples pra ver os próximos jogos (com busca e filtro por jogo).
- **Calendário assinável** (`.ics`) pra assinar no **Calendário do iPhone** — os jogos aparecem no app
  nativo, com alerta, e atualizam sozinhos. **Sem App Store, sem servidor, sem custo.**

Os dados de esports vêm da [PandaScore](https://pandascore.co), os de futebol da
[football-data.org](https://www.football-data.org) e os de tênis (ATP/WTA) da
[The Odds API](https://the-odds-api.com) — todos com tier grátis. Um robô do GitHub Actions atualiza
tudo de tempos em tempos e publica no GitHub Pages.

---

## Como funciona

```
GitHub Actions (a cada 12h)  →  busca jogos na PandaScore  →  gera:
    • public/agenda.ics   (pro Calendário do iPhone)
    • public/agenda.json  (pra página web)
    • public/teams.json   (catálogo de times pro seletor)
                          ↓
              publica no GitHub Pages
                          ↓
   iPhone assina agenda.ics   +   você vê tudo na página web
```

Você escolhe seus times na aba **Meus times** da página. Isso salva `data/favorites.json` no
repositório, o que dispara o robô e regenera a agenda.

O robô roda sozinho **de 12 em 12 horas**. Se quiser atualizar na hora, use o botão **🔄** no topo da
página (ele força o robô a rodar na hora — precisa do token configurado).

A validade do token configurado aparece na aba **Meus times** e no diálogo **Configurar token**, com
aviso quando estiver perto de expirar.

---

## Configuração (uma vez só)

### 1. Tokens das APIs
**PandaScore (esports):**
1. Crie uma conta grátis em https://pandascore.co (não pede cartão).
2. Copie seu **API token** no painel.

**football-data.org (futebol) — opcional:**
1. Pegue um token grátis em https://www.football-data.org/client/register.
2. Guarde o token. Se você não configurar este token, o app simplesmente **não mostra futebol**
   (os esports continuam funcionando normalmente).

> Competições acompanhadas (as que estiverem no tier grátis): Brasileirão, Champions League,
> Premier League, La Liga, Serie A (ITA), Bundesliga, Ligue 1, Eredivisie, Primeira Liga (POR),
> Championship e Libertadores. As que não estiverem no seu plano são puladas automaticamente.
> A lista fica em `COMPETITIONS`, no topo de `src/footballdata.mjs`.

**The Odds API (tênis) — opcional:**
1. Pegue uma API key grátis em https://the-odds-api.com (tier grátis ~500 req/mês; mas os endpoints
   que usamos, `/sports` e `/events`, **não consomem cota**).
2. Guarde a key. Sem ela, o app **não mostra tênis** (o resto continua funcionando).

> O tênis (ATP/WTA) só lista jogadores/partidas que já estão marcados a curto prazo (a fonte é
> baseada em casas de apostas). Você favorita os jogadores que aparecem no seletor. Para somar outros
> esportes dessa mesma API no futuro (basquete, MMA, boxe…), basta adicionar o grupo em `ODDS_GAMES`,
> no topo de `src/oddsapi.mjs`.

### 2. Suba este projeto pro GitHub
Crie um repositório chamado `GukzSchedule` na sua conta e suba estes arquivos:

```bash
git init
git add .
git commit -m "GukzSchedule inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/GukzSchedule.git
git push -u origin main
```

### 3. Guarde os tokens como secrets
No repositório: **Settings → Secrets and variables → Actions → New repository secret**
- `PANDASCORE_TOKEN` = o token da PandaScore
- `FOOTBALL_DATA_TOKEN` = o token da football-data.org (opcional; só se quiser futebol)
- `ODDS_API_KEY` = a key da The Odds API (opcional; só se quiser tênis)

### 4. Ligue o GitHub Pages
**Settings → Pages → Build and deployment → Source: GitHub Actions.**

### 5. Rode o robô pela primeira vez
**Actions → “Atualizar agenda e publicar” → Run workflow.**
Quando terminar, sua página estará em:

```
https://SEU_USUARIO.github.io/GukzSchedule/
```

### 6. (Opcional) Token pra salvar favoritos pela página
Pra marcar times direto na página web sem editar arquivos:
1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. **Repository access:** só o repositório `GukzSchedule`.
3. **Permissions → Repository → Contents: Read and write.**
4. Na página, aba **Meus times → Configurar token**, cole o token (fica só no seu navegador).

> Sem token também funciona: use **Baixar favorites.json** e faça o commit do arquivo em `data/` na mão.

### 7. Assine no iPhone
Na página, toque em **＋ Calendário** e copie a URL (`https://SEU_USUARIO.github.io/GukzSchedule/agenda.ics`).
No iPhone:

**Ajustes → Aplicativos → Calendário → Contas → Adicionar conta → Outra → Adicionar calendário assinado**
→ cole a URL.

Pronto. Os jogos dos seus times aparecem no Calendário e atualizam sozinhos.

---

## Rodar/testar localmente

Precisa de **Node 20+**.

```bash
# gera o catálogo de times e a agenda (precisa do token)
PANDASCORE_TOKEN=seu_token node scripts/catalog.mjs
PANDASCORE_TOKEN=seu_token node scripts/generate.mjs

# abre a página local em http://localhost:5173
node scripts/serve.mjs
```

No Windows (PowerShell):

```powershell
$env:PANDASCORE_TOKEN="seu_token"; node scripts/catalog.mjs
$env:PANDASCORE_TOKEN="seu_token"; node scripts/generate.mjs
node scripts/serve.mjs
```

---

## Estrutura

| Arquivo | O quê |
|---|---|
| `src/pandascore.mjs` | Cliente da API da PandaScore (esports) |
| `src/footballdata.mjs` | Coletor de futebol (football-data.org) |
| `src/oddsapi.mjs` | Coletor multi-esportes (The Odds API) — tênis |
| `src/ics.mjs` | Monta o arquivo `.ics` |
| `scripts/catalog.mjs` | Gera `public/teams.json` (catálogo de times) |
| `scripts/generate.mjs` | Gera `public/agenda.ics`, `agenda.json` e `favorites.json` |
| `data/favorites.json` | Seus times favoritos (por jogo) |
| `public/` | A página web + arquivos publicados no Pages |
| `.github/workflows/build.yml` | O robô que atualiza tudo |

---

## Próximos passos possíveis

A arquitetura é modular. **Futebol** (`src/footballdata.mjs`) e **tênis** (`src/oddsapi.mjs`) já
entraram. Como a The Odds API é multi-esportes, dá pra somar **basquete, MMA, boxe, etc.** só
adicionando o grupo em `ODDS_GAMES` (topo de `src/oddsapi.mjs`) — reaproveitando todo o coletor.
Esportes de outras fontes (ex.: **tênis de mesa**, que não tem API grátis boa) entram como um novo
coletor produzindo eventos no mesmo formato e juntando no `generate.mjs`/`catalog.mjs`.
