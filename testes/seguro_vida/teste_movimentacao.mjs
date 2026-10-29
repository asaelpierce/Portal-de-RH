// Testes da movimentação para a Prudential (src/seguroMovimentacao.js) com dados FICTÍCIOS.
// Rodar: node testes/seguro_vida/teste_movimentacao.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execSync } from "child_process";
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mv-"));
const cp = (de, para, trocas = []) => { let t = fs.readFileSync(path.join(raiz, "src", de), "utf8"); for (const [a, b] of trocas) t = t.split(a).join(b); fs.writeFileSync(path.join(tmp, para), t); };
cp("planilhaXlsx.js", "planilhaXlsx.mjs"); cp("feriasFolha.js", "feriasFolha.mjs");
cp("seguroVida.js", "seguroVida.mjs", [['"./planilhaXlsx.js"', '"./planilhaXlsx.mjs"']]);
cp("seguroMovimentacao.js", "seguroMovimentacao.mjs", [['"./feriasFolha.js"', '"./feriasFolha.mjs"'], ['"./planilhaXlsx.js"', '"./planilhaXlsx.mjs"'], ['"./seguroVida.js"', '"./seguroVida.mjs"']]);
const M = await import(path.join(tmp, "seguroMovimentacao.mjs"));
const res = {}; const ok = (n, v) => { res[n] = !!v; };
// cabeçalho como o da BRIT; CPF numérico sem o zero da frente; admissão como número de série do Excel (46315 = 20/10/2026)
const linhas = [{ A: "Relação de colaboradores" }, { A: "Nome", B: "Sexo", C: "CPF", D: "Título Reduzido (Cargo)", E: "Descrição (C.Custo)", F: "Admissão" },
  { A: "Maria Teste", B: "F", C: "2233344405", D: "Auxiliar", E: "VULCANIZACAO  -  MÃO DE OBRA", F: "46315" },
  { A: "Joao Teste", B: "M", C: "111.444.777-35", D: "Aprendiz", E: "RECURSOS HUMANOS", F: "01/10/2025" }];
const r = M.ativosDasLinhas(linhas);
ok("A1 acha as colunas pelo cabeçalho da BRIT", r.ativos.length === 2 && r.ativos[0].cargo === "Auxiliar");
ok("A2 CPF numérico ganha o zero da frente; formatado vira só dígitos", r.ativos[0].cpf === "02233344405" && r.ativos[1].cpf === "11144477735");
ok("A3 datas: número do Excel e dd/mm/aaaa", r.ativos[0].admissao === "2026-10-20" && r.ativos[1].admissao === "2025-10-01");
ok("A4 centro de custo com espaços normalizados", r.ativos[0].centro_custo === "VULCANIZACAO - MÃO DE OBRA");
let e1 = ""; try { M.ativosDasLinhas([...linhas, { A: "Repetido", C: "02233344405" }]); } catch (e) { e1 = e.message; }
ok("A5 CPF repetido é recusado", /CPF repetido/.test(e1));
let e2 = ""; try { M.ativosDasLinhas([{ A: "Relatório Coleta" }, { A: "Cadastro", B: "Período" }]); } catch (e) { e2 = e.message; }
ok("A6 outra planilha é recusada com mensagem clara", /não parece a lista de colaboradores ativos/.test(e2));
const mov = { base_competencia: "2026-09", segurados_base: 79, ativos: 83,
  inclusoes: [{ nome: "Maria Teste", cpf: "02233344405", sexo: "F", nascimento: null, admissao: "2026-10-20", cargo: "Auxiliar", centro_custo: "VULCANIZACAO - MÃO DE OBRA" }],
  aprendizes: [{ nome: "Joao Teste", cpf: "11144477735" }], sem_nascimento: ["Maria Teste"],
  exclusoes: [{ nome: "PEDRO SAIU", cpf: "33322211100", nascimento: "1995-05-05", centro_custo: "CORTE", status_portal: "desligado", desligamento: null }] };
const arq = path.join(tmp, "p.xlsx"); fs.writeFileSync(arq, M.gerarPlanilhaMovPrudential(mov, "2026-10-29"));
const x = JSON.parse(execSync(`python3 -c "
import openpyxl,json; wb=openpyxl.load_workbook('${arq}')
print(json.dumps({'abas':wb.sheetnames,'inc':[c.value for c in wb['Inclusões'][3]],'exc':[c.value for c in wb['Exclusões'][3]],'ver':[[c.value for c in r] for r in wb['Verificar'].iter_rows(min_row=2)]}))"`).toString());
ok("P1 abas Inclusões, Exclusões e Verificar", JSON.stringify(x.abas) === JSON.stringify(["Inclusões", "Exclusões", "Verificar"]));
ok("P2 inclusão com CPF formatado, admissão e centro de resultado", x.inc[0] === "Maria Teste" && x.inc[1] === "022.333.444-05" && x.inc[4] === "20/10/2026" && x.inc[6] === "VULCANIZACAO - MÃO DE OBRA");
ok("P3 exclusão com nascimento e situação", x.exc[0] === "PEDRO SAIU" && x.exc[2] === "05/05/1995" && x.exc[5] === "desligado");
ok("P4 verificar: sem nascimento, exclusão sem data e aprendiz", x.ver.some((v) => /sem data de nascimento/.test(v[0])) && x.ver.some((v) => /sem data de desligamento/.test(v[0])) && x.ver.some((v) => /Aprendiz/.test(v[0])));
// Leitor de Excel: códigos numéricos do XML (alguns programas gravam "Ã" como &#195;) — planilha real gerada pelo openpyxl
const fic = await M.lerAtivosBrit(fs.readFileSync(path.join(raiz, "testes/seguro_vida/ativos_ficticio.xlsx")));
ok("A7 acentos gravados como código numérico são lidos certo", fic.ativos[0].centro_custo === "VULCANIZACAO - MÃO DE OBRA");
let falhas = 0; for (const [n, v] of Object.entries(res)) { console.log((v ? "OK  " : "FALHOU ") + n); if (!v) falhas++; }
process.exit(falhas ? 1 : 0);
