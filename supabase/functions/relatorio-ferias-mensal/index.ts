// Relatório mensal de saldo de férias — RH + cada líder (só a equipe dele).
// Disparado pelo pg_cron no dia 1º às 8h (Brasília). A montagem dos e-mails fica em montar.js (testada à parte).
//
// Segurança: a função só roda com o cabeçalho x-segredo igual ao segredo guardado em private.config
// (esquema não exposto pela API). O agendamento lê o segredo direto do banco; ninguém precisa conhecê-lo.
//
// Corpo da requisição:
//   { "modo": "previa" }                         → só monta, não envia (padrão)
//   { "modo": "teste", "para_teste": "x@y" }     → envia a visão geral + 1 exemplo de líder SÓ para x@y, com [TESTE]
//   { "modo": "envio" }                          → envia para todos os destinatários
import { createClient } from "npm:@supabase/supabase-js@2";
import { montarRelatorios } from "./montar.js";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PA_WEBHOOK = Deno.env.get("POWER_AUTOMATE_WEBHOOK") ?? "";  // mesmo canal de e-mail da secure-proxy

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
// "Hoje" no fuso de Brasília, em YYYY-MM-DD (o servidor roda em UTC).
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);
  const admin = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

  const { data: cfg, error: eCfg } = await admin.rpc("relatorio_ferias_config", { p_segredo: req.headers.get("x-segredo") ?? "" });
  if (eCfg) return json({ ok: false, error: "Não autorizado." }, 401);
  const rhIds: number[] = (Array.isArray(cfg) ? cfg[0] : cfg)?.rh_ids ?? [];

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* corpo vazio = prévia */ }
  const modo = String(body.modo ?? "previa");
  if (!["previa", "teste", "envio"].includes(modo)) return json({ ok: false, error: "Modo inválido." }, 400);

  const { data: imp } = await admin.from("ferias_importacoes").select("*").order("id", { ascending: false }).limit(1).maybeSingle();
  const { data: saldos, error: eS } = imp ? await admin.from("ferias_saldos").select("*").eq("importacao_id", imp.id) : { data: [], error: null };
  const { data: usuarios, error: eU } = await admin.from("usuarios").select("id,name,email,status,cadastro,lider_id,role");
  if (eS || eU) return json({ ok: false, error: (eS ?? eU)!.message }, 500);

  const destinatariosRH = (usuarios ?? [])
    .filter((u) => rhIds.includes(u.id) && (u.status ?? "ativo") === "ativo" && u.email)
    .map((u) => ({ email: u.email, name: u.name }));
  const { emails, resumo } = montarRelatorios({ imp, saldos: saldos ?? [], usuarios: usuarios ?? [], hoje: hojeSP(), destinatariosRH });

  if (modo === "previa") {
    return json({ ok: true, modo, hoje: hojeSP(), resumo,
      emails: emails.map((e) => ({ para: e.para, tipo: e.tipo, nome: e.nome, assunto: e.assunto, urgentes: e.urgentes ?? null, caracteres: e.corpo.length, corpo: body.com_corpo ? e.corpo : undefined })) });
  }

  let fila = emails;
  if (modo === "teste") {
    const alvo = String(body.para_teste ?? "");
    if (!alvo.includes("@")) return json({ ok: false, error: "Informe para_teste." }, 400);
    // Um exemplo de líder: de preferência um com alerta de prazo, para ver o bloco de urgência.
    const exemploLider = emails.find((e) => e.tipo === "lider" && (e.urgentes ?? 0) > 0) ?? emails.find((e) => e.tipo === "lider");
    fila = [emails.find((e) => e.tipo === "rh"), exemploLider].filter(Boolean).map((e) => ({
      ...e!, para: alvo, assunto: "[TESTE] " + e!.assunto,
      corpo: `[TESTE — no envio real, este e-mail iria para: ${e!.nome}]\n\n` + e!.corpo,
    }));
  }
  if (!PA_WEBHOOK) return json({ ok: false, error: "POWER_AUTOMATE_WEBHOOK não configurado." }, 500);

  const resultados: { para: string | null; ok: boolean; status?: number; erro?: string }[] = [];
  for (const e of fila) {
    if (!e.para) { resultados.push({ para: null, ok: false, erro: `${e.nome} sem e-mail cadastrado` }); continue; }
    try {
      const r = await fetch(PA_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: e.para, subject: e.assunto, body: e.corpo }) });
      resultados.push({ para: e.para, ok: r.ok, status: r.status });
    } catch (err) { resultados.push({ para: e.para, ok: false, erro: String(err) }); }
    await new Promise((r) => setTimeout(r, 800)); // não sobrecarregar o Power Automate
  }
  const falhas = resultados.filter((r) => !r.ok).length;
  await admin.from("relatorio_ferias_envios").insert({ modo, total: fila.length, enviados: fila.length - falhas, falhas, detalhes: { resumo, resultados } });
  return json({ ok: falhas === 0, modo, total: fila.length, falhas, resultados });
});
