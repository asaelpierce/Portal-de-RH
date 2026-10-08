// ─────────────────────────────────────────────────────────────────────────────
// Leitura do AFD (Arquivo-Fonte de Dados) dos relógios de ponto (REP), leiaute da Portaria 1510/2009,
// que é o gerado pelos relógios da Kalenborn (registros de 34 caracteres para batidas).
// Sem dependências: roda no navegador e no Node (permite testar com os arquivos reais).
//
// Registros usados:
//   tipo 1 (cabeçalho): CNPJ, razão social, nº de fabricação do REP, período e data/hora de geração
//   tipo 3 (marcação):  NSR(9) + "3" + data DDMMAAAA + hora HHMM + PIS(12)
//   tipo 9 (trailer):   quantidade de registros de cada tipo → usado para conferir que nada se perdeu
// Outros tipos (2, 4, 5) são ignorados aqui.
// ─────────────────────────────────────────────────────────────────────────────

const iso = (ddmmaaaa) => `${ddmmaaaa.slice(4, 8)}-${ddmmaaaa.slice(2, 4)}-${ddmmaaaa.slice(0, 2)}`;

export function lerAfd(texto) {
  const linhas = String(texto).split(/\r?\n/).filter((l) => l.trim() !== "");
  const cab = linhas.find((l) => l[9] === "1");
  if (!cab || cab.length < 232) throw new Error("Arquivo não parece um AFD de relógio de ponto (cabeçalho ausente).");
  const trailer = linhas.find((l) => l.startsWith("999999999"));
  const batidas = [];
  for (const l of linhas) {
    if (l[9] !== "3") continue;
    if (l.length < 34 || !/^\d{34}/.test(l)) throw new Error("Marcação em formato desconhecido (o arquivo pode ser do leiaute da Portaria 671).");
    const data = iso(l.slice(10, 18)), hora = `${l.slice(18, 20)}:${l.slice(20, 22)}`;
    batidas.push({ nsr: Number(l.slice(0, 9)), data_hora: `${data}T${hora}:00`, pis: l.slice(22, 34) });
  }
  // Conferência: o trailer informa quantas marcações (tipo 3) o relógio exportou.
  if (trailer) {
    const qtd3 = Number(trailer.slice(18, 27));
    if (qtd3 !== batidas.length) throw new Error(`Arquivo incompleto: o relógio informa ${qtd3} marcações, mas há ${batidas.length}.`);
  }
  if (!batidas.length) throw new Error("Nenhuma marcação no arquivo.");
  return {
    cnpj: cab.slice(11, 25),
    razaoSocial: cab.slice(37, 187).trim(),
    rep: cab.slice(187, 204),
    periodoInicio: iso(cab.slice(204, 212)),
    periodoFim: iso(cab.slice(212, 220)),
    geradoEm: `${iso(cab.slice(220, 228))}T${cab.slice(228, 230)}:${cab.slice(230, 232)}:00`,
    conferidoPeloTrailer: !!trailer,
    batidas,
  };
}
