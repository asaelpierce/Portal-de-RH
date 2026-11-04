# Teste: Colaboradores › Movimentar setor/área — RH muda setor, centro de custo e gestor juntos. Dados FICTÍCIOS.
import os, re, sys
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read(); res={}
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    pg=b.new_page(viewport={"width":1300,"height":1000}); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort()); pg.add_init_script(MOCK)
    pg.goto("http://localhost:5173/"); pg.wait_for_timeout(800)
    pg.fill("input[type=email]","ana@teste.local"); pg.fill("input[type=password]","x"); pg.get_by_role("button",name=re.compile("Entrar")).click(); pg.wait_for_timeout(1200)
    pg.locator("nav").get_by_text("Colaboradores",exact=True).click(); pg.wait_for_timeout(700)
    pg.locator("main").get_by_text("Bia Colab",exact=True).first.click(); pg.wait_for_timeout(500)
    pg.get_by_role("button",name="⇄ Movimentar setor/área").first.click(); pg.wait_for_timeout(300)
    dlg=pg.get_by_role("dialog")
    res["C1 janela tem centro de custo, líder e gestor (RH)"]=all(dlg.get_by_label(x).count()==1 for x in ["Centro de custo (folha)","Líder","Gestor"])
    dlg.get_by_label("Novo setor").select_option("qualidade")
    dlg.get_by_label("Centro de custo (folha)").select_option("RECURSOS HUMANOS")
    dlg.get_by_label("Gestor").select_option(index=1)
    dlg.get_by_role("button",name="Confirmar").click(); pg.wait_for_timeout(700)
    upd=pg.evaluate("window.__UPD"); aj=pg.evaluate("window.__AJUSTES||[]")
    res["C2 salva setor e gestor, e o centro de custo pela correção registrada"]=upd and upd["setor"]=="qualidade" and upd.get("gestor_id") is not None and len(aj)==1 and aj[0]["p_centro_custo"]=="RECURSOS HUMANOS"
    res["C3 avisa que salvou e fecha a janela"]="movimentado(a)" in pg.locator("body").inner_text() and pg.get_by_role("dialog").count()==0
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
