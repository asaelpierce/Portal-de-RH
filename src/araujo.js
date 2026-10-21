// ─────────────────────────────────────────────────────────────────────────────
// Convênio Drogaria Araujo — rateio mensal por centro de custo (21/10/2026).
// 1) O RH anexa o "Relatório Total Compras agrupado por Funcionário e Período" (RCONV-06, PDF).
// 2) O navegador lê: período, e por funcionário matrícula, nome, total compras, TOTAL CONVÊNIO, subsídio e valor sem
//    subsídio; confere a soma do convênio com a "Soma Total" impressa.
// 3) A função do banco araujo_conferir liga cada linha ao cadastro (matrícula; senão nome, e guarda o vínculo), aplica o
//    centro de custo da folha da BRIT e faz o rateio do TOTAL CONVÊNIO e a conferência.
// Competência = mês do fim do período (ex.: 20/09 a 19/10 → outubro), como a aba mensal da planilha do RH.
// Lógica pura (sem tela e sem rede): testada em testes/araujo.
// ─────────────────────────────────────────────────────────────────────────────
import { gerarXlsx } from "./planilhaXlsx.js";
import { brl, nomeCompetencia } from "./seguroVida.js";

const num = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));
const V = "R\\$\\s*([\\d.]+,\\d\\d)";
const LINHA = new RegExp(`^(\\d{1,8})\\s+(.+?)\\s+${V}\\s+${V}\\s+${V}\\s+${V}\\s*$`);

export function lerRelatorioAraujo(linhasTexto) {
  const todo = linhasTexto.join("\n");
  if (!/Total Compras agrupado por/i.test(todo) || !/Conv[eê]nio/i.test(todo))
    throw new Error("Este arquivo não parece o relatório de compras do convênio da Drogaria Araujo.");
  const per = /Per[ií]odo:\s*(\d\d)\/(\d\d)\/(\d{4})\s+at[ée]\s+(\d\d)\/(\d\d)\/(\d{4})/i.exec(todo);
  const linhas = [];
  for (const bruta of linhasTexto) {
    const m = LINHA.exec(bruta.replace(/\s+/g, " ").trim());
    if (m) linhas.push({ matricula: m[1], nome: m[2].trim(), compras: num(m[3]), convenio: num(m[4]), subsidio: num(m[5]), sem_subsidio: num(m[6]) });
  }
  if (!linhas.length) throw new Error("Nenhum funcionário encontrado no relatório.");
  const t = /Soma Total\s+R\$\s*([\d.]+,\d\d)/i.exec(todo);
  const soma = Math.round(linhas.reduce((a, l) => a + l.convenio, 0) * 100) / 100;
  const totalImpresso = t ? num(t[1]) : null;
  return { competencia: per ? `${per[6]}-${per[5]}` : null, periodo: per ? `${per[1]}/${per[2]}/${per[3]} a ${per[4]}/${per[5]}/${per[6]}` : "",
           linhas, totalImpresso, soma, confere: totalImpresso !== null && Math.abs(totalImpresso - soma) < 0.005 };
}

export function itensConferenciaAraujo(conf) {
  const c = conf || {}, out = [], lista = (a, f = (x) => x) => (a || []).map(f).join(", ");
  const br = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
  if (c.nao_encontrados?.length) out.push({ tipo: "erro", titulo: "Não encontrados no cadastro (ficam sem centro de custo)", texto: lista(c.nao_encontrados, (x) => `${x.nome} (matrícula Araujo ${x.matricula})`) });
  if (c.desligados_com_compra?.length) out.push({ tipo: "erro", titulo: "Desligados com compra no convênio — bloquear o cartão na Araujo", texto: lista(c.desligados_com_compra, (x) => `${x.nome}${x.desligamento ? ` (desligado em ${br(x.desligamento)})` : ""}: ${brl(x.convenio)}`) });
  if (c.sem_centro_custo?.length) out.push({ tipo: "erro", titulo: "Sem centro de custo no cadastro", texto: lista(c.sem_centro_custo) });
  if (c.matricula_diferente?.length) out.push({ tipo: "alerta", titulo: "Matrícula na Araujo diferente da folha (pedir correção à Araujo; encontrados pelo nome)", texto: lista(c.matricula_diferente, (x) => `${x.nome}: Araujo ${x.araujo} × folha ${x.folha}`) });
  if (c.compras_acima_do_convenio?.length) out.push({ tipo: "info", titulo: "Compras acima do valor do convênio (limite ou compra fora do convênio)", texto: lista(c.compras_acima_do_convenio, (x) => `${x.nome}: compras ${brl(x.compras)}, convênio ${brl(x.convenio)}`) });
  return out;
}

export function gerarPlanilhaAraujo(rel) {
  const rateio = rel.rateio || [];
  const conf = itensConferenciaAraujo(rel.conferencia).map((i) => [i.titulo, i.texto]);
  return gerarXlsx([
    { nome: "Rateio", larguras: [48, 10, 14], cabecalho: 2, linhas: [
      [{ v: `Convênio Drogaria Araujo — rateio por centro de custo — ${nomeCompetencia(rel.competencia)}`, estilo: "titulo" }],
      [`Período ${rel.periodo || "—"} · total do convênio ${brl(rel.total)} · ${rel.pessoas} funcionários · centro de custo da folha da BRIT`],
      ["Centro de custo", "Pessoas", "Valor (R$)"].map((v) => ({ v, estilo: "cabecalho" })),
      ...rateio.map((r) => [r.centro_custo, r.pessoas, Number(r.valor)]),
      [{ v: "TOTAL", estilo: "negrito" }, { v: rateio.reduce((a, r) => a + Number(r.pessoas), 0), estilo: "negrito" },
       { v: Math.round(rateio.reduce((a, r) => a + Number(r.valor), 0) * 100) / 100, estilo: "negrito" }]] },
    { nome: "Lista", larguras: [12, 36, 36, 44, 14, 14, 12, 14], cabecalho: 0, linhas: [
      ["Matrícula Araujo", "Nome na Araujo", "Colaborador (cadastro)", "Centro de custo", "Total compras (R$)", "Total convênio (R$)", "Subsídio (R$)", "Sem subsídio (R$)"].map((v) => ({ v, estilo: "cabecalho" })),
      ...(rel.linhas || []).map((l) => [l.matricula, l.nome, l.colaborador || "", l.centro_custo || "SEM CENTRO DE CUSTO (verificar)",
        Number(l.compras), Number(l.convenio), Number(l.subsidio || 0), Number(l.sem_subsidio || 0)])] },
    { nome: "Conferência", larguras: [60, 110], cabecalho: 0, linhas: [
      [{ v: "Ponto", estilo: "cabecalho" }, { v: "Pessoas", estilo: "cabecalho" }],
      ...(conf.length ? conf : [["Nada a conferir", "Todos encontrados no cadastro, com centro de custo."]])] },
  ]);
}

export function emailResumoAraujo(rel) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const td = "padding:4px 10px;border-bottom:1px solid #ddd";
  const linhas = (rel.rateio || []).map((r) => `<tr><td style="${td}">${esc(r.centro_custo)}</td><td style="${td};text-align:right">${r.pessoas}</td><td style="${td};text-align:right">${esc(brl(r.valor))}</td></tr>`).join("");
  const conf = itensConferenciaAraujo(rel.conferencia).map((i) => `<li><b>${esc(i.titulo)}:</b> ${esc(i.texto)}</li>`).join("");
  return {
    assunto: `Convênio Drogaria Araujo — rateio por centro de custo — ${nomeCompetencia(rel.competencia)}`,
    html: `<p>Rateio do convênio Drogaria Araujo de <b>${esc(nomeCompetencia(rel.competencia))}</b> (período ${esc(rel.periodo || "—")}): <b>${esc(brl(rel.total))}</b>, ${rel.pessoas} funcionários. Centro de custo conforme a folha da BRIT.</p>
<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><tr><th style="${td};text-align:left">Centro de custo</th><th style="${td}">Pessoas</th><th style="${td}">Valor</th></tr>${linhas}
<tr><td style="${td}"><b>TOTAL</b></td><td style="${td};text-align:right"><b>${rel.pessoas}</b></td><td style="${td};text-align:right"><b>${esc(brl(rel.total))}</b></td></tr></table>
${conf ? `<p><b>Conferência</b></p><ul>${conf}</ul>` : "<p>Conferência: nada a apontar.</p>"}
<p style="color:#666;font-size:12px">A planilha completa (rateio, lista e conferência) está no Portal de RH › Relatórios.</p>`,
  };
}
