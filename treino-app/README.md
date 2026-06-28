# Torque Fitness · Montar Treino — site independente

App de autoatendimento onde o aluno responde um questionário e a IA (Claude)
monta a série de treino. Esta pasta é **autossuficiente**: pode ser publicada
sozinha como um site próprio, com URL independente do site de equipamentos.

```
index.html              app (questionário + resultado)
css/treino.css          estilo
js/config.js            URL + anon key do Supabase
js/treino.js            lógica + chamada à IA
treino.webmanifest      PWA instalável
icons/                  ícones do app
```

## Publicar (escolha uma)

### A) Repositório próprio no GitHub + Pages
1. Crie um repositório novo (ex.: `treino`).
2. Suba o **conteúdo desta pasta** na raiz do repositório.
3. Em **Settings → Pages**, source = `Deploy from a branch`, branch `main` / `/root`.
4. Sai no ar em `https://SEU-USUARIO.github.io/treino/`.

### B) Netlify / Vercel / Cloudflare Pages (arrastar e soltar)
1. Crie um projeto novo de site estático.
2. Faça upload desta pasta (ou conecte o repositório).
3. Sem build: é HTML/CSS/JS puro. URL própria sai na hora (ex.: `montar-treino.netlify.app`).

## Backend de IA (obrigatório para gerar treinos)

O app chama a Edge Function `generate-workout` no Supabase (mesma do repositório
principal). A chave da Anthropic fica como segredo, nunca no navegador:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy generate-workout --no-verify-jwt
```

A URL e a chave pública do Supabase ficam em `js/config.js` (já preenchidas).
Funciona em qualquer domínio — a função responde com CORS liberado.
