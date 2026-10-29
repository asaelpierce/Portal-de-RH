# Teste da tela Relatórios › Seguro de vida (ponta a ponta no navegador) — dados FICTÍCIOS.
# Requer: servidor do portal em http://localhost:5173 (npx vite), Playwright, e o pdf.js 3.11.174 em PDFJS_DIR
# (ex.: npm install pdfjs-dist@3.11.174 numa pasta temporária). Banco simulado mínimo embutido abaixo.
import os, re, json, sys, openpyxl, io
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); PDFJS_DIR=os.environ.get("PDFJS_DIR","/tmp/pdfjs/node_modules/pdfjs-dist/build")
MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read()
res={}
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    def pagina():
        pg=b.new_page(viewport={"width":1300,"height":950},accept_downloads=True); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
        pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort())
        pg.route("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",lambda r:r.fulfill(path=f"{PDFJS_DIR}/pdf.min.js",content_type="application/javascript"))
        pg.route("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",lambda r:r.fulfill(path=f"{PDFJS_DIR}/pdf.worker.min.js",content_type="application/javascript"))
        pg.add_init_script(MOCK); return pg
    def entrar(pg,email):
        pg.goto("http://localhost:5173/"); pg.wait_for_timeout(800)
        pg.fill("input[type=email]",email); pg.fill("input[type=password]","x"); pg.get_by_role("button",name=re.compile("Entrar")).click(); pg.wait_for_timeout(1200)
    pg=pagina(); entrar(pg,"ana@teste.local")
    pg.locator("nav").get_by_text("Relatórios",exact=True).click(); pg.wait_for_timeout(600)
    res["T1 RH abre Relatórios; histórico vazio"]="Seguro de vida — rateio por centro de custo" in pg.locator("main").inner_text() and "Nenhum mês gerado ainda" in pg.locator("[data-relatorio=seguro]").inner_text()
    pg.locator("[data-relatorio=seguro] input[type=file][accept^=\".pdf\"]").set_input_files(os.path.join(AQUI,"demonstrativo_ficticio.pdf")); pg.wait_for_timeout(3500)
    t=pg.locator("[data-relatorio=seguro]").inner_text().replace("\xa0"," ")   # moeda usa espaço não separável
    res["T2 lê o PDF e mostra o rateio de outubro/2026"]="Rateio de outubro/2026" in t and "R$ 21,81" in t and "3 segurados" in t
    res["T3 rateio por centro de custo (folha)"]="VULCANIZACAO - MÃO DE OBRA" in t and "ADMINISTRATIVE BOARD" in t and "SEM CENTRO DE CUSTO (verificar)" in t
    res["T4 conferência: desligado cobrado, aprendiz 'verificar', exclusão"]="Desligados ainda cobrados" in t and "Aprendizes fora do seguro (verificar" in t and "ANA EXCLUÍDA TESTE" in t
    with pg.expect_download() as d: pg.get_by_role("button",name=re.compile("Baixar planilha")).click()
    arq=d.value; caminho="/tmp/rateio_baixado.xlsx"; arq.save_as(caminho); wb=openpyxl.load_workbook(caminho)
    r=wb["Rateio"]; vals=[[c.value for c in row] for row in r.iter_rows(min_row=4,max_row=r.max_row)]
    tudo=" ".join(str(c.value) for ws in wb for r in ws.iter_rows() for c in r if c.value is not None)
    res["T5 planilha baixada: só Rateio, TOTAL e sem nomes"]=arq.suggested_filename=="seguro_vida_rateio_2026-10.xlsx" and wb.sheetnames==["Rateio"] and vals[-1][0]=="TOTAL" and abs(vals[-1][2]-21.81)<0.001 and "MARIA" not in tudo and "PEDRO" not in tudo
    pg.get_by_role("button",name=re.compile("Enviar resumo")).click()
    try: pg.get_by_text(re.compile("Resumo enviado")).first.wait_for(timeout=5000)
    except Exception: pass
    em=pg.evaluate("window.__EMAILS")
    res["T6 e-mail do resumo vai para o próprio RH"]=len(em)==1 and em[0]["to"]=="ana@teste.local" and "outubro/2026" in em[0]["subject"] and "Resumo enviado" in pg.locator("body").inner_text()
    res["T7 mês aparece no histórico"]="Outubro/2026" in pg.locator("main").inner_text() or "outubro/2026" in pg.locator("[data-relatorio=seguro]").inner_text().split("Histórico")[1]
    # Conferência: abrir o centro de custo, ver as pessoas e corrigir
    seg=pg.locator("[data-relatorio=seguro]")
    seg.get_by_role("button",name="Ver pessoas de VULCANIZACAO - MÃO DE OBRA").click(); pg.wait_for_timeout(300)
    res["T10 ▸ mostra quem está no centro de custo (só na tela)"]="MARIA DA SILVA TESTE" in seg.inner_text()
    seg.get_by_label("Centro de custo de MARIA DA SILVA TESTE").select_option("RECURSOS HUMANOS")
    seg.get_by_role("button",name="Corrigir").first.click(); pg.wait_for_timeout(1200)
    aj=pg.evaluate("window.__AJUSTES||[]")
    t=seg.inner_text()
    res["T11 'Corrigir' grava no cadastro e refaz o rateio"]=len(aj)==1 and aj[0]["p_usuario_id"]==101 and aj[0]["p_centro_custo"]=="RECURSOS HUMANOS" and "RECURSOS HUMANOS" in t and "centro de custo corrigido para RECURSOS HUMANOS" in pg.locator("body").inner_text()
    # PDF com total que não confere → recusa sem gravar
    import shutil, subprocess
    ruim=os.path.join("/tmp","demonstrativo_total_errado.pdf")
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.pdfgen import canvas
    W,H=landscape(A4); c=canvas.Canvas(ruim,pagesize=(W,H)); c.setFont("Helvetica",8)
    c.drawString(40,H-50,"Prudential VG EXPRESS"); c.drawString(40,H-75,"RELATÓRIO DE MOVIMENTAÇÃO"); c.drawString(600,H-105,"2026/11")
    c.drawString(60,H-150,"MARIA DA SILVA TESTE"); c.drawString(330,H-150,"111.444.777-35"); c.drawString(410,H-150,"10/02/1990"); c.drawString(470,H-150,"01/05/2026"); c.drawRightString(700,H-150,"41.696,00"); c.drawRightString(790,H-150,"4,47")
    c.drawString(560,H-163,"TOTAL:"); c.drawRightString(700,H-163,"41.696,00"); c.drawRightString(790,H-163,"99,99"); c.save()
    pg.locator("[data-relatorio=seguro] input[type=file][accept^=\".pdf\"]").set_input_files(ruim); pg.wait_for_timeout(3000)
    res["T8 total que não confere: recusa e não grava"]="não bate com o total do PDF" in pg.locator("[data-relatorio=seguro]").inner_text() and "2026-11" not in json.dumps(pg.evaluate("Object.keys(window.__REL)"))
    pg.close()
    pg=pagina(); entrar(pg,"bia@teste.local")
    res["T9 colaborador não vê Relatórios"]=pg.locator("nav").get_by_text("Relatórios",exact=True).count()==0
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
