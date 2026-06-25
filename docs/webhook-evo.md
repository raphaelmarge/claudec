# Webhook do EVO → Supabase (Torque Fitness)

Em vez de **puxar** dados do EVO via API (que tem limite diário de requisições e
travou em ~4.950 registros), o webhook faz o EVO **empurrar** cada evento na hora
em que ele acontece. Isso resolve o limite e abre caminho pra automação em tempo
real (ex.: aluno cancela → dispara reativação).

## Como funciona

```
EVO/W12  ──POST evento──▶  Edge Function `evo-webhook`  ──insert──▶  tabela public.evo_eventos
(NewSale,                  (valida header secreto)                   (admin consulta no painel)
 CreateMember, ...)
```

## Passo a passo

### 1) Criar a tabela
No painel do Supabase → **SQL Editor**, cole e rode `supabase/webhook-evo.sql`.

### 2) Publicar a Edge Function
Com a [CLI do Supabase](https://supabase.com/docs/guides/cli) instalada e logada:

```bash
supabase link --project-ref uqwbywzuqooqzmiklqct
supabase functions deploy evo-webhook --no-verify-jwt
```

> `--no-verify-jwt` é necessário porque o EVO não envia um JWT do Supabase.
> A segurança vem do **header secreto** (passo 3).

### 3) Definir o segredo
Crie um segredo forte (ex.: `openssl rand -hex 24`) e cadastre na função:

```bash
supabase secrets set EVO_WEBHOOK_SECRET="cole-o-segredo-aqui"
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas automaticamente.

A URL pública da função (o `urlCallback`) fica:

```
https://uqwbywzuqooqzmiklqct.supabase.co/functions/v1/evo-webhook
```

### 4) Registrar o webhook no EVO

**Jeito mais fácil — pela tela do EVO (recomendado):**
Em **EVO → Configurações → Integrações → EVO API → aba Webhook → Novo webhook**, preencha:

| Campo | Valor |
|---|---|
| Nome | `Reativação Supabase` (qualquer) |
| URL de callback | `https://uqwbywzuqooqzmiklqct.supabase.co/functions/v1/evo-webhook` |
| Habilitar para envio via WhatsApp | desmarcado (por enquanto) |
| Cabeçalhos → + Header | Chave `x-evo-token` · Valor = o segredo do passo 3 |

Clique em **TESTAR WEBHOOK** e depois **SALVAR**. As credenciais (token) ficam na
aba **Tokens**, ao lado.

**Jeito via terminal (alternativa):** use `tools/registrar_webhook_evo.sh` com
`EVO_LOGIN` (DNS da conta) + `EVO_TOKEN` (token da aba Tokens).

> Formato do evento: o EVO usa nomes em namespace, ex.:
> `crm.automation.contract_due_date` ("Vencimento de contrato"), com os dados em
> `person.idMember` e `organization.idBranch`. Confira a lista de eventos
> disponíveis na própria tela do EVO — o de **vencimento/cancelamento de contrato**
> é o ideal para disparar a reativação.

### 5) Testar
Faça uma ação no EVO que dispare o evento (ou peça um reenvio de teste) e confira:

```sql
select recebido_em, event_type, id_member, payload
from public.evo_eventos
order by recebido_em desc
limit 20;
```

## Próximo passo (automação da reativação)
Quando você escolher o canal de envio (e-mail ou WhatsApp), criamos um job (cron do
Supabase) que lê `evo_eventos where processado = false`, filtra os eventos de
cancelamento/inatividade e dispara a mensagem de "volte a treinar" — marcando
`processado = true` pra não repetir.

## Endpoints da API de webhook do EVO (referência)
- **Criar:** `POST https://evo-integracao-api.w12app.com.br/api/v1/webhook`
- **Listar:** `GET  https://evo-integracao-api.w12app.com.br/api/v1/webhook`
- **Remover:** `DELETE https://evo-integracao-api.w12app.com.br/api/v1/webhook/{id}`
- Auth: **Basic** (login + chave de API). Corpo: `eventType`, `urlCallback`,
  `headers[]`, `filters[]`, `idBranch` (opcional).
