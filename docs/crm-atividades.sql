-- ============================================================
-- TORQUE FITNESS — CRM: histórico de atividades por negócio
-- ------------------------------------------------------------
-- Adiciona a coluna `atividades` (linha do tempo) à tabela de
-- orçamentos. Cada atividade é um objeto JSON:
--   { "t": "ligacao", "x": "Cliente pediu desconto", "by": "Maria", "at": "2026-06-25T13:40:00.000Z" }
--   t  = tipo: nota | ligacao | whatsapp | email | reuniao | proposta | fase | sistema
--   x  = texto livre
--   by = nome do vendedor que registrou
--   at = data/hora ISO
--
-- COMO RODAR:
--   1. Abra o painel do seu projeto no Supabase.
--   2. Vá em "SQL Editor" → "New query".
--   3. Cole o comando abaixo e clique em "Run".
--   4. Recarregue a área do vendedor — o histórico passa a salvar.
--
-- É seguro rodar mais de uma vez (IF NOT EXISTS). A segurança de
-- linha (RLS) já existente na tabela `orcamentos` continua valendo,
-- pois a coluna pertence à mesma tabela — nenhuma policy nova é
-- necessária.
-- ============================================================

alter table public.orcamentos
  add column if not exists atividades jsonb not null default '[]'::jsonb;
