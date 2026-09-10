-- Private cost workspace. Additive: does not touch products, settings or quotations.
create table public.equipment_cost_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.equipment_cost_access enable row level security;
revoke all on public.equipment_cost_access from public, anon, authenticated;
grant select on public.equipment_cost_access to authenticated;
grant all on public.equipment_cost_access to service_role;
create policy cost_access_self on public.equipment_cost_access for select to authenticated
  using (user_id = (select auth.uid()));
-- Snapshot existing administrators ONCE. Editing one's own profile cannot grant cost access.
insert into public.equipment_cost_access(user_id)
  select p.id from public.profiles p join auth.users u on u.id = p.id
  where p.role = 'admin' and u.deleted_at is null;

create table public.equipment_cost_records (
  codigo text primary key check (char_length(codigo) between 1 and 100 and codigo = btrim(codigo)),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16000),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index equipment_cost_records_updated_by_idx on public.equipment_cost_records(updated_by);
alter table public.equipment_cost_records enable row level security;
revoke all on public.equipment_cost_records from public, anon, authenticated;
grant select on public.equipment_cost_records to authenticated;
grant insert(codigo, payload), update(payload) on public.equipment_cost_records to authenticated;
grant all on public.equipment_cost_records to service_role;
create policy cost_records_read on public.equipment_cost_records for select to authenticated using (
  exists (select 1 from public.equipment_cost_access a where a.user_id = (select auth.uid()) and a.enabled)
);
create policy cost_records_insert on public.equipment_cost_records for insert to authenticated with check (
  exists (select 1 from public.equipment_cost_access a where a.user_id = (select auth.uid()) and a.enabled)
);
create policy cost_records_update on public.equipment_cost_records for update to authenticated using (
  exists (select 1 from public.equipment_cost_access a where a.user_id = (select auth.uid()) and a.enabled)
) with check (
  exists (select 1 from public.equipment_cost_access a where a.user_id = (select auth.uid()) and a.enabled)
);
create function public.validate_equipment_cost_record() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare k text; v jsonb; n numeric;
begin
  for k,v in select key,value from jsonb_each(new.payload) loop
    if k = 'source' then
      if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 1500 then raise exception 'Invalid source'; end if;
    elsif k = any(array['fobUSD','landedBRL','cambio','freteIntlUSD','seguroPct','iof','ii','ipi','pisCofins','icms','freteNacionalBRL','despachanteBRL','portoBRL','armazenagemBRL','certificacaoBRL','montagemBRL','entregaBRL','garantiaBRL','operacaoBRL','financeiroBRL','outrosBRL','creditosBRL','tributosVendaPct','comissaoPct','pagamentoPct']) then
      if jsonb_typeof(v) <> 'number' then raise exception 'Invalid numeric cost field: %', k; end if;
      n := (v #>> '{}')::numeric;
      if n < 0 or n > 10000000000 then raise exception 'Out of range: %', k; end if;
      if k = any(array['fobUSD','landedBRL','cambio']) and n <= 0 then raise exception 'Must be positive: %', k; end if;
      if k = any(array['icms','tributosVendaPct','comissaoPct','pagamentoPct']) and n >= 100 then raise exception 'Rate must be below 100: %', k; end if;
    else raise exception 'Cost field not allowed: %', k;
    end if;
  end loop;
  if new.codigo = '__defaults__' and (new.payload ? 'fobUSD' or new.payload ? 'landedBRL') then raise exception 'Per-product purchase cannot be a global default'; end if;
  if coalesce((new.payload->>'tributosVendaPct')::numeric,0) + coalesce((new.payload->>'comissaoPct')::numeric,0) + coalesce((new.payload->>'pagamentoPct')::numeric,0) >= 100 then raise exception 'Combined sales rates must be below 100'; end if;
  if tg_op = 'UPDATE' then new.version := old.version + 1; else new.version := 1; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function public.validate_equipment_cost_record() from public, anon, authenticated;
create trigger equipment_cost_record_guard before insert or update on public.equipment_cost_records
for each row execute function public.validate_equipment_cost_record();
comment on table public.equipment_cost_records is 'Restricted internal cost inputs only. Never mirror into public catalog or settings. __defaults__ holds per-unit defaults.';
