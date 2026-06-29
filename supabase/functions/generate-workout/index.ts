// ============================================================
// Torque Fitness — montar série de treino por IA (Claude)
// Edge Function do Supabase. Guarda a chave da Anthropic como
// segredo (ANTHROPIC_API_KEY); o app público nunca a vê.
//
// Deploy:   supabase functions deploy generate-workout --no-verify-jwt
//           (--no-verify-jwt porque o app de treino é autoatendimento,
//            aberto a qualquer aluno, sem login.)
// Segredo:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Modelo:   (opcional) supabase secrets set CLAUDE_MODEL=claude-sonnet-4-6
//
// Recebe um questionário (objetivo, nível, dias, equipamentos…) e
// devolve uma série estruturada em JSON, montada por Claude via tool
// use (saída garantidamente no formato esperado).
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

// Esquema da série que o Claude precisa preencher.
const WORKOUT_TOOL = {
  name: "montar_treino",
  description:
    "Monta uma série de treino de academia estruturada a partir do perfil do aluno.",
  input_schema: {
    type: "object",
    properties: {
      titulo: { type: "string", description: "Título curto da série, ex: 'Treino ABC de Hipertrofia'." },
      resumo: { type: "string", description: "1 a 2 frases explicando a lógica da série para o aluno." },
      divisao: { type: "string", description: "Tipo de divisão, ex: 'Full body', 'AB', 'ABC', 'ABCD'." },
      aquecimento: { type: "string", description: "Orientação curta de aquecimento antes de cada treino." },
      dias: {
        type: "array",
        description: "Os dias/treinos da série (um item por dia de treino).",
        items: {
          type: "object",
          properties: {
            nome: { type: "string", description: "Ex: 'Treino A — Peito e Tríceps'." },
            foco: { type: "string", description: "Grupos musculares trabalhados nesse dia." },
            exercicios: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nome: { type: "string" },
                  series: { type: "integer", description: "Número de séries." },
                  repeticoes: { type: "string", description: "Faixa de repetições, ex: '8-12'." },
                  descanso: { type: "string", description: "Descanso entre séries, ex: '60-90s'." },
                  obs: { type: "string", description: "Dica curta de execução (opcional)." },
                },
                required: ["nome", "series", "repeticoes", "descanso"],
              },
            },
          },
          required: ["nome", "foco", "exercicios"],
        },
      },
      progressao: { type: "string", description: "Como evoluir cargas/repetições ao longo das semanas." },
      avisos: { type: "string", description: "Avisos de segurança e quando procurar um profissional." },
    },
    required: ["titulo", "resumo", "divisao", "dias", "progressao", "avisos"],
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "ANTHROPIC_API_KEY não configurada no Supabase." }, 500);

    const model = Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-4-6";
    const q = await req.json().catch(() => ({}));

    const perfil = [
      q.objetivo ? `Objetivo: ${q.objetivo}` : "",
      q.nivel ? `Nível de experiência: ${q.nivel}` : "",
      q.dias ? `Dias disponíveis por semana: ${q.dias}` : "",
      q.tempo ? `Tempo por treino: ${q.tempo}` : "",
      q.local ? `Local / equipamentos: ${q.local}` : "",
      q.foco ? `Ênfase desejada: ${q.foco}` : "",
      q.sexo ? `Sexo: ${q.sexo}` : "",
      q.idade ? `Idade: ${q.idade}` : "",
      q.limitacoes ? `Limitações / lesões / dores: ${q.limitacoes}` : "",
      q.observacoes ? `Observações do aluno: ${q.observacoes}` : "",
    ].filter(Boolean).join("\n");

    const system = [
      "Você é um educador físico experiente, montando uma série de treino de academia para um aluno que pediu por conta própria.",
      "Monte uma divisão coerente com os dias disponíveis (1 dia = full body; 2 = AB; 3 = ABC; 4+ = ABCD…).",
      "Escolha exercícios compatíveis com o local e os equipamentos informados. Respeite quaisquer limitações/lesões evitando exercícios contraindicados.",
      "Ajuste volume, séries e repetições ao nível e ao objetivo (hipertrofia, força, emagrecimento, condicionamento ou saúde).",
      "Seja realista quanto ao tempo por treino. Use nomes de exercícios em português do Brasil.",
      "No campo 'avisos', deixe claro que isto é uma sugestão educativa, não substitui avaliação física/médica, e que dor ou desconforto pedem orientação de um profissional.",
      "Preencha SEMPRE a ferramenta montar_treino com a série completa.",
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
        max_tokens: 2000,
        system,
        tools: [WORKOUT_TOOL],
        tool_choice: { type: "tool", name: "montar_treino" },
        messages: [
          {
            role: "user",
            content: `Perfil do aluno:\n${perfil || "(sem detalhes — monte uma série geral de corpo inteiro para iniciante)"}\n\nMonte a série de treino.`,
          },
        ],
      }),
    });

    if (!r.ok) return json({ error: `Claude respondeu ${r.status}: ${await r.text()}` }, 502);
    const data = await r.json();
    const block = (data.content || []).find(
      (b: { type?: string; name?: string }) => b.type === "tool_use" && b.name === "montar_treino",
    );
    if (!block || !block.input) return json({ error: "A IA não retornou uma série válida." }, 502);

    return json({ treino: block.input });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
