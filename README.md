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
- Resumo mostra só os itens com quantidade > 0: subtotal, **desconto** (em % ou
  R$), total, **sinal/entrada** e **saldo a financiar**, com a **simulação de
  parcelamento sobre o saldo** (ex.: até 48×, com o valor da parcela).
- **Vendedor** e **cliente** são selecionados/cadastrados na hora (nome,
  empresa, telefone, e-mail, cidade, CNPJ/CPF).
- Botão **Gerar orçamento** cria um documento pronto para o cliente, com **foto**
  de cada equipamento, dados do cliente e do vendedor, itens, quantidades, valor
  unitário, total, desconto, sinal, saldo e parcelas. Dá para **salvar em PDF**,
  **exportar como imagem (PNG)** ou **compartilhar** (WhatsApp etc.).

## Cadastros e base de dados

- **Vendedores** e **clientes** ficam cadastrados localmente (no aparelho).
- Cada orçamento gerado é **salvo num histórico** (`orcamentos`), ligando
  vendedor + cliente + itens + totais.
- No Modo Admin, **Exportar base (JSON)** baixa vendedores, clientes e
  orçamentos num arquivo — pronto para alimentar um futuro banco de dados.

## Catálogo

O app já vem com o **catálogo real da planilha comercial** (926 produtos das
séries HM, K1, K3, K5, K6, K8, A7, A8, A9, P, L, HY, SQ F, Pilates e Cardio),
com **foto, código, nome, dimensões e custo FOB** de cada equipamento. As fotos
ficam em `assets/products/`. Você pode reimportar uma planilha nova a qualquer
momento pelo Modo Admin.

## Precificação

O cálculo é **idêntico à aba "Configuracoes" da sua planilha**. Para cada
produto, a partir do custo **FOB (US$)**:

```
CIF (US$)   = FOB + Frete internacional + FOB × Seguro%
Custo (R$)  = CIF × (1 + IOF + II + IPI + PIS/COFINS) / (1 − ICMS) × Câmbio
              + Frete nacional
Preço (R$)  = Custo × (1 + Margem%) × (1 − Desconto%)
```

Todos os parâmetros (câmbio, margem, II, IPI, PIS/COFINS, ICMS, IOF, seguro,
fretes e desconto) ficam no painel do Admin e, ao mudar qualquer um, **todos os
preços recalculam sozinhos** — exatamente como na planilha.

- A **margem** usada é a do produto, ou a **margem geral** se o produto não tiver
  uma própria.
- Você pode **travar** um preço por produto (sobrepõe o cálculo). Deixe em branco
  para voltar ao automático.

## Acesso protegido por senha 🔒

O site é público (qualquer um abre o link e vê os **preços de venda**), mas os
**custos e a configuração** são protegidos:

- O arquivo público (`js/products.js`) contém **apenas o preço de venda** — não
  expõe custo FOB, margem nem impostos.
- Os dados sensíveis (custos + parâmetros fiscais) ficam **criptografados**
  (`AES-256-GCM`, chave derivada da senha via PBKDF2) em `js/secure.js`. Sem a
  senha, o arquivo é ilegível mesmo que alguém o baixe.
- Ao tocar em **Admin**, o app pede a **senha**. Com a senha correta, os custos
  são descriptografados **no próprio navegador** e o painel de configuração é
  liberado. O botão **🔒 Bloquear** tranca de novo e apaga os custos do
  dispositivo.

> A senha é definida na geração do `js/secure.js`. Para trocá-la, basta gerar o
> arquivo novamente com a nova senha.

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

## App separado: Manutenções da Academia 🔧

Ferramenta interna para organizar **toda a manutenção da academia** — aparelhos
(esteiras, bikes, musculação) e também o prédio (elétrica, hidráulica,
climatização, limpeza, segurança…). Abra `manutencao.html` (ou instale como
PWA). Tudo roda no navegador, sem servidor: os dados ficam no aparelho
(localStorage), com **exportação/importação de backup em JSON** para transferir
entre aparelhos.

### O que dá para fazer

- **Painel**: chamados em aberto, atrasados, preventivas vencidas e gasto do
  mês, com a lista de "atenção agora" (urgentes + vencidos).
- **Chamados (ordens de serviço)**: registre qualquer problema ou serviço com
  área (equipamentos, predial, elétrica, hidráulica, climatização…),
  prioridade, prazo, responsável/prestador, custo e observações. Status:
  aberta → em andamento → aguardando peça → concluída. Numeração automática
  (OS-001, OS-002…), busca e filtros.
- **Preventivas recorrentes**: rotinas do tipo "lubrificar a lona das esteiras
  a cada 30 dias". O app calcula a próxima data, avisa quando vence e, ao tocar
  em **✓ Feita hoje**, registra a execução no histórico e reagenda sozinho.
- **Ativos**: cadastro de aparelhos e locais (marca, nº de série, data de
  compra), com **histórico de manutenções e total gasto por ativo**.

### Arquivos

```
manutencao.html          estrutura do app (tabs, modal)
css/manutencao.css       identidade visual (mesma paleta violeta + preto)
js/manutencao.js         estado, chamados, preventivas, ativos, backup
manutencao.webmanifest   PWA do app de manutenções
```

A primeira abertura traz **dados de exemplo** para ver o app funcionando —
apague-os no menu ⚙ para começar do zero.

## App separado: Montar Treino por IA 🏋️

Além da ferramenta de orçamento, este repositório inclui um **app independente**
de autoatendimento onde o aluno monta a própria **série de treino** com IA. Abra
`treino.html` (ou instale como PWA).

### Como funciona

1. O aluno responde um **questionário curto** — objetivo (hipertrofia,
   emagrecimento, força, condicionamento ou saúde), nível, dias por semana,
   tempo por treino, local/equipamentos, ênfase muscular e eventuais
   limitações/lesões.
2. Ao tocar em **Montar meu treino**, o app chama a Edge Function
   `generate-workout`, que usa o **Claude** para montar uma série coerente
   (divisão, exercícios, séries × repetições, descanso, aquecimento, progressão
   e avisos de segurança).
3. A série aparece pronta na tela, com botões para **salvar/imprimir (PDF)** e
   **compartilhar** (WhatsApp etc.). É só sugestão educativa — não substitui
   avaliação profissional.

### Arquivos

```
treino.html                              UI do questionário e do resultado
css/treino.css                           identidade visual (mesma paleta)
js/treino.js                             questionário → chamada à IA → render
treino.webmanifest                       PWA do app de treino
supabase/functions/generate-workout/     Edge Function (guarda a chave da IA)
```

### IA protegida (mesma arquitetura do follow-up)

A chave da Anthropic **nunca** vai para o navegador: fica como segredo no
Supabase e só a Edge Function a usa. Como o app é aberto (sem login), a função é
publicada sem exigência de JWT:

```
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy generate-workout --no-verify-jwt
# opcional: supabase secrets set CLAUDE_MODEL=claude-sonnet-4-6
```

O Claude responde via **tool use**, garantindo que a série sempre chega no
formato estruturado que o app espera renderizar.
