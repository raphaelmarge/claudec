-- ============================================================
-- TORQUE FITNESS — Automação de reativação (controle + agendamento)
-- Cole no SQL Editor do Supabase e rode. Idempotente.
-- Pré-requisito: já ter rodado supabase/webhook-evo.sql (tabela evo_eventos).
-- ============================================================

-- 1) Colunas de controle de envio na tabela de eventos
alter table public.evo_eventos
  add column if not exists status_envio text not null default 'pendente',
      -- 'pendente' | 'enviado' | 'sem_contato' | 'erro' | 'ignorado'
  add column if not exists canal        text,         -- 'email' | 'whatsapp'
  add column if not exists enviado_em   timestamptz,
  add column if not exists erro         text,
  add column if not exists tentativas   int not null default 0;

-- índice para a fila (o que ainda falta processar)
create index if not exists idx_evo_evt_envio
  on public.evo_eventos (processado, status_envio, recebido_em);

-- ============================================================
-- 2) Agendamento (pg_cron) chamando a Edge Function `processar-reativacao`
--    via pg_net. Roda a cada 15 minutos.
-- ============================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- remove agendamento anterior com o mesmo nome (evita duplicar ao rodar de novo)
select cron.unschedule('reativacao-15min')
where exists (select 1 from cron.job where jobname = 'reativacao-15min');

select cron.schedule(
  'reativacao-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://uqwbywzuqooqzmiklqct.supabase.co/functions/v1/processar-reativacao',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', 'TROQUE_PELO_MESMO_CRON_SECRET_DA_FUNCAO'
               ),
    body    := '{}'::jsonb
  );
  $$
);

-- ⚠️ Troque 'TROQUE_PELO_MESMO_CRON_SECRET_DA_FUNCAO' pelo valor que você
-- vai cadastrar no secret CRON_SECRET da Edge Function (passo da doc).
-- (Para produção, o ideal é guardar esse segredo no Supabase Vault em vez de
--  texto puro aqui — veja docs/reativacao.md.)

-- Útil:
--   select * from cron.job;                       -- ver agendamentos
--   select * from cron.job_run_details order by start_time desc limit 20;  -- histórico
