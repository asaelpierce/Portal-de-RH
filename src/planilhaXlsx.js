// ─────────────────────────────────────────────────────────────────────────────
// Gerador mínimo de planilha Excel (.xlsx) — várias abas, cabeçalho em negrito, larguras, cabeçalho congelado
// e filtro. Sem dependências (o portal não usa biblioteca de planilha; a leitura da folha também é própria).
// Usado no relatório da aba Eventos. Testado abrindo o arquivo com openpyxl.
//
// gerarXlsx([{ nome, larguras:[n,...], linhas:[[celula,...],...], cabecalho: índice da linha de cabeçalho (opcional) }])
//   celula: string | number | null  ou  { v, estilo:"titulo"|"negrito"|"cabecalho" }
// Retorna Uint8Array (conteúdo do arquivo).
// ─────────────────────────────────────────────────────────────────────────────

const enc = new TextEncoder();
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  // caracteres de controle não são válidos em XML (exceto tab/quebra de linha)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const coluna = (i) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const ESTILO = { normal: 0, cabecalho: 1, negrito: 2, titulo: 3 };

// ── CRC32 + ZIP sem compressão (formato "stored"), suficiente para .xlsx ──
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(arquivos) {
  const partes = [], central = []; let pos = 0;
  for (const { nome, dados } of arquivos) {
    const n = enc.encode(nome), crc = crc32(dados);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); // UTF-8 nos nomes
    loc.setUint32(14, crc, true); loc.setUint32(18, dados.length, true); loc.setUint32(22, dados.length, true); loc.setUint16(26, n.length, true);
    partes.push(new Uint8Array(loc.buffer), n, dados);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, dados.length, true); cen.setUint32(24, dados.length, true); cen.setUint16(28, n.length, true);
    cen.setUint32(42, pos, true);
    central.push(new Uint8Array(cen.buffer), n);
    pos += 30 + n.length + dados.length;
  }
  const tamCentral = central.reduce((a, b) => a + b.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true); fim.setUint32(16, pos, true);
  const tudo = [...partes, ...central, new Uint8Array(fim.buffer)];
  const out = new Uint8Array(tudo.reduce((a, b) => a + b.length, 0)); let o = 0;
  for (const p of tudo) { out.set(p, o); o += p.length; }
  return out;
}

function planilha({ larguras = [], linhas = [], cabecalho = null }) {
  const cols = larguras.length ? `<cols>${larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const congelar = cabecalho !== null
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${cabecalho + 1}" topLeftCell="A${cabecalho + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const rows = linhas.map((l, r) => `<row r="${r + 1}">${(l || []).map((c, i) => {
    if (c === null || c === undefined || c === "") return "";
    const obj = typeof c === "object" ? c : { v: c };
    const s = ESTILO[obj.estilo || (r === cabecalho ? "cabecalho" : "normal")] || 0;
    const ref = coluna(i) + (r + 1);
    return typeof obj.v === "number" && isFinite(obj.v)
      ? `<c r="${ref}" s="${s}"><v>${obj.v}</v></c>`
      : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(obj.v)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const largura = Math.max(1, ...linhas.map((l) => (l || []).length));
  const filtro = cabecalho !== null && linhas.length > cabecalho + 1 ? `<autoFilter ref="A${cabecalho + 1}:${coluna(largura - 1)}${linhas.length}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${congelar}${cols}<sheetData>${rows}</sheetData>${filtro}</worksheet>`;
}

export function gerarXlsx(abas) {
  if (!abas?.length) throw new Error("Nenhuma aba para gerar.");
  // Nomes de aba: até 31 caracteres, sem : \ / ? * [ ] e sem repetir.
  const usados = new Set();
  const nomes = abas.map((a, i) => { let n = String(a.nome || `Aba ${i + 1}`).replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim() || `Aba ${i + 1}`; while (usados.has(n)) n = (n.slice(0, 28) + " " + i); usados.add(n); return n; });
  const xml = (s) => enc.encode(s);
  const arquivos = [
    { nome: "[Content_Types].xml", dados: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${nomes.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`) },
    { nome: "_rels/.rels", dados: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { nome: "xl/workbook.xml", dados: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomes.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`) },
    { nome: "xl/_rels/workbook.xml.rels", dados: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${nomes.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${nomes.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    // Estilos: 0 normal · 1 cabeçalho (negrito, fundo cinza, borda inferior) · 2 negrito · 3 título (negrito 14)
    { nome: "xl/styles.xml", dados: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF94A3B8"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`) },
    ...abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: xml(planilha(a)) })),
  ];
  return zip(arquivos);
}
