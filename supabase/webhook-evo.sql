-- ============================================================
-- TORQUE FITNESS — Webhook do EVO (tabela de eventos)
-- Cole TODO este conteúdo no SQL Editor do Supabase e clique em "Run".
-- Pode rodar mais de uma vez sem problema (é idempotente).
-- ============================================================

-- Guarda CADA evento que o EVO empurra para a Edge Function `evo-webhook`.
-- O payload bruto fica em `payload` (jsonb) para não perder nenhuma informação;
-- alguns campos são extraídos em colunas próprias para facilitar consultas.
create table if not exists public.evo_eventos (
  id           uuid primary key default gen_random_uuid(),
  event_type   text,                       -- ex.: crm.automation.contract_due_date
  event_label  text,                        -- rótulo legível (ex.: "Vencimento de contrato")
  event_date   timestamptz,                 -- eventDate enviado pelo EVO
  id_member    bigint,                      -- person.idMember, quando o evento traz
  id_branch    bigint,                      -- organization.idBranch (unidade)
  payload      jsonb not null,              -- corpo completo recebido do EVO
  processado   boolean not null default false,  -- vira true quando a automação já tratou
  recebido_em  timestamptz not null default now()
);

-- colunas novas (rode mesmo se a tabela já existir)
alter table public.evo_eventos
  add column if not exists event_label text,
  add column if not exists event_date  timestamptz;

-- índices para os filtros mais comuns (por tipo, por aluno, e fila do que falta processar)
create index if not exists idx_evo_evt_tipo    on public.evo_eventos (event_type);
create index if not exists idx_evo_evt_member  on public.evo_eventos (id_member);
create index if not exists idx_evo_evt_fila    on public.evo_eventos (processado, recebido_em);

-- RLS: ninguém lê via chave pública. A Edge Function grava com a SERVICE ROLE
-- (que ignora o RLS), e só o admin do painel pode ler os eventos.
alter table public.evo_eventos enable row level security;

drop policy if exists evo_eventos_select_admin on public.evo_eventos;
create policy evo_eventos_select_admin on public.evo_eventos
  for select using (public.is_admin());

-- ============================================================
-- Próximo passo (opcional): quando você definir o canal de envio
-- (e-mail / WhatsApp), criamos uma função/cron que lê os eventos
-- com processado = false e dispara a reativação.
-- ============================================================
