# Teste da tela Relatórios › Plano odontológico (ponta a ponta no navegador) — dados FICTÍCIOS.
# Mesmos requisitos do teste do seguro (portal em :5173, Playwright, pdf.js em PDFJS_DIR). Banco simulado: ../relatorios_mock.js
import os, re, sys, openpyxl
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); PDFJS_DIR=os.environ.get("PDFJS_DIR","/tmp/pdfjs/node_modules/pdfjs-dist/build")
MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read(); res={}
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    pg=b.new_page(viewport={"width":1300,"height":1000},accept_downloads=True); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort())
    def servir(nome): return lambda route, *_: route.fulfill(path=f"{PDFJS_DIR}/{nome}", content_type="application/javascript")
    for f in ("pdf.min.js","pdf.worker.min.js"):
        pg.route(f"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/{f}", servir(f))
    pg.add_init_script(MOCK)
    pg.goto("http://localhost:5173/"); pg.wait_for_timeout(800)
    pg.fill("input[type=email]","ana@teste.local"); pg.fill("input[type=password]","x"); pg.get_by_role("button",name=re.compile("Entrar")).click(); pg.wait_for_timeout(1200)
    pg.locator("nav").get_by_text("Relatórios",exact=True).click(); pg.wait_for_timeout(600)
    od=pg.locator("[data-relatorio=odonto]")
    res["O1 cartão do odontológico na tela de Relatórios"]="Plano odontológico (Bradesco)" in od.inner_text() and "Nenhum mês gerado ainda" in od.inner_text()
    od.locator("input[type=file]").set_input_files(os.path.join(AQUI,"fatura_ficticia.pdf")); pg.wait_for_timeout(3500)
    t=od.inner_text().replace("\xa0"," ")
    res["O2 rateio da fatura de outubro/2026 com vigência e total"]="Rateio da fatura de outubro/2026" in t and "R$ 15,95" in t and "vigência 27/10/2026 a 26/11/2026" in t
    res["O3 dependente no centro de custo do titular; desligado no CC fixo"]="REVESTIMENTO - MÃO DE OBRA" in t and "CORTE CERAMICA MAO DE OBRA" in t
    res["O4 titular desconhecido: aviso e área de vínculo"]="sem colaborador responsável" in t and "Vincular titulares" in t and "ANA NOVA TESTE" in t
    opcoes=od.get_by_label("Centro de custo fixo de ANA NOVA TESTE").locator("option").all_inner_texts()
    colab=od.get_by_label("Colaborador responsável por ANA NOVA TESTE").locator("option").all_inner_texts()
    res["O7 listas vêm do cadastro (centros de custo e só colaboradores ativos)"]="REVESTIMENTO - MÃO DE OBRA" in opcoes and "RECURSOS HUMANOS" in opcoes and "Bia Colab" in colab and "Pedro Saiu" not in colab
    od.get_by_label("Colaborador responsável por ANA NOVA TESTE").select_option(label="Bia Colab")
    od.get_by_role("button",name=re.compile("^ *Guardar")).click(); pg.wait_for_timeout(600)
    res["O5 vínculo guardado (vale para os próximos meses)"]=pg.evaluate("JSON.stringify(window.__VINC['0000003'])")=='{"uid":2,"cc":null}' and "Vínculo de ANA NOVA TESTE guardado" in pg.locator("body").inner_text()
    od.get_by_role("button",name=re.compile("Refazer o rateio")).click(); pg.wait_for_timeout(1000)
    t=od.inner_text()
    res["O6 refazer: titular sai de 'sem centro de custo' e vai para o CC do colaborador"]="SEM CENTRO DE CUSTO" not in t and "VULCANIZACAO - MÃO DE OBRA" in t and "Vincular titulares" not in t
    with pg.expect_download() as d: od.get_by_role("button",name=re.compile("Baixar planilha")).click()
    arq=d.value; caminho="/tmp/odonto_baixado.xlsx"; arq.save_as(caminho); wb=openpyxl.load_workbook(caminho)
    rel=[[c.value for c in r] for r in wb["Relação"].iter_rows(min_row=2)]
    res["O8 planilha: nome do arquivo, abas e relação por beneficiário"]=arq.suggested_filename=="odonto_rateio_2026-10.xlsx" and wb.sheetnames==["Rateio","Relação","Conferência"] and len(rel)==4 and any(r[1]=="PEDRO SAIU TESTE" and r[7]==-39.15 for r in rel)
    res["O9 histórico do odonto"]="outubro/2026" in od.inner_text().split("Histórico")[1].lower()
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
