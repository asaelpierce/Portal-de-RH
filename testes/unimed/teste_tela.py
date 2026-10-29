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
    res["U3b subtotal da enfermaria = fatura inteira (R$ 835,00 de mensalidade)"]="R$ 835,00" in t
    res["U4 desligado: desconto na rescisão e valor no rateio"]="Rescisão:" in t and "Pedro Saiu" in t and "Desligados ainda no plano" in t and "CORTE CERAMICA MAO DE OBRA" in t
    res["U5 família desconhecida: aviso e vínculo"]="Vincular famílias" in t and "FULANO NAO CADASTRADO" in t
    res["U6 PDFs faltando na conferência"]="PDFs que não foram anexados" in t and "0372477" in t
    un.get_by_label("Titular da família de FULANO NAO CADASTRADO").select_option(label="Bia Colab")
    un.get_by_role("button",name=re.compile("^ *Guardar")).click(); pg.wait_for_timeout(600)
    un.get_by_role("button",name=re.compile("Refazer com os vínculos")).click(); pg.wait_for_timeout(1200)
    t=un.inner_text()
    res["U7 refazer: família vinculada sai de 'sem centro de custo'"]="Vincular famílias" not in t and "VULCANIZACAO - MÃO DE OBRA" in t and "SEM CENTRO DE CUSTO" not in t
    with pg.expect_download() as d: un.get_by_role("button",name=re.compile("Baixar planilha")).click()
    arq=d.value; caminho="/tmp/unimed_baixado.xlsx"; arq.save_as(caminho); wb=openpyxl.load_workbook(caminho)
    tudo=" ".join(str(c.value) for ws in wb for r in ws.iter_rows() for c in r if c.value is not None)
    res["U8 planilha do rateio: só Rateio e sem nomes"]=arq.suggested_filename=="unimed_rateio_descontos_2026-10.xlsx" and wb.sheetnames==["Rateio"] and "Maria" not in tudo and "Pedro" not in tudo
    with pg.expect_download() as d2: un.get_by_role("button",name=re.compile("Descontos em folha \\(BRIT\\)")).click()
    a2=d2.value; c2="/tmp/unimed_desc.xlsx"; a2.save_as(c2); wd=openpyxl.load_workbook(c2)
    desc=[[c.value for c in r] for r in wd["Descontos em folha"].iter_rows(min_row=3)]
    res["U8b descontos em folha em arquivo separado (Maria: tabela 18,98 + 9,33 = 28,31; copart 3,60)"]=a2.suggested_filename=="unimed_descontos_folha_2026-10.xlsx" and wd.sheetnames==["Descontos em folha","Rescisão"] and any(r[0]=="Maria Titular" and r[3]==28.31 and r[4]==3.6 for r in desc)
    un.locator("tr",has=pg.get_by_role("button",name="Ver pessoas de REVESTIMENTO - MÃO DE OBRA")).locator("td").first.click(position={"x":120,"y":8}); pg.wait_for_timeout(300)
    un.get_by_role("button",name=re.compile("Maria Titular")).click(); pg.wait_for_timeout(300)
    t=un.inner_text()
    res["U10 família: beneficiários da mensalidade e quem usou a coparticipação"]="FILHO DA MARIA" in t and "usou a coparticipação" in t
    res["U9 histórico e os cinco cartões"]="outubro/2026" in un.inner_text().split("Histórico")[1].lower() and all(pg.locator(f"[data-relatorio={k}]").count()==1 for k in ("seguro","odonto","araujo","sesi","unimed"))
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
