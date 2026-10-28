# Teste da Movimentação de Pessoal (substitui o Forms KdB 133) — ponta a ponta no navegador, dados FICTÍCIOS.
# Requer o portal em :5173 e Playwright. Banco simulado: ../relatorios_mock.js
import os, re, sys, json
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read(); res={}
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    pg=b.new_page(viewport={"width":1300,"height":1000}); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort()); pg.add_init_script(MOCK)
    pg.goto("http://localhost:5173/"); pg.wait_for_timeout(800)
    pg.fill("input[type=email]","ana@teste.local"); pg.fill("input[type=password]","x"); pg.get_by_role("button",name=re.compile("Entrar")).click(); pg.wait_for_timeout(1200)
    pg.locator("nav").get_by_text("Pedidos de pessoal",exact=True).click(); pg.wait_for_timeout(800)
    res["M1 menu 'Pedidos de pessoal' e botão de movimentação"]="Admissão, Demissão e Movimentação" in pg.locator("main").inner_text() and pg.get_by_role("button",name=re.compile("Pedir movimentação")).count()==1
    pg.get_by_role("button",name=re.compile("Pedir movimentação")).click(); pg.wait_for_timeout(500)
    dlg=pg.get_by_role("dialog")
    dlg.get_by_label("Colaborador *").select_option("2")
    pg.wait_for_timeout(200)
    res["M2 mostra a situação atual do colaborador"]="Hoje:" in dlg.inner_text() and "VULCANIZACAO - MÃO DE OBRA" in dlg.inner_text()
    dlg.get_by_label("Transferência de setor/centro de custo").check(); dlg.get_by_label("Alteração salarial").check(); pg.wait_for_timeout(200)
    t=dlg.inner_text().lower()   # rótulos aparecem em maiúsculas por estilo (CSS)
    res["M3 campos conforme os tipos (setor, área, centro de custo, salário)"]=all(x.lower() in t for x in ("Novo setor","Nova área","Novo centro de custo (folha)","Novo salário")) and "novo cargo" not in t
    dlg.get_by_label("Novo centro de custo (folha)").select_option("REVESTIMENTO - MÃO DE OBRA")
    dlg.get_by_label("Novo salário").fill("R$ 3.000,00")
    dlg.get_by_label("Justificativa *").fill("Reorganização da equipe de revestimento")
    dlg.get_by_role("button",name=re.compile("Enviar ao gestor")).click(); pg.wait_for_timeout(800)
    env=pg.evaluate("window.__ULTIMO_MOV")
    d=env["p_dados"]
    res["M4 pedido enviado ao banco com tipos, proposta e vigência"]=env["p_tipo"]=="movimentacao" and set(d["tipos"])=={"transferencia","salario"} and d["proposta"]=={"centro_custo":"REVESTIMENTO - MÃO DE OBRA","salario":"R$ 3.000,00"} and len(d["data_vigencia"])==10
    t=pg.locator("main").inner_text()
    res["M5 cartão da movimentação com tipos e vigência"]="Bia Colab" in t and "Transferência de setor/centro de custo" in t and "vigência" in t
    pg.get_by_role("button",name=re.compile("Detalhar e enviar")).first.click(); pg.wait_for_timeout(500)
    t=pg.get_by_role("dialog").inner_text()
    res["M6 gestor vê de → para"]="Atual" in t and "Proposto" in t and "REVESTIMENTO - MÃO DE OBRA" in t and "(não fica no portal)" in t
    pg.get_by_role("dialog").get_by_role("button",name=re.compile("Enviar ao RH")).click(); pg.wait_for_timeout(600)
    pg.get_by_role("button",name=re.compile("Decidir")).first.click(); pg.wait_for_timeout(500)
    res["M7 RH vê o aviso de atualização do cadastro"]="aprovar atualiza o cadastro na data de vigência" in pg.get_by_role("dialog").inner_text()
    pg.get_by_role("dialog").get_by_role("button",name=re.compile("Aprovar e efetivar")).click(); pg.wait_for_timeout(800)
    res["M8 aprovado com vigência hoje: 'Cadastro atualizado'"]="Aprovado — cadastro atualizado." in pg.locator("body").inner_text()
    pg.get_by_role("button",name=re.compile("^Todas$")).click(); pg.wait_for_timeout(300)
    res["M9 chip no cartão"]="Cadastro atualizado em" in pg.locator("main").inner_text()
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
