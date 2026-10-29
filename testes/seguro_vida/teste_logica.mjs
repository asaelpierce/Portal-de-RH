// Testes da lógica do rateio do seguro de vida (src/seguroVida.js) com dados FICTÍCIOS.
// Rodar: node testes/seguro_vida/teste_logica.mjs  (copia os módulos para .mjs numa pasta temporária)
import fs from "fs"; import os from "os"; import path from "path"; import { execSync } from "child_process";
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sv-"));
fs.writeFileSync(path.join(tmp, "planilhaXlsx.mjs"), fs.readFileSync(path.join(raiz, "src/planilhaXlsx.js")));
fs.writeFileSync(path.join(tmp, "seguroVida.mjs"), fs.readFileSync(path.join(raiz, "src/seguroVida.js"), "utf8").replace('"./planilhaXlsx.js"', '"./planilhaXlsx.mjs"'));
const sv = await import(path.join(tmp, "seguroVida.mjs"));
const res = {}; const ok = (n, v) => { res[n] = !!v; };

// 1) Leitura: linhas como o pdf.js monta (fictícias)
const texto = ["VG EXPRESS", "Prudential", "RELATÓRIO DE MOVIMENTAÇÃO", "Ano/Mês Vigência", "377483  1  1099300016171  66  2026/10",
  "MARIA DA SILVA TESTE  111.444.777-35  10/02/1990  01/05/2026  41.696,00  4,47",
  "JOSÉ CONCEIÇÃO FICTÍCIO  022.333.444-05  03/04/1985  01/01/2024  119.876,00  12,87",
  "ANA EXCLUÍDA TESTE  333.222.111-00  01/01/1999  01/08/2026  Exclusão  0,00  0,00",
  "TOTAL:  3.372.164,00  17,34"];
const r = sv.lerDemonstrativoVG(texto);
ok("L1 competência AAAA-MM", r.competencia === "2026-10");
ok("L2 três segurados, exclusão reconhecida", r.linhas.length === 3 && r.linhas[2].movimentacao === "Exclusão" && r.linhas[2].premio === 0);
ok("L3 CPF com zero à frente preservado", r.linhas[1].cpf === "02233344405");
ok("L4 números brasileiros (milhar e vírgula)", r.linhas[1].capital === 119876 && r.linhas[1].premio === 12.87);
ok("L5 soma confere com o total impresso", r.soma === 17.34 && r.confere === true);
ok("L6 total que não confere é detectado", sv.lerDemonstrativoVG([...texto.slice(0, -1), "TOTAL:  1,00  99,99"]).confere === false);
let erro = ""; try { sv.lerDemonstrativoVG(["Boleto qualquer", "R$ 10,00"]); } catch (e) { erro = e.message; }
ok("L7 outro PDF é recusado com mensagem clara", /não parece o Relatório de Movimentação/.test(erro));
ok("L8 linhas espalhadas são agrupadas por altura", JSON.stringify(sv.agruparLinhas([{ str: "B", x: 50, y: 10 }, { str: "A", x: 10, y: 10.8 }, { str: "C", x: 5, y: 30 }])) === JSON.stringify(["A  B", "C"]));

// 2) Planilha e e-mail a partir do resultado do banco (formato de seguro_vida_conferir)
const rel = { competencia: "2026-10", total: 17.34, pessoas: 2,
  rateio: [{ centro_custo: "VULCANIZACAO - MÃO DE OBRA", pessoas: 1, valor: 4.47 }, { centro_custo: "ADMINISTRATIVE BOARD", pessoas: 1, valor: 12.87 }],
  linhas: r.linhas.map((l, i) => ({ ...l, centro_custo: ["VULCANIZACAO - MÃO DE OBRA", "ADMINISTRATIVE BOARD", null][i], cargo: "Teste", admissao: "2024-01-02" })),
  conferencia: { premio_padrao: 4.47, nao_encontrados: [], sem_centro_custo: [], desligados_cobrados: [{ nome: "PEDRO DESLIGADO", desligamento: "2026-10-15" }],
    exclusoes: ["ANA EXCLUÍDA TESTE"], inclusoes: [], premio_diferente: [{ nome: "JOSÉ CONCEIÇÃO FICTÍCIO", premio: 12.87, capital: 119876 }],
    ativos_fora_do_seguro: [{ nome: "Aprendiz Teste", cargo: "Aprendiz", admissao: "2025-10-06", aprendiz: true }, { nome: "Novo Teste", cargo: "Auxiliar", admissao: "2026-10-01", aprendiz: false }], achados_pelo_nome: [] } };
const celulas = (arq) => JSON.parse(execSync(`python3 -c "
import openpyxl,json; wb=openpyxl.load_workbook('${arq}'); print(json.dumps({'abas':wb.sheetnames,'txt':' | '.join(str(c.value) for ws in wb for r in ws.iter_rows() for c in r if c.value is not None)}))"`).toString());
const arq = path.join(tmp, "rateio.xlsx"); fs.writeFileSync(arq, sv.gerarPlanilhaVG(rel));
const x = celulas(arq);
ok("P1 planilha só com a aba Rateio", JSON.stringify(x.abas) === JSON.stringify(["Rateio"]));
ok("P2 totais por centro de custo e TOTAL", /VULCANIZACAO - MÃO DE OBRA \| 1 \| 4\.47/.test(x.txt) && /TOTAL/.test(x.txt));
ok("P3 sem nomes nem CPF no arquivo", !/MARIA|JOSÉ|ANA EXCL|PEDRO|111\.444|02233344405/.test(x.txt));
const em = sv.emailResumoVG(rel);
ok("E1 e-mail: assunto com o mês e total em reais", /outubro\/2026/.test(em.assunto) && /R\$\s?17,34/.test(em.html));
ok("E2 e-mail: tabela por centro de custo, quantos pontos conferir e sem nomes", /ADMINISTRATIVE BOARD/.test(em.html) && /ponto\(s\) para conferir/.test(em.html) && !/PEDRO|Aprendiz Teste|MARIA/.test(em.html));
ok("E3 e-mail escapa HTML", !/<script>/.test(sv.emailResumoVG({ ...rel, rateio: [{ centro_custo: "<script>x</script>", pessoas: 1, valor: 1 }] }).html));
let falhas = 0; for (const [n, v] of Object.entries(res)) { console.log((v ? "OK  " : "FALHOU ") + n); if (!v) falhas++; }
process.exit(falhas ? 1 : 0);
