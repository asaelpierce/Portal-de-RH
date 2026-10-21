// Testes da lógica do rateio do convênio Araujo (src/araujo.js) com dados FICTÍCIOS. Rodar: node testes/araujo/teste_logica.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execSync } from "child_process";
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ar-"));
fs.writeFileSync(path.join(tmp, "planilhaXlsx.mjs"), fs.readFileSync(path.join(raiz, "src/planilhaXlsx.js")));
fs.writeFileSync(path.join(tmp, "seguroVida.mjs"), fs.readFileSync(path.join(raiz, "src/seguroVida.js"), "utf8").replace('"./planilhaXlsx.js"', '"./planilhaXlsx.mjs"'));
fs.writeFileSync(path.join(tmp, "araujo.mjs"), fs.readFileSync(path.join(raiz, "src/araujo.js"), "utf8").replace('"./planilhaXlsx.js"', '"./planilhaXlsx.mjs"').replace('"./seguroVida.js"', '"./seguroVida.mjs"'));
const ar = await import(path.join(tmp, "araujo.mjs"));
const res = {}; const ok = (n, v) => { res[n] = !!v; };
const texto = ["Relatório Total Compras agrupado por Funcionário e Período", "EMPRESA: TESTE  Período:  20/09/2026 até 19/10/2026",
  "Matrícula  Nome do Funcionário  Total Compras  Total Convênio  Valor Subsidio  Valor s/ Subsidio",
  "100  MARIA TESTE DA SILVA  R$ 1.120,50  R$ 120,50  R$ 0,00  R$ 120,50", "00007  JOAO NOME CURTO  R$ 300,00  R$ 250,00  R$ 0,00  R$ 250,00",
  "Soma Total  R$ 370,50"];
const r = ar.lerRelatorioAraujo(texto);
ok("L1 competência = mês do fim do período", r.competencia === "2026-10" && r.periodo === "20/09/2026 a 19/10/2026");
ok("L2 linhas, matrícula com zeros e milhar", r.linhas.length === 2 && r.linhas[1].matricula === "00007" && r.linhas[0].compras === 1120.5);
ok("L3 soma do convênio confere com a Soma Total", r.soma === 370.5 && r.confere);
ok("L4 soma que não confere é detectada", ar.lerRelatorioAraujo(texto.map((l) => l.startsWith("Soma") ? "Soma Total  R$ 999,99" : l)).confere === false);
let erro = ""; try { ar.lerRelatorioAraujo(["BRADESCO DENTAL"]); } catch (e) { erro = e.message; }
ok("L5 outro PDF recusado com mensagem clara", /não parece o relatório de compras do convênio/.test(erro));
const rel = { competencia: "2026-10", periodo: "20/09/2026 a 19/10/2026", total: 370.5, pessoas: 2,
  rateio: [{ centro_custo: "FINANCEIRO", pessoas: 1, valor: 250 }, { centro_custo: "VULCANIZACAO - MÃO DE OBRA", pessoas: 1, valor: 120.5 }],
  linhas: r.linhas.map((l, i) => ({ ...l, colaborador: ["Maria Teste da Silva", "Joao Nome Curto Completo"][i], centro_custo: ["VULCANIZACAO - MÃO DE OBRA", "FINANCEIRO"][i] })),
  conferencia: { nao_encontrados: [{ matricula: "999", nome: "PESSOA DE FORA" }], matricula_diferente: [{ nome: "Joao Nome Curto Completo", araujo: "00007", folha: "70" }],
    sem_centro_custo: [], desligados_com_compra: [{ nome: "Ex Funcionario", desligamento: "2026-10-01", convenio: 10 }], compras_acima_do_convenio: [{ nome: "Joao", compras: 300, convenio: 250 }] } };
const arq = path.join(tmp, "a.xlsx"); fs.writeFileSync(arq, ar.gerarPlanilhaAraujo(rel));
const x = JSON.parse(execSync(`python3 -c "
import openpyxl,json; wb=openpyxl.load_workbook('${arq}'); r=wb['Rateio']; l=wb['Lista']; c=wb['Conferência']
print(json.dumps({'abas':wb.sheetnames,'total':[r.cell(r.max_row,i).value for i in range(1,4)],'l2':[x.value for x in l[3]],'conf':[[x.value for x in row] for row in c.iter_rows(min_row=2)]}))"`).toString());
ok("P1 abas Rateio, Lista e Conferência; total", JSON.stringify(x.abas) === JSON.stringify(["Rateio", "Lista", "Conferência"]) && x.total[0] === "TOTAL" && Math.abs(x.total[2] - 370.5) < 0.001);
ok("P2 lista: matrícula da Araujo, colaborador e convênio", x.l2[0] === "00007" && x.l2[2] === "Joao Nome Curto Completo" && x.l2[5] === 250);
ok("P3 conferência: não encontrado, desligado com compra e matrícula diferente", x.conf.some((c) => /Não encontrados/.test(c[0]) && /999/.test(c[1]))
  && x.conf.some((c) => /Desligados com compra/.test(c[0])) && x.conf.some((c) => /Matrícula na Araujo diferente/.test(c[0]) && /Araujo 00007 × folha 70/.test(c[1])));
const em = ar.emailResumoAraujo(rel);
ok("E1 e-mail com mês, período e total", /outubro\/2026/.test(em.assunto) && /20\/09\/2026 a 19\/10\/2026/.test(em.html) && /R\$\s?370,50/.test(em.html));
let falhas = 0; for (const [n, v] of Object.entries(res)) { console.log((v ? "OK  " : "FALHOU ") + n); if (!v) falhas++; }
process.exit(falhas ? 1 : 0);
