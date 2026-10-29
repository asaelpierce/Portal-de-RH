// ─────────────────────────────────────────────────────────────────────────────
// Clube SESI Vespasiano — rateio mensal por centro de custo (21/10/2026).
// 1) O RH anexa a "Relação de Conveniados" (PDF) do SESI. O valor de cada titular é o valor integral (Asael).
// 2) O navegador lê data de corte, contrato, vigência e, por titular, CPF, nome, categoria e valor (o PDF usa ponto
//    decimal: "45.00"); confere a soma com o total impresso.
// 3) A função do banco sesi_conferir liga pelo CPF (ou nome), aplica o centro de custo da folha da BRIT e rateia.
// Competência = mês da data de corte. Lógica pura (sem tela e sem rede): testada em testes/sesi.
// ─────────────────────────────────────────────────────────────────────────────
import { gerarXlsx } from "./planilhaXlsx.js";
import { brl, nomeCompetencia } from "./seguroVida.js";

const valor = (s) => Number(String(s).replace(/,/g, ""));   // "1,234.56" ou "45.00"
const dataISO = (s) => { const m = /(\d\d)\/(\d\d)\/(\d{4})/.exec(s || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

export function lerRelacaoSesi(linhasTexto) {
  const todo = linhasTexto.join("\n");
  if (!/Rela[cç][aã]o de Conveniados/i.test(todo) || !/SESI/i.test(todo))
    throw new Error("Este arquivo não parece a Relação de Conveniados do Clube SESI.");
  const corte = /Data de Corte:\s*(\d\d\/\d\d\/\d{4})/i.exec(todo);
  const contrato = /Contrato:\s*(\d+)/i.exec(todo);
  const vig = /Vig[eê]ncia:\s*(\d\d\/\d\d\/\d{4})\s+a\s+(\d\d\/\d\d\/\d{4})/i.exec(todo);
  const linhas = [];
  for (const bruta of linhasTexto) {
    // colunas separadas por 2+ espaços (cada célula do PDF vira um item): [matrícula], CPF, nome, categoria, valor
    const col = bruta.trim().split(/\s{2,}/);
    const i = col.findIndex((c) => /^\d{11}$/.test(c));
    if (i < 0 || col.length < i + 4) continue;
    const v = col[col.length - 1];
    if (!/^\d{1,3}(,\d{3})*\.\d\d$/.test(v)) continue;
    linhas.push({ cpf: col[i], nome: col[i + 1].trim(), categoria: col.slice(i + 2, col.length - 1).join(" ").trim(), valor: valor(v) });
  }
  if (!linhas.length) throw new Error("Nenhum conveniado encontrado na relação.");
  const t = /Total de titulares:\s*\d+\s+(\d{1,3}(?:,\d{3})*\.\d\d)/i.exec(todo);
  const soma = Math.round(linhas.reduce((a, l) => a + l.valor, 0) * 100) / 100;
  const totalImpresso = t ? valor(t[1]) : null;
  const dc = corte ? dataISO(corte[1]) : null;
  return { competencia: dc ? dc.slice(0, 7) : null, dataCorte: dc, contrato: contrato ? contrato[1] : "",
           vigencia: vig ? `${vig[1]} a ${vig[2]}` : "", linhas, totalImpresso, soma,
           confere: totalImpresso !== null && Math.abs(totalImpresso - soma) < 0.005 };
}

export function itensConferenciaSesi(conf) {
  const c = conf || {}, out = [], lista = (a, f = (x) => x) => (a || []).map(f).join(", ");
  const br = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
  if (c.nao_encontrados?.length) out.push({ tipo: "erro", titulo: "Não encontrados no cadastro (ficam sem centro de custo)", texto: lista(c.nao_encontrados) });
  if (c.desligados_conveniados?.length) out.push({ tipo: "erro", titulo: "Desligados ainda conveniados — pedir exclusão ao SESI", texto: lista(c.desligados_conveniados, (x) => `${x.nome}${x.desligamento ? ` (desligado em ${br(x.desligamento)})` : ""}: ${brl(x.valor)}`) });
  if (c.sem_centro_custo?.length) out.push({ tipo: "erro", titulo: "Sem centro de custo no cadastro", texto: lista(c.sem_centro_custo) });
  if (c.achados_pelo_nome?.length) out.push({ tipo: "info", titulo: "Encontrados pelo nome (CPF não está no cadastro)", texto: lista(c.achados_pelo_nome) });
  return out;
}

const brData = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
export function gerarPlanilhaSesi(rel) {
  const rateio = rel.rateio || [];  return gerarXlsx([
    { nome: "Rateio", larguras: [48, 10, 14], cabecalho: 2, linhas: [
      [{ v: `Clube SESI Vespasiano — rateio por centro de custo — ${nomeCompetencia(rel.competencia)}`, estilo: "titulo" }],
      [`Data de corte ${brData(rel.data_corte)} · contrato ${rel.contrato || "—"} · vigência ${rel.vigencia || "—"} · total ${brl(rel.total)} · centro de custo da folha da BRIT`],
      ["Centro de custo", "Titulares", "Valor (R$)"].map((v) => ({ v, estilo: "cabecalho" })),
      ...rateio.map((r) => [r.centro_custo, r.pessoas, Number(r.valor)]),
      [{ v: "TOTAL", estilo: "negrito" }, { v: rateio.reduce((a, r) => a + Number(r.pessoas), 0), estilo: "negrito" },
       { v: Math.round(rateio.reduce((a, r) => a + Number(r.valor), 0) * 100) / 100, estilo: "negrito" }]] },
  ]);
}

export function emailResumoSesi(rel) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const td = "padding:4px 10px;border-bottom:1px solid #ddd";
  const linhas = (rel.rateio || []).map((r) => `<tr><td style="${td}">${esc(r.centro_custo)}</td><td style="${td};text-align:right">${r.pessoas}</td><td style="${td};text-align:right">${esc(brl(r.valor))}</td></tr>`).join("");
  const nConf = itensConferenciaSesi(rel.conferencia).length;  // e-mail sem nomes: só quantos pontos há para conferir
  return {
    assunto: `Clube SESI — rateio por centro de custo — ${nomeCompetencia(rel.competencia)}`,
    html: `<p>Rateio do Clube SESI Vespasiano de <b>${esc(nomeCompetencia(rel.competencia))}</b> (data de corte ${esc(brData(rel.data_corte))}): <b>${esc(brl(rel.total))}</b>, ${rel.pessoas} titulares (valor integral). Centro de custo conforme a folha da BRIT.</p>
<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><tr><th style="${td};text-align:left">Centro de custo</th><th style="${td}">Titulares</th><th style="${td}">Valor</th></tr>${linhas}
<tr><td style="${td}"><b>TOTAL</b></td><td style="${td};text-align:right"><b>${rel.pessoas}</b></td><td style="${td};text-align:right"><b>${esc(brl(rel.total))}</b></td></tr></table>
${nConf ? `<p>Conferência: ${nConf} ponto(s) para conferir no Portal de RH (os nomes ficam só no portal).</p>` : "<p>Conferência: nada a apontar.</p>"}
<p style="color:#666;font-size:12px">O detalhe por pessoa fica só no Portal de RH › Relatórios.</p>`,
  };
}
