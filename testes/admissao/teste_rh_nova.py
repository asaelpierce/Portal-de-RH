# Teste do RH: "Nova admissão" com centro de custo e setor obrigatórios e e-mail opcional. Dados FICTÍCIOS.
import os, re, sys
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read(); res={}
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    pg=b.new_page(viewport={"width":1300,"height":1000}); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort()); pg.add_init_script(MOCK)
    pg.goto("http://localhost:5173/"); pg.wait_for_timeout(800)
    pg.fill("input[type=email]","ana@teste.local"); pg.fill("input[type=password]","x"); pg.get_by_role("button",name=re.compile("Entrar")).click(); pg.wait_for_timeout(1200)
    pg.locator("nav").get_by_text("Vagas e candidatos",exact=True).click(); pg.wait_for_timeout(600)
    pg.get_by_role("button",name=re.compile("^Admissões")).first.click(); pg.wait_for_timeout(600)
    pg.get_by_role("button",name="+ Nova admissão").click(); pg.wait_for_timeout(300)
    dlg=pg.get_by_role("dialog"); criar=dlg.get_by_role("button",name="Criar e gerar link")
    dlg.get_by_label("Nome do candidato *").fill("Carlos Teste")
    res["R1 sem centro de custo e setor não cria"]=criar.is_disabled() and "opcional" in dlg.inner_text().lower()
    dlg.get_by_label("Centro de custo (resultado) *").select_option("VULCANIZACAO - MÃO DE OBRA"); dlg.get_by_label("Setor / departamento *").select_option("Produção")
    criar.click(); pg.wait_for_timeout(700)
    a=pg.evaluate("window.__ADM_CRIADA")
    res["R2 cria sem e-mail, já com centro de custo e setor"]=a and a["p_email"] is None and a["p_dados_empresa"]=={"centro_custo":"VULCANIZACAO - MÃO DE OBRA","departamento":"Produção"} and "Carlos Teste" in pg.locator("main").inner_text()
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
