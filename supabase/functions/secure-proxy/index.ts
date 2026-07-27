// Edge Function: secure-proxy
// Centraliza chamadas sensíveis (OpenAI, PDF extractor, Power Automate) e acesso
// às tabelas restritas (clima_denuncias, movimentacoes, beneficios_usuarios,
// beneficios_solicitacoes) usando a service_role key, que nunca sai do servidor.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const PDF_API = Deno.env.get("PDF_EXTRACTOR_URL") ?? "https://api-extrator-pdf.onrender.com/extrair";
const PA_WEBHOOK = Deno.env.get("POWER_AUTOMATE_WEBHOOK") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(SB_URL, SB_SERVICE_KEY);

// "dev" tem o mesmo nível de acesso que "rh" nas ações administrativas desta function.
const isRHouDev = (role: string) => role === "rh" || role === "dev";

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
      const d = await r.json();
      return json({ ok: true, text: d.choices?.[0]?.message?.content || "" });
    }

    if (action === "claude") {
      const { msgs, sys } = body;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, system: sys ?? "Assistente RH Kalenborn. Responda em português.", messages: msgs }),
      });
      const d = await r.json();
      return json({ ok: true, text: d.content?.[0]?.text || "" });
    }

    if (action === "pdf") {
      const { fileBase64, fileName } = body;
      const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
      const fd = new FormData();
      const file = new File([bytes], fileName || "arquivo.pdf", { type: "application/pdf" });
      fd.append("file", file);
      fd.append("arquivo", file);
      const r = await fetch(PDF_API, { method: "POST", body: fd });
      const txt = await r.text();
      try { const d = JSON.parse(txt); return json({ ok: true, text: d.text || d.texto || d.conteudo || d.content || "" }); }
      catch { return json({ ok: true, text: txt }); }
    }

    if (action === "email") {
      const { to, subject, body: emailBody } = body;
      if (!to) return json({ ok: false, error: "Destinatário vazio." });
      if (!PA_WEBHOOK) return json({ ok: false, error: "Webhook não configurado no servidor." });
      const r = await fetch(PA_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, body: emailBody }) });
      if (!r.ok) { const txt = await r.text().catch(() => ""); return json({ ok: false, error: `Power Automate respondeu ${r.status}.` + (txt ? " " + txt.substring(0, 200) : "") }); }
      return json({ ok: true });
    }

    // ── Ações de banco para tabelas restritas (sem policy anon) ──
    // Regra simples: quem chama precisa mandar o papel do usuário logado (role) já validado
    // pelo próprio app no momento do login. Ideal a médio prazo: usar Supabase Auth de verdade
    // para não depender do frontend afirmar "eu sou RH/dev".
    if (action === "denuncia_criar") {
      const { payload } = body; // denúncia é sempre permitida criar, ninguém lê de volta aqui
      const { data, error } = await admin.from("clima_denuncias").insert([payload]).select().single();
      if (error) return json({ ok: false, error: error.message });
      return json({ ok: true, data });
    }

    if (action === "denuncia_listar_rh") {
      const { callerRole } = body;
      if (!isRHouDev(callerRole)) return json({ ok: false, error: "Apenas RH pode listar denúncias." }, 403);
      const { data, error } = await admin.from("clima_denuncias").select("*").order("created_at", { ascending: false });
      if (error) return json({ ok: false, error: error.message });
      return json({ ok: true, data });
    }

    if (action === "beneficios_usuario_get") {
      const { userId } = body;
      const { data, error } = await admin.from("beneficios_usuarios").select("*").eq("user_id", userId);
      if (error) return json({ ok: false, error: error.message });
      return json({ ok: true, data });
    }

    if (action === "beneficios_usuario_upsert_rh") {
      const { callerRole, payload } = body;
      if (!isRHouDev(callerRole)) return json({ ok: false, error: "Apenas RH pode alterar benefícios de usuários." }, 403);
      const { data, error } = await admin.from("beneficios_usuarios").upsert(payload).select();
      if (error) return json({ ok: false, error: error.message });
      return json({ ok: true, data });
    }

    return json({ ok: false, error: "Ação desconhecida: " + action }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: "Erro interno: " + (e as Error).message }, 500);
  }
});
