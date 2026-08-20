# GukzSchedule 🎮

Uma agenda dos jogos dos **seus times de esports** (CS2, Valorant e LoL) em um lugar só:

- **Página web** simples pra ver os próximos jogos (com busca e filtro por jogo).
- **Calendário assinável** (`.ics`) pra assinar no **Calendário do iPhone** — os jogos aparecem no app
  nativo, com alerta, e atualizam sozinhos. **Sem App Store, sem servidor, sem custo.**

Os dados vêm da [PandaScore](https://pandascore.co) (tier grátis). Um robô do GitHub Actions atualiza
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

### 1. Token da PandaScore
1. Crie uma conta grátis em https://pandascore.co (não pede cartão).
2. Copie seu **API token** no painel.

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

### 3. Guarde o token como secret
No repositório: **Settings → Secrets and variables → Actions → New repository secret**
- Nome: `PANDASCORE_TOKEN`
- Valor: o token da PandaScore

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
| `src/pandascore.mjs` | Cliente da API da PandaScore |
| `src/ics.mjs` | Monta o arquivo `.ics` |
| `scripts/catalog.mjs` | Gera `public/teams.json` (catálogo de times) |
| `scripts/generate.mjs` | Gera `public/agenda.ics`, `agenda.json` e `favorites.json` |
| `data/favorites.json` | Seus times favoritos (por jogo) |
| `public/` | A página web + arquivos publicados no Pages |
| `.github/workflows/build.yml` | O robô que atualiza tudo |

---

## Próximos passos possíveis

A arquitetura é modular. Pra adicionar **futebol, tênis ou tênis de mesa**, é só criar um novo
"coletor" que produza eventos no mesmo formato (`matchToEvent`) e juntá-los no `generate.mjs`.
Cada esporte pode usar uma API diferente (football-data.org, API-Sports, etc.).
