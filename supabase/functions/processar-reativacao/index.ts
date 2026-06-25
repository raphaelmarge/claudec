// ============================================================
// TORQUE FITNESS — Edge Function: processar-reativacao
// Lê eventos de reativação ainda não processados em public.evo_eventos,
// dispara a mensagem (e-mail OU WhatsApp) e marca o resultado.
// Chamada periodicamente pelo pg_cron (ver supabase/reativacao.sql).
//
// Deploy:
//   supabase functions deploy processar-reativacao --no-verify-jwt
//
// Secrets (Settings > Edge Functions > Secrets):
//   CRON_SECRET            -> protege a função; o MESMO valor vai no pg_cron.
//   CANAL                  -> "email" ou "whatsapp"
//   # Se CANAL=email (provedor Resend):
//   RESEND_API_KEY         -> chave da Resend (https://resend.com)
//   EMAIL_FROM             -> ex.: "Torque Fit <contato@seudominio.com.br>"
//   # Se CANAL=whatsapp (Meta WhatsApp Cloud API):
//   WHATSAPP_TOKEN         -> token permanente do app do WhatsApp
//   WHATSAPP_PHONE_ID      -> Phone Number ID
//   WHATSAPP_TEMPLATE      -> nome do template aprovado (com 1 variável = primeiro nome)
//   WHATSAPP_LANG          -> idioma do template (ex.: "pt_BR")
//   (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente.)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CANAL = (Deno.env.get("CANAL") ?? "email").toLowerCase();

// Quais eventos disparam a reativação. Ajuste à vontade.
const TIPOS_REATIVACAO = ["contract_due_date"]; // casa com crm.automation.contract_due_date
const LOTE = 50; // quantos eventos processar por execução

type Obj = Record<string, unknown>;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// procura recursivamente o primeiro e-mail no payload
function acharEmail(v: unknown): string | null {
  const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (typeof v === "string") return re.test(v.trim()) ? v.trim() : null;
  if (Array.isArray(v)) { for (const x of v) { const r = acharEmail(x); if (r) return r; } }
  else if (v && typeof v === "object") {
    for (const x of Object.values(v as Obj)) { const r = acharEmail(x); if (r) return r; }
  }
  return null;
}

// procura recursivamente um telefone (>= 10 dígitos) no payload
function acharTelefone(v: unknown): string | null {
  if (typeof v === "string") {
    const dig = v.replace(/\D/g, "");
    return dig.length >= 10 && dig.length <= 13 ? dig : null;
  }
  if (typeof v === "number") {
    const s = String(v);
    return s.length >= 10 && s.length <= 13 ? s : null;
  }
  if (Array.isArray(v)) { for (const x of v) { const r = acharTelefone(x); if (r) return r; } }
  else if (v && typeof v === "object") {
    for (const x of Object.values(v as Obj)) { const r = acharTelefone(x); if (r) return r; }
  }
  return null;
}

function primeiroNome(payload: Obj): string {
  const p = (payload.person ?? {}) as Obj;
  const n = (p.firstName ?? p.name ?? payload.firstName ?? "") as string;
  return (typeof n === "string" ? n.trim().split(/\s+/)[0] : "") || "tudo bem";
}

function corpoEmail(nome: string): { subject: string; html: string; text: string } {
  const subject = "Seu halter tá com saudade 🏋️ (7 dias por nossa conta)";
  const text =
`Oi, ${nome}!

Os pesos aqui na Torque Fit perguntaram de você. 😄
Sabemos que a rotina aperta — sem culpa pelo tempo parado. Voltar é
mais fácil do que recomeçar do zero.

Nosso convite: 7 DIAS GRÁTIS pra você retomar o hábito, sem compromisso.

Bora marcar sua volta essa semana? É só responder este e-mail. 🙌

Equipe Torque Fit`;
  const html = text.replace(/\n/g, "<br>");
  return { subject, html, text };
}

async function enviarEmail(para: string, nome: string): Promise<void> {
  const key = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("EMAIL_FROM") ?? "";
  if (!key || !from) throw new Error("RESEND_API_KEY/EMAIL_FROM não configurados");
  const { subject, html, text } = corpoEmail(nome);
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [para], subject, html, text }),
  });
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
}

async function enviarWhatsapp(telefone: string, nome: string): Promise<void> {
  const token = Deno.env.get("WHATSAPP_TOKEN") ?? "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") ?? "";
  const template = Deno.env.get("WHATSAPP_TEMPLATE") ?? "";
  const lang = Deno.env.get("WHATSAPP_LANG") ?? "pt_BR";
  if (!token || !phoneId || !template) {
    throw new Error("WHATSAPP_TOKEN/PHONE_ID/TEMPLATE não configurados");
  }
  // telefone precisa do código do país (Brasil = 55). Acrescenta se faltar.
  const to = telefone.startsWith("55") ? telefone : `55${telefone}`;
  const resp = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: lang },
        components: [
          { type: "body", parameters: [{ type: "text", text: nome }] },
        ],
      },
    }),
  });
  if (!resp.ok) throw new Error(`WhatsApp ${resp.status}: ${await resp.text()}`);
}

Deno.serve(async (req) => {
  // só o cron (com o segredo) pode rodar
  const secret = req.headers.get("x-cron-secret") ?? "";
  if (!CRON_SECRET || !safeEqual(secret, CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // pega o lote de eventos pendentes de reativação
  const orFiltro = TIPOS_REATIVACAO.map((t) => `event_type.ilike.%${t}%`).join(",");
  const { data: eventos, error } = await sb
    .from("evo_eventos")
    .select("id, event_type, payload, tentativas")
    .eq("processado", false)
    .or(orFiltro)
    .order("recebido_em", { ascending: true })
    .limit(LOTE);

  if (error) return new Response(`Erro ao ler fila: ${error.message}`, { status: 500 });

  let enviados = 0, semContato = 0, erros = 0;

  for (const ev of eventos ?? []) {
    const payload = (ev.payload ?? {}) as Obj;
    const nome = primeiroNome(payload);
    let status = "enviado", erroMsg: string | null = null;
    try {
      if (CANAL === "whatsapp") {
        const tel = acharTelefone(payload);
        if (!tel) { status = "sem_contato"; semContato++; }
        else { await enviarWhatsapp(tel, nome); enviados++; }
      } else {
        const email = acharEmail(payload);
        if (!email) { status = "sem_contato"; semContato++; }
        else { await enviarEmail(email, nome); enviados++; }
      }
    } catch (e) {
      status = "erro"; erroMsg = String((e as Error).message ?? e); erros++;
    }

    await sb.from("evo_eventos").update({
      processado: status !== "erro",     // erro fica pendente p/ retry na próxima rodada
      status_envio: status,
      canal: CANAL,
      enviado_em: status === "enviado" ? new Date().toISOString() : null,
      erro: erroMsg,
      tentativas: ((ev as Obj).tentativas as number ?? 0) + 1,
    }).eq("id", ev.id);
  }

  return new Response(
    JSON.stringify({ ok: true, processados: eventos?.length ?? 0, enviados, semContato, erros }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});
