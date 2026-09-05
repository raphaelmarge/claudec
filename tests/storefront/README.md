# Revisão da vitrine Torque Fitness

A reformulação é restrita ao site público do repositório `raphaelmarge/claudec`.
O painel do vendedor, os preços, os arquivos de catálogo, as credenciais públicas
existentes e o projeto Supabase `torquefitness` não são modificados.

## Alterações

- Abertura editorial com fotografia original de alta resolução do A701.
- Identidade preta/violeta compartilhada por nove páginas públicas.
- Imagens de equipamentos em `object-fit: contain`, sem alterar geometria/cor.
- Cartões com profundidade, resposta ao mouse e revelação na rolagem.
- Controle persistente de movimento e respeito a `prefers-reduced-motion`.
- Carrossel com controles, pausa, foco por teclado e slides inativos `inert`.
- Pausa automática fora da tela, ao focar e quando a aba não está visível.
- Navegação editorial móvel, botões nativos para linhas e detalhes de produtos.
- Foco contido nos diálogos; Escape fecha o diálogo superior e restaura o foco.
- Remoção de depoimentos fictícios e contagens fixas de prova social.
- Depoimentos, banners e contatos reais publicados no Supabase continuam ativos.
- Correção do link da campanha HM para o identificador real `HM Series`.

## Executar

```sh
python3 tests/storefront/check_static.py
python3 -m pip install playwright==1.57.0
python3 -m playwright install --with-deps chromium
python3 tests/storefront/check_browser.py
```

O teste abre seu próprio servidor local em porta livre. Resultados e capturas vão
para `test-results/`. Os testes do navegador cobrem cinco larguras (320, 390, 768,
1024 e 1440 px), catálogo, busca, preços, paginação, favoritos, orçamento local,
validação sem envio, URLs de linha/produto, teclado e controle de movimento.
Todas as requisições externas são bloqueadas deliberadamente: o teste usa o
catálogo embutido e não cria leads, não grava dados reais nem envia mensagens.
As fontes online usam o fallback do sistema nas capturas de teste.

**Limites:** pagamentos, autenticação do vendedor, envio real ao Supabase,
WhatsApp, geração de PDF que depende de CDN e dispositivos físicos não são
validados por esta suíte. A publicação permanece dependente de revisão e merge;
a automação de revisão não faz deploy.

Para reverter o visual, reverta o commit/PR de reformulação. Não existe migração
ou alteração de banco de dados para desfazer.
