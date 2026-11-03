# Teste: convidado (terceiro) no formulário da festa e na lista do RH. Dados FICTÍCIOS. Banco simulado: relatorios_mock.js
import os, re, sys
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); MOCK=open(os.path.join(AQUI,"relatorios_mock.js")).read(); res={}
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    pg=b.new_page(viewport={"width":900,"height":1100}); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort()); pg.add_init_script(MOCK)
    pg.goto("http://localhost:5173/?evento=festa-teste"); pg.wait_for_timeout(1300)
    pg.get_by_role("textbox").first.fill("Juli"); pg.wait_for_timeout(300)
    bt=pg.get_by_role("button",name=re.compile("Juliana Maria Leal"))
    res["E1 convidada aparece na busca"]=bt.count()==1
    bt.click(); pg.wait_for_timeout(400)
    res["E2 identificada como convidada"]="Convidado(a) da Kalenborn" in pg.locator("body").inner_text()
    pg.get_by_role("button",name=re.compile("Não vou")).first.click(); pg.wait_for_timeout(200)
    pg.get_by_role("button",name=re.compile("Enviar resposta")).click(); pg.wait_for_timeout(600)
    r=pg.evaluate("window.__EVENTO_RESP")
    res["E3 resposta enviada pela função de convidados"]=bool(r) and r["fn"]=="responder_evento_convidado" and r["a"]["p_convidado_id"]==5 and "p_usuario_id" not in r["a"]
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    pg.close()
    pg=b.new_page(viewport={"width":1300,"height":1000}); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort()); pg.add_init_script(MOCK)
    pg.goto("http://localhost:5173/"); pg.wait_for_timeout(800)
    pg.fill("input[type=email]","ana@teste.local"); pg.fill("input[type=password]","x"); pg.get_by_role("button",name=re.compile("Entrar")).click(); pg.wait_for_timeout(1200)
    nav=pg.locator("nav").get_by_text(re.compile("^Eventos"))
    if nav.count(): nav.first.click(); pg.wait_for_timeout(900)
    t=pg.locator("main").inner_text()
    res["E4 RH: convidada na lista do evento e botão + Convidado"]="Juliana Maria Leal (convidado)" in t and pg.get_by_role("button",name="+ Convidado").count()==1
    res["sem exceções (RH)"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
