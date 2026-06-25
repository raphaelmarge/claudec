// ============================================================
// TORQUE FITNESS — Edge Function: evo-webhook
// Recebe os eventos que o EVO/W12 empurra e grava em public.evo_eventos.
//
// Deploy (CLI do Supabase):
//   supabase functions deploy evo-webhook --no-verify-jwt
//   (--no-verify-jwt porque o EVO não envia um JWT do Supabase;
//    a autenticação é feita pelo header secreto abaixo)
//
// Variáveis de ambiente (Settings > Edge Functions > Secrets):
//   EVO_WEBHOOK_SECRET   -> um segredo forte que você inventa (ex.: 32+ chars).
//                           O MESMO valor vai no header do webhook registrado no EVO.
//   SUPABASE_URL               } injetadas automaticamente pelo Supabase
//   SUPABASE_SERVICE_ROLE_KEY }  no ambiente da função.
//
// URL pública (urlCallback do webhook):
//   https://<seu-projeto>.supabase.co/functions/v1/evo-webhook
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECRET = Deno.env.get("EVO_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// comparação em tempo constante para o token (evita timing attack)
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// extrai um número de um objeto tentando várias grafias de chave
function pickNum(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  }
  return null;
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 1) Autenticação pelo header secreto (configurado no webhook do EVO).
  const token = req.headers.get("x-evo-token") ?? "";
  if (!SECRET || !safeEqual(token, SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2) Lê o corpo. O EVO pode mandar um objeto único ou uma lista de eventos.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request: JSON inválido", { status: 400 });
  }
  const eventos = Array.isArray(body) ? body : [body];

  // 3) Monta as linhas a inserir, extraindo os campos mais úteis.
  const linhas = eventos.map((ev) => {
    const o = (ev ?? {}) as Record<string, unknown>;
    return {
      event_type: pickStr(o, ["eventType", "EventType", "event", "tipo"]),
      id_member: pickNum(o, ["idMember", "IdMember", "memberId"]),
      id_branch: pickNum(o, ["idBranch", "IdBranch", "branchId"]),
      payload: o,
    };
  });

  // 4) Grava com a SERVICE ROLE (ignora RLS).
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.from("evo_eventos").insert(linhas);

  if (error) {
    console.error("Falha ao inserir evento do EVO:", error.message);
    // 500 faz o EVO reenviar depois (retry), então não perdemos o evento.
    return new Response("Erro ao gravar", { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, recebidos: linhas.length }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
