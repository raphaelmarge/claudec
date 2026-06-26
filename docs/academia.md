# Academia — Sistema de Gestão

App web (mobile-first) para gerir uma academia: cadastro de alunos, planos,
mensalidades/inadimplência, dashboard e **controle de catraca com
reconhecimento facial** (com liberação manual por CPF como alternativa).

Roda no navegador, sem build. Abra `academia.html`. Funciona **offline**
(dados no `localStorage`) e, ao fazer login, **sincroniza no Supabase**.

> É um app **separado** da ferramenta de orçamento (`index.html` / `app.html`).
> Eles compartilham só o `js/config.js` (credenciais públicas do Supabase).

## Funcionalidades

- **Painel:** total de alunos, em dia, inadimplentes, check-ins do dia,
  receita do mês, inadimplentes e aniversariantes.
- **Alunos:** cadastro completo (nome, CPF, contato, nascimento, plano,
  início/vencimento, status, foto) + **captura de rosto** pela webcam.
- **Catraca:** reconhecimento facial em tempo real que **libera ou bloqueia**
  conforme o plano do aluno; liberação manual por CPF/nome quando não há
  câmera ou rosto cadastrado. Cada acesso fica registrado.
- **Financeiro:** receita do mês, lista de inadimplentes e histórico de
  pagamentos. Receber um pagamento estende o vencimento automaticamente.
- **Planos:** crie planos (valor + duração em dias). Já vem com Mensal,
  Trimestral e Anual de exemplo.
- **Config:** nome da academia, tolerância de atraso, sensibilidade do facial,
  login na nuvem e exportar/importar a base (JSON).

## Reconhecimento facial

- Usa **face-api.js** (fork `@vladmandic`), carregado por CDN. A primeira
  abertura da câmera baixa os modelos (precisa de internet uma vez).
- Tudo roda **no navegador**: a imagem não é enviada a lugar nenhum. O que se
  guarda é um *descritor* (128 números) por aluno, usado para comparação.
- **Câmera exige HTTPS** (ou `localhost`). Em GitHub Pages/Netlify já é HTTPS.
- Ajuste a **sensibilidade** em Config (`faceThreshold`): menor = mais rígido
  (0,45–0,55 costuma funcionar bem). Cadastre o rosto com boa luz e de frente.

## Nuvem (Supabase) — opcional

1. No painel do Supabase, abra **SQL Editor** e rode
   `supabase/academia_schema.sql` (cria as tabelas `acad_*` + RLS).
2. As credenciais públicas saem de `js/config.js` (as mesmas do projeto).
3. Em **Config → Nuvem**, crie a conta da equipe e faça login. A partir daí os
   dados sincronizam entre dispositivos. Sem login, fica tudo só no aparelho.

> No MVP, **qualquer usuário autenticado** (a equipe) lê/escreve tudo. Alunos
> não têm login — quem opera é a recepção/admin.

## Estrutura

```
academia.html            markup + modais
css/academia.css         tema violeta/preto, mobile-first
js/academia.js           estado, persistência (local+nuvem), regras, telas
js/academia-face.js      reconhecimento facial (webcam + face-api.js)
js/academia-cloud.js     camada Supabase (auth + CRUD acad_*)
supabase/academia_schema.sql   tabelas + RLS
```

## Limitações / próximos passos

- Não integra hardware físico de catraca (a tela simula a liberação). Dá para
  plugar depois um relé/Wiegand via uma ponte local.
- Sem login por aluno, app, treinos ou agenda de aulas — foco no núcleo
  (cadastro + acesso + financeiro). Tudo extensível sobre a mesma base.
