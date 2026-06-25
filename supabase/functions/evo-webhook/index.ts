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
//                           O MESMO valor vai no header `x-evo-token` do webhook no EVO.
//   SUPABASE_URL               } injetadas automaticamente pelo Supabase
//   SUPABASE_SERVICE_ROLE_KEY }  no ambiente da função.
//
// URL pública (urlCallback do webhook):
//   https://<seu-projeto>.supabase.co/functions/v1/evo-webhook
//
// Formato real do evento do EVO (exemplo):
//   {
//     "eventType": "crm.automation.contract_due_date",
//     "eventLabel": "Vencimento de contrato",
//     "eventDate": "2026-03-17T14:30:00Z",
//     "eventContext": { "moment": "after", "daysOffset": 10 },
//     "organization": { "idW12": 12345, "idBranch": 10, "branchName": "..." },
//     "person": { "idMember": 456789, "idProspect": null, "firstName": "...", "lastName": "..." }
//   }
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

type Obj = Record<string, unknown>;

// lê um valor num caminho aninhado, ex.: get(o, ["person", "idMember"])
function get(o: unknown, path: string[]): unknown {
  let cur: unknown = o;
  for (const k of path) {
    if (cur && typeof cur === "object" && k in (cur as Obj)) cur = (cur as Obj)[k];
    else return undefined;
  }
  return cur;
}

// tenta vários caminhos (planos OU aninhados) e devolve o primeiro número válido
function firstNum(o: unknown, paths: string[][]): number | null {
  for (const p of paths) {
    const v = get(o, p);
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  }
  return null;
}

function firstStr(o: unknown, paths: string[][]): string | null {
  for (const p of paths) {
    const v = get(o, p);
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

  // 3) Monta as linhas, extraindo os campos úteis (formato novo aninhado + fallback plano).
  const linhas = eventos.map((ev) => ({
    event_type: firstStr(ev, [["eventType"], ["EventType"], ["event"]]),
    event_label: firstStr(ev, [["eventLabel"], ["EventLabel"]]),
    event_date: firstStr(ev, [["eventDate"], ["EventDate"]]),
    id_member: firstNum(ev, [["person", "idMember"], ["idMember"], ["IdMember"]]),
    id_branch: firstNum(ev, [["organization", "idBranch"], ["idBranch"], ["IdBranch"]]),
    payload: (ev ?? {}) as Obj,
  }));

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
