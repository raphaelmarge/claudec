// ============================================================
// Torque Fitness — sugestão de follow-up por IA (Claude)
// Edge Function do Supabase. Guarda a chave da Anthropic como
// segredo (ANTHROPIC_API_KEY); o site público nunca a vê.
//
// Deploy:   supabase functions deploy suggest-reply
// Segredo:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Modelo:   (opcional) supabase secrets set CLAUDE_MODEL=claude-sonnet-4-6
//
// A função exige JWT válido por padrão, então só usuários
// logados (vendedores) conseguem chamá-la.
// ============================================================

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "ANTHROPIC_API_KEY não configurada no Supabase." }, 500);

    const model = Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-4-6";
    const ctx = await req.json().catch(() => ({}));

    const itens = Array.isArray(ctx.itens)
      ? ctx.itens.map((i: { qtd?: number; nome?: string }) => `- ${i.qtd ?? ""}x ${i.nome ?? ""}`).join("\n")
      : "";
    const contexto = [
      ctx.cliente ? `Cliente: ${ctx.cliente}` : "",
      ctx.vendedor ? `Vendedor: ${ctx.vendedor}` : "",
      ctx.numero ? `Orçamento: ${ctx.numero}` : "",
      ctx.total ? `Total: ${ctx.total}` : "",
      ctx.etapa ? `Etapa no funil: ${ctx.etapa}` : "",
      itens ? `Itens:\n${itens}` : "",
      ctx.nota ? `Anotação interna do vendedor: ${ctx.nota}` : "",
      ctx.ultima ? `Última interação registrada: ${ctx.ultima}` : "",
      ctx.instrucao ? `Pedido específico do vendedor: ${ctx.instrucao}` : "",
    ].filter(Boolean).join("\n");

    const system = [
      "Você é um vendedor consultivo da Torque Fitness, que vende equipamentos de musculação para academias e estúdios.",
      "Escreva UMA mensagem curta de follow-up para enviar no WhatsApp, em português brasileiro.",
      "Tom cordial, profissional e próximo — sem ser insistente nem soar como robô.",
      "Use o primeiro nome do cliente. Não invente preços, descontos ou prazos que não estejam no contexto.",
      "Não use markdown nem títulos; no máximo um emoji. No máximo 3 frases curtas.",
      "Responda apenas com o texto da mensagem, sem aspas e sem explicações.",
    ].join(" ");

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system,
        messages: [
          { role: "user", content: `Contexto do orçamento:\n${contexto || "(sem detalhes)"}\n\nEscreva a mensagem de follow-up.` },
        ],
      }),
    });

    if (!r.ok) return json({ error: `Claude respondeu ${r.status}: ${await r.text()}` }, 502);
    const data = await r.json();
    const text = (data.content || []).map((b: { text?: string }) => b.text || "").join("").trim();
    return json({ text });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
