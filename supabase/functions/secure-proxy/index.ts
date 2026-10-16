// Edge Function: secure-proxy
// Centraliza chamadas sensíveis (OpenAI, Anthropic, Power Automate); as chaves nunca saem do servidor.
//
// 15/10/2026 (versão 3) — a partir da versão publicada (2), duas mudanças:
//  • removida a ação "pdf": mandava currículos a um extrator externo (api-extrator-pdf.onrender.com). A leitura
//    de currículos agora é feita pela função "curriculos" (a IA lê o arquivo direto); nenhuma tela usa mais "pdf".
//  • "gpt" e "claude" devolvem ok:false quando a IA responde com erro. Antes devolviam ok:true com texto vazio,
//    o que escondeu que a ANTHROPIC_API_KEY está inválida. O portal já tratava ok:false como resposta vazia.
// 16/10/2026 (versão 4): removidas as ações de banco denuncia_criar, denuncia_listar_rh, beneficios_usuario_get e
//    beneficios_usuario_upsert_rh. Nenhuma tela as usava e elas confiavam no papel ("rh") informado pelo navegador:
//    qualquer um poderia ler as denúncias ou alterar benefícios. Denúncias e benefícios agora usam funções do banco
//    que conferem o perfil (clima_* e ben_*).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const PA_WEBHOOK = Deno.env.get("POWER_AUTOMATE_WEBHOOK") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "JSON inválido." }, 400); }
  const { action } = body;

  try {
    if (action === "gpt") {
      const { msgs, sys } = body;
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + OPENAI_KEY },
        body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: sys ?? "Analista de RH Kalenborn. Responda em português." }, ...msgs], max_tokens: 1000 }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { console.error("OpenAI", r.status, d?.error?.message); return json({ ok: false, error: "IA indisponível (" + r.status + ")." }); }
      return json({ ok: true, text: d.choices?.[0]?.message?.content || "" });
    }

    if (action === "claude") {
      const { msgs, sys } = body;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, system: sys ?? "Assistente RH Kalenborn. Responda em português.", messages: msgs }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { console.error("Anthropic", r.status, d?.error?.message); return json({ ok: false, error: "IA indisponível (" + r.status + ")." }); }
      return json({ ok: true, text: d.content?.[0]?.text || "" });
    }

    if (action === "email") {
      const { to, subject, body: emailBody } = body;
      if (!to) return json({ ok: false, error: "Destinatário vazio." });
      if (!PA_WEBHOOK) return json({ ok: false, error: "Webhook não configurado no servidor." });
      const r = await fetch(PA_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, body: emailBody }) });
      if (!r.ok) { const txt = await r.text().catch(() => ""); return json({ ok: false, error: `Power Automate respondeu ${r.status}.` + (txt ? " " + txt.substring(0, 200) : "") }); }
      return json({ ok: true });
    }

    return json({ ok: false, error: "Ação desconhecida: " + action }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: "Erro interno: " + (e as Error).message }, 500);
  }
});
