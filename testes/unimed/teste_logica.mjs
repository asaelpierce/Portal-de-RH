// Testes da lógica da Unimed (src/unimed.js) com dados FICTÍCIOS — regras confirmadas pelo RH em 21/10/2026.
// Rodar: node testes/unimed/teste_logica.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execSync } from "child_process";
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "un-"));
fs.writeFileSync(path.join(tmp, "planilhaXlsx.mjs"), fs.readFileSync(path.join(raiz, "src/planilhaXlsx.js")));
fs.writeFileSync(path.join(tmp, "seguroVida.mjs"), fs.readFileSync(path.join(raiz, "src/seguroVida.js"), "utf8").replace('"./planilhaXlsx.js"', '"./planilhaXlsx.mjs"'));
fs.writeFileSync(path.join(tmp, "unimed.mjs"), fs.readFileSync(path.join(raiz, "src/unimed.js"), "utf8").replace('"./planilhaXlsx.js"', '"./planilhaXlsx.mjs"').replace('"./seguroVida.js"', '"./seguroVida.mjs"'));
const U = await import(path.join(tmp, "unimed.mjs"));
const res = {}; const ok = (n, v) => { res[n] = !!v; };
const F1 = "11111111111111", F2 = "22222222222222", F3 = "33333333333333", F4 = "44444444444444";
// Rel1 (mensalidade) do contrato 0309917: família 1 (titular + dependente), família 2 com crédito negativo, família 4 (desligado)
const rel1 = ["Salutaris.com  Dados da Fatura", "Nota Fiscal:  1 / E02  Competência:  01/11/2026", "Nº Contrato Aux.:  0309917  Vlr. Tot. Pre Pagto:  1.035,00",
  `1251398  ${F1}000  MARIA TITULAR  10/02/1990  34 a 38`, "ENFERMARIA  BASICO ENFERMARIA  12/05/2026  400,00  0,00  0,00  0,00  N  400,00",
  `1251398  ${F1}302  FILHO DA MARIA  01/01/2015  0 a 18`, "BASICO ENFERMARIA  12/05/2026  150,00  0,00  0,00  0,00  N  150,00",
  `1251398  ${F2}000  JOAO TITULAR COM NOME`, `1251398  ${F2}000  JOAO TITULAR COM NOME  03/03/1980  44 a 48`,
  "BASICO ENFERMARIA  12/05/2026  300,00  0,00  0,00  0,00  N  300,00", "BASICO ENFERMARIA  12/05/2026  -100,00  0,00  0,00  0,00  N",
  `1251398  ${F4}000  PEDRO SAIU  05/05/1995  29 a 33`, "BASICO ENFERMARIA  12/05/2026  285,00  0,00  0,00  0,00  N  285,00"];
// Rel7 (coparticipação) do 0309917: família 1 com 4 procedimentos, família 4 (desligado) com 3
const it = (f, nome, data, desc, v) => `COPAR_BH  ${f}  ${nome}  00611  1139  3992  ${data} 08:00 10101012  ${desc}  1  0  0  0  0,00  0,00  ${v}  S`;
const rel7 = ["Relatório de Utilização por Família - Cobrança", "Competência:  09/2026  Período:  COBRANÇA DE COPARTICIPAÇÃO", "Num. Aux:  0309917  Contrato:  1251398",
  `Titular:  ${F1}000  MARIA TITULAR  Matrícula:`, it(F1 + "000", "MARIA", "01/09/2026", "CONS. EM CONSULT", "36,62"), it(F1 + "302", "FILHO", "02/09/2026", "HOLTER", "31,63"),
  it(F1 + "302", "FILHO", "03/09/2026", "ECG", "7,20"), it(F1 + "000", "MARIA", "04/09/2026", "EXAME", "10,00"), "Total Família:  85,45",
  `Titular:  ${F4}000  PEDRO SAIU  Matrícula:`, it(F4 + "000", "PEDRO", "05/09/2026", "CONS", "59,52"), it(F4 + "000", "PEDRO", "06/09/2026", "CONS", "36,62"), it(F4 + "000", "PEDRO", "07/09/2026", "RX", "9,47"),
  "Total Geral:  191,06"];
// Rel7 da diretoria (0309918)
const rel7d = ["Relatório de Utilização por Família - Cobrança", "Competência:  09/2026", "Num. Aux:  0309918  Contrato:  1251403",
  `Titular:  ${F3}000  DIRETOR TESTE  Matrícula:`, it(F3 + "000", "DIRETOR", "09/09/2026", "CONS", "45,81"), it(F3 + "000", "DIRETOR", "10/09/2026", "CONS", "45,81"), it(F3 + "000", "DIRETOR", "11/09/2026", "CONS", "45,81"), "Total Geral:  137,43"];
const rel1d = ["Dados da Fatura", "Competência:  01/11/2026", "Nº Contrato Aux.:  0309918  Vlr. Tot. Pre Pagto:  436,14", `1251403  ${F3}000  DIRETOR TESTE  01/01/1970  49 a 53`, "APARTAMENTO  BASICO APTO  01/01/2024  436,14  0,00  0,00  0,00  N  436,14"];

const m = U.lerPdfUnimed(rel1), c = U.lerPdfUnimed(rel7);
ok("L1 mensalidade: contrato, competência e soma = Pre Pagto", m.tipo === "mensalidade" && m.contrato === "0309917" && m.competencia === "2026-11" && m.confere);
ok("L2 mensalidade: crédito negativo somado ao beneficiário; família = 14 dígitos", m.beneficiarios.find((b) => b.familia === F2).valor === 200 && m.beneficiarios[0].familia === F1);
ok("L3 coparticipação: famílias, procedimentos e total geral", c.tipo === "coparticipacao" && c.familias.length === 2 && c.familias[0].itens.length === 4 && c.confere);
const lido = U.lerVariosUnimed([{ nome: "a.pdf", linhas: rel1 }, { nome: "b.pdf", linhas: rel7 }, { nome: "c.pdf", linhas: rel7d }, { nome: "d.pdf", linhas: rel1d }]);
ok("L4 mês do relatório = mensalidade − 1 = coparticipação + 1", lido.competencia === "2026-10");
let e1 = ""; try { U.lerVariosUnimed([{ nome: "x.pdf", linhas: rel7.map((l) => l.startsWith("Total Geral") ? "Total Geral:  1,00" : l) }]); } catch (e) { e1 = e.message; }
ok("L5 total que não confere: recusa citando o arquivo", /^x\.pdf: a soma lida/.test(e1));
let e2 = ""; try { U.lerVariosUnimed([{ nome: "a.pdf", linhas: rel7 }, { nome: "b.pdf", linhas: rel7 }]); } catch (e) { e2 = e.message; }
ok("L6 PDF repetido do mesmo contrato é recusado", /Dois PDFs do mesmo tipo/.test(e2));
let e3 = ""; try { U.lerPdfUnimed(["Prudential"]); } catch (e) { e3 = e.message; }
ok("L7 outro PDF recusado com mensagem clara", /não parece um relatório da Unimed/.test(e3));

const vinc = { [F1]: { colaborador: "Maria Titular", centro_custo: "VULCANIZACAO", status: "ativo", cadastro: "100" },
  [F2]: { colaborador: "Joao Titular", centro_custo: "FINANCEIRO", status: "ativo" },
  [F3]: { colaborador: "Diretor Teste", centro_custo: "ADMINISTRATIVE BOARD", status: "ativo" },
  [F4]: { colaborador: "Pedro Saiu", centro_custo: "CORTE", status: "desligado", data_desligamento: "2026-10-15" } };
const r = U.calcularUnimed(lido.dados, vinc);
const L = (f, c) => r.linhas.find((l) => l.familia === f && l.contrato === c);
const maria = L(F1, "0309917");
ok("R1 coparticipação: 2 mais caros pela empresa (36,62 + 31,63)", maria.empresa_copart === 68.25 && maria.itens.filter((i) => i.coberto).map((i) => i.valor).join() === "36.62,31.63");
ok("R2 coparticipação: 50% do restante (7,20 + 10,00) = 8,60", maria.desconto_copart === 8.6);
ok("R3 mensalidade: 11% de cada beneficiário (400 + 150) = 60,50", maria.desconto_mensalidade === 60.5);
ok("R4 mensalidade: crédito negativo não desconta (11% de 300 = 33,00)", L(F2, "0309917").desconto_mensalidade === 33);
const dir = r.linhas.filter((l) => l.familia === F3);
ok("R5 diretoria: R$ 1,00 na mensalidade e nada na coparticipação", dir.find((l) => l.contrato === "0309918" && l.beneficiarios.length).desconto_mensalidade === 1 && dir.every((l) => l.desconto_copart === 0));
const pedro = r.rescisao.find((x) => x.colaborador === "Pedro Saiu");
ok("R6 desligado: mesmo cálculo, vai para a rescisão (11% de 285 + 50% de 9,47)", pedro && pedro.mensalidade === 31.35 && pedro.copart === 4.74 && !r.descontos.some((d) => d.colaborador === "Pedro Saiu"));
const rat17 = r.rateio.find((x) => x.contrato === "0309917");
ok("R7 rateio sem o desligado; dependente no titular", !rat17.centros.some((c) => c.centro_custo === "CORTE") && rat17.centros.find((c) => c.centro_custo === "VULCANIZACAO").mensalidade === 550);
ok("R8 total inclui tudo (rateio + rescisão) = soma dos PDFs", Math.abs(r.total - (1035 + 191.06 + 137.43 + 436.14)) < 0.005);
ok("R9 conferência: faltam os PDFs do 0372477; desligado na rescisão", r.conferencia.arquivos_faltando.length === 2 && r.conferencia.arquivos_faltando.every((x) => /0372477/.test(x)) && r.conferencia.rescisao.length === 1);
const r2 = U.calcularUnimed(lido.dados, { ...vinc, [F2]: undefined });
ok("R4b crédito/estorno aparece na conferência", r.conferencia.creditos.some((x) => /JOAO TITULAR/.test(x)));
ok("R10 família não encontrada: aviso e lista para vincular", r2.conferencia.nao_encontrados_fam.some((x) => x.familia === F2) && r2.rateio[0].centros.some((c) => /SEM CENTRO DE CUSTO/.test(c.centro_custo)));

const rel = { ...r, competencia: "2026-10" };
const celulas = (arq) => JSON.parse(execSync(`python3 -c "
import openpyxl,json; wb=openpyxl.load_workbook('${arq}'); print(json.dumps({'abas':wb.sheetnames,'txt':' | '.join(str(c.value) for ws in wb for r in ws.iter_rows() for c in r if c.value is not None)}))"`).toString());
const arq = path.join(tmp, "u.xlsx"); fs.writeFileSync(arq, U.gerarPlanilhaUnimed(rel));
const x = celulas(arq);
ok("P1 rateio: só a aba Rateio e sem nomes", JSON.stringify(x.abas) === JSON.stringify(["Rateio"]) && !/Maria|MARIA|Pedro|PEDRO|Joao|JOAO|Diretor|FILHO/.test(x.txt));
const arqD = path.join(tmp, "d.xlsx"); fs.writeFileSync(arqD, U.gerarDescontosUnimed(rel));
const d = JSON.parse(execSync(`python3 -c "
import openpyxl,json; wb=openpyxl.load_workbook('${arqD}'); d=wb['Descontos em folha']; rs=wb['Rescisão']
print(json.dumps({'abas':wb.sheetnames,'desc':[[c.value for c in row] for row in d.iter_rows(min_row=3)],'resc':[[c.value for c in row] for row in rs.iter_rows(min_row=3)]}))"`).toString());
ok("P2 descontos em folha (arquivo separado): Maria 60,50 + 8,60 = 69,10 e total", JSON.stringify(d.abas) === JSON.stringify(["Descontos em folha", "Rescisão"]) && d.desc.some((l) => l[0] === "Maria Titular" && l[3] === 60.5 && l[4] === 8.6 && l[5] === 69.1) && d.desc[d.desc.length - 1][0] === "TOTAL");
ok("P3 rescisão com o desligado (arquivo separado)", d.resc.length === 1 && d.resc[0][0] === "Pedro Saiu");
ok("R11 cada família guarda o colaborador (para a correção de centro de custo)", r.linhas.every((l) => "usuario_id" in l));
const em = U.emailResumoUnimed(rel);
ok("E1 e-mail com mês e descontos, sem nomes", /outubro\/2026/.test(em.assunto) && /Descontos em folha/.test(em.html) && /ponto\(s\) para conferir/.test(em.html) && !/Pedro|Maria/.test(em.html));
let falhas = 0; for (const [n, v] of Object.entries(res)) { console.log((v ? "OK  " : "FALHOU ") + n); if (!v) falhas++; }
process.exit(falhas ? 1 : 0);
