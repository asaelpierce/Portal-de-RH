// Lógica pura da extração de currículos (sem rede/banco) — testável fora do servidor.
// Decisões do Asael (15/10/2026): PDF, Word e foto; a IA SÓ SUGERE (RH decide); nada de inventar dados.
import { unzipSync, strFromU8 } from "npm:fflate@0.8.2";

export const TIPOS = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "imagem", "image/png": "imagem", "image/webp": "imagem",
};
export const tipoPorNome = (nome = "") => {
  const ext = nome.toLowerCase().split(".").pop();
  return { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
           jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[ext] || "";
};

// Texto de um .docx: parágrafos de word/document.xml.
export function textoDocx(bytes) {
  const z = unzipSync(bytes);
  const xml = z["word/document.xml"] ? strFromU8(z["word/document.xml"]) : "";
  if (!xml) throw new Error("Arquivo Word inválido.");
  const des = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [])
    .map((p) => des([...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)].map((m) => (m[1] ?? "\t")).join("")))
    .filter((t) => t.trim()).join("\n");
}

export function instrucao(vagas, vagaFixa) {
  const lista = vagas.map((v) => `- id:"${v.id}" | ${v.title}${v.area ? " (" + v.area + ")" : ""} — ${(v.descricao || "").slice(0, 200)}`).join("\n");
  return `Você é um recrutador sênior da Kalenborn do Brasil (indústria em Vespasiano/MG). Leia o currículo anexado e responda APENAS com um JSON válido, sem markdown.

REGRAS:
- Bloco "candidato": copie SOMENTE o que está escrito no currículo. Se um dado não aparecer, deixe "" (ou [] / null). NUNCA invente nome, e-mail, telefone, cidade ou qualquer outro dado.
- "experiencia_anos": estime pelos períodos das experiências (número). "experiencias": as mais recentes primeiro, no máximo 8.
- Bloco "avaliacao": é só uma SUGESTÃO para o RH (quem decide é o RH). Seja criterioso e justo; score de 0 a 100.
- Se o arquivo não for um currículo ou estiver ilegível, responda {"legivel": false, "motivo": "..."}.
${vagaFixa ? `- Avalie para a vaga: ${vagaFixa.title} — ${(vagaFixa.descricao || "").slice(0, 400)}. Use "vaga_id": "${vagaFixa.id}".`
           : `- Escolha em "vaga_id" a vaga ativa que MAIS combina (ou null se nenhuma combinar bem). Vagas ativas:\n${lista || "(nenhuma vaga ativa)"}`}

FORMATO:
{"legivel": true,
 "candidato": {"nome":"","email":"","telefone":"","cidade":"","linkedin":"","formacao":"","experiencia_anos":0,
   "experiencias":[{"empresa":"","cargo":"","periodo":""}],"habilidades":[],"certificacoes":[],"idiomas":[],"cnh":"","pretensao_salarial":""},
 "avaliacao": {"vaga_id":null,"area_sugerida":"","score":0,"tech":0,"behavior":0,"resumo":"","pontos_fortes":[],"pontos_atencao":[],
   "sugestao":"aprovado|revisao|rejeitado"}}`;
}

export function lerJsonIA(texto) {
  const t = String(texto || "").replace(/```json|```/g, "").trim();
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i < 0 || j < i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
}

const lim = (s, n) => String(s ?? "").trim().slice(0, n);
const lista = (a, n = 30, t = 120) => (Array.isArray(a) ? a.map((x) => lim(x, t)).filter(Boolean).slice(0, n) : []);
export const soDigitos = (s) => String(s || "").replace(/\D/g, "");
export function normalizarEmail(e) { const v = lim(e, 120).toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : ""; }
export function normalizarTelefone(t) {
  let d = soDigitos(t); if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return "";   // fora do padrão brasileiro: não grava um telefone duvidoso
}
const nota = (n) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null; };

// Converte a resposta da IA nas colunas de "candidatos". vagasIds = ids de vagas ativas válidos.
export function paraCandidato(ia, { nomeArquivo, vagasIds, vagaFixaId }) {
  const c = ia.candidato || {}, a = ia.avaliacao || {};
  const nomeIA = lim(c.nome, 120);
  const nome = nomeIA.length >= 3 ? nomeIA : lim(String(nomeArquivo || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "), 120);
  const sug = ["aprovado", "revisao", "rejeitado"].includes(a.sugestao) ? a.sugestao : "revisao";
  const vaga = vagaFixaId ? String(vagaFixaId) : (a.vaga_id != null && vagasIds.includes(String(a.vaga_id)) ? String(a.vaga_id) : null);
  return {
    name: nome, email: normalizarEmail(c.email) || null, phone: normalizarTelefone(c.telefone) || null,
    cidade: lim(c.cidade, 80) || null, linkedin: lim(c.linkedin, 200) || null, formacao: lim(c.formacao, 200),
    experiencia_anos: Number.isFinite(Number(c.experiencia_anos)) ? Math.max(0, Math.min(60, Number(c.experiencia_anos))) : null,
    experiencias: (Array.isArray(c.experiencias) ? c.experiencias : []).slice(0, 8).map((x) => ({ empresa: lim(x?.empresa, 100), cargo: lim(x?.cargo, 100), periodo: lim(x?.periodo, 60) })),
    habilidades: lista(c.habilidades), certificacoes: lista(c.certificacoes), idiomas: lista(c.idiomas, 10, 60), cnh: lim(c.cnh, 20) || null,
    salario_pret: lim(c.pretensao_salarial, 60) || null,
    vaga_id: vaga, area_sugerida: lim(a.area_sugerida, 80) || null,
    score: nota(a.score), tech: nota(a.tech), behavior: nota(a.behavior), resumo: lim(a.resumo, 2000),
    sugestao_ia: sug,
    analise_ia: { pontos_fortes: lista(a.pontos_fortes, 10, 300), pontos_atencao: lista(a.pontos_atencao, 10, 300), nome_do_arquivo: nomeIA.length < 3 },
  };
}

// Duplicado: mesmo e-mail, ou mesmo telefone (8 últimos dígitos).
export function acharDuplicado(existentes, novo) {
  const tel = soDigitos(novo.phone).slice(-8);
  return existentes.find((x) => (novo.email && (x.email || "").toLowerCase() === novo.email) || (tel.length === 8 && soDigitos(x.phone).slice(-8) === tel)) || null;
}
