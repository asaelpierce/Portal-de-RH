// Testes da lógica do rateio do plano odontológico (src/odontoBradesco.js) com dados FICTÍCIOS.
// Rodar: node testes/odonto/teste_logica.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execSync } from "child_process";
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "od-"));
fs.writeFileSync(path.join(tmp, "planilhaXlsx.mjs"), fs.readFileSync(path.join(raiz, "src/planilhaXlsx.js")));
fs.writeFileSync(path.join(tmp, "seguroVida.mjs"), fs.readFileSync(path.join(raiz, "src/seguroVida.js"), "utf8").replace('"./planilhaXlsx.js"', '"./planilhaXlsx.mjs"'));
fs.writeFileSync(path.join(tmp, "odontoBradesco.mjs"), fs.readFileSync(path.join(raiz, "src/odontoBradesco.js"), "utf8")
  .replace('"./planilhaXlsx.js"', '"./planilhaXlsx.mjs"').replace('"./seguroVida.js"', '"./seguroVida.mjs"'));
const od = await import(path.join(tmp, "odontoBradesco.mjs"));
const res = {}; const ok = (n, v) => { res[n] = !!v; };
const texto = ["BRADESCO DENTAL - FATURA TECNICA", "005  982  1000383  DENTAL  10/2026 01  Subfatura",
  "(TS)TOTAIS DA SUBFATURA  2  1  3  7  26,08  0,00",
  "0000001/00  MARIA TITULAR TESTE  14/08/1992  FEM  CAS  TNDA  27/02/2024  10/2026  21,75  0,00",
  "0000001/01  JOAO DEPENDENTE TESTE  22/07/2017  MAS  SOLT  FILH  TNDA  27/02/2024  10/2026  21,75  0,00",
  "0000002/00  PEDRO SAIU TESTE  06/05/1997  MAS  SOLT  TNDA  02/09/2026  10/2026  21,75  0,00",
  "TNDA  02/09/2026  CM  10/2026  21,75-  0,00", "TNDA  02/09/2026  CR  09/2026  21,75-  0,00", "TNDA  02/09/2026  CR  08/2026  17,40-  0,00",
  "0000003/00  ANA NOVA TESTE  10/02/1982  FEM  CAS  TNDA  10/09/2026  IR  08/2026  11,60  0,00",
  "DE 27.10.2026 A 26.11.2026"];
// (o 3º titular só tem a inclusão retroativa nesta amostra; soma = 21,75+21,75+21,75−21,75−21,75−17,40+11,60 = 15,95)
texto[2] = "(TS)TOTAIS DA SUBFATURA  3  1  4  7  15,95  0,00";
const r = od.lerFaturaOdonto(texto);
ok("L1 competência da fatura e vigência", r.competencia === "2026-10" && r.vigencia === "27/10/2026 a 26/11/2026");
ok("L2 beneficiários e parentesco (titular/filho)", r.beneficiarios.length === 4 && r.beneficiarios[0].parentesco === "Titular" && r.beneficiarios[1].parentesco === "Filho(a)");
const pedro = r.beneficiarios[2];
ok("L3 lançamentos extras somados ao beneficiário anterior (devoluções negativas)", pedro.lancamentos.length === 4 && pedro.valor === -39.15 && pedro.lancamentos[1].tipo === "CM");
ok("L4 inclusão retroativa reconhecida", r.beneficiarios[3].lancamentos[0].tipo === "IR" && r.beneficiarios[3].valor === 11.6);
ok("L5 soma confere com (TS)TOTAIS DA SUBFATURA", r.soma === 15.95 && r.confere);
ok("L6 total que não confere é detectado", od.lerFaturaOdonto(texto.map((l) => l.startsWith("(TS)") ? "(TS)TOTAIS DA SUBFATURA  3  1  4  7  99,99  0,00" : l)).confere === false);
let erro = ""; try { od.lerFaturaOdonto(["Prudential", "RELATÓRIO DE MOVIMENTAÇÃO"]); } catch (e) { erro = e.message; }
ok("L7 outro PDF recusado com mensagem clara", /não parece a Fatura Técnica/.test(erro));

const rel = { competencia: "2026-10", vigencia: "27/10/2026 a 26/11/2026", total: 15.95, titulares: 3, beneficiarios: 4,
  rateio: [{ centro_custo: "CORTE CERAMICA MAO DE OBRA", titulares: 1, beneficiarios: 1, valor: -39.15 }, { centro_custo: "REVESTIMENTO - MÃO DE OBRA", titulares: 1, beneficiarios: 2, valor: 43.5 },
           { centro_custo: "SEM CENTRO DE CUSTO (verificar)", titulares: 1, beneficiarios: 1, valor: 11.6 }],
  linhas: r.beneficiarios.map((b, i) => ({ ...b, titular: ["MARIA TITULAR TESTE", "MARIA TITULAR TESTE", "PEDRO SAIU TESTE", "ANA NOVA TESTE"][i],
    responsavel: ["Maria Titular", "Maria Titular", "Pedro Saiu", null][i], centro_custo: ["REVESTIMENTO - MÃO DE OBRA", "REVESTIMENTO - MÃO DE OBRA", "CORTE CERAMICA MAO DE OBRA", null][i] })),
  conferencia: { mensalidade_padrao: 21.75, titulares_sem_vinculo: [{ certificado: "0000003", titular: "ANA NOVA TESTE" }], sem_centro_custo: [],
    desligados_cobrados: [{ titular: "OUTRO DESLIGADO TESTE", desligamento: "2026-10-15" }], vinculados_a_outro: [{ titular: "TITULAR DE FORA", responsavel: "Maria Titular" }],
    inclusoes: ["ANA NOVA TESTE"], cancelamentos: ["PEDRO SAIU TESTE"], valor_diferente: [] } };
const celulas = (arq) => JSON.parse(execSync(`python3 -c "
import openpyxl,json; wb=openpyxl.load_workbook('${arq}'); print(json.dumps({'abas':wb.sheetnames,'txt':' | '.join(str(c.value) for ws in wb for r in ws.iter_rows() for c in r if c.value is not None)}))"`).toString());
const arq = path.join(tmp, "odonto.xlsx"); fs.writeFileSync(arq, od.gerarPlanilhaOdonto(rel));
const x = celulas(arq);
ok("P1 planilha só com a aba Rateio", JSON.stringify(x.abas) === JSON.stringify(["Rateio"]));
ok("P2 total: titulares, beneficiários e valor", /TOTAL \| 3 \| 4 \| 15\.95/.test(x.txt));
ok("P3 sem nomes no arquivo", !/MARIA|JOAO|PEDRO|ANA NOVA|Maria Titular|TITULAR DE FORA/.test(x.txt));
const em = od.emailResumoOdonto(rel);
ok("E2 e-mail sem nomes", !/PEDRO|ANA NOVA|TITULAR DE FORA|OUTRO DESLIGADO/.test(em.html) && /ponto\(s\) para conferir/.test(em.html));
ok("E1 e-mail com fatura, vigência e total", /outubro\/2026/.test(em.assunto) && /27\/10\/2026 a 26\/11\/2026/.test(em.html) && /R\$\s?15,95/.test(em.html));
let falhas = 0; for (const [n, v] of Object.entries(res)) { console.log((v ? "OK  " : "FALHOU ") + n); if (!v) falhas++; }
process.exit(falhas ? 1 : 0);
