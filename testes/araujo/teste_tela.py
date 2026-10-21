# Teste da tela Relatórios › Convênio Araujo (ponta a ponta no navegador) — dados FICTÍCIOS.
# Mesmos requisitos dos outros testes de tela (portal em :5173, Playwright, PDFJS_DIR). Banco simulado: ../relatorios_mock.js
import os, re, sys, openpyxl
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); PDFJS_DIR=os.environ.get("PDFJS_DIR","/tmp/pdfjs/node_modules/pdfjs-dist/build")
MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read(); res={}
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    pg=b.new_page(viewport={"width":1300,"height":1000},accept_downloads=True); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort())
    def servir(nome): return lambda route, *_: route.fulfill(path=f"{PDFJS_DIR}/{nome}", content_type="application/javascript")
    for f in ("pdf.min.js","pdf.worker.min.js"): pg.route(f"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/{f}", servir(f))
    pg.add_init_script(MOCK)
    pg.goto("http://localhost:5173/"); pg.wait_for_timeout(800)
    pg.fill("input[type=email]","ana@teste.local"); pg.fill("input[type=password]","x"); pg.get_by_role("button",name=re.compile("Entrar")).click(); pg.wait_for_timeout(1200)
    pg.locator("nav").get_by_text("Relatórios",exact=True).click(); pg.wait_for_timeout(600)
    ar=pg.locator("[data-relatorio=araujo]")
    res["A1 cartão do convênio Araujo na tela"]="Convênio Drogaria Araujo" in ar.inner_text() and "Nenhum mês gerado ainda" in ar.inner_text()
    ar.locator("input[type=file]").set_input_files(os.path.join(AQUI,"relatorio_ficticio.pdf")); pg.wait_for_timeout(3500)
    t=ar.inner_text().replace("\xa0"," ")
    res["A2 rateio de outubro/2026 com período e total"]="Rateio de outubro/2026" in t and "R$ 410,50" in t and "período 20/09/2026 a 19/10/2026" in t
    res["A3 rateio pelo centro de custo; não encontrado separado"]="VULCANIZACAO - MÃO DE OBRA" in t and "FINANCEIRO" in t and "SEM CENTRO DE CUSTO (verificar)" in t
    res["A4 conferência: matrícula diferente, compras acima e não encontrado"]="Matrícula na Araujo diferente" in t and "Araujo 00007 × folha 70" in t and "Compras acima do valor do convênio" in t and "PESSOA DE FORA" in t
    with pg.expect_download() as d: ar.get_by_role("button",name=re.compile("Baixar planilha")).click()
    arq=d.value; caminho="/tmp/araujo_baixado.xlsx"; arq.save_as(caminho); wb=openpyxl.load_workbook(caminho)
    res["A5 planilha: nome do arquivo e abas"]=arq.suggested_filename=="araujo_rateio_2026-10.xlsx" and wb.sheetnames==["Rateio","Lista","Conferência"]
    res["A6 histórico"]="outubro/2026" in ar.inner_text().split("Histórico")[1].lower()
    res["A7 os outros cartões continuam na tela"]=pg.locator("[data-relatorio=seguro]").count()==1 and pg.locator("[data-relatorio=odonto]").count()==1
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
