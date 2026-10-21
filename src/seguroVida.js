// ─────────────────────────────────────────────────────────────────────────────
// Seguro de vida (Prudential VG Express) — rateio mensal por centro de custo (21/10/2026).
// 1) O RH anexa o "Relatório de Movimentação" (PDF) da Prudential.
// 2) O navegador lê o PDF com o pdf.js (carregado só nesta tela) e extrai competência, segurados e total.
// 3) A função do banco seguro_vida_conferir cruza com o cadastro (CPF; nome se faltar), aplica o centro de custo
//    oficial da folha da BRIT, faz o rateio e a conferência, e guarda o relatório do mês.
// 4) Este módulo gera a planilha (Lista, Rateio, Conferência) e o e-mail de resumo.
// Lógica pura (sem tela e sem rede): testada em testes/seguro_vida.
// ─────────────────────────────────────────────────────────────────────────────
import { gerarXlsx } from "./planilhaXlsx.js";

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";
let _pdfjs = null;
// Carrega o pdf.js só quando o RH usa este relatório (mesmo padrão do supabase-js no portal).
export function carregarPdfJs() {
  if (_pdfjs) return _pdfjs;
  _pdfjs = new Promise((ok, falha) => {
    if (window.pdfjsLib) { ok(window.pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = `${PDFJS}/pdf.min.js`;
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`; ok(window.pdfjsLib); };
    s.onerror = () => { _pdfjs = null; falha(new Error("Não foi possível carregar o leitor de PDF. Verifique a internet e tente de novo.")); };
    document.head.appendChild(s);
  });
  return _pdfjs;
}

// Textos de cada página → linhas. As coordenadas passam pela rotação da página (o demonstrativo da Prudential vem
// com a página girada em paisagem; sem isso, cada linha de segurado sai espalhada). Coordenadas de tela: y cresce
// para baixo; agrupa por altura e ordena da esquerda para a direita.
export async function textoDoPdf(pdfjs, bytes) {
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const linhas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pag = await doc.getPage(p);
    const vp = pag.getViewport({ scale: 1 });
    const { items } = await pag.getTextContent();
    linhas.push(...agruparLinhas(items.map((i) => { const t = pdfjs.Util.transform(vp.transform, i.transform); return { str: i.str, x: t[4], y: t[5] }; })));
  }
  return linhas;
}
export function agruparLinhas(itens) {
  const grupos = [];
  for (const it of itens.filter((i) => String(i.str).trim() !== "").sort((a, b) => a.y - b.y || a.x - b.x)) {
    const g = grupos.find((x) => Math.abs(x.y - it.y) <= 2);
    if (g) g.itens.push(it); else grupos.push({ y: it.y, itens: [it] });
  }
  return grupos.map((g) => g.itens.sort((a, b) => a.x - b.x).map((i) => String(i.str).trim()).join("  "));
}

const num = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));
const dataISO = (s) => { const m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(s || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const LINHA = /^(.+?)\s+(\d{3}\.\d{3}\.\d{3}-\d{2})\s+(\d\d\/\d\d\/\d{4})\s+(\d\d\/\d\d\/\d{4})\s+(?:(Exclusão|Inclusão|Alteração)\s+)?([\d.]+,\d\d)\s+([\d.]+,\d\d)\s*$/;

// Linhas de texto do demonstrativo → { competencia "AAAA-MM", linhas:[...], totalImpresso, soma, confere }.
export function lerDemonstrativoVG(linhasTexto) {
  const todo = linhasTexto.join("\n");
  if (!/RELAT[ÓO]RIO DE MOVIMENTA/i.test(todo) || !/Prudential|VG EXPRESS/i.test(todo))
    throw new Error("Este arquivo não parece o Relatório de Movimentação do seguro de vida (Prudential).");
  const comp = /\b(20\d\d)\/(0[1-9]|1[0-2])\b/.exec(todo);
  const linhas = [];
  for (const l of linhasTexto) {
    const m = LINHA.exec(l.trim());
    if (!m) continue;
    linhas.push({ nome: m[1].replace(/\s+/g, " ").trim(), cpf: m[2].replace(/\D/g, ""), nascimento: dataISO(m[3]), inicio: dataISO(m[4]),
                  movimentacao: m[5] || "", capital: num(m[6]), premio: num(m[7]) });
  }
  const t = /TOTAL:\s+([\d.]+,\d\d)\s+([\d.]+,\d\d)/.exec(todo);
  const soma = Math.round(linhas.reduce((a, l) => a + l.premio, 0) * 100) / 100;
  const totalImpresso = t ? num(t[2]) : null;
  if (!linhas.length) throw new Error("Nenhum segurado encontrado no PDF.");
  return { competencia: comp ? `${comp[1]}-${comp[2]}` : null, linhas, totalImpresso, soma,
           confere: totalImpresso !== null && Math.abs(totalImpresso - soma) < 0.005 };
}

const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeCompetencia = (c) => { const [a, m] = String(c || "").split("-"); return m ? `${MES[Number(m) - 1]}/${a}` : c || ""; };
export const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const cpfF = (c) => { const d = String(c || "").replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : c || ""; };

// Itens da conferência em texto, na ordem de importância (usado na tela, na planilha e no e-mail).
export function itensConferencia(conf) {
  const c = conf || {}, out = [];
  const lista = (a, f = (x) => x) => (a || []).map(f).join(", ");
  if (c.nao_encontrados?.length) out.push({ tipo: "erro", titulo: "Não encontrados no cadastro (ficam sem centro de custo)", texto: lista(c.nao_encontrados) });
  if (c.desligados_cobrados?.length) out.push({ tipo: "erro", titulo: "Desligados ainda cobrados — pedir exclusão à Prudential", texto: lista(c.desligados_cobrados, (d) => d.nome + (d.desligamento ? ` (desligado em ${br(d.desligamento)})` : "")) });
  if (c.sem_centro_custo?.length) out.push({ tipo: "erro", titulo: "Sem centro de custo no cadastro", texto: lista(c.sem_centro_custo) });
  const fora = c.ativos_fora_do_seguro || [];
  const foraNormal = fora.filter((x) => !x.aprendiz), foraAprendiz = fora.filter((x) => x.aprendiz);
  if (foraNormal.length) out.push({ tipo: "alerta", titulo: "Ativos na folha que não estão no seguro", texto: lista(foraNormal, (x) => `${x.nome} (${x.cargo || "—"}, admissão ${br(x.admissao)})`) });
  if (foraAprendiz.length) out.push({ tipo: "info", titulo: "Aprendizes fora do seguro (verificar a regra da apólice)", texto: lista(foraAprendiz, (x) => x.nome) });
  if (c.premio_diferente?.length) out.push({ tipo: "info", titulo: `Prêmio diferente do padrão (${brl(c.premio_padrao)})`, texto: lista(c.premio_diferente, (x) => `${x.nome}: ${brl(x.premio)} (capital ${brl(x.capital)})`) });
  if (c.exclusoes?.length) out.push({ tipo: "info", titulo: "Exclusões do mês", texto: lista(c.exclusoes) });
  if (c.inclusoes?.length) out.push({ tipo: "info", titulo: "Inclusões do mês", texto: lista(c.inclusoes) });
  if (c.achados_pelo_nome?.length) out.push({ tipo: "info", titulo: "Encontrados pelo nome (CPF não está no cadastro)", texto: lista(c.achados_pelo_nome) });
  return out;
}

// Planilha do mês: Rateio (o que vai para o financeiro), Lista (pessoa a pessoa) e Conferência.
export function gerarPlanilhaVG(rel) {
  const rateio = rel.rateio || [];
  const linhasRateio = rateio.map((r) => [r.centro_custo, r.pessoas, Number(r.valor)]);
  const tot = [{ v: "TOTAL", estilo: "negrito" }, { v: rateio.reduce((a, r) => a + Number(r.pessoas), 0), estilo: "negrito" },
               { v: Math.round(rateio.reduce((a, r) => a + Number(r.valor), 0) * 100) / 100, estilo: "negrito" }];
  const pessoas = (rel.linhas || []).map((l) => [l.nome, l.centro_custo || "SEM CENTRO DE CUSTO (verificar)", br(l.admissao), l.cargo || "",
    cpfF(l.cpf), br(l.nascimento), l.movimentacao || "", Number(l.capital || 0), Number(l.premio || 0)]);
  const conf = itensConferencia(rel.conferencia).map((i) => [i.titulo, i.texto]);
  return gerarXlsx([
    { nome: "Rateio", larguras: [48, 10, 14], cabecalho: 2, linhas: [
      [{ v: `Seguro de vida (Prudential) — rateio por centro de custo — ${nomeCompetencia(rel.competencia)}`, estilo: "titulo" }],
      [`Total do demonstrativo: ${brl(rel.total)} · ${rel.pessoas} segurados · centro de custo da folha da BRIT`],
      [{ v: "Centro de custo", estilo: "cabecalho" }, { v: "Pessoas", estilo: "cabecalho" }, { v: "Valor (R$)", estilo: "cabecalho" }],
      ...linhasRateio, tot] },
    { nome: "Lista", larguras: [40, 44, 12, 30, 16, 12, 13, 14, 11], cabecalho: 0, linhas: [
      ["Nome", "Centro de custo", "Admissão", "Função", "CPF", "Nascimento", "Movimentação", "Capital (R$)", "Prêmio (R$)"].map((v) => ({ v, estilo: "cabecalho" })),
      ...pessoas] },
    { nome: "Conferência", larguras: [52, 110], cabecalho: 0, linhas: [
      [{ v: "Ponto", estilo: "cabecalho" }, { v: "Pessoas", estilo: "cabecalho" }],
      ...(conf.length ? conf : [["Nada a conferir", "Todos encontrados no cadastro, com centro de custo."]])] },
  ]);
}

// E-mail de resumo (corpo em HTML; a planilha completa fica no portal).
export function emailResumoVG(rel) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const td = "padding:4px 10px;border-bottom:1px solid #ddd";
  const linhas = (rel.rateio || []).map((r) => `<tr><td style="${td}">${esc(r.centro_custo)}</td><td style="${td};text-align:right">${r.pessoas}</td><td style="${td};text-align:right">${esc(brl(r.valor))}</td></tr>`).join("");
  const conf = itensConferencia(rel.conferencia).map((i) => `<li><b>${esc(i.titulo)}:</b> ${esc(i.texto)}</li>`).join("");
  return {
    assunto: `Seguro de vida — rateio por centro de custo — ${nomeCompetencia(rel.competencia)}`,
    html: `<p>Rateio do seguro de vida (Prudential) de <b>${esc(nomeCompetencia(rel.competencia))}</b>: <b>${esc(brl(rel.total))}</b>, ${rel.pessoas} segurados. Centro de custo conforme a folha da BRIT.</p>
<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><tr><th style="${td};text-align:left">Centro de custo</th><th style="${td}">Pessoas</th><th style="${td}">Valor</th></tr>${linhas}
<tr><td style="${td}"><b>TOTAL</b></td><td style="${td};text-align:right"><b>${rel.pessoas}</b></td><td style="${td};text-align:right"><b>${esc(brl(rel.total))}</b></td></tr></table>
${conf ? `<p><b>Conferência</b></p><ul>${conf}</ul>` : "<p>Conferência: nada a apontar.</p>"}
<p style="color:#666;font-size:12px">A planilha completa (rateio, lista e conferência) está no Portal de RH › Relatórios.</p>`,
  };
}
