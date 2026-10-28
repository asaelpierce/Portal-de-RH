# Teste da ciência do colaborador nas férias (substitui "Colaborador ciente?" do Forms KdB 163) — dados FICTÍCIOS.
# Requer o portal em :5173 e Playwright. Banco simulado: ../relatorios_mock.js (usuários Ana RH e Bia Colab).
import os, re, sys, json
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read()
FERIAS=[{"id":1,"user_id":2,"user_name":"Bia Colab","setor":"producao","tipo":"30","opcao":"30","inicio":"2026-12-01","fim":"2026-12-30","status":"pendente_rh",
         "lider_aprov":"aprovado","gestor_aprov":"aprovado","lancado_por":1,"lancado_por_nome":"Ana RH","ciente_lancador":False,"ciente_colaborador_em":None,"created_at":"2026-10-21T10:00:00Z"},
        {"id":2,"user_id":3,"user_name":"Maria Titular","setor":"producao","tipo":"30","opcao":"30","inicio":"2027-01-04","fim":"2027-02-02","status":"pendente_rh",
         "lider_aprov":"aprovado","gestor_aprov":"aprovado","lancado_por":1,"lancado_por_nome":"Ana RH","ciente_lancador":True,"ciente_lancador_em":"2026-10-21T10:00:00Z","ciente_colaborador_em":None,"created_at":"2026-10-21T10:00:00Z"}]
res={}
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    def abrir(email):
        pg=b.new_page(viewport={"width":1300,"height":1000}); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
        pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort())
        pg.add_init_script(MOCK+"\nwindow.__FERIAS="+json.dumps(FERIAS)+";")
        pg.goto("http://localhost:5173/"); pg.wait_for_timeout(800)
        pg.fill("input[type=email]",email); pg.fill("input[type=password]","x"); pg.get_by_role("button",name=re.compile("Entrar")).click(); pg.wait_for_timeout(1200)
        pg.locator("nav").get_by_text("Férias",exact=True).first.click(); pg.wait_for_timeout(1200)
        return pg
    pg=abrir("bia@teste.local"); t=pg.locator("main").inner_text()
    res["F1 colaborador vê 'Ciência pendente' e o botão nas próprias férias"]="Ciência pendente" in t and pg.get_by_role("button",name=re.compile("Estou ciente")).count()==1
    pg.get_by_role("button",name=re.compile("Estou ciente")).click(); pg.wait_for_timeout(800)
    t=pg.locator("main").inner_text()
    res["F2 'Estou ciente' registra e mostra a data"]="Ciente (confirmado em" in t and pg.get_by_role("button",name=re.compile("Estou ciente")).count()==0 and "Ciência registrada" in pg.locator("body").inner_text()
    pg.close()
    pg=abrir("ana@teste.local"); t=pg.locator("main").inner_text()
    res["F3 RH vê a situação, sem botão (não são férias dele)"]="Ciente (informado)" in t and pg.get_by_role("button",name=re.compile("Estou ciente")).count()==0
    res["F4 quem gerencia vê 'Enviar link' e 'Copiar link'"]=pg.get_by_role("button",name=re.compile("Enviar link")).count()>=1 and pg.get_by_role("button",name=re.compile("Copiar link")).count()>=1
    pg.get_by_role("button",name=re.compile("Enviar link")).first.click(); pg.wait_for_timeout(800)
    inv=pg.evaluate("window.__INVOKES||[]")
    res["F5 'Enviar link' chama o servidor e avisa para quem foi"]=any(i["nome"]=="ferias-ciencia" and i["body"]["enviar"] for i in inv) and "Link de ciência enviado para bi***@teste.local" in pg.locator("body").inner_text()
    pg.close()
    # página pública do link (sem login)
    pg=b.new_page(viewport={"width":420,"height":800}); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort()); pg.add_init_script(MOCK)
    pg.goto("http://localhost:5173/?ciencia="+"a1"*18); pg.wait_for_timeout(1500)
    t=pg.locator("body").inner_text()
    res["F6 link abre sem login e mostra as férias"]="Olá, Bia!" in t and "01/12/2026 a 30/12/2026" in t and "30 dias" in t and "Em aprovação" in t and "adiantamento do 13º" in t
    pg.get_by_role("button",name=re.compile("Estou ciente")).click(); pg.wait_for_timeout(800)
    res["F7 'Estou ciente' pelo link confirma"]="Você confirmou que está ciente" in pg.locator("body").inner_text()
    pg.goto("http://localhost:5173/?ciencia="+"b2"*18); pg.wait_for_timeout(1500)
    res["F8 link inválido: mensagem clara"]="Link inválido ou expirado" in pg.locator("body").inner_text()
    pg.close()
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
