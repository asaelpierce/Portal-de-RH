// ─────────────────────────────────────────────────────────────────────────────
// Ficha de registro da BRIT ("DADOS CADASTRAIS PARA ADMISSÃO") preenchida a partir da pré-admissão do portal.
// Preenche a PRÓPRIA planilha da BRIT (public/modelos/ficha_registro_brit.xlsx): mantém bordas, mesclagens e layout;
// só escreve o valor nas células de cada campo (todas existem no modelo como células vazias já formatadas).
// Mapa de células conferido no modelo em 15/10/2026.
// ─────────────────────────────────────────────────────────────────────────────
import { zipLer, zipEscrever } from "./feriasFolha.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const br = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso || "");
const cpfF = (c) => { const d = String(c || "").replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : c || ""; };
const cepF = (c) => { const d = String(c || "").replace(/\D/g, ""); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : c || ""; };
const sn = (v) => (v === true || v === "sim" ? "SIM" : v === false || v === "nao" ? "NÃO" : v || "");

// Escreve cada valor na célula indicada, mantendo o estilo (s="…") da célula do modelo.
// Célula vazia (<c r="B5" s="32"/>) ou com valor (<c …>…</c>) — as duas formas existem no modelo.
export function preencherCelulas(xml, valores) {
  const faltou = [];
  for (const [ref, valor] of Object.entries(valores)) {
    if (valor === undefined || valor === null || String(valor).trim() === "") continue;
    const re = new RegExp(`<c r="${ref}"((?:\\s+(?!t=)[a-z]+="[^"]*")*)(?:\\s+t="[^"]*")?((?:\\s+[a-z]+="[^"]*")*)\\s*(?:/>|>[\\s\\S]*?</c>)`);
    if (!re.test(xml)) { faltou.push(ref); continue; }
    xml = xml.replace(re, (_, a1, a2) => `<c r="${ref}"${a1}${a2} t="inlineStr"><is><t xml:space="preserve">${esc(valor)}</t></is></c>`);
  }
  if (faltou.length) throw new Error("O modelo da ficha mudou; células não encontradas: " + faltou.join(", "));
  return xml;
}

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sab"];
// c = dados do candidato (ficha), e = dados do vínculo (RH)
export function celulasFicha(c = {}, e = {}) {
  const v = {
    G3: e.filial, B4: e.centro_custo, G4: e.departamento,
    B5: c.nome, I5: c.raca, B6: c.mae, B7: c.pai, B8: br(c.nascimento), G8: c.escolaridade,
    B9: c.estado_civil, G9: c.telefone, B10: c.naturalidade, G10: c.email,
    B11: [c.logradouro, c.complemento].filter(Boolean).join(", "), H11: c.numero,
    B12: c.bairro, F12: cepF(c.cep), H12: c.cidade,
    B13: c.ctps, F13: c.ctps_serie_uf, H13: br(c.ctps_emissao),
    B14: c.rg, F14: br(c.rg_emissao), H14: cpfF(c.cpf),
    B15: c.pis, H15: br(c.pis_data), B16: c.titulo, F16: c.titulo_zona, I16: c.titulo_secao, B17: c.cnh,
    B23: e.tipo_vinculo, B24: br(e.data_admissao), E24: e.funcao, I24: e.salario,
    B25: c.banco, D25: c.agencia, F25: c.conta, I25: c.tipo_conta,
    E26: sn(e.contribuicao_sindical), I26: e.sindicato,
    C27: e.experiencia_dias, G27: e.prorrogacao_dias,
    D35: e.dsr, H35: e.jornada_semanal, J35: e.jornada_mensal,
    B36: sn(e.adiantamento), D36: e.adiantamento_pct, F36: sn(e.vale_refeicao), H36: e.vr_valor, J36: e.vr_qtd,
    B37: sn(e.vale_transporte), D37: e.vt_tarifa, G37: e.vt_qtd, B38: sn(e.vale_transporte2), D38: e.vt2_tarifa, G38: e.vt2_qtd,
  };
  (c.dependentes || []).slice(0, 4).forEach((d, i) => { const l = 18 + i; v["B" + l] = d.nome; v["G" + l] = d.vinculo; v["J" + l] = sn(d.irrf); });
  DIAS.forEach((dia, i) => { const h = (e.horarios || {})[dia] || {}; const l = 29 + i; v["C" + l] = h.entrada; v["E" + l] = h.saida; v["G" + l] = h.intervalo_ini; v["I" + l] = h.intervalo_fim; });
  return v;
}

export async function gerarFichaBrit(modeloBuf, cand, emp) {
  const arq = await zipLer(modeloBuf);
  const caminho = "xl/worksheets/sheet1.xml";
  if (!arq.get(caminho)) throw new Error("Modelo da ficha inválido (planilha não encontrada).");
  const xml = preencherCelulas(new TextDecoder().decode(arq.get(caminho)), celulasFicha(cand, emp));
  arq.set(caminho, new TextEncoder().encode(xml));
  const ordem = [...arq.keys()].sort((a, b) => (a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : 0));
  return zipEscrever(ordem.map((k) => [k, arq.get(k)]));
}

// Dados para o kit de admissão (documentosAdmissao.js) a partir da pré-admissão.
export function dadosKitDaAdmissao(a) {
  const c = a.dados_candidato || {}, e = a.dados_empresa || {};
  return {
    nome: c.nome || a.nome, cargo: e.funcao || a.cargo || "", admissao: e.data_admissao || "",
    ctps: [c.ctps, c.ctps_serie_uf ? "série " + c.ctps_serie_uf : ""].filter(Boolean).join(" "),
    endereco: [[c.logradouro, c.numero].filter(Boolean).join(", "), c.complemento, c.bairro, c.cidade, c.cep ? "CEP " + cepF(c.cep) : ""].filter(Boolean).join(", "),
    rg: c.rg || "", cpf: c.cpf || "", data_nascimento: c.nascimento || "", naturalidade: c.naturalidade || "", estado_civil: c.estado_civil || "", sexo: c.sexo || "",
  };
}
