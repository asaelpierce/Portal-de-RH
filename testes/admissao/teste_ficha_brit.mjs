// Teste: ficha de registro da BRIT gerada com o MODELO REAL (public/modelos) e dados FICTÍCIOS; confere as células.
// Rodar: node testes/admissao/teste_ficha_brit.mjs  (precisa de python3 + openpyxl)
import fs from "fs"; import os from "os"; import path from "path"; import { execSync } from "child_process";
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fb-"));
fs.copyFileSync(path.join(raiz, "src/feriasFolha.js"), path.join(tmp, "feriasFolha.mjs"));
fs.writeFileSync(path.join(tmp, "fichaBrit.mjs"), fs.readFileSync(path.join(raiz, "src/fichaBrit.js"), "utf8").replace('"./feriasFolha.js"', '"./feriasFolha.mjs"'));
const { gerarFichaBrit } = await import(path.join(tmp, "fichaBrit.mjs"));
const c = { nome: "Carlos Teste da Silva", raca: "Parda", nascimento: "1995-05-05", email: "carlos@exemplo.com", logradouro: "Rua A", complemento: "apto 2",
  cep: "33200000", cpf: "52998224725", pis: "123.45678.90-0", titulo: "123456789012", titulo_zona: "100", titulo_secao: "200",
  dependentes: [{ nome: "Filho Teste", vinculo: "Filho", irrf: "sim", cpf: "11144477735" }, { nome: "Esposa Teste", vinculo: "Cônjuge", irrf: "nao" }],
  banco: "Itaú", agencia: "1234", conta: "56789-0", tipo_conta: "Corrente",
  vt: "sim", vt_trajetos: [{ linha: "4105", valor: "5,50" }, { linha: "30", valor: "4,80" }, { linha: "30", valor: "4,80" }, { linha: "4105", valor: "5,50" }], vt_passagens_dia: "4" };
const e = { centro_custo: "VULCANIZACAO - MÃO DE OBRA", departamento: "Produção", experiencia_dias: 45, prorrogacao_dias: 45 };
const out = await gerarFichaBrit(fs.readFileSync(path.join(raiz, "public/modelos/ficha_registro_brit.xlsx")), c, e);
const arq = path.join(tmp, "f.xlsx"); fs.writeFileSync(arq, Buffer.from(out instanceof Blob ? await out.arrayBuffer() : out));
const v = JSON.parse(execSync(`python3 -c "
import openpyxl,json; ws=openpyxl.load_workbook('${arq}').active
print(json.dumps({r:ws[r].value for r in ['A5','B4','G4','B5','B11','F12','H14','B15','B16','F16','I16','J18','J19','B23','B25','I25','J27','B37','D37','G37','B38','D38','G38','F49']}))"`).toString());
const res = {}; const ok = (n, x) => { res[n] = !!x; };
ok("B1 rótulo novo e item 18 dos documentos", v.A5 === "NOME COMPLETO:" && v.F49 === "18 - ATESTADO DE BONS ANTECEDENTES");
ok("B2 centro de custo e setor da criação", v.B4 === "VULCANIZACAO - MÃO DE OBRA" && v.G4 === "Produção");
ok("B3 dados pessoais formatados", v.B5 === "Carlos Teste da Silva" && v.B11 === "Rua A, apto 2" && v.F12 === "33200-000" && v.H14 === "529.982.247-25");
ok("B4 PIS e título com zona e seção", v.B15 === "123.45678.90-0" && v.B16 === "123456789012" && v.F16 === "100" && v.I16 === "200");
ok("B5 IRRF por dependente (SIM / NÃO)", v.J18 === "SIM" && v.J19 === "NÃO");
ok("B6 vínculo padrão e conta corrente", v.B23 === "EMPREGADO CLT" && v.B25 === "Itaú" && v.I25 === "Corrente");
ok("B7 prazo total da experiência 45 + 45 = 90", String(v.J27) === "90");
ok("B8 vale-transporte por tarifa (2 × 5,50 e 2 × 4,80)", v.B37 === "SIM" && v.D37 === "R$ 5,50" && String(v.G37) === "2" && v.B38 === "SIM" && v.D38 === "R$ 4,80" && String(v.G38) === "2");
let falhas = 0; for (const [n, x] of Object.entries(res)) { console.log((x ? "OK  " : "FALHOU ") + n); if (!x) falhas++; }
process.exit(falhas ? 1 : 0);
