// ─────────────────────────────────────────────────────────────────────────────
// Unimed BH — rateio mensal por centro de custo e descontos em folha (21/10/2026).
// O RH anexa de uma vez os PDFs do mês: Rel1 "Dados da Fatura" (mensalidade, um por contrato) e Rel7 "Relatório de
// Utilização por Família" (coparticipação, um por contrato). Contratos: 0309917 (Enfermaria), 0309918 (Apartamento —
// diretoria) e 0372477 (Unipart). Família = 14 primeiros dígitos do código Unimed (titular + dependentes).
// Regras (planilha "Novo Rateio Unimed" + respostas do RH em 21/10/2026):
//  • Rateio: mensalidade e coparticipação de cada família no centro de custo da folha (BRIT) do titular, por contrato.
//  • Desconto mensalidade: 11% de cada valor positivo (créditos/estornos negativos não descontam);
//    diretoria (0309918): R$ 1,00 por titular.
//  • Desconto coparticipação: por família e por mês, a empresa cobre 2 consultas/exames (os 2 mais caros, como a
//    planilha) e o colaborador desconta 50% do restante; diretoria: sem desconto.
//  • Desligados: mesmo cálculo, mas FORA do rateio — vão para a lista "lançar na rescisão".
// Lógica pura (sem tela e sem rede): testada em testes/unimed.
// ─────────────────────────────────────────────────────────────────────────────
import { gerarXlsx } from "./planilhaXlsx.js";
import { brl, nomeCompetencia } from "./seguroVida.js";

export const CONTRATOS = { "0309917": "Enfermaria", "0309918": "Apartamento (diretoria)", "0372477": "Unipart" };
export const CONTRATOS_DIRETORIA = ["0309918"];
export const DESCONTO_MENSALIDADE = 0.11, DESCONTO_DIRETORIA = 1, COBERTOS_POR_MES = 2, DESCONTO_COPART = 0.5;
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const num = (s) => { const t = String(s).trim(); const neg = t.startsWith("-") || t.endsWith("-"); return (neg ? -1 : 1) * Number(t.replace(/-/g, "").replace(/\./g, "").replace(",", ".")); };
const dataISO = (s) => { const m = /(\d\d)\/(\d\d)\/(\d{4})/.exec(s || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const MOEDA = "-?[\\d.]+,\\d\\d-?";

// ── Leitura de um PDF (texto já agrupado em linhas pela leitura comum do seguro de vida)
export function lerPdfUnimed(linhasTexto) {
  const todo = linhasTexto.join("\n");
  if (/Dados da Fatura/i.test(todo) && /Pre Pagto/i.test(todo)) return lerMensalidade(linhasTexto, todo);
  if (/Utiliza[cç][aã]o por Fam[ií]lia/i.test(todo)) return lerCoparticipacao(linhasTexto, todo);
  throw new Error("Este arquivo não parece um relatório da Unimed (Dados da Fatura ou Utilização por Família).");
}

function lerMensalidade(linhas, todo) {
  const comp = /Compet[eê]ncia:\s*\d\d\/(\d\d)\/(\d{4})/.exec(todo);
  const contrato = (/N[ºo°] Contrato Aux\.?:\s*(\d{7})/.exec(todo) || /^\s*(\d{7})\s+\d{7}\s+\w+/m.exec(todo) || [])[1] || "";
  const tot = /Vlr\. Tot\. Pre Pagto:\s*([\d.]+,\d\d)/.exec(todo);
  const ben = []; let atual = null;
  const BEN = /^(\d{7})\s+(\d{17})\s+(.+?)\s+(\d\d\/\d\d\/\d{4})\s+(\d+\s+a\s+\d+|\d+\s+ou\s+mais)?\s*$/;
  const MOD = new RegExp(`(\\d\\d/\\d\\d/\\d{4})(?:\\s+\\d\\d/\\d\\d/\\d{4})?\\s+(${MOEDA})\\s+(${MOEDA})\\s+(${MOEDA})\\s+(${MOEDA})\\s+[SN](?:\\s+(${MOEDA}))?\\s*$`);
  for (const bruta of linhas) {
    const l = bruta.replace(/\s+/g, " ").trim();
    let m = BEN.exec(l);
    if (m) { atual = { codigo: m[2], familia: m[2].slice(0, 14), nome: m[3].trim(), nascimento: dataISO(m[4]), faixa: (m[5] || "").trim(), modulos: [], valor: 0 }; ben.push(atual); continue; }
    m = MOD.exec(l);
    if (m && atual) {
      const [valor, desc, cred, deb] = [num(m[2]), num(m[3]), num(m[4]), num(m[5])];
      const modulo = l.slice(0, l.indexOf(m[1])).replace(/^UNIPART FLEX\s+|^[A-Z ]*FLEX\s+/i, "").trim();
      atual.modulos.push({ modulo, valor, desconto: desc, credito: cred, debito: deb });
      atual.valor = r2(atual.valor + valor - desc - cred + deb);
      continue;
    }
    // nome quebrado em duas linhas (ex.: "MARIELE DE OLIVEIRA GONCALVES" / "XAVIER")
    if (atual && !atual.modulos.length && /^[A-ZÀ-Ü ]{2,40}$/.test(l)) atual.nome = `${atual.nome} ${l}`.trim();
  }
  const soma = r2(ben.reduce((a, b) => a + b.valor, 0)), totalImpresso = tot ? num(tot[1]) : null;
  if (!ben.length) throw new Error("Nenhum beneficiário encontrado nos Dados da Fatura.");
  return { tipo: "mensalidade", contrato, competencia: comp ? `${comp[2]}-${comp[1]}` : null, beneficiarios: ben, soma, totalImpresso,
           confere: totalImpresso !== null && Math.abs(totalImpresso - soma) < 0.005 };
}

function lerCoparticipacao(linhas, todo) {
  const comp = /Compet[eê]ncia:\s*(\d\d)\/(\d{4})/.exec(todo);
  const contrato = (/Num\. Aux:\s*(\d{7})/.exec(todo) || [])[1] || "";
  const tot = /Total Geral:\s*([\d.]+,\d\d)/.exec(todo);
  const familias = []; let fam = null;
  for (const bruta of linhas) {
    const l = bruta.trim();
    let m = /^Titular:\s+(\d{17})\s+(.+?)(?:\s+Matr[ií]cula:.*)?$/.exec(l.replace(/\s{2,}/g, "  ")) ;
    if (m) { fam = { familia: m[1].slice(0, 14), codigo_titular: m[1], titular: m[2].replace(/\s+/g, " ").trim(), itens: [] }; familias.push(fam); continue; }
    const col = l.split(/\s{2,}/);
    if (fam && /^(COPAR|CUSTO|INDEV|PCMSO|PS)\w*$/.test(col[0]) && /^\d{17}$/.test(col[1]) && /^[SN]$/.test(col[col.length - 1])) {
      const dt = col.findIndex((c) => /^\d\d\/\d\d\/\d{4}\s+\d\d:\d\d/.test(c));
      const dm = dt >= 0 ? /^(\d\d\/\d\d\/\d{4})\s+(\d\d:\d\d)\s*(\d{8})?/.exec(col[dt]) : null;
      fam.itens.push({ tipo: col[0], codigo: col[1], nome: col[2], data: dm ? dataISO(dm[1]) : null, procedimento: dm?.[3] || "",
                       descricao: dt >= 0 ? (col[dt + 1] || "") : "", valor: num(col[col.length - 2]) });
    }
  }
  for (const f of familias) f.total = r2(f.itens.reduce((a, i) => a + i.valor, 0));
  const soma = r2(familias.reduce((a, f) => a + f.total, 0)), totalImpresso = tot ? num(tot[1]) : null;
  if (!familias.length) throw new Error("Nenhuma família encontrada no relatório de utilização.");
  return { tipo: "coparticipacao", contrato, competencia: comp ? `${comp[2]}-${comp[1]}` : null, familias, soma, totalImpresso,
           confere: totalImpresso !== null && Math.abs(totalImpresso - soma) < 0.005 };
}

// Mês do relatório: a mensalidade é do mês seguinte e a coparticipação do anterior (ex.: Rel1 11/2026 + Rel7 09/2026
// = relatório 10/2026, como "Novo_Rateio_Unimed_10_2026").
const somaMes = (c, n) => { const [a, m] = c.split("-").map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
export function competenciaRelatorio(arquivos) {
  const men = arquivos.find((a) => a.tipo === "mensalidade" && a.competencia), cop = arquivos.find((a) => a.tipo === "coparticipacao" && a.competencia);
  return men ? somaMes(men.competencia, -1) : cop ? somaMes(cop.competencia, 1) : null;
}

// Famílias a ligar ao cadastro (titular de cada família, com nascimento quando a mensalidade traz).
export function familiasParaVincular(arquivos) {
  const map = new Map();
  for (const a of arquivos) {
    if (a.tipo === "mensalidade") {
      const porFam = {}; a.beneficiarios.forEach((b) => (porFam[b.familia] = porFam[b.familia] || []).push(b));
      for (const [f, bs] of Object.entries(porFam)) { const t = [...bs].sort((x, y) => x.codigo.localeCompare(y.codigo))[0];
        map.set(f, { familia: f, titular: map.get(f)?.titular || t.nome, nascimento: t.nascimento }); }
    } else for (const f of a.familias) map.set(f.familia, { familia: f.familia, titular: f.titular, nascimento: map.get(f.familia)?.nascimento || null });
  }
  return [...map.values()];
}

// Base dos 11%: só o que foi cobrado (módulos positivos, já com débitos); créditos e estornos não entram.
export const cobradoPositivo = (b) => r2((b.modulos || []).reduce((a, m) => { const v = m.valor - m.desconto + m.debito; return a + (v > 0 ? v : 0); }, 0));
const temCredito = (b) => (b.modulos || []).some((m) => m.valor < 0 || m.credito > 0);

// ── Cálculo do mês. vinculos: { familia: { colaborador, centro_custo, status, data_desligamento, cadastro } }
export function calcularUnimed(arquivos, vinculos) {
  const contratos = [...new Set(arquivos.map((a) => a.contrato))].sort();
  const fams = {};
  const F = (contrato, familia) => (fams[`${contrato}|${familia}`] = fams[`${contrato}|${familia}`] ||
    { contrato, familia, beneficiarios: [], itens: [], mensalidade: 0, copart: 0, titular: null });
  for (const a of arquivos) {
    if (a.tipo === "mensalidade") a.beneficiarios.forEach((b) => { const f = F(a.contrato, b.familia); f.beneficiarios.push(b); f.mensalidade = r2(f.mensalidade + b.valor); });
    else a.familias.forEach((x) => { const f = F(a.contrato, x.familia); f.titular = x.titular; f.itens.push(...x.itens); f.copart = r2(f.copart + x.total); });
  }
  const linhas = Object.values(fams).map((f) => {
    const v = vinculos[f.familia] || {};
    const diretoria = CONTRATOS_DIRETORIA.includes(f.contrato);
    const titular = f.titular || [...f.beneficiarios].sort((x, y) => x.codigo.localeCompare(y.codigo))[0]?.nome || "";
    const descMens = diretoria ? (f.beneficiarios.length ? DESCONTO_DIRETORIA : 0)
      : r2(f.beneficiarios.reduce((a, b) => a + r2(cobradoPositivo(b) * DESCONTO_MENSALIDADE), 0));
    const ordenados = [...f.itens].sort((x, y) => y.valor - x.valor);
    const cobertos = ordenados.slice(0, COBERTOS_POR_MES), resto = ordenados.slice(COBERTOS_POR_MES);
    const empresaCopart = r2(cobertos.reduce((a, i) => a + i.valor, 0));
    const descCopart = diretoria ? 0 : r2(resto.reduce((a, i) => a + i.valor, 0) * DESCONTO_COPART);
    return { contrato: f.contrato, familia: f.familia, titular, colaborador: v.colaborador || null, cadastro: v.cadastro || null,
      centro_custo: v.centro_custo || null, status: v.status || null, data_desligamento: v.data_desligamento || null,
      desligado: v.status === "desligado", diretoria, beneficiarios: f.beneficiarios, itens: ordenados.map((i, k) => ({ ...i, coberto: k < COBERTOS_POR_MES })),
      mensalidade: f.mensalidade, copart: f.copart, empresa_copart: diretoria ? f.copart : empresaCopart,
      desconto_mensalidade: descMens, desconto_copart: descCopart, desconto_total: r2(descMens + descCopart) };
  }).sort((a, b) => a.contrato.localeCompare(b.contrato) || (a.colaborador || a.titular).localeCompare(b.colaborador || b.titular));

  // Rateio por contrato e centro de custo (desligados ficam fora: vão para a rescisão)
  const SEM = "SEM CENTRO DE CUSTO (verificar)";
  const rateio = contratos.map((c) => { const g = {};
    linhas.filter((l) => l.contrato === c && !l.desligado).forEach((l) => { const k = l.centro_custo || SEM;
      g[k] = g[k] || { centro_custo: k, familias: 0, mensalidade: 0, copart: 0 }; g[k].familias++; g[k].mensalidade = r2(g[k].mensalidade + l.mensalidade); g[k].copart = r2(g[k].copart + l.copart); });
    const cc = Object.values(g).map((x) => ({ ...x, total: r2(x.mensalidade + x.copart) })).sort((x, y) => x.centro_custo.localeCompare(y.centro_custo));
    return { contrato: c, nome: CONTRATOS[c] || c, centros: cc, mensalidade: r2(cc.reduce((a, x) => a + x.mensalidade, 0)), copart: r2(cc.reduce((a, x) => a + x.copart, 0)) }; });

  // Descontos em folha por colaborador (somando contratos) e rescisão
  const porPessoa = (lista) => { const g = {};
    lista.forEach((l) => { const k = l.colaborador || l.titular; g[k] = g[k] || { colaborador: k, cadastro: l.cadastro, centro_custo: l.centro_custo, data_desligamento: l.data_desligamento, mensalidade: 0, copart: 0 };
      g[k].mensalidade = r2(g[k].mensalidade + l.desconto_mensalidade); g[k].copart = r2(g[k].copart + l.desconto_copart); });
    return Object.values(g).map((x) => ({ ...x, total: r2(x.mensalidade + x.copart) })).filter((x) => x.total !== 0).sort((a, b) => a.colaborador.localeCompare(b.colaborador)); };
  const descontos = porPessoa(linhas.filter((l) => !l.desligado)), rescisao = porPessoa(linhas.filter((l) => l.desligado));

  const faltam = [];
  for (const c of Object.keys(CONTRATOS)) for (const t of ["mensalidade", "coparticipacao"])
    if (!arquivos.some((a) => a.contrato === c && a.tipo === t)) faltam.push(`${t === "mensalidade" ? "Rel1 (mensalidade)" : "Rel7 (coparticipação)"} do contrato ${c}`);
  const conferencia = {
    arquivos_faltando: faltam,
    nao_encontrados: linhas.filter((l) => !l.colaborador).map((l) => `${l.titular} (família ${l.familia}, contrato ${l.contrato})`),
    nao_encontrados_fam: [...new Map(linhas.filter((l) => !l.colaborador).map((l) => [l.familia, { familia: l.familia, titular: l.titular }])).values()],
    sem_centro_custo: linhas.filter((l) => l.colaborador && !l.centro_custo && !l.desligado).map((l) => l.colaborador),
    rescisao: rescisao.map((r) => `${r.colaborador}: ${brl(r.total)}`),
    contratos_desconhecidos: contratos.filter((c) => !CONTRATOS[c]),
    creditos: linhas.flatMap((l) => l.beneficiarios.filter(temCredito).map((b) => `${b.nome} (${l.colaborador || l.titular})`)),
  };
  const total = r2(rateio.reduce((a, r) => a + r.mensalidade + r.copart, 0)) + r2(linhas.filter((l) => l.desligado).reduce((a, l) => a + l.mensalidade + l.copart, 0));
  return { linhas, rateio, descontos, rescisao, conferencia, total: r2(total),
    arquivos: arquivos.map((a) => ({ tipo: a.tipo, contrato: a.contrato, competencia: a.competencia, total: a.soma })) };
}

// Lê vários PDFs de uma vez (cada um precisa bater com o próprio total impresso).
export function lerVariosUnimed(textos) {
  const arquivos = textos.map(({ nome, linhas }) => {
    let a; try { a = lerPdfUnimed(linhas); } catch (e) { throw new Error(`${nome}: ${e.message}`); }
    if (!a.confere) throw new Error(`${nome}: a soma lida (${brl(a.soma)}) não bate com o total do PDF (${a.totalImpresso == null ? "não encontrado" : brl(a.totalImpresso)}). Nada foi gravado.`);
    return { ...a, arquivo: nome };
  });
  const dup = arquivos.find((a, i) => arquivos.findIndex((b) => b.tipo === a.tipo && b.contrato === a.contrato) !== i);
  if (dup) throw new Error(`Dois PDFs do mesmo tipo para o contrato ${dup.contrato}. Anexe um de cada.`);
  const soma = r2(arquivos.reduce((x, a) => x + a.soma, 0));
  return { competencia: competenciaRelatorio(arquivos), dados: arquivos, soma, totalImpresso: soma, confere: true };
}

export function itensConferenciaUnimed(rel) {
  const c = rel.conferencia || {}, out = [], lista = (a) => (a || []).join(", ");
  if (c.arquivos_faltando?.length) out.push({ tipo: "alerta", titulo: "PDFs que não foram anexados (o rateio sai sem eles)", texto: lista(c.arquivos_faltando) });
  if (c.nao_encontrados?.length) out.push({ tipo: "erro", titulo: "Famílias não encontradas no cadastro (ficam sem centro de custo)", texto: lista(c.nao_encontrados) });
  if (c.rescisao?.length) out.push({ tipo: "erro", titulo: "Desligados: lançar na rescisão (fora do rateio) — e pedir exclusão à Unimed", texto: lista(c.rescisao) });
  if (c.sem_centro_custo?.length) out.push({ tipo: "erro", titulo: "Sem centro de custo no cadastro", texto: lista(c.sem_centro_custo) });
  if (c.creditos?.length) out.push({ tipo: "info", titulo: "Beneficiários com crédito/estorno no mês (o desconto de 11% considera só o que foi cobrado — conferir)", texto: lista(c.creditos) });
  if (c.contratos_desconhecidos?.length) out.push({ tipo: "alerta", titulo: "Contrato desconhecido (regra de desconto padrão aplicada)", texto: lista(c.contratos_desconhecidos) });
  return out;
}

export function gerarPlanilhaUnimed(rel) {
  const H = (a) => a.map((v) => ({ v, estilo: "cabecalho" })), N = (v) => ({ v, estilo: "negrito" });
  const rat = []; (rel.rateio || []).forEach((r) => {
    rat.push([N(`Contrato ${r.contrato} — ${r.nome}`)]); rat.push(H(["Centro de custo", "Famílias", "Mensalidade (R$)", "Coparticipação (R$)", "Total (R$)"]));
    r.centros.forEach((c) => rat.push([c.centro_custo, c.familias, c.mensalidade, c.copart, c.total]));
    rat.push([N("Subtotal"), "", N(r.mensalidade), N(r.copart), N(r2(r.mensalidade + r.copart))]); rat.push([]); });
  const pessoa = (l) => l.colaborador || l.titular;
  const men = [], cop = [];
  (rel.linhas || []).forEach((l) => {
    l.beneficiarios.forEach((b) => men.push([l.contrato, l.centro_custo || "—", pessoa(l), b.nome, b.faixa, b.valor, !l.diretoria ? r2(cobradoPositivo(b) * DESCONTO_MENSALIDADE) : 0]));
    l.itens.forEach((i) => cop.push([l.contrato, l.centro_custo || "—", pessoa(l), i.nome, i.data ? i.data.split("-").reverse().join("/") : "", i.descricao, i.valor, i.coberto || l.diretoria ? "Empresa" : "50% colaborador"])); });
  const desc = (lista) => lista.map((d) => [d.colaborador, d.cadastro || "", d.centro_custo || "", d.mensalidade, d.copart, d.total]);
  const conf = itensConferenciaUnimed(rel).map((i) => [i.titulo, i.texto]);
  return gerarXlsx([
    { nome: "Rateio", larguras: [48, 10, 18, 20, 14], linhas: [[{ v: `Unimed — rateio por centro de custo — ${nomeCompetencia(rel.competencia)}`, estilo: "titulo" }],
      ["Centro de custo da folha da BRIT; dependentes no titular; desligados fora do rateio (lançados na rescisão)."], [], ...rat] },
    { nome: "Descontos em folha", larguras: [40, 12, 40, 16, 18, 14], cabecalho: 0, linhas: [H(["Colaborador", "Matrícula", "Centro de custo", "Mensalidade (R$)", "Coparticipação (R$)", "Total (R$)"]), ...desc(rel.descontos || []),
      [N("TOTAL"), "", "", N(r2((rel.descontos || []).reduce((a, d) => a + d.mensalidade, 0))), N(r2((rel.descontos || []).reduce((a, d) => a + d.copart, 0))), N(r2((rel.descontos || []).reduce((a, d) => a + d.total, 0)))]] },
    { nome: "Rescisão", larguras: [40, 12, 40, 16, 18, 14], cabecalho: 0, linhas: [H(["Desligado", "Matrícula", "Centro de custo", "Mensalidade (R$)", "Coparticipação (R$)", "Total (R$)"]), ...desc(rel.rescisao || [])] },
    { nome: "Mensalidade", larguras: [10, 40, 36, 40, 10, 14, 14], cabecalho: 0, linhas: [H(["Contrato", "Centro de custo", "Colaborador", "Beneficiário", "Faixa", "Valor (R$)", "Desconto 11% (R$)"]), ...men] },
    { nome: "Coparticipação", larguras: [10, 40, 36, 24, 12, 26, 12, 18], cabecalho: 0, linhas: [H(["Contrato", "Centro de custo", "Colaborador", "Usuário", "Data", "Procedimento", "Valor (R$)", "Paga"]), ...cop] },
    { nome: "Conferência", larguras: [60, 110], cabecalho: 0, linhas: [H(["Ponto", "Detalhe"]), ...(conf.length ? conf : [["Nada a conferir", "Todos os PDFs anexados e todas as famílias encontradas."]])] },
  ]);
}

export function emailResumoUnimed(rel) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const td = "padding:4px 10px;border-bottom:1px solid #ddd";
  const blocos = (rel.rateio || []).map((r) => `<p><b>Contrato ${esc(r.contrato)} — ${esc(r.nome)}</b></p><table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><tr><th style="${td};text-align:left">Centro de custo</th><th style="${td}">Mensalidade</th><th style="${td}">Coparticipação</th></tr>${
    r.centros.map((c) => `<tr><td style="${td}">${esc(c.centro_custo)}</td><td style="${td};text-align:right">${esc(brl(c.mensalidade))}</td><td style="${td};text-align:right">${esc(brl(c.copart))}</td></tr>`).join("")}</table>`).join("");
  const conf = itensConferenciaUnimed(rel).map((i) => `<li><b>${esc(i.titulo)}:</b> ${esc(i.texto)}</li>`).join("");
  const td2 = (rel.descontos || []).reduce((a, d) => a + d.total, 0);
  return { assunto: `Unimed — rateio por centro de custo e descontos — ${nomeCompetencia(rel.competencia)}`,
    html: `<p>Unimed de <b>${esc(nomeCompetencia(rel.competencia))}</b>: total ${esc(brl(rel.total))}. Descontos em folha: <b>${esc(brl(td2))}</b> (${(rel.descontos || []).length} colaboradores).</p>${blocos}
${conf ? `<p><b>Conferência</b></p><ul>${conf}</ul>` : ""}<p style="color:#666;font-size:12px">A planilha completa (rateio, descontos em folha, rescisão, mensalidade e coparticipação) está no Portal de RH › Relatórios.</p>` };
}
