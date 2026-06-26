-- ============================================================
-- ACADEMIA — Banco de dados (Supabase / Postgres)
-- Cole TODO este conteúdo no SQL Editor do Supabase e clique em "Run".
-- É idempotente: pode rodar mais de uma vez sem problema.
--
-- Modelo de acesso (MVP): qualquer usuário AUTENTICADO (a equipe da
-- academia) lê e escreve os dados. Os alunos NÃO têm login — quem opera
-- é a recepção/admin. Se quiser multi-academia no futuro, dá para
-- adicionar uma coluna academia_id e refinar as policies.
-- ============================================================

-- ---------- PLANOS ----------
create table if not exists public.acad_planos (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  valor        numeric not null default 0,
  duracao_dias int not null default 30,
  descricao    text default '',
  ativo        boolean not null default true,
  criado_em    timestamptz default now()
);

-- ---------- ALUNOS ----------
create table if not exists public.acad_alunos (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  cpf             text default '',
  telefone        text default '',
  email           text default '',
  nascimento      date,
  foto            text default '',            -- dataURL (base64) opcional
  plano_id        uuid references public.acad_planos on delete set null,
  inicio          date default current_date,
  vencimento      date,                       -- próximo vencimento (controle de acesso)
  status          text not null default 'ativo',   -- 'ativo' | 'inativo'
  face_descriptor jsonb,                       -- 128 floats do reconhecimento facial
  obs             text default '',
  criado_em       timestamptz default now()
);
create index if not exists idx_acad_alunos_cpf on public.acad_alunos (cpf);
create index if not exists idx_acad_alunos_venc on public.acad_alunos (vencimento);

-- ---------- PAGAMENTOS / MENSALIDADES ----------
create table if not exists public.acad_pagamentos (
  id         uuid primary key default gen_random_uuid(),
  aluno_id   uuid not null references public.acad_alunos on delete cascade,
  plano_id   uuid references public.acad_planos on delete set null,
  valor      numeric not null default 0,
  vencimento date,
  pago       boolean not null default true,
  pago_em    timestamptz default now(),
  metodo     text default 'dinheiro',     -- dinheiro | pix | cartao | boleto
  ref_mes    text default '',             -- ex.: '2026-06'
  obs        text default '',
  criado_em  timestamptz default now()
);
create index if not exists idx_acad_pag_aluno on public.acad_pagamentos (aluno_id);

-- ---------- ACESSOS (catraca / check-ins) ----------
create table if not exists public.acad_acessos (
  id        uuid primary key default gen_random_uuid(),
  aluno_id  uuid references public.acad_alunos on delete set null,
  ts        timestamptz default now(),
  liberado  boolean not null default false,
  metodo    text default 'manual',        -- facial | manual
  motivo    text default ''               -- ex.: 'em dia', 'inadimplente', 'plano inativo'
);
create index if not exists idx_acad_acessos_ts on public.acad_acessos (ts desc);

-- ---------- CONFIGURAÇÃO (linha única) ----------
create table if not exists public.acad_config (
  id         int primary key default 1,
  data       jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- ============================================================
-- RLS: equipe autenticada faz tudo. (Sem login = sem acesso.)
-- ============================================================
alter table public.acad_planos     enable row level security;
alter table public.acad_alunos     enable row level security;
alter table public.acad_pagamentos enable row level security;
alter table public.acad_acessos    enable row level security;
alter table public.acad_config     enable row level security;

drop policy if exists acad_planos_rw     on public.acad_planos;
drop policy if exists acad_alunos_rw     on public.acad_alunos;
drop policy if exists acad_pagamentos_rw on public.acad_pagamentos;
drop policy if exists acad_acessos_rw    on public.acad_acessos;
drop policy if exists acad_config_rw     on public.acad_config;

create policy acad_planos_rw     on public.acad_planos     for all to authenticated using (true) with check (true);
create policy acad_alunos_rw     on public.acad_alunos     for all to authenticated using (true) with check (true);
create policy acad_pagamentos_rw on public.acad_pagamentos for all to authenticated using (true) with check (true);
create policy acad_acessos_rw    on public.acad_acessos    for all to authenticated using (true) with check (true);
create policy acad_config_rw     on public.acad_config     for all to authenticated using (true) with check (true);
