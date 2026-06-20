# Torque Fitness — Ferramenta de Orçamento

Ferramenta web (mobile-first) para montar orçamentos da Torque Fitness a partir
da sua planilha de importação. Tudo roda no navegador, sem servidor e sem
instalação — basta abrir o `index.html`.

## Como usar

1. Abra `index.html` no celular ou no computador (ou hospede a pasta em qualquer
   lugar estático: GitHub Pages, Netlify, etc.).
2. A primeira abertura vem com **dados de exemplo** da Torque Fitness, só para
   você ver a ferramenta funcionando.
3. No **Modo Admin → Importar planilha**, suba seu arquivo `.xlsx`, `.xls` ou
   `.csv`. A ferramenta detecta as colunas automaticamente (código, nome,
   série/categoria, custo, preço de venda, imagem) e você confirma o mapeamento.

> Os dados ficam salvos no próprio navegador (localStorage). O que você edita no
> Admin é exatamente o que o Vendedor vê.

## Os dois modos

Use o botão **Vendedor / Admin** no topo para alternar.

### 🔒 Modo Admin (uso interno)
- Vê custo, margem efetiva e preço de venda de cada produto.
- Edita qualquer produto (nome, código, série, custo, margem, preço, imagem).
- Adiciona produtos manualmente e remove/oculta produtos.
- Painel de **parâmetros gerais**: câmbio (US$), frete (%), impostos/markup (%),
  margem padrão (%), parcelas máx., juros a.m. e validade. Ao mudar qualquer
  parâmetro, **os preços recalculam sozinhos**.
- Filtra por série/categoria e busca por nome ou código.

### 🟣 Modo Vendedor (versão para enviar)
- **Não mostra** custo, margem nem nenhum parâmetro. Só o preço final.
- O vendedor escolhe os produtos e define a **quantidade** de cada um.
- Resumo mostra só os itens com quantidade > 0: subtotal, total geral e
  **simulação de parcelamento** (ex.: até 48×, com o valor da parcela).
- Botão **Gerar orçamento** cria um documento pronto para o cliente, com itens,
  quantidades, valor unitário, total e parcelas. Dá para **salvar em PDF**
  (impressão → salvar como PDF), **exportar como imagem (PNG)** ou
  **compartilhar** (WhatsApp etc. via menu nativo do celular).

## Precificação

Para cada produto:

```
custo base      = custo × câmbio        (se "Custo em dólar" estiver ligado)
custo com tudo  = custo base × (1 + frete%) × (1 + impostos%)
preço de venda  = custo com tudo × (1 + margem%)
```

- A **margem** usada é a do produto, ou a **margem padrão** se o produto não
  tiver uma própria.
- Você pode definir um **preço manual** por produto (sobrepõe o cálculo). Deixe
  em branco para voltar ao automático.
- Se sua planilha já traz o **preço de venda**, ele é importado como preço manual
  (o orçamento sai idêntico à planilha); depois, se quiser, é só limpar o preço
  para o produto passar a recalcular pelos parâmetros.

## Identidade visual

- Paleta violeta + preto, com cinzas neutros de apoio.
- Tipografia: **Archivo** (títulos), **Inter** (texto), **JetBrains Mono**
  (números e preços).
- Assinatura de marca: medidor de torque (gauge) animado e motivo de disco de
  peso nos cards sem imagem.
- Layout pensado para o celular primeiro.

## Estrutura

```
index.html        markup + estrutura dos modais
css/styles.css    identidade visual, layout mobile-first, estilo de impressão
js/seed.js        catálogo de exemplo + parâmetros padrão
js/app.js         estado, precificação, carrinho, import, exportação
```

As bibliotecas de leitura de XLSX (SheetJS) e geração de imagem (html2canvas) e
as fontes são carregadas por CDN sob demanda — exigem internet apenas para
importar `.xlsx` e exportar PNG. CSV, PDF (impressão) e todo o resto funcionam
offline.
