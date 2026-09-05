# Reformulação e validação da vitrine pública

## Escopo integrado

O PR preserva HTML/CSS/JavaScript existentes e a integração com o projeto
Supabase `torquefitness`. A direção visual inclui fotografia original do A701,
preto/violeta, profundidade, movimento controlável, navegação móvel, catálogo,
galeria, orçamento e páginas institucionais. A proposta compartilhável também
recebe o acabamento visual, preservando seu payload, cálculos e aceite.

Páginas: index, sobre, soluções (lista e segmentos), guia de linhas, CT, FAQ,
blog (lista e artigos), planejador de projeto, proposta e 404. Área do vendedor
e treino não recebem reformulação funcional. Produtos, preços, imagens,
configuração e scripts de autenticação não foram alterados.

Foram preservados os commits concorrentes até `16240af`, incorporados por
fast-forward antes de finalizar os complementos e repetir a validação. A
implementação visual concorrente foi mantida como base; não houve force push.

## Inventário de funções preservadas

- Catálogo embutido e atualização pelo JSON público do Supabase; traduções,
  códigos, séries, tipo, grupamento, preços, selos e imagens.
- Busca em português, filtros combinados, ordenação, paginação e URLs de
  linhas/tipos/produtos, metadados e dados estruturados.
- Favoritos, compartilhamento de listas, vistos recentemente, comparação,
  detalhes, imagens/vídeos e produtos relacionados.
- Quantidades, totais, parcelas, cupons, orçamento em localStorage, formulário,
  registro do pedido, PDF, WhatsApp, e-mail e proposta compartilhável.
- Simulador de academia por metragem e foco; planejador com planta, dimensões,
  arraste, rotação, exportação de PNG e compartilhamento.
- FAQ, blog, contato, fotos de projetos e depoimentos publicados, PWA.

Removidos exemplos de depoimentos fictícios e estatísticas fixas de prova
social. As contagens do hero vêm dos produtos. Conteúdo comercial já existente
de CT/garantia/pagamento não foi revalidado comercialmente nesta tarefa.

## Complementos desta execução

- Proposta comercial com sistema visual compartilhado e regras responsivas
  restritas a `.tf-proposal`.
- Aviso discreto quando o catálogo ao vivo não está disponível, mantendo o
  catálogo salvo utilizável.
- Comparador incluído no gerenciamento de foco e Escape dos diálogos.
- A ação existente de instalar o site passa para o menu móvel quando disponível,
  preservando seu elemento, eventos e estado. Testada com `beforeinstallprompt`
  simulado, sem instalar aplicativo real.
- Cache `torque-app-v4-premium`, incluindo a vitrine e seus arquivos com as
  mesmas versões referenciadas no HTML. Limpeza restrita ao namespace Torque.
  Navegação pública offline não cai mais na tela do vendedor; requisições
  externas e POST permanecem fora do service worker.

## Verificações executadas localmente

`tests/storefront/check_static.py`: passou para as nove páginas da suíte
original, seus assets, IDs e sintaxe de JavaScript; catálogo embutido com 955
produtos. `node --check scripts/test-public.cjs` e `git diff --check`: passaram.

`node tests/storefront/check_sw.cjs`: passou para recursos do shell, limpeza
isolada do cache, fallback público/vendedor, bypass externo/POST e rede online.

`node scripts/test-public.cjs`, Playwright com Microsoft Edge headless: **14
cenários passaram**, incluindo:

- dados reais do catálogo embutido servidos como fixture pelo contrato de
  `catalog.json`; busca, estado vazio, reset, séries, músculos, preço e ordem;
- adicionar, aumentar, editar, diminuir e remover itens, cupom, total e recarga;
- teclado no produto, galeria, canonical, foco contido e restaurado;
- favoritos, comparação e validação de formulário vazio;
- PDF de catálogo e orçamento: download de arquivos `%PDF` após um único POST
  totalmente interceptado, contendo apenas dados fictícios de teste; conferidos
  o payload, a soma dos itens e o esvaziamento do carrinho;
- 11 rotas/estados em **360, 390, 768 e 1440 px**, sem overflow horizontal;
- menu móvel, navegação por tipo, orçamento, planejador e exportação de PNG;
- conteúdo sem JavaScript, movimento reduzido e catálogo offline;
- nenhuma exceção de JavaScript nem escrita externa não interceptada.

Capturas da versão integrada, resultados JSON e PDFs fictícios ficam na pasta
`outputs` da tarefa executora. A suíte abre servidor próprio em porta livre.
Todas as chamadas externas são bloqueadas ou respondidas localmente. As fontes
online usam fallback nas capturas. O teste de PDF usa cópias locais das versões
já consumidas pelo site: html2canvas 1.4.1 e jsPDF 2.5.1.

Para reproduzir a suíte Node, disponibilize Playwright instalado em `NODE_PATH`,
opcionalmente `BROWSER_CHANNEL=msedge`, `TEST_OUTPUT` para o diretório de saída
e `PDF_TEST_LIBS` apontando para uma pasta com `html2canvas.min.js` e
`jspdf.umd.min.js`. Sem `PDF_TEST_LIBS`, o cenário de PDF não é executado.

## Limites e entrega

Não houve merge, deploy, alteração de produção, envio de mensagem comercial,
migração ou mudança de RLS/autenticação. Supabase foi confirmado somente por
metadados de projeto; chamadas de escrita foram simuladas no navegador.

Aceite comercial da proposta, WhatsApp/e-mail, Web Share em dispositivos
físicos, autenticação do vendedor e instalação PWA em aparelho real não foram
executados. O cache foi testado por regressão isolada, não por atualização de
uma instalação de produção. As suítes Python de navegador já presentes são
executadas pelo workflow do PR; a máquina local desta tarefa dispõe do runner
Node e não tem o módulo Python Playwright instalado.

A origem contém muitas fotos pequenas; a principal usa o arquivo original de
alta resolução. Nenhuma geometria ou cor do equipamento foi alterada.
