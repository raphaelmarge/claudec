# Torque Fitness — reformulação do site para implementação com Codex

## Pedido e escopo

O usuário pediu reformular TODO o site público de venda de equipamentos Torque Fitness, com efeitos, profundidade, animações e uma experiência premium em preto e violeta. Em seguida decidiu executar a implementação com Codex.

Repositório: `raphaelmarge/claudec`.
Branch de trabalho: `work/torque-fitness-premium-20260905`.

Implemente e teste o resultado; não entregue apenas uma proposta ou outro briefing. Este arquivo prepara a implementação: não representa uma implementação concluída nem um site publicado.

Trabalhe na branch existente, inspecione o estado mais recente antes de editar e preserve eventuais mudanças de outros colaboradores. Não faça force push, merge em `main` ou deploy de produção. Ao concluir, mantenha o trabalho em um PR para revisão do usuário.

## Inspeção obrigatória antes de alterar

Leia as instruções aplicáveis do repositório, a implementação atual, seus estilos, scripts, fontes de produtos e fluxos de orçamento. Mapeie páginas públicas e seus componentes compartilhados. Preserve a arquitetura existente quando adequada; não migre para outro framework apenas para obter animações.

Entradas já identificadas no repositório: `index.html`, `sobre.html`, `solucoes.html`, `guia-linhas.html`, `ct.html`, `faq.html`, `blog.html`, `projeto.html`, `proposta.html`, `css/`, `js/` e `assets/`. Confirme a função de cada página antes de modificar. A área do vendedor e os aplicativos não são alvo de uma reescrita funcional. Não confunda Torque Fitness com Torque Personal, Método Torque ou o app do aluno.

## Direção visual

Referência: mockup apresentado no chat, com vitrine cinematográfica escura, fundo quase preto, iluminação violeta atrás de um grande equipamento à direita e chamada comercial à esquerda. A imagem original do chat não é automaticamente anexada por este arquivo; use a descrição a seguir como especificação visual, sem afirmar ter acesso ao raster quando ele não estiver disponível.

- Fundo principal `#0B0B0F`; violeta de destaque `#8B5CF6`, com variações mais escuras; texto claro e contraste legível. Use camadas escuras com bordas e reflexos sutis, evitando excesso de neon e desfoque.
- Tipografia forte e espaçada para títulos, com hierarquia clara. Preserve a identidade e o logotipo real da marca. Navegação menos congestionada, com acesso fácil a equipamentos, linhas, soluções, sobre e orçamento.
- Hero com equipamento real em grande escala, luz de recorte violeta, sombra de contato e planos de fundo em profundidade. Texto sugerido, sujeito a refinamento: “Equipamentos que elevam resultados”. CTAs: “Explorar equipamentos” e “Montar orçamento”.
- Abaixo do hero: acesso rápido às categorias REAIS e exposição editorial das linhas. Cards com imagem protagonista, nome, descrição curta verificável e ação clara.
- Catálogo com filtros legíveis, busca, ordenação e estados de carregamento, vazio e falha. Página ou modal do produto com imagem proporcional, galeria e especificações reais; orçamento acessível.
- Seções sobre a marca, soluções/projetos e contato com o mesmo sistema visual. Não crie botão de vídeo sem vídeo existente. Não invente projetos, depoimentos ou parceiros.
- Na experiência móvel, componha novamente o hero em vez de apenas reduzir a versão desktop. Garanta navegação por toque, texto legível, filtros fáceis e acesso ao orçamento sem encobrir conteúdo.

## Dados do mockup NÃO são dados comerciais

O mockup contém números e rótulos ilustrativos, incluindo “+150”, “+500”, “5 linhas” e nomes de linhas. Não copie esses valores para produção. Use contagens derivadas do catálogo real e nomes presentes na fonte atual. O material já consultado menciona séries como HM, K1, K3, K5, K6, K8, A7, A8, A9, P, L, HY, SQ F, Pilates e Cardio; confirme o estado atual antes de utilizá-las.

Não publique promessas, prazos, financiamento, garantias ou dados de atendimento sem fonte comercial vigente no projeto. Não invente prova social.

## Movimento e profundidade

Implemente entrada progressiva de textos e seções, transições de imagens, iluminação sutil de botões e cards e parallax leve de fundo. Tilt em cards apenas para dispositivos com ponteiro preciso, sem mover alvos de clique de forma incômoda. Use profundidade em camadas; não simule um produto 360 graus com vistas inventadas.

Priorize `transform` e `opacity`, `IntersectionObserver` e recursos nativos quando suficientes. Evite listeners pesados, scroll-jacking e grandes bibliotecas sem necessidade. Não esconda conteúdo permanentemente caso JavaScript ou a animação falhe.

Respeite `prefers-reduced-motion`, pause animações fora da tela/aba e reduza efeitos em celular. Nenhuma informação pode depender exclusivamente de hover. Carrosséis automáticos precisam de controle de pausa e navegação acessível.

## Imagens: fidelidade e proporção

Preserve as fotos REAIS dos equipamentos, sem alterar a geometria dos aparelhos. Corrija qualquer esticamento: mantenha proporções intrínsecas, dimensões explícitas e `object-fit: contain` nas vitrines de produtos. Use `cover` apenas em fotos ambientais onde o recorte é aceitável. Não corte partes relevantes da máquina para preencher um card.

Revise hero, catálogo, galeria e páginas institucionais em desktop e celular. Otimize entrega com tamanhos responsivos, carregamento tardio abaixo da dobra e prioridade adequada para a imagem principal. Gere/promova imagens apenas quando existirem ferramentas e referências autorizadas; não substitua o catálogo por aparelhos fictícios.

## Funcionalidades e integração que devem permanecer intactas

Preserve produtos e códigos, imagens, preços, regras de cálculo, categorias, busca, filtros, ordenação, quantidades, carrinho de orçamento, persistência, formulários, contato, compartilhamento e exportações existentes. Não exponha custos de importação, margens, configurações administrativas ou segredos no cliente público.

A integração existente utiliza o projeto Supabase `torquefitness`. Preserve o cliente e os contratos de dados atuais. Esta reformulação visual não autoriza alterar dados de clientes, orçamentos, autenticação, políticas de acesso ou estrutura do banco de produção. Teste com dados locais/fictícios próprios para teste, sem gerar leads reais nem enviar mensagens.

Não presuma que as credenciais/conexões do ChatGPT estão disponíveis no ambiente Codex. Use apenas acessos já autorizados nesse ambiente; registre dependências indisponíveis e avance nas partes independentes. Nunca peça ao usuário que cole senhas ou chaves secretas no chat, nem comite credenciais. Não desative RLS para resolver erros de integração.

Preserve SEO, URLs, dados estruturados válidos, navegação e a experiência de instalação quando existente. Verifique cache/versionamento do service worker para evitar que estilos e scripts incompatíveis se misturem após uma futura publicação. Não acrescente rastreadores ou serviços pagos por conta própria.

## Validação e entrega

1. Execute os testes existentes e validação de sintaxe. Adicione testes de regressão proporcionais ao escopo, incluindo busca/filtros e ciclo de orçamento.
2. Use navegador real quando disponível. Verifique larguras de 360, 390, 768 e 1440 px: sem overflow horizontal, conteúdo cortado, controles sobrepostos ou imagens esticadas. Verifique teclado, foco visível, labels e movimento reduzido.
3. Teste navegação, abrir e fechar menus/modais, filtros, adicionar/remover itens, alterar quantidades, totais e persistência. Confirme que nenhum teste enviou dados para produção.
4. Registre problemas preexistentes separadamente. Não declare testes, screenshots, desempenho ou integração como validados se não puder executá-los.
5. Entregue código no PR, resumo das páginas e arquivos alterados, comandos e resultados dos testes, capturas de desktop/celular quando possíveis e limitações conhecidas. Informe claramente se houver qualquer etapa dependente de acesso adicional.

Resultado esperado: uma reformulação real e coerente da vitrine pública, com movimento visível e sofisticado, fiel aos equipamentos e aos dados comerciais, sem quebrar catálogo, orçamento ou integração. Não publicar automaticamente.
