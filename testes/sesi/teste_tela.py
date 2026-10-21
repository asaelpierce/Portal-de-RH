# Teste da tela Relatórios › Clube SESI (ponta a ponta no navegador) — dados FICTÍCIOS.
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
    se=pg.locator("[data-relatorio=sesi]")
    res["S1 cartão do Clube SESI na tela"]="Clube SESI Vespasiano" in se.inner_text() and "Nenhum mês gerado ainda" in se.inner_text()
    se.locator("input[type=file]").set_input_files(os.path.join(AQUI,"relacao_ficticia.pdf")); pg.wait_for_timeout(3500)
    t=se.inner_text().replace("\xa0"," ")
    res["S2 rateio de outubro/2026 com data de corte e total"]="Rateio de outubro/2026" in t and "R$ 1.100,00" in t and "data de corte 16/10/2026" in t
    res["S3 rateio pelo centro de custo da folha"]="VULCANIZACAO - MÃO DE OBRA" in t and "RECURSOS HUMANOS" in t
    res["S4 conferência: desligado ainda conveniado"]="Desligados ainda conveniados" in t and "Jose Teste de Tal" in t
    with pg.expect_download() as d: se.get_by_role("button",name=re.compile("Baixar planilha")).click()
    arq=d.value; caminho="/tmp/sesi_baixado.xlsx"; arq.save_as(caminho); wb=openpyxl.load_workbook(caminho)
    res["S5 planilha: nome do arquivo e abas"]=arq.suggested_filename=="sesi_rateio_2026-10.xlsx" and wb.sheetnames==["Rateio","Lista","Conferência"]
    res["S6 histórico"]="outubro/2026" in se.inner_text().split("Histórico")[1].lower()
    res["S7 quatro cartões na tela"]=all(pg.locator(f"[data-relatorio={k}]").count()==1 for k in ("seguro","odonto","araujo","sesi"))
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
