# CuidarJá — home care sob demanda 🏠💚

Protótipo funcional de um app estilo **“Uber para home care”**: faz a ponte entre
**famílias que precisam de cuidado em casa** e **profissionais** (cuidadores de
idosos, técnicos de enfermagem, enfermeiros, fisioterapeutas e acompanhantes
hospitalares) — na hora ou agendado.

É um **app independente** dentro deste repositório (não interfere no site da
Torque). Abra `homecare/index.html` no celular ou no computador — roda 100% no
navegador, sem servidor e sem instalação. Também pode ser instalado como PWA.

## O que dá para fazer

O app tem **dois lados**, alternados pelo seletor no topo:

### 🏠 Preciso de cuidado (família)
1. **Solicitar** — escolhe o tipo de cuidado, para quem é (paciente, idade,
   condição), o endereço, se é **agora** ou **agendado** e por quanto tempo
   (hora, diária, plantão 12h ou pernoite).
2. **Comparar e escolher** — vê os profissionais compatíveis perto de você,
   ordenados por **distância, avaliação ou preço**, com nota, especialidades,
   selos de verificação (identidade, antecedentes, COREN/CREFITO), preço por
   hora e **estimativa do atendimento**.
3. **Confirmar e acompanhar** — confirma a solicitação e acompanha o status em
   tempo real (Solicitado → Confirmado → Em atendimento → Concluído). Ao final,
   **avalia** o profissional.

### 🩺 Sou profissional
1. **Solicitações** — recebe os chamados das famílias e **aceita ou recusa**.
2. **Agenda** — os atendimentos aceitos, que ele **inicia** e **conclui**.
3. **Perfil** — edita atuação, preço/hora, registro (COREN/CREFITO),
   especialidades, bio e disponibilidade — é o que a família vê na busca.

> Crie uma solicitação como família e depois troque para “Sou profissional”:
> o mesmo chamado aparece lá para você aceitar — o ciclo completo dos dois lados.

## Estrutura

```
homecare/
  index.html            markup + telas (SPA por abas) + folhas/modais
  app.css               identidade visual (verde-azulado + coral), mobile-first
  app.js                estado, dados de exemplo, matching, fluxos e persistência
  manifest.webmanifest  PWA
  icon.svg              ícone do app
  sw.js                 service worker (offline / instalável)
```

## Como os dados funcionam (e como plugar um backend)

Tudo é persistido no **`localStorage`** do próprio aparelho e vem com **dados de
exemplo** (9 profissionais fictícios). A camada de dados fica isolada no módulo
`Store` (dentro de `app.js`), com métodos como `getPros`, `getBookings`,
`saveBookings`, `getProMe`.

Para virar um app real multiusuário, basta reimplementar esses métodos sobre um
backend — o mesmo padrão do **Supabase** já usado neste repositório
(`js/cloud.js`): tabelas `profissionais`, `solicitacoes`/`agendamentos` e
`avaliacoes` protegidas por RLS, auth por e-mail, e geolocalização real para o
“perto de você”. O resto da interface não muda.

## Identidade visual

- Paleta **verde-azulado** (cuidado, saúde, confiança) + **coral** (calor humano),
  em tema claro, pensado para famílias e para leitura fácil.
- Tipografia: **Archivo** (títulos), **Inter** (texto), **JetBrains Mono**
  (preços e números) — a mesma família dos outros apps do repositório.
- Mobile-first, com barra de abas inferior e folhas (bottom sheets) estilo app.

## Aviso

Protótipo **demonstrativo**. Profissionais, registros e avaliações são
**fictícios**, apenas para ilustrar o funcionamento. Não é um serviço real de
saúde e não substitui avaliação profissional.
