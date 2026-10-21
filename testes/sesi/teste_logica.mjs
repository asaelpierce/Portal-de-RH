// Testes da lógica do rateio do Clube SESI (src/sesi.js) com dados FICTÍCIOS. Rodar: node testes/sesi/teste_logica.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execSync } from "child_process"; import { createRequire } from "module";
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "se-"));
fs.writeFileSync(path.join(tmp, "planilhaXlsx.mjs"), fs.readFileSync(path.join(raiz, "src/planilhaXlsx.js")));
fs.writeFileSync(path.join(tmp, "seguroVida.mjs"), fs.readFileSync(path.join(raiz, "src/seguroVida.js"), "utf8").replace('"./planilhaXlsx.js"', '"./planilhaXlsx.mjs"'));
fs.writeFileSync(path.join(tmp, "sesi.mjs"), fs.readFileSync(path.join(raiz, "src/sesi.js"), "utf8").replace('"./planilhaXlsx.js"', '"./planilhaXlsx.mjs"').replace('"./seguroVida.js"', '"./seguroVida.mjs"'));
const se = await import(path.join(tmp, "sesi.mjs"));
const res = {}; const ok = (n, v) => { res[n] = !!v; };
const texto = ["SESI", "Relação de Conveniados  Data de Corte:  16/10/2026", "Contrato:  374323  EMPRESA  Vigência:  01/04/2026  a 31/03/2027",
  "11144477735  MARIA TESTE  INDÚSTRIA CONTRIBUINTE - FAMILIAR  45.00", "123  02233344405  JOSE TESTE DE TAL  INDÚSTRIA CONTRIBUINTE - FAMILIAR+1 AGREGADO  1,055.00",
  "Total de titulares:  2  1,100.00", "Total de dependentes:0"];
const r = se.lerRelacaoSesi(texto);
ok("L1 competência = mês da data de corte; contrato e vigência", r.competencia === "2026-10" && r.dataCorte === "2026-10-16" && r.contrato === "374323" && r.vigencia === "01/04/2026 a 31/03/2027");
ok("L2 colunas separadas (com e sem matrícula), categoria inteira", r.linhas.length === 2 && r.linhas[1].nome === "JOSE TESTE DE TAL" && r.linhas[1].categoria === "INDÚSTRIA CONTRIBUINTE - FAMILIAR+1 AGREGADO");
ok("L3 valor com ponto decimal e milhar", r.linhas[0].valor === 45 && r.linhas[1].valor === 1055);
ok("L4 soma confere com o total de titulares", r.soma === 1100 && r.confere);
ok("L5 total que não confere é detectado", se.lerRelacaoSesi(texto.map((l) => l.startsWith("Total de titulares") ? "Total de titulares:  2  9.99" : l)).confere === false);
let erro = ""; try { se.lerRelacaoSesi(["Prudential"]); } catch (e) { erro = e.message; }
ok("L6 outro PDF recusado com mensagem clara", /não parece a Relação de Conveniados/.test(erro));
// PDF fictício de verdade (se o pdf.js estiver disponível em PDFJS_NODE ou /tmp/pdfjs)
try {
  const pdfjs = createRequire((process.env.PDFJS_NODE || "/tmp/pdfjs") + "/")("pdfjs-dist/legacy/build/pdf.js");
  const sv = await import(path.join(tmp, "seguroVida.mjs"));
  const rp = se.lerRelacaoSesi(await sv.textoDoPdf(pdfjs, new Uint8Array(fs.readFileSync(path.join(raiz, "testes/sesi/relacao_ficticia.pdf")))));
  ok("L7 PDF fictício lido (2 titulares, R$ 1.100,00, corte 16/10)", rp.linhas.length === 2 && rp.soma === 1100 && rp.confere && rp.competencia === "2026-10");
} catch (e) { console.log("(L7 pulado: pdf.js não disponível no Node)"); }
const rel = { competencia: "2026-10", data_corte: "2026-10-16", contrato: "374323", vigencia: "01/04/2026 a 31/03/2027", total: 1100, pessoas: 2,
  rateio: [{ centro_custo: "RECURSOS HUMANOS", pessoas: 1, valor: 1055 }, { centro_custo: "VULCANIZACAO - MÃO DE OBRA", pessoas: 1, valor: 45 }],
  linhas: r.linhas.map((l, i) => ({ ...l, colaborador: ["Maria Teste", "Jose Teste de Tal"][i], centro_custo: ["VULCANIZACAO - MÃO DE OBRA", "RECURSOS HUMANOS"][i] })),
  conferencia: { nao_encontrados: [], sem_centro_custo: [], achados_pelo_nome: [], desligados_conveniados: [{ nome: "Ex Funcionario", desligamento: "2026-10-01", valor: 45 }] } };
const arq = path.join(tmp, "s.xlsx"); fs.writeFileSync(arq, se.gerarPlanilhaSesi(rel));
const x = JSON.parse(execSync(`python3 -c "
import openpyxl,json; wb=openpyxl.load_workbook('${arq}'); r=wb['Rateio']; l=wb['Lista']; c=wb['Conferência']
print(json.dumps({'abas':wb.sheetnames,'total':[r.cell(r.max_row,i).value for i in range(1,4)],'l1':[x.value for x in l[2]],'conf':[[x.value for x in row] for row in c.iter_rows(min_row=2)]}))"`).toString());
ok("P1 abas e total", JSON.stringify(x.abas) === JSON.stringify(["Rateio", "Lista", "Conferência"]) && x.total[0] === "TOTAL" && x.total[2] === 1100);
ok("P2 lista com CPF formatado, categoria e valor", x.l1[0] === "111.444.777-35" && x.l1[4] === "INDÚSTRIA CONTRIBUINTE - FAMILIAR" && x.l1[5] === 45);
ok("P3 conferência: desligado conveniado", x.conf.some((c) => /Desligados ainda conveniados/.test(c[0]) && /Ex Funcionario/.test(c[1])));
const em = se.emailResumoSesi(rel);
ok("E1 e-mail com mês, data de corte e total", /outubro\/2026/.test(em.assunto) && /16\/10\/2026/.test(em.html) && /R\$\s?1\.100,00/.test(em.html));
let falhas = 0; for (const [n, v] of Object.entries(res)) { console.log((v ? "OK  " : "FALHOU ") + n); if (!v) falhas++; }
process.exit(falhas ? 1 : 0);
