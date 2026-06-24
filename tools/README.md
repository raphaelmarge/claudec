# Ferramentas do catálogo

## `extract_catalog_images.py`

Extrai as fotos em alta definição do **catálogo SYT (PDF)** e troca, em massa,
as imagens dos 926 produtos do app — casando cada foto com o **código** que
aparece logo abaixo dela na página do PDF.

### Pré-requisito (uma vez)

```bash
pip install pymupdf      # pypi.org é liberado mesmo na rede "Trusted"
```

### Fase 1 — extrair e conferir (não altera nada do app)

```bash
python3 tools/extract_catalog_images.py --pdf "catalog syt-2026.pdf"
```

Gera:

- `tools/_incoming/<CODIGO>.png` — uma imagem por código reconhecido
- `tools/_incoming/_report.csv` — o que casou, em que página, tamanho em px e status
- `tools/_incoming/_unmatched/` — imagens cujo código não foi reconhecido

**Confira o `_report.csv`** e as imagens antes de aplicar.

### Fase 2 — aplicar (sobrescreve as imagens dos produtos)

```bash
python3 tools/extract_catalog_images.py --pdf "catalog syt-2026.pdf" --apply
```

Para cada produto cujo código tem imagem extraída, sobrescreve o arquivo
apontado por `imagem` no `js/products.js` (ex.: `assets/products/<hash>.png`).
Os originais são copiados para `assets/products/_backup/` **antes** de qualquer
troca — dá pra reverter a qualquer momento.

> Nenhum caminho do `products.js` muda: a foto nova entra no mesmo arquivo que
> o produto já usa, então o app pega automaticamente sem alterar código.

### Como o casamento funciona

- Usamos a **lista oficial de códigos** do `js/products.js` (não adivinhamos
  formato). Os 926 códigos não têm colisão de normalização, então o casamento
  é inequívoco.
- Para cada imagem da página, pega-se o código conhecido cujo rótulo está
  **logo abaixo** da imagem e **horizontalmente alinhado** (até `--max-gap`
  pontos de distância vertical, padrão 120).
- Imagens menores que `--min-size` px (padrão 80) são ignoradas (ícones/logos).

### Opções

| Flag | Padrão | Descrição |
|---|---|---|
| `--pdf` | (obrigatório) | Caminho do PDF do catálogo |
| `--apply` | desligado | Sobrescreve as imagens dos produtos (fase 2) |
| `--out` | `tools/_incoming` | Pasta de staging das imagens extraídas |
| `--min-size` | `80` | Ignora imagens menores que isso (px) |
| `--max-gap` | `120` | Distância vertical máx. (pt) entre imagem e o código |

### Atenção

- 6 códigos são puramente numéricos (`8401`, `8400-2`, `8402`, `1020`, `1023`,
  `9700`). A regra de proximidade filtra a maioria dos falsos positivos, mas
  **confira essas linhas no `_report.csv`**.
- Produtos que ficarem **sem imagem** (código não encontrado no PDF) aparecem
  no resumo ao final da extração — esses mantêm a foto antiga.
