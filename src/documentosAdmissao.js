// ─────────────────────────────────────────────────────────────────────────────
// Kit de admissão: preenche os modelos oficiais do RH (public/modelos/*.docx) com os dados do colaborador.
// Pedido do Asael (15/10/2026). Reaproveita a leitura/escrita de .docx de feriasFolha.js.
//
// No Word, um texto como "nome completo, cargo, ctps , endereço completo" costuma estar picotado em vários
// pedaços de formatação (no Acordo são 25). substituirNoParagrafo() encontra o trecho mesmo picotado e troca,
// mantendo a formatação do pedaço onde ele começa. Se algum campo não for encontrado (modelo mudou), NÃO gera
// o documento pela metade: lança erro dizendo qual campo faltou.
// ─────────────────────────────────────────────────────────────────────────────
import { zipLer, zipEscrever } from "./feriasFolha.js";

const desesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const preservar = (abre) => /xml:space=/.test(abre) ? abre : abre.replace("<w:t", '<w:t xml:space="preserve"');
// Os modelos marcam os campos a preencher em VERMELHO (ex.: Acordo: FF0000/EE0000). Ao preencher, a cor vermelha sai do
// pedaço preenchido (fica a cor normal do texto). Outras cores do modelo são mantidas.
const ehVermelho = (hex) => { const v = parseInt(hex, 16); if (isNaN(v) || hex.length !== 6) return false; const r = v >> 16, g = (v >> 8) & 255, b = v & 255; return r >= 0xC0 && g <= 0x50 && b <= 0x50; };
const tirarVermelhoDoPedaco = (seg) => {               // seg termina logo antes do <w:t> preenchido
  const i = Math.max(seg.lastIndexOf("<w:r>"), seg.lastIndexOf("<w:r "));
  return i < 0 ? seg : seg.slice(0, i) + seg.slice(i).replace(/<w:color w:val="([0-9A-Fa-f]{6})"[^>]*\/>/g, (m, hex) => (ehVermelho(hex) ? "" : m));
};

// Troca a 1ª ocorrência de `procura` (texto visível) dentro de UM parágrafo; devolve null se não achar.
export function substituirNoParagrafo(p, procura, novo) {
  const re = /(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g; const nos = []; let m;
  while ((m = re.exec(p))) nos.push({ ini: m.index, fim: m.index + m[0].length, abre: m[1], txt: desesc(m[2]), fecha: m[3] });
  const todo = nos.map((n) => n.txt).join(""); const pos = todo.indexOf(procura);
  if (pos < 0) return null;
  const fimPos = pos + procura.length; let acc = 0; let out = ""; let ultimo = 0;
  for (const n of nos) {
    const a = acc, b = acc + n.txt.length; acc = b;
    if (b <= pos || a >= fimPos) continue;                       // pedaço fora do trecho: fica como está
    const antes = pos > a ? n.txt.slice(0, pos - a) : "";
    const depois = fimPos < b ? n.txt.slice(fimPos - a) : "";
    const texto = (pos >= a && pos < b ? antes + novo : antes) + depois; // o texto novo entra no pedaço onde o trecho começa
    out += tirarVermelhoDoPedaco(p.slice(ultimo, n.ini)) + preservar(n.abre) + esc(texto) + n.fecha; ultimo = n.fim;
  }
  return out + p.slice(ultimo);
}

// Texto visível de um parágrafo (para achar a opção a marcar).
const textoParagrafo = (p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => desesc(m[1])).join("");
// Normaliza o rótulo de uma opção "( ) TEXTO;" → "TEXTO" (espaços comuns ou não separáveis, ponto e vírgula/ponto final).
const normOpcao = (t) => t.replace(/^\s*\(\s*X?\s*\)\s*/i, "").replace(/[\s\u00a0]+/g, " ").replace(/[;.\s]+$/, "").trim().toUpperCase();

// Aplica as trocas no document.xml; cada troca precisa ser encontrada (senão erro com o nome do campo).
// Tipos de troca:  { procura, novo }  troca texto  ·  { marcar: "RÓTULO DA OPÇÃO" }  marca "( )" → "(X)" no parágrafo
// cuja opção é exatamente esse rótulo  ·  opcional: true  não acusa erro se não achar (campo não obrigatório).
export async function preencherDocx(modeloBuf, trocas) {
  const arq = await zipLer(modeloBuf);
  let xml = new TextDecoder().decode(arq.get("word/document.xml"));
  const faltou = [];
  for (const t of trocas) {
    let achou = false;
    xml = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (p) => {
      if (achou) return p;
      if (t.marcar) {
        const txt = textoParagrafo(p);
        if (normOpcao(txt) !== normOpcao(t.marcar)) return p;
        const caixa = txt.match(/\(\s*\)/); if (!caixa) return p;     // já marcada ou sem caixa
        const r = substituirNoParagrafo(p, caixa[0], "(X)"); if (r === null) return p;
        achou = true; return r;
      }
      const r = substituirNoParagrafo(p, t.procura, t.novo);
      if (r === null) return p;
      achou = true; return r;
    });
    if (!achou && !t.opcional) faltou.push(t.rotulo || t.marcar || t.procura);
  }
  if (faltou.length) throw new Error("O modelo mudou; campos não encontrados: " + faltou.join(", "));
  arq.set("word/document.xml", new TextEncoder().encode(xml));
  const ordem = [...arq.keys()].sort((a, b) => (a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : 0));
  return zipEscrever(ordem.map((k) => [k, arq.get(k)]));
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const dataExtenso = (iso) => { const [a, m, d] = iso.split("-").map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
const dataBR = (iso) => iso.split("-").reverse().join("/");
const cpfFormatado = (c) => { const d = String(c || "").replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : String(c || ""); };

// Documentos do kit. "precisa" = dados obrigatórios para gerar.
export const DOCUMENTOS_ADMISSAO = [
  { id: "carta", titulo: "Carta de boas-vindas", modelo: "/modelos/carta_boas_vindas.docx", precisa: ["nome"],
    trocas: (c) => [{ procura: "Nome completo colaborador", novo: c.nome, rotulo: "nome" }] },
  { id: "conduta", titulo: "Termo de compromisso do Manual de Conduta", modelo: "/modelos/termo_manual_conduta.docx", precisa: ["nome", "admissao"],
    trocas: (c) => [
      { procura: "Data de admissão", novo: dataExtenso(c.admissao), rotulo: "data (Vespasiano, …)" },
      { procura: "Nome completo colaborador", novo: c.nome, rotulo: "nome (assinatura)" }] },
  { id: "acordo", titulo: "Acordo individual de compensação de jornada (banco de horas)", modelo: "/modelos/acordo_banco_de_horas.docx", precisa: ["nome", "admissao", "cargo", "ctps", "endereco"],
    trocas: (c) => [
      { procura: "nome completo, cargo, ctps , endereço completo", novo: `${c.nome}, ${c.cargo}, CTPS nº ${c.ctps}, residente e domiciliado(a) em ${c.endereco}`, rotulo: "qualificação do empregado" },
      { procura: "data de admissão", novo: dataBR(c.admissao), rotulo: "data da cláusula primeira" },
      { procura: "Data de admissão", novo: dataExtenso(c.admissao), rotulo: "data (Vespasiano, …)" },
      { procura: "Nome completo colaborador", novo: c.nome, rotulo: "nome (assinatura)" }] },
];
DOCUMENTOS_ADMISSAO.push({ id: "imagem", titulo: "Termo de autorização de uso de imagem", modelo: "/modelos/termo_uso_imagem.docx",
  precisa: ["nome", "admissao", "cargo", "endereco", "rg", "cpf", "data_nascimento", "naturalidade", "estado_civil"],
  trocas: (c) => [
    { procura: "[NOME COMPLETO]", novo: c.nome, rotulo: "nome" },
    { procura: "[LOCAL DE NASCIMENTO]", novo: c.naturalidade, rotulo: "local de nascimento" },
    { procura: "[Data de nascimento] [estado civil]", novo: `${dataBR(c.data_nascimento)}, ${c.estado_civil}`, rotulo: "data de nascimento e estado civil" },
    { procura: "[cargo]", novo: c.cargo, rotulo: "cargo" },
    { procura: "[nº da identidade]", novo: c.rg, rotulo: "RG" },
    { procura: "[nº do CPF]", novo: cpfFormatado(c.cpf), rotulo: "CPF" },
    { procura: "[ENDEREÇO COMPLETO]", novo: c.endereco, rotulo: "endereço" },
    { procura: "Data de admissão", novo: dataExtenso(c.admissao), rotulo: "data (Vespasiano/MG, …)" },
    { procura: "Nome completo do colaborador", novo: c.nome, rotulo: "nome (assinatura)" },
    { procura: "CPF do colaborador", novo: "CPF " + cpfFormatado(c.cpf), rotulo: "CPF (assinatura)" }] });

export const faltandoPara = (doc, c) => doc.precisa.filter((k) => !String(c[k] ?? "").trim());

// ── Solicitação de rescisão (modelo da BRIT). Gerada no fluxo de desligamento, com as opções escolhidas pelo RH.
export const TIPOS_AVISO = ["TÉRMINO DE CONTRATO DE EXPERIÊNCIA", "INDENIZADO", "TRABALHADO", "OUTROS – PEDIDO DE DEMISSÃO"];
export const TIPOS_RESCISAO = ["TÉRMINO DE CONTRATO EXPERIÊNCIA, EMPREGADO", "TÉRMINO DE CONTRATO EXPERIÊNCIA, ANTECIPADO, EMPREGADO",
  "TÉRMINO DE CONTRATO EXPERIÊNCIA, EMPREGADOR", "TÉRMINO DE CONTRATO EXPERIÊNCIA, ANTECIPADO, EMPREGADOR", "DISPENSA SEM JUSTA CAUSA",
  "DISPENSA COM JUSTA CAUSA", "PEDIDO DE DISPENSA SEM JUSTA CAUSA", "PEDIDO DE DISPENSA COM JUSTA CAUSA", "MORTE EMPREGADO", "TERMINO ESTÁGIO", "TERMINO APRENDIZAGEM"];
// Sugestão a partir do tipo de desligamento do portal (só quando a correspondência é inequívoca; o RH confirma).
export const SUGESTAO_RESCISAO = { sem_justa_causa: "DISPENSA SEM JUSTA CAUSA", justa_causa: "DISPENSA COM JUSTA CAUSA" };
export const DESCONTOS_MARCAR = ["Vale Transporte", "Vale Refeição", "Aviso Prévio"];
export const MODELO_RESCISAO = "/modelos/solicitacao_rescisao.docx";
// r = { nome, cadastro, dataAviso, tipoAviso, tipoRescisao, horasExtras, premio, comissoes, adicionalNoturno, outrosProventos,
//       descontos: ["Vale Transporte", ...], faltas, dsr, atrasos, outrosDescontos }
export const trocasRescisao = (r) => {
  const com = (rotulo, valor, novo) => (String(valor ?? "").trim() ? [{ procura: rotulo, novo: novo(String(valor).trim()), rotulo }] : []);
  return [
    { procura: "COLABORADOR: ", novo: `COLABORADOR: ${r.nome}${r.cadastro ? " (cadastro " + r.cadastro + ")" : ""}`, rotulo: "colaborador" },
    { procura: "[Data da admissão]", novo: dataBR(r.dataAviso), rotulo: "data do aviso prévio" },
    { marcar: r.tipoAviso, rotulo: "tipo de aviso" },
    { marcar: r.tipoRescisao, rotulo: "tipo de rescisão" },
    ...com("a) Horas Extras: a 65 % :", r.horasExtras, (v) => "a) Horas Extras: a 65 % : " + v),
    ...com("b) Prêmio:", r.premio, (v) => "b) Prêmio: " + v),
    ...com("c) Comissões", r.comissoes, (v) => "c) Comissões: " + v),
    ...com("d) Adional Noturno", r.adicionalNoturno, (v) => "d) Adional Noturno: " + v),
    ...com("e) Outros: Abono de férias (cct)", r.outrosProventos, (v) => "e) Outros: Abono de férias (cct): " + v),
    ...(r.descontos || []).map((d) => ({ marcar: d, rotulo: "desconto " + d })),
    ...com("Faltas:", r.faltas, (v) => "Faltas: " + v),
    ...com("DSR:", r.dsr, (v) => "DSR: " + v),
    ...com("Atrasos:", r.atrasos, (v) => "Atrasos: " + v),
    ...com("Outros : ", r.outrosDescontos, (v) => "Outros : " + v + " — "),
  ];
};
