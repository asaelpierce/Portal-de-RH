# Teste da tela Relatórios › Unimed (ponta a ponta no navegador) — dados FICTÍCIOS.
# Mesmos requisitos dos outros testes de tela. Banco simulado: ../relatorios_mock.js
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
    un=pg.locator("[data-relatorio=unimed]")
    res["U1 cartão da Unimed aceita vários PDFs"]="Unimed — rateio por centro de custo e descontos em folha" in un.inner_text() and un.locator("input[type=file][multiple]").count()==1
    un.locator("input[type=file]").set_input_files([os.path.join(AQUI,"rel1_ficticio.pdf"),os.path.join(AQUI,"rel7_ficticio.pdf")]); pg.wait_for_timeout(4000)
    t=un.inner_text().replace("\xa0"," ")
    res["U2 mês do relatório (outubro/2026) a partir dos dois PDFs"]="Unimed de outubro/2026" in t and "2 PDFs" in t
    res["U3 tabela por contrato com mensalidade e coparticipação"]="Contrato 0309917 — Enfermaria" in t and "REVESTIMENTO - MÃO DE OBRA" in t and "R$ 550,00" in t
    res["U4 desligado fora do rateio e na rescisão"]="Rescisão:" in t and "Pedro Saiu" in t and "Desligados: lançar na rescisão" in t
    res["U5 família desconhecida: aviso e vínculo"]="Vincular famílias" in t and "FULANO NAO CADASTRADO" in t
    res["U6 PDFs faltando na conferência"]="PDFs que não foram anexados" in t and "0372477" in t
    un.get_by_label("Titular da família de FULANO NAO CADASTRADO").select_option(label="Bia Colab")
    un.get_by_role("button",name=re.compile("^ *Guardar")).click(); pg.wait_for_timeout(600)
    un.get_by_role("button",name=re.compile("Refazer com os vínculos")).click(); pg.wait_for_timeout(1200)
    t=un.inner_text()
    res["U7 refazer: família vinculada sai de 'sem centro de custo'"]="Vincular famílias" not in t and "VULCANIZACAO - MÃO DE OBRA" in t and "SEM CENTRO DE CUSTO" not in t
    with pg.expect_download() as d: un.get_by_role("button",name=re.compile("Baixar planilha")).click()
    arq=d.value; caminho="/tmp/unimed_baixado.xlsx"; arq.save_as(caminho); wb=openpyxl.load_workbook(caminho)
    desc=[[c.value for c in r] for r in wb["Descontos em folha"].iter_rows(min_row=2)]
    res["U8 planilha: abas e descontos (Maria 60,50 + 3,60)"]=arq.suggested_filename=="unimed_rateio_descontos_2026-10.xlsx" and wb.sheetnames==["Rateio","Descontos em folha","Rescisão","Mensalidade","Coparticipação","Conferência"] and any(r[0]=="Maria Titular" and r[3]==60.5 and r[4]==3.6 for r in desc)
    res["U9 histórico e os cinco cartões"]="outubro/2026" in un.inner_text().split("Histórico")[1].lower() and all(pg.locator(f"[data-relatorio={k}]").count()==1 for k in ("seguro","odonto","araujo","sesi","unimed"))
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
