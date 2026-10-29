// ─────────────────────────────────────────────────────────────────────────────
// Plano odontológico (Bradesco Dental) — rateio mensal por centro de custo (21/10/2026).
// 1) O RH anexa a "Fatura Técnica" (PDF) da Bradesco.
// 2) O navegador lê o PDF (mesma leitura do seguro de vida: src/seguroVida.js) e extrai competência, vigência,
//    beneficiários (titular /00 e dependentes /01…) e TODOS os lançamentos de cada um (mensalidade, inclusões IM/IR,
//    cancelamentos CM/CR — os cancelamentos vêm negativos). Valor do beneficiário = soma dos lançamentos.
// 3) A função do banco odonto_conferir liga cada titular (certificado) ao colaborador responsável, aplica o centro de
//    custo da folha da BRIT (dependentes seguem o titular), faz o rateio e a conferência e guarda o mês.
// Lógica pura (sem tela e sem rede): testada em testes/odonto.
// ─────────────────────────────────────────────────────────────────────────────
import { gerarXlsx } from "./planilhaXlsx.js";
import { brl, nomeCompetencia } from "./seguroVida.js";

const num = (s, neg) => Number(String(s).replace(/\./g, "").replace(",", ".")) * (neg ? -1 : 1);
const dataISO = (s) => { const m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(s || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const br = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const PARENTESCO = { CONJ: "Cônjuge", FILH: "Filho(a)", OUTR: "Outro" };
// Beneficiário: certificado/seq, nome, nascimento, sexo, [estado civil] [parentesco], plano, início, [mov], mês/ano, valor[-], part.
const LINHA_BEN = /^(\d{7})\/(\d\d)\s+(.+?)\s+(\d\d\/\d\d\/\d{4})\s+(MAS|FEM)\s+(.*?)\s*TNDA\s+(\d\d\/\d\d\/\d{4})\s+(?:([A-Z]{2})\s+)?(\d\d\/\d{4})\s+([\d.]+,\d\d)\s*(-?)\s+[\d.]+,\d\d\s*$/;
// Lançamento extra do mesmo beneficiário (linha sem nome).
const LINHA_LANC = /^TNDA\s+(\d\d\/\d\d\/\d{4})\s+(?:([A-Z]{2})\s+)?(\d\d\/\d{4})\s+([\d.]+,\d\d)\s*(-?)\s+[\d.]+,\d\d\s*$/;
export const TIPO_LANC = { "": "Mensalidade", IM: "Inclusão no mês", IR: "Inclusão retroativa", CM: "Cancelamento no mês", CR: "Cancelamento retroativo" };

export function lerFaturaOdonto(linhasTexto) {
  const todo = linhasTexto.join("\n");
  if (!/BRADESCO DENTAL/i.test(todo) || !/FATURA T[EÉ]CNICA/i.test(todo))
    throw new Error("Este arquivo não parece a Fatura Técnica do plano odontológico (Bradesco Dental).");
  const comp = /DENTAL\s+(0[1-9]|1[0-2])\/(20\d\d)/.exec(todo);
  const vig = /DE\s+(\d\d)\.(\d\d)\.(\d{4})\s+A\s+(\d\d)\.(\d\d)\.(\d{4})/.exec(todo);
  const beneficiarios = []; let atual = null;
  for (const bruta of linhasTexto) {
    const l = bruta.replace(/\s+/g, " ").trim();
    let m = LINHA_BEN.exec(l);
    if (m) {
      const extra = m[6].trim().split(" ").filter(Boolean);
      const par = m[2] !== "00" ? (PARENTESCO[extra[extra.length - 1]] || extra[extra.length - 1] || "Dependente") : "Titular";
      atual = { certificado: m[1], seq: m[2], nome: m[3].trim(), nascimento: dataISO(m[4]), sexo: m[5], parentesco: par, inicio: dataISO(m[7]), lancamentos: [] };
      atual.lancamentos.push({ tipo: m[8] || "", mes: m[9], valor: num(m[10], m[11] === "-") });
      beneficiarios.push(atual); continue;
    }
    m = LINHA_LANC.exec(l);
    if (m && atual) atual.lancamentos.push({ tipo: m[2] || "", mes: m[3], valor: num(m[4], m[5] === "-") });
  }
  for (const b of beneficiarios) b.valor = Math.round(b.lancamentos.reduce((a, x) => a + x.valor, 0) * 100) / 100;
  const ts = /\(TS\)\s*TOTAIS DA SUBFATURA[^\n]*?([\d.]+,\d\d)\s+[\d.]+,\d\d\s*$/m.exec(todo);
  const soma = Math.round(beneficiarios.reduce((a, b) => a + b.valor, 0) * 100) / 100;
  const totalImpresso = ts ? num(ts[1]) : null;
  if (!beneficiarios.length) throw new Error("Nenhum beneficiário encontrado na fatura.");
  return { competencia: comp ? `${comp[2]}-${comp[1]}` : null,
           vigencia: vig ? `${vig[1]}/${vig[2]}/${vig[3]} a ${vig[4]}/${vig[5]}/${vig[6]}` : "",
           beneficiarios, totalImpresso, soma, confere: totalImpresso !== null && Math.abs(totalImpresso - soma) < 0.005 };
}

export function itensConferenciaOdonto(conf) {
  const c = conf || {}, out = [], lista = (a, f = (x) => x) => (a || []).map(f).join(", ");
  if (c.titulares_sem_vinculo?.length) out.push({ tipo: "erro", titulo: "Titulares sem colaborador responsável (vincule abaixo)", texto: lista(c.titulares_sem_vinculo, (x) => `${x.titular} (certificado ${x.certificado})`) });
  if (c.desligados_cobrados?.length) out.push({ tipo: "erro", titulo: "Desligados ainda cobrados — pedir cancelamento à Bradesco", texto: lista(c.desligados_cobrados, (d) => d.titular + (d.desligamento ? ` (desligado em ${br(d.desligamento)})` : "")) });
  if (c.sem_centro_custo?.length) out.push({ tipo: "erro", titulo: "Sem centro de custo (titular fora da folha — defina um centro de custo fixo)", texto: lista(c.sem_centro_custo) });
  if (c.vinculados_a_outro?.length) out.push({ tipo: "info", titulo: "Titulares lançados em outro colaborador (vínculo guardado)", texto: lista(c.vinculados_a_outro, (x) => `${x.titular} → ${x.responsavel}`) });
  if (c.valor_diferente?.length) out.push({ tipo: "info", titulo: `Mensalidade diferente do padrão (${brl(c.mensalidade_padrao)})`, texto: lista(c.valor_diferente, (x) => `${x.nome}: ${brl(x.valor)}`) });
  if (c.inclusoes?.length) out.push({ tipo: "info", titulo: "Inclusões (no mês e retroativas)", texto: lista(c.inclusoes) });
  if (c.cancelamentos?.length) out.push({ tipo: "info", titulo: "Cancelamentos (no mês e retroativos — valores devolvidos)", texto: lista(c.cancelamentos) });
  return out;
}

const SEM_CC = "SEM CENTRO DE CUSTO (verificar)";
export function gerarPlanilhaOdonto(rel) {
  const rateio = rel.rateio || [];
  const soma = (k) => rateio.reduce((a, r) => a + Number(r[k] || 0), 0);  return gerarXlsx([
    { nome: "Rateio", larguras: [48, 10, 14, 14], cabecalho: 2, linhas: [
      [{ v: `Plano odontológico (Bradesco) — rateio por centro de custo — fatura ${nomeCompetencia(rel.competencia)}`, estilo: "titulo" }],
      [`Vigência ${rel.vigencia || "—"} · total ${brl(rel.total)} · ${rel.titulares} titulares e ${rel.beneficiarios} beneficiários · centro de custo da folha da BRIT (dependentes seguem o titular)`],
      ["Centro de custo", "Titulares", "Beneficiários", "Valor (R$)"].map((v) => ({ v, estilo: "cabecalho" })),
      ...rateio.map((r) => [r.centro_custo, r.titulares, r.beneficiarios, Number(r.valor)]),
      [{ v: "TOTAL", estilo: "negrito" }, { v: soma("titulares"), estilo: "negrito" }, { v: soma("beneficiarios"), estilo: "negrito" },
       { v: Math.round(soma("valor") * 100) / 100, estilo: "negrito" }]] },
  ]);
}

export function emailResumoOdonto(rel) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const td = "padding:4px 10px;border-bottom:1px solid #ddd";
  const linhas = (rel.rateio || []).map((r) => `<tr><td style="${td}">${esc(r.centro_custo)}</td><td style="${td};text-align:right">${r.beneficiarios}</td><td style="${td};text-align:right">${esc(brl(r.valor))}</td></tr>`).join("");
  const nConf = itensConferenciaOdonto(rel.conferencia).length;  // e-mail sem nomes: só quantos pontos há para conferir
  return {
    assunto: `Plano odontológico — rateio por centro de custo — fatura ${nomeCompetencia(rel.competencia)}`,
    html: `<p>Rateio do plano odontológico (Bradesco Dental), fatura de <b>${esc(nomeCompetencia(rel.competencia))}</b> (vigência ${esc(rel.vigencia || "—")}): <b>${esc(brl(rel.total))}</b>, ${rel.titulares} titulares e ${rel.beneficiarios} beneficiários. Centro de custo conforme a folha da BRIT; dependentes seguem o titular.</p>
<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><tr><th style="${td};text-align:left">Centro de custo</th><th style="${td}">Beneficiários</th><th style="${td}">Valor</th></tr>${linhas}
<tr><td style="${td}"><b>TOTAL</b></td><td style="${td};text-align:right"><b>${rel.beneficiarios}</b></td><td style="${td};text-align:right"><b>${esc(brl(rel.total))}</b></td></tr></table>
${nConf ? `<p>Conferência: ${nConf} ponto(s) para conferir no Portal de RH (os nomes ficam só no portal).</p>` : "<p>Conferência: nada a apontar.</p>"}
<p style="color:#666;font-size:12px">O detalhe por pessoa fica só no Portal de RH › Relatórios.</p>`,
  };
}
