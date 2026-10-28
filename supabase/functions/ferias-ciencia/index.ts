// Edge Function: ferias-ciencia (28/10/2026)
// Link de ciência das férias para o colaborador (ideia do Asael): o colaborador não precisa entrar no portal — recebe
// por e-mail um link individual que mostra as férias dele e tem "Estou ciente". Para quem não tem e-mail, o portal
// mostra o link para o líder copiar e mandar (ex.: WhatsApp).
//
// Segurança:
//  • exige a SESSÃO; a permissão é conferida no banco (ferias_ciencia_link): RH, quem lançou, líder ou gestor do
//    colaborador. A função chama o banco COMO quem pede (token da sessão), não como administrador.
//  • o destinatário é SEMPRE o e-mail do cadastro do colaborador (vem do banco, não do navegador): ninguém consegue
//    usar esta função para mandar e-mail a outro endereço.
//  • o código do link fica numa tabela fechada ao navegador (ferias_ciencia_links).
//
// Corpo: { ferias_id: number, enviar?: boolean }  →  { ok, link, enviado, sem_email, para }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PA_WEBHOOK = Deno.env.get("POWER_AUTOMATE_WEBHOOK") ?? "";
const PORTAL = Deno.env.get("PORTAL_URL") ?? "https://portal-de-rh.vercel.app";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const br = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
// e-mail mascarado para mostrar na tela (ex.: jo***@kalenborn.com.br)
const mascara = (e: string) => { const [u, d] = String(e).split("@"); return d ? `${u.slice(0, 2)}***@${d}` : ""; };

function emailHtml(nome: string, inicio: string, fim: string, dias: number, periodo: string, link: string) {
  const primeiro = esc(String(nome).split(" ")[0]);
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
<p>Olá, ${primeiro}!</p>
<p>Suas férias foram programadas:</p>
<p style="font-size:16px"><b>${esc(br(inicio))} a ${esc(br(fim))}</b> — ${dias} dias${periodo ? `<br><span style="color:#666;font-size:13px">Período aquisitivo: ${esc(periodo)}</span>` : ""}</p>
<p>Abra o link abaixo para ver os detalhes e confirmar que você está ciente. Você pode usar o mesmo link para consultar suas férias depois.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#0b6bcb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Ver minhas férias e confirmar</a></p>
<p style="color:#666;font-size:12px">Se o botão não abrir, copie este endereço no navegador:<br>${esc(link)}</p>
<p style="color:#666;font-size:12px">RH Kalenborn</p></div>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "JSON inválido." }, 400); }
  const ferias_id = Number(body?.ferias_id);
  if (!Number.isInteger(ferias_id) || ferias_id <= 0) return json({ ok: false, error: "Férias inválidas." }, 400);
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) return json({ ok: false, error: "Entre no portal para usar este recurso." }, 401);

  // Banco chamado COMO quem pede (a permissão é conferida lá).
  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  try {
    const { data: l, error } = await sb.rpc("ferias_ciencia_link", { p_pedido_por: 0, p_ferias_id: ferias_id, p_registrar_envio: false });
    if (error || !l) return json({ ok: false, error: error?.message || "Não foi possível gerar o link." }, 403);
    const link = `${PORTAL}/?ciencia=${l.token}`;
    if (!body?.enviar) return json({ ok: true, link, enviado: false, sem_email: !l.email });
    if (!l.email) return json({ ok: true, link, enviado: false, sem_email: true });
    if (!PA_WEBHOOK) return json({ ok: false, link, error: "Envio de e-mail não configurado no servidor." });
    const r = await fetch(PA_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: l.email, subject: `Suas férias: ${br(l.inicio)} a ${br(l.fim)} — confirme que está ciente`,
        body: emailHtml(l.nome, l.inicio, l.fim, l.dias, l.periodo_aquisitivo, link) }) });
    if (!r.ok) return json({ ok: false, link, error: `O e-mail não foi enviado (Power Automate respondeu ${r.status}).` });
    await sb.rpc("ferias_ciencia_link", { p_pedido_por: 0, p_ferias_id: ferias_id, p_registrar_envio: true });
    return json({ ok: true, link, enviado: true, para: mascara(l.email) });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: "Erro interno." }, 500);
  }
});
