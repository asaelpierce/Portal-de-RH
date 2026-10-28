# Teste da Requisição de Pessoal (pedido de admissão — substitui o Forms KdB 181), dados FICTÍCIOS.
# Requer o portal em :5173 e Playwright. Banco simulado: ../relatorios_mock.js
import os, re, sys
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read(); res={}
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    pg=b.new_page(viewport={"width":1300,"height":1000}); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort()); pg.add_init_script(MOCK)
    pg.goto("http://localhost:5173/"); pg.wait_for_timeout(800)
    pg.fill("input[type=email]","ana@teste.local"); pg.fill("input[type=password]","x"); pg.get_by_role("button",name=re.compile("Entrar")).click(); pg.wait_for_timeout(1200)
    pg.locator("nav").get_by_text("Pedidos de pessoal",exact=True).click(); pg.wait_for_timeout(800)
    pg.get_by_role("button",name=re.compile("Pedir admissão")).click(); pg.wait_for_timeout(400)
    dlg=pg.get_by_role("dialog")
    t=dlg.inner_text().lower()
    res["R1 campos da requisição no pedido"]=all(x in t for x in ("motivo da requisição","quantidade de vagas","tipo de contratação","turno / horário","centro de custo")) and "quem será substituído" not in t
    dlg.get_by_label("Gestor responsável *").select_option("1")
    dlg.get_by_label("Qual cargo? *").fill("Auxiliar de Produção")
    dlg.get_by_label("Qual salário da vaga? *").fill("R$ 1.900,00")
    dlg.get_by_label("Motivo da requisição *").select_option("substituicao"); pg.wait_for_timeout(200)
    res["R2 substituição pede 'quem', incluindo desligados"]="quem será substituído" in dlg.inner_text().lower() and "Pedro Saiu (desligado)" in dlg.get_by_label("Quem será substituído? *").inner_text()
    enviar=dlg.get_by_role("button",name=re.compile("Enviar ao gestor"))
    dlg.get_by_label("O que você busca no colaborador? *").fill("Experiência em produção")
    dlg.get_by_label("Justificativa da necessidade *").fill("Saída do Pedro, reposição")
    res["R3 sem dizer quem, não envia"]=enviar.is_disabled()
    dlg.get_by_label("Quem será substituído? *").select_option("4")
    dlg.get_by_label("Quantidade de vagas *").fill("2")
    dlg.get_by_label("Tipo de contratação *").select_option("temporario")
    dlg.get_by_label("Turno / horário").fill("2º turno")
    enviar.click(); pg.wait_for_timeout(800)
    d=pg.evaluate("window.__ULTIMO_MOV")["p_dados"]
    res["R4 envio com motivo, substituído, quantidade, tipo e turno"]=d["motivo_requisicao"]=="substituicao" and d["substituido_id"]==4 and d["quantidade"]==2 and d["tipo_contratacao"]=="temporario" and d["turno"]=="2º turno"
    t=pg.locator("main").inner_text()
    res["R5 cartão: 2 vagas · substituição de Pedro Saiu · Temporário"]="2 vagas · substituição de Pedro Saiu · Temporário" in t
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
