// Captura de currículos — mesmo processamento para as duas entradas (decisão do Asael, 15/10/2026):
//   • Portal (aba Upload de CVs, arrastar e soltar): body.pedido_por = id do usuário (precisa ser RH/dev).
//   • Power Automate (e-mail do RH): cabeçalho "x-segredo" = chave da integração (tela Configurações).
// Faz: guarda o arquivo original (armazenamento privado "curriculos") → a IA (gpt-4o) lê o PDF/foto direto ou o
// texto do Word → extrai os dados (só o que está no currículo) e uma SUGESTÃO de avaliação → grava/atualiza o
// candidato (status 'pendente' em novo; quem decide é o RH; duplicado = mesmo e-mail ou telefone).
// Ação "url": link temporário (10 min) para o RH abrir o currículo original.
// simular: true → faz a leitura e a análise, mas não guarda o arquivo nem grava o candidato (para testes).
import { createClient } from "npm:@supabase/supabase-js@2";
import { TIPOS, tipoPorNome, textoDocx, instrucao, lerJsonIA, paraCandidato, acharDuplicado } from "./extrair.js";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// IA: OpenAI gpt-4o (a chave que funciona no projeto; testado em 15/10/2026 — a ANTHROPIC_API_KEY está inválida).
// O gpt-4o lê PDF direto (inclusive escaneado, porque vê as páginas como imagem) e fotos.
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODELO = "gpt-4o";
const LIMITE = 10 * 1024 * 1024;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-segredo", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);
  const admin = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "Corpo inválido." }, 400); }

  // ── Autenticação: chave do Power Automate OU usuário RH do portal
  let origem = "upload";
  const segredo = req.headers.get("x-segredo");
  if (segredo) {
    const { data: ok } = await admin.rpc("curriculos_segredo_ok", { p_segredo: segredo });
    if (ok !== true) return json({ ok: false, error: "Chave inválida." }, 401);
    origem = "email";
  } else {
    const { data: u } = await admin.from("usuarios").select("role,status").eq("id", Number(body.pedido_por) || 0).maybeSingle();
    if (!u || !["rh", "dev"].includes(u.role) || (u.status ?? "ativo") !== "ativo") return json({ ok: false, error: "Acesso permitido apenas para RH." }, 403);
  }

  // ── Link temporário para abrir o currículo original
  if (body.acao === "url") {
    const { data: c } = await admin.from("candidatos").select("arquivo_path").eq("id", Number(body.candidato_id) || 0).maybeSingle();
    if (!c?.arquivo_path) return json({ ok: false, error: "Este candidato não tem arquivo guardado." }, 404);
    const { data, error } = await admin.storage.from("curriculos").createSignedUrl(c.arquivo_path, 600);
    return error ? json({ ok: false, error: error.message }, 500) : json({ ok: true, url: data.signedUrl });
  }

  // ── Testes: em simulação, pode ler um currículo FICTÍCIO da pasta testes/curriculos do repositório (e só de lá).
  const PASTA_TESTES = "https://raw.githubusercontent.com/asaelpierce/Portal-de-RH/main/testes/curriculos/";
  if (body.arquivo_url) {
    if (body.simular !== true || !String(body.arquivo_url).startsWith(PASTA_TESTES) || String(body.arquivo_url).includes(".."))
      return json({ ok: false, error: "arquivo_url só é aceito em simulação e da pasta de testes." }, 400);
    const rf = await fetch(body.arquivo_url);
    if (!rf.ok) return json({ ok: false, error: "Arquivo de teste não encontrado (" + rf.status + ")." }, 400);
    const buf = new Uint8Array(await rf.arrayBuffer()); let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    body.arquivo_base64 = btoa(bin); body.nome_arquivo = body.nome_arquivo || String(body.arquivo_url).split("/").pop();
  }

  // ── Análise de um arquivo
  const nomeArquivo = String(body.nome_arquivo || "curriculo").slice(0, 150);
  const mime = TIPOS[body.mime] ? body.mime : tipoPorNome(nomeArquivo);
  if (!TIPOS[mime]) return json({ ok: false, error: nomeArquivo.toLowerCase().endsWith(".doc") ? "Word antigo (.doc) não é aceito: salve como .docx ou PDF." : "Formato não aceito. Envie PDF, Word (.docx) ou foto (JPG/PNG)." }, 400);
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(String(body.arquivo_base64 || "")), (ch) => ch.charCodeAt(0)); } catch { return json({ ok: false, error: "Arquivo inválido." }, 400); }
  if (!bytes.length) return json({ ok: false, error: "Arquivo vazio." }, 400);
  if (bytes.length > LIMITE) return json({ ok: false, error: "Arquivo maior que 10 MB." }, 400);
  // E-mail: imagens pequenas são logotipos/assinaturas, não currículos — ignora sem gastar chamada de IA.
  // (Foto real de currículo tirada no celular passa de 100 KB; no portal o RH escolhe o arquivo, então não se aplica.)
  if (origem === "email" && TIPOS[mime] === "imagem" && bytes.length < 30 * 1024)
    return json({ ok: false, ignorado: true, error: "Imagem pequena (provável assinatura de e-mail): ignorada." }, 200);

  // Vagas abertas (para a sugestão de vaga)
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { data: vagasDb } = await admin.from("vagas").select("id,title,area,descricao,ativa,prazo_encerramento");
  const vagas = (vagasDb ?? []).filter((v: any) => v.ativa && (!v.prazo_encerramento || v.prazo_encerramento >= hoje));
  const vagaFixa = body.vaga_id ? vagas.find((v: any) => String(v.id) === String(body.vaga_id)) : null;

  // Conteúdo para a IA: PDF e foto vão direto (a IA lê inclusive currículo escaneado); Word vira texto.
  const tipo = TIPOS[mime];
  let doc: any;
  if (tipo === "pdf") doc = { type: "file", file: { filename: nomeArquivo.replace(/[^\w.\-]+/g, "_") || "curriculo.pdf", file_data: "data:application/pdf;base64," + body.arquivo_base64 } };
  else if (tipo === "imagem") doc = { type: "image_url", image_url: { url: `data:${mime};base64,${body.arquivo_base64}` } };
  else {
    let txt = ""; try { txt = textoDocx(bytes); } catch { return json({ ok: false, error: "Não foi possível ler o arquivo Word." }, 400); }
    if (txt.trim().length < 30) return json({ ok: false, error: "O arquivo Word não tem texto suficiente." }, 400);
    doc = { type: "text", text: "CURRÍCULO (texto extraído do Word):\n" + txt.slice(0, 20000) };
  }
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + OPENAI_KEY },
    body: JSON.stringify({ model: MODELO, temperature: 0, max_tokens: 2000, response_format: { type: "json_object" },
      messages: [{ role: "user", content: [doc, { type: "text", text: instrucao(vagas, vagaFixa) }] }] }),
  });
  const resp = await r.json().catch(() => null);
  // Erro da IA aparece como erro (a função antiga devolvia "sucesso" com texto vazio e escondia a falha).
  if (!r.ok) return json({ ok: false, error: "A IA não respondeu (" + r.status + (resp?.error?.message ? ": " + String(resp.error.message).slice(0, 160) : "") + "). Tente de novo." }, 502);
  const ia = lerJsonIA(resp?.choices?.[0]?.message?.content ?? "");
  if (!ia) return json({ ok: false, error: "A IA não devolveu uma análise válida. Envie o arquivo de novo." }, 502);
  if (ia.legivel === false) return json({ ok: false, error: "Não parece um currículo legível" + (ia.motivo ? ": " + String(ia.motivo).slice(0, 200) : ".") }, 422);

  const dados = paraCandidato(ia, { nomeArquivo, vagasIds: vagas.map((v: any) => String(v.id)), vagaFixaId: vagaFixa?.id });
  const vaga = vagas.find((v: any) => String(v.id) === dados.vaga_id);
  // Simulação (testes): devolve o que seria gravado, sem guardar arquivo nem mexer no banco.
  if (body.simular === true) return json({ ok: true, simulacao: true, candidato: { ...dados, role: vaga?.title || dados.area_sugerida || "A definir" } });

  // Guarda o arquivo original
  const caminho = `${hoje.slice(0, 7)}/${crypto.randomUUID()}-${nomeArquivo.replace(/[^\w.\-]+/g, "_")}`;
  const up = await admin.storage.from("curriculos").upload(caminho, bytes, { contentType: mime, upsert: false });
  if (up.error) return json({ ok: false, error: "Não foi possível guardar o arquivo: " + up.error.message }, 500);

  // Duplicado (mesmo e-mail ou telefone) → atualiza; senão cria como 'pendente'
  const { data: existentes } = await admin.from("candidatos").select("id,email,phone,status,vaga_id");
  const dup = acharDuplicado(existentes ?? [], dados);
  const { analise_ia, sugestao_ia, ...campos } = dados;
  const linha = { ...campos, role: vaga?.title || dados.area_sugerida || "A definir", analise_ia, sugestao_ia,
                  arquivo_path: caminho, arquivo_nome: nomeArquivo, origem, atualizado_em: new Date().toISOString() };
  delete (linha as any).area_sugerida;
  let gravado;
  if (dup) {
    if (!linha.vaga_id) linha.vaga_id = dup.vaga_id;                          // não perde a vaga já escolhida
    const { data, error } = await admin.from("candidatos").update(linha).eq("id", dup.id).select().single();
    if (error) return json({ ok: false, error: error.message }, 500);
    gravado = data;
  } else {
    const { data, error } = await admin.from("candidatos").insert([{ ...linha, status: "pendente", area_sugerida: dados.area_sugerida }]).select().single();
    if (error) return json({ ok: false, error: error.message }, 500);
    gravado = data;
  }
  return json({ ok: true, duplicado: !!dup, candidato: gravado });
});
