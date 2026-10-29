# Teste dos formulários SEM LOGIN (?form=...) — substituem os Forms; dados FICTÍCIOS. Banco simulado: ../relatorios_mock.js
import os, re, sys
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read(); res={}
BASE="http://localhost:5173"
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    def abrir(url):
        ctx=b.new_context(viewport={"width":900,"height":1100}); ctx.grant_permissions(["clipboard-read","clipboard-write"],origin=BASE)
        pg=ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
        pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort()); pg.add_init_script(MOCK); pg.goto(url); pg.wait_for_timeout(1200); return pg
    pg=abrir(BASE+"/?form=ferias")
    t=pg.locator("body").inner_text()
    res["P1 férias abre sem login (sem tela de entrada)"]="Programação de Férias" in t and pg.locator("input[type=password]").count()==0
    res["P1b sem campo de matrícula"]="matrícula" not in t.lower()
    pg.get_by_label("Seu nome *").select_option("3")
    op=pg.get_by_label("Colaborador *").locator("option").all_inner_texts()
    res["P2 líder vê só a própria equipe"]=any("Maria Titular" in o for o in op) and not any("Bia Colab" in o for o in op)
    pg.get_by_label("Seu nome *").select_option("1")
    op=pg.get_by_label("Colaborador *").locator("option").all_inner_texts()
    res["P2b gestor/RH vê a equipe dele (Bia e Maria)"]=any("Bia Colab" in o for o in op) and any("Maria Titular" in o for o in op)
    pg.get_by_label("Colaborador *").select_option("2"); pg.get_by_label("Data de início *").fill("2026-12-01")
    pg.get_by_label("Quantos dias em descanso").fill("12"); pg.wait_for_timeout(200)
    res["P3 'Outro: 12 dias' calcula o período"]="01/12/2026 a 12/12/2026 (12 dias)" in pg.locator("body").inner_text()
    pg.get_by_role("button",name=re.compile("Enviar ao RH")).click(); pg.wait_for_timeout(600)
    env=pg.evaluate("window.__FORM_ENVIADO")
    res["P4 enviado ao RH com opção 12, sem matrícula"]="Pedido enviado ao RH" in pg.locator("body").inner_text() and env["p_tipo"]=="ferias" and env["p_dados"]["opcao"]=="12" and env["p_dados"]["descanso"]==12 and "solicitante_matricula" not in env["p_dados"]
    pg.context.close()
    pg=abrir(BASE+"/?form=ferias")
    res["P4b opção 20 + 10 de abono disponível"]=pg.get_by_text("20 dias em descanso e 10 dias de abono pecuniário").count()==1
    pg.context.close()
    pg=abrir(BASE+"/?form=movimentacao")
    pg.get_by_label("Seu nome *").select_option("1")
    pg.get_by_label("Colaborador *").select_option("2"); pg.get_by_label("Gestor responsável *").select_option("1")
    pg.get_by_label("Mudança de função").check(); pg.get_by_label("Novo cargo").fill("Oficial de Produção IA")
    pg.get_by_label("Data de vigência *").fill("2026-12-01"); pg.get_by_label("Justificativa *").fill("Promoção por desempenho")
    pg.get_by_role("button",name=re.compile("Enviar ao RH")).click(); pg.wait_for_timeout(600)
    d=pg.evaluate("window.__FORM_ENVIADO")["p_dados"]
    res["P5 movimentação sem login: dados certos"]=d["tipos"]==["funcao"] and d["proposta"]=={"cargo":"Oficial de Produção IA"} and d["user_id"]==2 and d["gestor_id"]==1 and "Pedido enviado ao RH" in pg.locator("body").inner_text()
    pg.context.close()
    # RH logado copia o link SEM login
    pg=abrir(BASE+"/")
    pg.fill("input[type=email]","ana@teste.local"); pg.fill("input[type=password]","x"); pg.get_by_role("button",name=re.compile("Entrar")).click(); pg.wait_for_timeout(1300)
    pg.locator("nav").get_by_text("Pedidos de pessoal",exact=True).click(); pg.wait_for_timeout(600)
    pg.get_by_role("button",name="Copiar link · Admissão").click(); pg.wait_for_timeout(300)
    res["P6 RH copia o link sem login"]=pg.evaluate("navigator.clipboard.readText()")==BASE+"/?form=admissao"
    pg.context.close()
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
