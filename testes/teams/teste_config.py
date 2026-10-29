# Teste da tela Configurações › Avisos no Teams (URL do Power Automate). Dados FICTÍCIOS. Banco simulado: ../relatorios_mock.js
import os, re, sys
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read(); res={}
URL="https://prod-00.brazilsouth.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01&sig=SEGREDO123"
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    pg=b.new_page(viewport={"width":1300,"height":1000}); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort()); pg.add_init_script(MOCK)
    pg.goto("http://localhost:5173/"); pg.wait_for_timeout(800)
    pg.fill("input[type=email]","ana@teste.local"); pg.fill("input[type=password]","x"); pg.get_by_role("button",name=re.compile("Entrar")).click(); pg.wait_for_timeout(1200)
    pg.locator("nav").get_by_text("Configurações",exact=True).click(); pg.wait_for_timeout(700)
    t=pg.locator("main").inner_text()
    res["T1 cartão de avisos do Teams, desligado"]="Avisos no Teams" in t and "desligado" in t
    pg.get_by_label("URL do gatilho HTTP (Power Automate)").fill("https://exemplo.com/x"); pg.get_by_role("button",name="Salvar").click(); pg.wait_for_timeout(500)
    res["T2 URL errada recusada"]="Cole a URL do gatilho" in pg.locator("main").inner_text()
    pg.get_by_label("URL do gatilho HTTP (Power Automate)").fill(URL); pg.get_by_role("button",name="Salvar").click(); pg.wait_for_timeout(500)
    t=pg.locator("main").inner_text()
    res["T3 salva: ligado e mascarada (segredo não aparece inteiro)"]="ligado" in t and "SEGREDO123" not in t and "…" in t
    pg.get_by_role("button",name=re.compile("Enviar teste")).click(); pg.wait_for_timeout(500)
    res["T4 teste enviado"]=pg.evaluate("window.__TEAMS_TESTE")==1 and "Teste enviado" in pg.locator("main").inner_text()
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
