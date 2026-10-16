// Captura de currículos — mesmo processamento para as duas entradas (decisão do Asael, 15/10/2026):
//   • Portal (aba Upload de CVs, arrastar e soltar): token da sessão do login do Supabase (precisa ser RH/dev).
//   • Power Automate (e-mail do RH): cabeçalho "x-segredo" = chave da integração (tela Configurações).
//   • Portal público do candidato (K.Carreiras): acao "candidatura", sem login (vaga ativa, LGPD, limites de envio).
// Faz: guarda o arquivo original (armazenamento privado "curriculos") → a IA (gpt-4o) lê o PDF/foto direto ou o
// texto do Word → extrai os dados (só o que está no currículo) e uma SUGESTÃO de avaliação → grava/atualiza o
// candidato (status 'pendente' em novo; quem decide é o RH; duplicado = mesmo e-mail ou telefone).
// Ação "url": link temporário (10 min) para o RH abrir o currículo original.
// simular: true → faz a leitura e a análise, mas não guarda o arquivo nem grava o candidato (para testes).
import { createClient } from "npm:@supabase/supabase-js@2";
import { TIPOS, tipoPorNome, textoDocx, instrucao, lerJsonIA, paraCandidato, acharDuplicado, normalizarEmail, normalizarTelefone } from "./extrair.js";

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

  // ── Candidatura pelo portal público (K.Carreiras), sem login. Regras: vaga ativa, consentimento LGPD,
  //    dados mínimos válidos, limite de envios; o candidato recebe só a confirmação (nunca nota/análise).
  let publico: any = null;
  const segredo = req.headers.get("x-segredo");
  if (body.acao === "candidatura") {
    // Simulação no portal público só com a chave da integração (testes); senão alguém usaria a IA de graça sem limite.
    const testeAutorizado = segredo ? (await admin.rpc("curriculos_segredo_ok", { p_segredo: segredo })).data === true : false;
    if (!testeAutorizado) { body.simular = false; delete body.arquivo_url; }
    const nome = String(body.nome ?? "").trim().slice(0, 120), email = normalizarEmail(body.email), tel = normalizarTelefone(body.telefone);
    if (body.consentimento !== true) return json({ ok: false, error: "É preciso concordar com o uso dos seus dados para participar do processo seletivo." }, 400);
    if (nome.length < 5 || !nome.includes(" ")) return json({ ok: false, error: "Informe seu nome completo." }, 400);
    if (!email) return json({ ok: false, error: "Informe um e-mail válido." }, 400);
    if (!tel) return json({ ok: false, error: "Informe um telefone válido com DDD." }, 400);
    const respostas = (Array.isArray(body.respostas) ? body.respostas : []).slice(0, 6).map((r: unknown) => String(r ?? "").slice(0, 2000));
    const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const { data: vg } = await admin.from("vagas").select("id,title,ativa,prazo_encerramento").eq("id", String(body.vaga_id ?? "")).maybeSingle();
    if (!vg || !vg.ativa || (vg.prazo_encerramento && vg.prazo_encerramento < hojeSP)) return json({ ok: false, error: "Esta vaga não está mais aberta." }, 400);
    // Limites contra abuso: a mesma pessoa no máximo 1 envio a cada 10 minutos; o portal todo, 60 por hora.
    const desde10 = new Date(Date.now() - 10 * 60e3).toISOString(), desde60 = new Date(Date.now() - 60 * 60e3).toISOString();
    const { count: recente } = await admin.from("candidatos").select("id", { count: "exact", head: true }).eq("email", email).gte("atualizado_em", desde10);
    if ((recente ?? 0) > 0) return json({ ok: false, error: "Recebemos sua candidatura há poucos minutos. Aguarde um pouco antes de enviar de novo." }, 429);
    const { count: hora } = await admin.from("candidatos").select("id", { count: "exact", head: true }).eq("origem", "portal_candidato").gte("atualizado_em", desde60);
    if ((hora ?? 0) >= 60) return json({ ok: false, error: "Muitas candidaturas agora. Tente de novo em alguns minutos." }, 429);
    publico = { nome, email, tel, respostas, vaga_id: String(vg.id), pcd: body.pcd === true, salario: String(body.salario_pret ?? "").slice(0, 60) };
    body.vaga_id = vg.id;
  }

  // ── Autenticação: candidatura pública (acima), chave do Power Automate OU usuário RH do portal
  let origem = publico ? "portal_candidato" : "upload";
  if (publico) {
    // já validado acima
  } else if (segredo) {
    const { data: ok } = await admin.rpc("curriculos_segredo_ok", { p_segredo: segredo });
    if (ok !== true) return json({ ok: false, error: "Chave inválida." }, 401);
    origem = "email";
  } else {
    // RH do portal: identidade pelo TOKEN DA SESSÃO do login do Supabase (16/10/2026, etapa 3). Antes valia o número
    // "pedido_por" enviado pelo navegador — dava para se passar por RH.
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: au } = token ? await admin.auth.getUser(token) : { data: null };
    const authId = au?.user?.id;
    const { data: u } = authId ? await admin.from("usuarios").select("role,status").eq("auth_id", authId).maybeSingle() : { data: null };
    if (!u || !["rh", "dev"].includes(u.role) || (u.status ?? "ativo") !== "ativo") return json({ ok: false, error: "Acesso permitido apenas para RH (entre de novo no portal)." }, 403);
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
  const semArquivo = !!publico && !body.arquivo_base64;           // no portal público o currículo é opcional
  if (!semArquivo && !TIPOS[mime]) return json({ ok: false, error: nomeArquivo.toLowerCase().endsWith(".doc") ? "Word antigo (.doc) não é aceito: salve como .docx ou PDF." : "Formato não aceito. Envie PDF, Word (.docx) ou foto (JPG/PNG)." }, 400);
  let bytes = new Uint8Array();
  if (!semArquivo) {
    try { bytes = Uint8Array.from(atob(String(body.arquivo_base64 || "")), (ch) => ch.charCodeAt(0)); } catch { return json({ ok: false, error: "Arquivo inválido." }, 400); }
    if (!bytes.length) return json({ ok: false, error: "Arquivo vazio." }, 400);
    if (bytes.length > LIMITE) return json({ ok: false, error: "Arquivo maior que 10 MB." }, 400);
  }
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
  const tipo = semArquivo ? "nenhum" : TIPOS[mime];
  let doc: any;
  if (tipo === "nenhum") doc = { type: "text", text: "O candidato não anexou currículo." };
  else if (tipo === "pdf") doc = { type: "file", file: { filename: nomeArquivo.replace(/[^\w.\-]+/g, "_") || "curriculo.pdf", file_data: "data:application/pdf;base64," + body.arquivo_base64 } };
  else if (tipo === "imagem") doc = { type: "image_url", image_url: { url: `data:${mime};base64,${body.arquivo_base64}` } };
  else {
    let txt = ""; try { txt = textoDocx(bytes); } catch { return json({ ok: false, error: "Não foi possível ler o arquivo Word." }, 400); }
    if (txt.trim().length < 30) return json({ ok: false, error: "O arquivo Word não tem texto suficiente." }, 400);
    doc = { type: "text", text: "CURRÍCULO (texto extraído do Word):\n" + txt.slice(0, 20000) };
  }
  // Falha de rede não pode derrubar a função (na candidatura pública, a candidatura seria perdida).
  const r: Response | null = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + OPENAI_KEY },
    body: JSON.stringify({ model: MODELO, temperature: 0, max_tokens: 2000, response_format: { type: "json_object" },
      messages: [{ role: "user", content: [doc, { type: "text", text: instrucao(vagas, vagaFixa,
        publico?.respostas?.some((x: string) => x.trim()) ? publico.respostas.map((x: string, i: number) => `${i + 1}. ${x || "(sem resposta)"}`).join("\n") : null, semArquivo) }] }] }),
  }).catch((e) => { console.error("Falha de rede com a IA:", e); return null; });
  const resp = r ? await r.json().catch(() => null) : null;
  let ia = r?.ok ? lerJsonIA(resp?.choices?.[0]?.message?.content ?? "") : null;
  if (publico && (!ia || ia.legivel === false)) {
    // Candidatura pública NUNCA se perde por falha da IA: grava sem nota, para o RH avaliar manualmente.
    console.error("IA indisponível na candidatura pública:", r?.status ?? "rede", resp?.error?.message ?? "");
    ia = { legivel: true, candidato: {}, avaliacao: { score: null, tech: null, behavior: null, sugestao: "revisao",
           resumo: "Análise automática indisponível — avaliar manualmente." } };
  }
  // Erro da IA aparece como erro (a função antiga devolvia "sucesso" com texto vazio e escondia a falha).
  if (!r?.ok && !publico) return json({ ok: false, error: "A IA não respondeu (" + (r?.status ?? "sem conexão") + (resp?.error?.message ? ": " + String(resp.error.message).slice(0, 160) : "") + "). Tente de novo." }, 502);
  if (!ia) return json({ ok: false, error: "A IA não devolveu uma análise válida. Envie o arquivo de novo." }, 502);
  if (ia.legivel === false) return json({ ok: false, error: "Não parece um currículo legível" + (ia.motivo ? ": " + String(ia.motivo).slice(0, 200) : ".") }, 422);

  const dados: any = paraCandidato(ia, { nomeArquivo, vagasIds: vagas.map((v: any) => String(v.id)), vagaFixaId: vagaFixa?.id });
  if (publico) {   // no portal público valem os dados que o próprio candidato digitou
    Object.assign(dados, { name: publico.nome, email: publico.email, phone: publico.tel, vaga_id: publico.vaga_id, pcd: publico.pcd,
      salario_pret: publico.salario || dados.salario_pret, respostas: publico.respostas, consentimento_em: new Date().toISOString() });
    dados.analise_ia.nome_do_arquivo = false;
  }
  const vaga = vagas.find((v: any) => String(v.id) === dados.vaga_id);
  // Simulação (testes): devolve o que seria gravado, sem guardar arquivo nem mexer no banco.
  if (body.simular === true) return json({ ok: true, simulacao: true, candidato: { ...dados, role: vaga?.title || dados.area_sugerida || "A definir" } });

  // Guarda o arquivo original (se houver)
  let caminho: string | null = null;
  if (!semArquivo) {
    caminho = `${hoje.slice(0, 7)}/${crypto.randomUUID()}-${nomeArquivo.replace(/[^\w.\-]+/g, "_")}`;
    const up = await admin.storage.from("curriculos").upload(caminho, bytes, { contentType: mime, upsert: false });
    if (up.error) return json({ ok: false, error: "Não foi possível guardar o arquivo: " + up.error.message }, 500);
  }

  // Duplicado (mesmo e-mail ou telefone) → atualiza; senão cria como 'pendente'
  const { data: existentes } = await admin.from("candidatos").select("id,email,phone,status,vaga_id");
  const dup = acharDuplicado(existentes ?? [], dados);
  const { analise_ia, sugestao_ia, ...campos } = dados;
  const linha = { ...campos, role: vaga?.title || dados.area_sugerida || "A definir", analise_ia, sugestao_ia,
                  ...(caminho ? { arquivo_path: caminho, arquivo_nome: nomeArquivo } : {}), origem, atualizado_em: new Date().toISOString() };
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
  // Candidatura pública nova → tarefa "Decidir" no Planejamento (antes o próprio navegador do candidato gravava a
  // tarefa; a partir da etapa 3 do login o público não grava mais direto nas tabelas). Falha aqui não perde a candidatura.
  if (publico && !dup) {
    const { error: eT } = await admin.from("tarefas").insert([{ titulo: `Decidir: ${gravado.name}`,
      descricao: `Vaga: ${vaga?.title || "—"}\nCandidatura pelo portal (K.Carreiras). Avaliação sugerida pela IA no cadastro do candidato.`,
      coluna: "backlog", prioridade: "media", responsavel_id: null, responsavel_name: "", setor: "", data_vencimento: null,
      tags: ["recrutamento"], criado_por_id: null, criado_por_name: "Sistema Automático", origem_tipo: "candidato", origem_id: String(gravado.id) }]);
    if (eT) console.error("Tarefa da candidatura não criada:", eT.message);
  }
  // Candidato do portal público recebe só a confirmação (nota e análise são do RH).
  if (publico) return json({ ok: true, candidato: { id: gravado.id, name: gravado.name } });
  return json({ ok: true, duplicado: !!dup, candidato: gravado });
});
