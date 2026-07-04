-- ============================================================
-- TORQUE FITNESS — Banco de dados (Supabase / Postgres)
-- Cole TODO este conteúdo no SQL Editor do Supabase e clique em "Run".
-- Pode rodar mais de uma vez sem problema (é idempotente).
-- ============================================================

-- ---------- PERFIS (vendedores e admin) ----------
create table if not exists public.profiles (
  id        uuid primary key references auth.users on delete cascade,
  nome      text not null default '',
  telefone  text default '',
  role      text not null default 'vendedor',   -- 'vendedor' | 'admin'
  criado_em timestamptz default now()
);

-- campos completos do vendedor (rode mesmo se a tabela já existir)
alter table public.profiles
  add column if not exists cpf      text default '',
  add column if not exists celular  text default '',
  add column if not exists endereco text default '',
  add column if not exists cidade   text default '',
  add column if not exists cep      text default '';

-- ---------- helper: usuário atual é admin? (evita recursão no RLS) ----------
-- Criado DEPOIS da tabela profiles, pois referencia ela.
create or replace function public.is_admin()
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid());

-- cria o perfil automaticamente quando um usuário é criado
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', ''))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- CLIENTES (cada vendedor tem os seus) ----------
create table if not exists public.clientes (
  id          uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null default auth.uid() references auth.users on delete cascade,
  nome        text not null,
  empresa     text default '',
  telefone    text default '',
  email       text default '',
  doc         text default '',
  cidade      text default '',
  obs         text default '',
  criado_em   timestamptz default now()
);
alter table public.clientes enable row level security;

drop policy if exists clientes_rw on public.clientes;
create policy clientes_rw on public.clientes
  for all
  using (vendedor_id = auth.uid() or public.is_admin())
  with check (vendedor_id = auth.uid() or public.is_admin());

-- ---------- ORÇAMENTOS (salvos no nome do cliente + vendedor) ----------
create table if not exists public.orcamentos (
  id            uuid primary key default gen_random_uuid(),
  numero        text,
  vendedor_id   uuid not null default auth.uid() references auth.users on delete cascade,
  vendedor_nome text default '',
  cliente_id    uuid references public.clientes on delete set null,
  cliente_nome  text default '',
  itens         jsonb not null default '[]',
  subtotal      numeric default 0,
  desconto      numeric default 0,
  total         numeric default 0,
  sinal         numeric default 0,
  saldo         numeric default 0,
  parcelas      int default 1,
  valor_parcela numeric default 0,
  status        text default 'enviado',
  criado_em     timestamptz default now()
);
-- acompanhamento (funil) + leads do site (rode mesmo se a tabela já existir)
alter table public.orcamentos
  add column if not exists obs              text default '',
  add column if not exists retorno_em       date,
  add column if not exists origem           text default 'app',   -- 'app' | 'site'
  add column if not exists contato_telefone text default '',
  add column if not exists contato_email    text default '';
-- leads do site não têm vendedor ainda -> precisa permitir nulo
alter table public.orcamentos alter column vendedor_id drop not null;

alter table public.orcamentos enable row level security;

-- vendedor vê os seus + leads do site (sem dono); admin vê tudo
drop policy if exists orcamentos_select on public.orcamentos;
create policy orcamentos_select on public.orcamentos
  for select using (vendedor_id = auth.uid() or vendedor_id is null or public.is_admin());

-- vendedor logado insere os seus
drop policy if exists orcamentos_insert on public.orcamentos;
create policy orcamentos_insert on public.orcamentos
  for insert to authenticated with check (vendedor_id = auth.uid());

-- o SITE (anônimo) insere leads (sem dono, origem 'site')
drop policy if exists orcamentos_insert_lead on public.orcamentos;
create policy orcamentos_insert_lead on public.orcamentos
  for insert to anon with check (vendedor_id is null and origem = 'site' and status = 'novo');

-- vendedor atualiza os seus e pode assumir um lead; admin atualiza tudo
drop policy if exists orcamentos_update on public.orcamentos;
create policy orcamentos_update on public.orcamentos
  for update using (vendedor_id = auth.uid() or vendedor_id is null or public.is_admin());

-- índices úteis
create index if not exists idx_orc_vendedor on public.orcamentos (vendedor_id);
create index if not exists idx_orc_cliente  on public.orcamentos (cliente_id);
create index if not exists idx_cli_vendedor on public.clientes  (vendedor_id);

-- ---------- MANUTENÇÕES DA ACADEMIA (apps manutencao.html + manutencao-tv.html) ----------
-- Uma linha por item (chamado, preventiva, rotina de limpeza, ativo, execução),
-- com o conteúdo em JSON. Exclusões viram "tombstones" (deleted = true) para
-- sincronizarem entre aparelhos.
create table if not exists public.manutencao_itens (
  id         text primary key,            -- id gerado no aparelho
  tipo       text not null,               -- 'ativo' | 'os' | 'plano' | 'limpeza' | 'log'
  data       jsonb not null default '{}',
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.manutencao_itens enable row level security;

-- app interno: toda a equipe logada lê e escreve
drop policy if exists manutencao_rw on public.manutencao_itens;
create policy manutencao_rw on public.manutencao_itens
  for all to authenticated using (true) with check (true);

create index if not exists idx_manut_tipo on public.manutencao_itens (tipo);
create index if not exists idx_manut_upd  on public.manutencao_itens (updated_at);

-- tempo real: a TV e os outros aparelhos atualizam na hora
do $$ begin
  alter publication supabase_realtime add table public.manutencao_itens;
exception when duplicate_object then null; end $$;

-- ============================================================
-- DEPOIS de criar seu usuário admin em Authentication > Users,
-- rode este comando (troque o e-mail) para virar admin:
--
--   update public.profiles set role = 'admin', nome = 'Seu Nome'
--   where id = (select id from auth.users where email = 'seu@email.com');
-- ============================================================
