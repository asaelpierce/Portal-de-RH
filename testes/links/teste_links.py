# Teste dos links diretos dos formulários (?abrir=...) — substituem os links dos Forms KdB 163/181/133. Dados FICTÍCIOS.
# Requer o portal em :5173 e Playwright. Banco simulado: ../relatorios_mock.js
import os, re, sys
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read(); res={}
BASE="http://localhost:5173"
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    def abrir(url,email):
        ctx=b.new_context(viewport={"width":1300,"height":1000}); ctx.grant_permissions(["clipboard-read","clipboard-write"],origin=BASE)
        pg=ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
        pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort()); pg.add_init_script(MOCK)
        pg.goto(url); pg.wait_for_timeout(900)
        aviso=pg.locator("body").inner_text()
        pg.fill("input[type=email]",email); pg.fill("input[type=password]","x"); pg.get_by_role("button",name=re.compile("Entrar")).click(); pg.wait_for_timeout(1500)
        return pg,aviso
    pg,aviso=abrir(BASE+"/?abrir=movimentacao","ana@teste.local")
    res["L1 tela de entrada avisa o que vai abrir"]="Entre para abrir: Pedir movimentação de pessoal" in aviso and "Peça ao RH" in aviso
    res["L2 depois do login abre 'Pedir movimentação' e limpa o endereço"]=pg.get_by_role("dialog").count()==1 and "Pedir movimentação de pessoal" in pg.get_by_role("dialog").inner_text() and "abrir=" not in pg.url
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    if pg.get_by_role("dialog").count(): pg.get_by_role("dialog").get_by_role("button",name="Cancelar").click(); pg.wait_for_timeout(300)
    pg.get_by_role("button",name="Copiar link · Movimentação").click(); pg.wait_for_timeout(300)
    res["L3 RH copia o link certo (sem login)"]=pg.evaluate("navigator.clipboard.readText()")==BASE+"/?form=movimentacao" and "Link copiado" in pg.locator("body").inner_text()
    pg.context.close()
    pg,_=abrir(BASE+"/?abrir=ferias","ana@teste.local")
    res["L4 ?abrir=ferias abre o lançamento de férias"]=pg.get_by_role("dialog").count()==1 and "férias" in pg.get_by_role("dialog").inner_text().lower()
    pg.context.close()
    pg,_=abrir(BASE+"/?abrir=admissao","bia@teste.local")
    res["L5 colaborador comum: aviso educado, sem abrir nada"]=pg.get_by_role("dialog").count()==0 and "Este formulário é para líderes, gestores e RH" in pg.locator("body").inner_text()
    pg.context.close()
    pg,aviso=abrir(BASE+"/?abrir=qualquercoisa","ana@teste.local")
    res["L6 link inválido é ignorado (entra normal)"]="Entre para abrir" not in aviso and pg.get_by_role("dialog").count()==0
    pg.context.close()
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
