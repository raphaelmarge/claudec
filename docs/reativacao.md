# Reativação automática (Supabase) — Torque Fitness

Fecha o ciclo da reativação: o webhook do EVO já grava os eventos em
`public.evo_eventos`; aqui um **cron** chama uma **Edge Function** que lê os
eventos de *vencimento de contrato* ainda não processados e dispara a mensagem
de "volte a treinar" (e-mail ou WhatsApp), marcando o resultado.

```
pg_cron (a cada 15 min) ──▶ Edge Function processar-reativacao
                                 │  lê evo_eventos (pendentes, tipo contract_due_date)
                                 │  envia e-mail (Resend) OU WhatsApp (Meta Cloud API)
                                 └─ marca status_envio / enviado_em / erro
```

## Pré-requisitos
- `supabase/webhook-evo.sql` já rodado (tabela `evo_eventos` recebendo eventos).
- Webhook do EVO funcionando (ver `docs/webhook-evo.md`).

## Passo a passo

### 1) Colunas de controle + agendamento
No **SQL Editor**, rode `supabase/reativacao.sql`. Ele:
- adiciona `status_envio`, `canal`, `enviado_em`, `erro`, `tentativas` em `evo_eventos`;
- cria o cron `reativacao-15min` (pg_cron + pg_net) que chama a função.

> Troque, dentro do SQL, `TROQUE_PELO_MESMO_CRON_SECRET_DA_FUNCAO` pelo valor que
> você definirá no secret `CRON_SECRET` (passo 3).

### 2) Publicar a função
```bash
supabase functions deploy processar-reativacao --no-verify-jwt
```

### 3) Configurar os secrets
```bash
supabase secrets set CRON_SECRET="um-segredo-forte"      # MESMO valor do SQL
supabase secrets set CANAL="email"                        # ou "whatsapp"

# Se CANAL=email (provedor Resend — https://resend.com):
supabase secrets set RESEND_API_KEY="re_xxx"
supabase secrets set EMAIL_FROM="Torque Fit <contato@seudominio.com.br>"

# Se CANAL=whatsapp (Meta WhatsApp Cloud API):
supabase secrets set WHATSAPP_TOKEN="EAxxx"
supabase secrets set WHATSAPP_PHONE_ID="123456789"
supabase secrets set WHATSAPP_TEMPLATE="reativacao_7dias"   # template aprovado, 1 variável
supabase secrets set WHATSAPP_LANG="pt_BR"
```

### 4) Testar sem esperar o cron
Chame a função manualmente (com o segredo):
```bash
curl -i -X POST "https://uqwbywzuqooqzmiklqct.supabase.co/functions/v1/processar-reativacao" \
  -H "x-cron-secret: um-segredo-forte"
```
Resposta esperada: `{"ok":true,"processados":N,"enviados":...,"semContato":...,"erros":...}`.

### 5) Acompanhar
```sql
select status_envio, count(*) from public.evo_eventos group by status_envio;
select enviado_em, canal, status_envio, erro, id_member
from public.evo_eventos where processado order by enviado_em desc nulls last limit 30;
select * from cron.job_run_details order by start_time desc limit 10;  -- execuções do cron
```

## Detalhes de comportamento
- **Filtro de evento:** constante `TIPOS_REATIVACAO = ["contract_due_date"]` na função.
  Ajuste para incluir cancelamento etc. conforme os eventos reais do seu EVO.
- **Contato:** o e-mail/telefone é procurado dentro do `payload` do evento. Se o
  evento do EVO **não trouxer contato**, o registro fica `status_envio = 'sem_contato'`.
  Nesse caso, habilite os campos de contato no webhook do EVO, ou adicionamos um
  passo de enriquecimento via API do EVO (sua conta é API PRO).
- **Retry:** falhas de envio (`erro`) ficam com `processado = false` e são
  reprocessadas na próxima rodada; `tentativas` é incrementado.
- **WhatsApp:** exige **template aprovado** pela Meta com 1 variável (o primeiro
  nome) e opt-in dos contatos. Sem isso, a Meta recusa o envio.
- **Lote:** processa até 50 eventos por execução (constante `LOTE`).

## Segurança do segredo no cron
Guardar o `CRON_SECRET` em texto puro no SQL funciona, mas o ideal é usar o
**Supabase Vault** e ler com `vault.decrypted_secrets`. Veja a doc do Supabase
sobre pg_cron + Vault se quiser endurecer isso.
