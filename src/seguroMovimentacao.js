// ─────────────────────────────────────────────────────────────────────────────
// Seguro de vida — movimentação para a Prudential (29/10/2026). Ideia do Asael: em vez de dois arquivos (admitidos e
// demitidos), o RH carrega a lista de COLABORADORES ATIVOS da folha (BRIT). A função do banco seguro_vida_movimentacao
// compara com os segurados do último demonstrativo da Prudential guardado no portal (pelo CPF) e devolve inclusões,
// exclusões e o que verificar. Este módulo lê a planilha da BRIT e gera a listagem para mandar à seguradora.
// Lógica pura (sem tela e sem rede): testada em testes/seguro_vida.
// ─────────────────────────────────────────────────────────────────────────────
import { zipLer, linhasPlanilha, dataCel } from "./feriasFolha.js";
import { gerarXlsx } from "./planilhaXlsx.js";
import { nomeCompetencia } from "./seguroVida.js";

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const cpf11 = (v) => { const d = String(v ?? "").replace(/\.0+$/, "").replace(/\D/g, ""); return d ? d.padStart(11, "0") : ""; };
// Cabeçalhos aceitos (a BRIT usa "Título Reduzido (Cargo)" e "Descrição (C.Custo)").
const COLUNAS = {
  nome: (h) => h === "NOME" || h === "NOME DO COLABORADOR" || h === "COLABORADOR",
  cpf: (h) => h === "CPF",
  sexo: (h) => h === "SEXO",
  cargo: (h) => h.includes("CARGO"),
  centro_custo: (h) => h.includes("C.CUSTO") || h.includes("CENTRO DE CUSTO") || h.includes("CENTRO DE RESULTADO"),
  admissao: (h) => h.startsWith("ADMISS"),
  nascimento: (h) => h.includes("NASC"),
};

// Linhas já lidas da planilha ([{A:..., B:...}]) → colaboradores ativos.
export function ativosDasLinhas(linhas) {
  const iCab = linhas.findIndex((c) => Object.values(c).some((v) => norm(v) === "CPF") && Object.values(c).some((v) => COLUNAS.nome(norm(v))));
  if (iCab < 0) throw new Error("Este arquivo não parece a lista de colaboradores ativos da BRIT (não achei as colunas Nome e CPF).");
  const mapa = {};
  for (const [col, titulo] of Object.entries(linhas[iCab])) {
    const h = norm(titulo);
    for (const [campo, teste] of Object.entries(COLUNAS)) if (!mapa[campo] && teste(h)) mapa[campo] = col;
  }
  const out = [];
  for (const c of linhas.slice(iCab + 1)) {
    const cpf = cpf11(c[mapa.cpf]), nome = String(c[mapa.nome] ?? "").trim();
    if (!cpf || !nome) continue;
    out.push({ cpf, nome, sexo: mapa.sexo ? String(c[mapa.sexo] ?? "").trim() : "", cargo: mapa.cargo ? String(c[mapa.cargo] ?? "").trim() : "",
      centro_custo: mapa.centro_custo ? String(c[mapa.centro_custo] ?? "").replace(/\s+/g, " ").trim() : "",
      admissao: mapa.admissao ? dataCel(c[mapa.admissao]) : null, nascimento: mapa.nascimento ? dataCel(c[mapa.nascimento]) : null });
  }
  if (!out.length) throw new Error("Nenhum colaborador com CPF encontrado na lista.");
  const dup = out.find((a, i) => out.findIndex((b) => b.cpf === a.cpf) !== i);
  if (dup) throw new Error(`CPF repetido na lista (${dup.nome}). Confira o arquivo.`);
  return { ativos: out, temNascimento: !!mapa.nascimento };
}
export async function lerAtivosBrit(buf) { return ativosDasLinhas(linhasPlanilha(await zipLer(buf))); }

const br = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const cpfF = (c) => { const d = cpf11(c); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : ""; };

// Planilha para mandar à Prudential: Inclusões, Exclusões e Verificar (aprendizes, sem nascimento, exclusão sem data).
export function gerarPlanilhaMovPrudential(r, hojeISO) {
  const H = (a) => a.map((v) => ({ v, estilo: "cabecalho" }));
  const verificar = [
    ...(r.sem_nascimento || []).map((n) => ["Inclusão sem data de nascimento (preencher antes de enviar)", n]),
    ...(r.exclusoes || []).filter((e) => !e.desligamento).map((e) => ["Exclusão sem data de desligamento no portal (preencher)", e.nome]),
    ...(r.exclusoes || []).filter((e) => e.status_portal === "ativo").map((e) => ["Fora da lista de ativos, mas ATIVO no portal (conferir antes de excluir)", e.nome]),
    ...(r.aprendizes || []).map((a) => ["Aprendiz fora do seguro (confirmar a regra da apólice antes de incluir)", a.nome]),
  ];
  return gerarXlsx([
    { nome: "Inclusões", larguras: [40, 16, 12, 8, 14, 30, 44], cabecalho: 1, linhas: [
      [{ v: `Seguro de vida (Prudential) — inclusões — base: demonstrativo de ${nomeCompetencia(r.base_competencia)}; lista de ativos de ${br(hojeISO)}`, estilo: "titulo" }],
      H(["Nome", "CPF", "Nascimento", "Sexo", "Admissão (início)", "Cargo", "Centro de resultado"]),
      ...(r.inclusoes || []).map((i) => [i.nome, cpfF(i.cpf), br(i.nascimento), i.sexo || "", br(i.admissao), i.cargo || "", i.centro_custo || ""])] },
    { nome: "Exclusões", larguras: [40, 16, 12, 16, 44, 14], cabecalho: 1, linhas: [
      [{ v: `Seguro de vida (Prudential) — exclusões — segurados que não estão mais na lista de ativos`, estilo: "titulo" }],
      H(["Nome", "CPF", "Nascimento", "Data de exclusão", "Centro de resultado", "Situação no portal"]),
      ...(r.exclusoes || []).map((e) => [e.nome, cpfF(e.cpf), br(e.nascimento), br(e.desligamento), e.centro_custo || "", e.status_portal || "não encontrado"])] },
    { nome: "Verificar", larguras: [70, 40], cabecalho: 0, linhas: [H(["Ponto", "Pessoa"]), ...(verificar.length ? verificar : [["Nada a verificar", ""]])] },
  ]);
}
