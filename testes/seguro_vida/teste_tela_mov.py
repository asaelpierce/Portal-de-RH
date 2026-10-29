# Teste da tela: Seguro de vida › Movimentação para a Prudential (lista de ativos da BRIT) — dados FICTÍCIOS.
# Requer o portal em :5173 e Playwright. Banco simulado: ../relatorios_mock.js
import os, re, sys, openpyxl
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read(); res={}
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    pg=b.new_page(viewport={"width":1300,"height":1000},accept_downloads=True); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort()); pg.add_init_script(MOCK)
    pg.goto("http://localhost:5173/"); pg.wait_for_timeout(800)
    pg.fill("input[type=email]","ana@teste.local"); pg.fill("input[type=password]","x"); pg.get_by_role("button",name=re.compile("Entrar")).click(); pg.wait_for_timeout(1200)
    pg.locator("nav").get_by_text("Relatórios",exact=True).click(); pg.wait_for_timeout(600)
    se=pg.locator("[data-relatorio=seguro]")
    res["V1 seção de movimentação no cartão do seguro"]="Movimentação para a Prudential" in se.inner_text() and se.get_by_role("button",name=re.compile("Carregar colaboradores ativos")).count()==1
    se.locator('input[type=file][accept=".xlsx"]').set_input_files(os.path.join(AQUI,"ativos_ficticio.xlsx")); pg.wait_for_timeout(1500)
    env=pg.evaluate("window.__ATIVOS_ENVIADOS")
    res["V2 lê a planilha e manda os ativos ao banco (CPF com zero, data)"]=len(env)==2 and env[0]["cpf"]=="02233344405" and env[0]["admissao"]=="2026-10-20" and env[0]["centro_custo"]=="VULCANIZACAO - MÃO DE OBRA"
    t=se.inner_text()
    res["V3 resumo: inclusões, exclusões e verificar"]="Inclusões (1):" in t and "Maria Teste" in t and "Exclusões (1):" in t and "PEDRO SAIU (desligado em 15/10/2026)" in t and "aprendizes fora do seguro: Joao Teste" in t
    with pg.expect_download() as d: se.get_by_role("button",name=re.compile("Baixar listagem para a Prudential")).click()
    arq=d.value; caminho="/tmp/prud_mov.xlsx"; arq.save_as(caminho); wb=openpyxl.load_workbook(caminho)
    res["V4 listagem baixada com as 3 abas"]=arq.suggested_filename.startswith("prudential_movimentacao_") and wb.sheetnames==["Inclusões","Exclusões","Verificar"] and wb["Inclusões"]["A3"].value=="Maria Teste"
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
