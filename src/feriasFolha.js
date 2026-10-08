// ─────────────────────────────────────────────────────────────────────────────
// Férias × folha BRIT: leitura do relatório de saldos e geração do formulário Word.
// Sem dependências externas (roda no navegador e no Node ≥ 18, o que permite testar
// com os arquivos reais da folha).
//
// Por quê um leitor próprio de .xlsx: o Excel exportado pela BRIT vem fora do padrão
// (caminhos internos com "\", estilos inválidos, texto em células "inlineStr"); as
// bibliotecas comuns recusam o arquivo. Também aceitamos o arquivo depois de salvo
// no Excel (aí ele passa a usar sharedStrings e caminhos com "/").
// ─────────────────────────────────────────────────────────────────────────────

// ── Datas em "YYYY-MM-DD", sem fuso: evita o erro clássico de o dia "voltar" um no Brasil (UTC−3).
export const addDias = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};
export const diasEntre = (a, b) => { // b − a, em dias
  const p = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86400000);
};
export const addAnos = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y + n, m - 1, d)).toISOString().slice(0, 10); };
export const br = iso => iso ? iso.split("-").reverse().join("/") : "—";

// As 4 opções do formulário oficial "Solicitação de Férias" (mantidas exatamente como no papel).
export const OPCOES_FERIAS = [
  { id: "30",   label: "30 dias em descanso",                               descanso: 30, abono: 0,  doc: "30 DIAS EM DESCANSO" },
  { id: "15",   label: "15 dias em descanso",                               descanso: 15, abono: 0,  doc: "15 DIAS EM DESCANSO" },
  { id: "5+10", label: "5 dias em descanso e 10 dias de abono pecuniário",  descanso: 5,  abono: 10, doc: "05 DIAS EM DESCANSO E 10 DIAS DE ABONO" },
  { id: "10",   label: "10 dias em descanso",                               descanso: 10, abono: 0,  doc: "10  DIAS EM DESCANSO" },
];

// ── ZIP mínimo ────────────────────────────────────────────────────────────────
async function inflar(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
// Lê todas as entradas; nomes normalizados com "/" (a BRIT grava "xl\sheet1.xml").
export async function zipLer(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Arquivo não é um .xlsx/.docx válido.");
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder(), out = new Map();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Estrutura do arquivo corrompida.");
    const metodo = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const loc = dv.getUint32(p + 42, true);
    const nome = dec.decode(u8.subarray(p + 46, p + 46 + nl)).replace(/\\/g, "/");
    const ini = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
    const dados = u8.subarray(ini, ini + csize);
    out.set(nome, metodo === 0 ? dados.slice() : await inflar(dados));
    p += 46 + nl + el + cl;
  }
  return out;
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
// Escreve um ZIP sem compressão ("stored"): simples, válido para o Word.
export function zipEscrever(entradas) {
  const enc = new TextEncoder(), partes = [], central = []; let off = 0;
  for (const [nome, dados] of entradas) {
    const nb = enc.encode(nome), crc = crc32(dados), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, dados.length, true); h.setUint32(22, dados.length, true); h.setUint16(26, nb.length, true);
    partes.push(new Uint8Array(h.buffer), nb, dados);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, dados.length, true); c.setUint32(24, dados.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + dados.length;
  }
  const tam = central.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entradas.length, true); e.setUint16(10, entradas.length, true); e.setUint32(12, tam, true); e.setUint32(16, off, true);
  return new Blob([...partes, ...central, new Uint8Array(e.buffer)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

// ── Relatório de saldos da folha (FPPF001 "Relatório Coleta") ───────────────────
const desesc = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const serialParaISO = v => { const n = Number(v); if (!Number.isFinite(n) || n < 20000) return null; return new Date(Date.UTC(1899, 11, 30 + Math.round(n))).toISOString().slice(0, 10); };
const brParaISO = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s || "").trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const dataCel = v => serialParaISO(v) || brParaISO(v);
const numCel = v => { if (v == null || v === "") return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };

function linhasPlanilha(arquivos) {
  const nomeSheet = [...arquivos.keys()].find(k => /(^|\/)sheet1\.xml$/i.test(k));
  if (!nomeSheet) throw new Error("Planilha não encontrada dentro do arquivo.");
  const dec = new TextDecoder(), x = dec.decode(arquivos.get(nomeSheet));
  const ss = [...arquivos.keys()].find(k => /sharedStrings\.xml$/i.test(k));
  const compart = ss ? [...dec.decode(arquivos.get(ss)).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => desesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(""))) : [];
  const linhas = [];
  for (const rm of x.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cel = {};
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, attrs, corpo = ""] = cm; const tipo = (/t="([^"]+)"/.exec(attrs) || [])[1];
      let v = null;
      const t = /<t[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/t>/.exec(corpo), vv = /<v>([\s\S]*?)<\/v>/.exec(corpo);
      if (tipo === "s" && vv) v = compart[Number(vv[1])] ?? null;
      else if (t) v = desesc(t[1]); else if (vv) v = desesc(vv[1]);
      if (v != null && v !== "") cel[col] = v;
    }
    if (Object.keys(cel).length) linhas.push(cel);
  }
  return linhas;
}

// Devolve { dataRelatorio, linhas:[{cadastro,nome,admissao,situacao,cargo,periodo_inicio,periodo_fim,direito,debito,saldo,sugestao}] }
export async function lerRelatorioFerias(buf) {
  const linhas = linhasPlanilha(await zipLer(buf));
  const texto = linhas.map(c => Object.values(c).join(" ")).join("\n");
  // Recusa outro relatório da folha (ex.: Colaboradores FPRE001, Aniversariantes FPRE006).
  if (!/Relat[óo]rio Coleta/i.test(texto) || !/FPPF001/.test(texto))
    throw new Error("Este arquivo não é o relatório de férias da folha (FPPF001 – Relatório Coleta).");
  const dr = /FPPF001\.COL\s*-\s*(\d{2}\/\d{2}\/\d{4})/.exec(texto);
  const out = []; let atual = null;
  for (const c of linhas) {
    const a = (c.A || "").trim();
    // Linha do colaborador: A = cadastro, B = nome, E = admissão, G = situação, H = cargo
    if (/^\d+$/.test(a) && c.B && c.B !== "-" && a !== "0289" && c.B !== "Nome") {
      atual = { cadastro: a, nome: c.B.trim(), admissao: dataCel(c.E), situacao: c.G || null, cargo: c.H || null };
    // Linha de período: F = início, H = "a", I = fim, J = direito, K = débito, L = saldo, M = sugestão
    } else if (atual && (c.H || "").trim() === "a") {
      const p = { ...atual, periodo_inicio: dataCel(c.F), periodo_fim: dataCel(c.I), direito: numCel(c.J), debito: numCel(c.K), saldo: numCel(c.L), sugestao: dataCel(c.M) };
      if (!p.periodo_inicio || !p.periodo_fim || p.direito == null || p.saldo == null)
        throw new Error(`Período ilegível para o cadastro ${atual.cadastro} (${atual.nome}).`);
      out.push(p);
    }
  }
  if (!out.length) throw new Error("Nenhum período de férias encontrado no arquivo.");
  return { dataRelatorio: dr ? brParaISO(dr[1]) : null, linhas: out };
}

// ── Formulário Word "Solicitação de Férias" preenchido ──────────────────────────
const escXml = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Preenche o próprio modelo do RH (public/modelos/solicitacao_ferias.docx), parágrafo a parágrafo.
// Lança erro se algum campo esperado não for encontrado — melhor do que entregar formulário incompleto.
export async function preencherFormularioFerias(modeloBuf, d) {
  const arq = await zipLer(modeloBuf);
  let xml = new TextDecoder().decode(arq.get("word/document.xml"));
  const op = OPCOES_FERIAS.find(o => o.id === d.opcao);
  const faltou = [];
  const noParagrafo = (contem, fn, rotulo) => {
    let achou = false;
    xml = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, p => {
      const txt = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join("");
      if (achou || !txt.includes(contem)) return p;
      achou = true; return fn(p);
    });
    if (!achou) faltou.push(rotulo);
  };
  const anexar = (rotulo, valor) => p => p.replace(new RegExp(`(<w:t[^>]*>)(${rotulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(</w:t>)`), `$1$2${escXml(valor)}$3`);
  const marcar = p => p.replace(/\(\s*\)/, "(X)");
  noParagrafo("FUNCIONÁRIO:", anexar("FUNCIONÁRIO: ", `${d.nome}${d.cadastro ? " (cadastro " + d.cadastro + ")" : ""}`), "funcionário");
  noParagrafo("DATA DE INÍCIO DO GOZO:", anexar("DATA DE INÍCIO DO GOZO: ", br(d.inicio)), "data de início");
  if (op) noParagrafo(op.doc, marcar, "opção");
  else faltou.push("opção");
  noParagrafo("PERIDO AQUISITIVO DE:", anexar("FÉRIAS RELATIVA AO PERIDO AQUISITIVO DE: ", d.periodo || ""), "período aquisitivo");
  if (d.adiantamento13 === true) noParagrafo(") SIM", marcar, "13º sim");
  if (d.adiantamento13 === false) noParagrafo(") NÃO", marcar, "13º não");
  if (faltou.length) throw new Error("O modelo do formulário mudou; campos não encontrados: " + faltou.join(", "));
  arq.set("word/document.xml", new TextEncoder().encode(xml));
  // [Content_Types].xml precisa vir primeiro no pacote.
  const ordem = [...arq.keys()].sort((a, b) => (a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : 0));
  return zipEscrever(ordem.map(k => [k, arq.get(k)]));
}

// ── E-mail "férias aprovadas" (HTML) ────────────────────────────────────────────
// Por quê HTML: o Power Automate envia o corpo como HTML; texto puro chegava sem quebras de linha.
// Mesmo visual do relatório mensal (supabase/functions/relatorio-ferias-mensal/montar.js).
export function emailFeriasAprovadasHtml({ nome, inicio, fim, dias, abono, periodo }) {
  const F = "font-family:'Segoe UI',Arial,Helvetica,sans-serif;";
  const linha = (r, v) => `<tr><td style="${F}font-size:13px;color:#64748b;padding:8px 0;border-bottom:1px solid #e2e8f0;width:45%;">${r}</td><td style="${F}font-size:14px;color:#0f172a;padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:700;">${v}</td></tr>`;
  const primeiro = escXml(String(nome || "").split(" ")[0]);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Férias aprovadas</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;"><tr><td align="center" style="padding:20px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;">
<tr><td style="background:#4338ca;padding:20px 18px;${F}">
  <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#c7d2fe;">Kalenborn do Brasil · Recursos Humanos</div>
  <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:6px;">Suas férias foram aprovadas ✓</div>
</td></tr>
<tr><td style="padding:22px 16px;${F}font-size:14px;line-height:1.6;color:#0f172a;">
  <p style="margin:0 0 14px 0;">Olá, <strong>${primeiro}</strong>!</p>
  <p style="margin:0 0 16px 0;">O RH aprovou suas férias. Confira os detalhes:</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px 0;">
    ${linha("Período de descanso", `${br(inicio)} a ${br(fim)}`)}
    ${dias ? linha("Dias de descanso", `${dias} dias`) : ""}
    ${abono ? linha("Abono pecuniário", `${abono} dias`) : ""}
    ${periodo ? linha("Período aquisitivo", escXml(periodo)) : ""}
  </table>
  <p style="margin:0;font-size:13px;color:#334155;">Os detalhes ficam disponíveis no Portal de RH, na tela <strong>Férias</strong>.</p>
</td></tr>
<tr><td style="padding:16px 18px;border-top:1px solid #e2e8f0;background:#fafafa;${F}font-size:12px;color:#64748b;">Mensagem automática. Dúvidas: fale com o RH.</td></tr>
</table></td></tr></table></body></html>`;
}
