# Teste da ficha de admissão pelo link: documentos, conta Itaú, uniforme e vale-transporte. Dados FICTÍCIOS.
import os, re, sys
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read(); res={}
TOKEN="t"*48
PDF=os.path.join("/tmp","cpf_teste.pdf"); open(PDF,"wb").write(b"%PDF-1.4\n%ficticio\n")
TXT=os.path.join("/tmp","nota.txt"); open(TXT,"w").write("x")
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    pg=b.new_page(viewport={"width":900,"height":1200}); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort()); pg.add_init_script(MOCK)
    pg.goto(f"http://localhost:5173/?admissao={TOKEN}"); pg.wait_for_timeout(1300)
    t=pg.locator("body").inner_text()
    res["F1 orientações (CamScanner) e prazo"]="CamScanner" in t and "10/11/2026" in t
    pg.get_by_label("Enviar: CPF",exact=True).set_input_files(PDF); pg.wait_for_timeout(700)
    up=pg.evaluate("window.__UPLOADS||[]")
    res["F2 PDF enviado na pasta do link e marcado ✅"]=len(up)==1 and up[0].startswith(TOKEN+"/cpf/") and "cpf_teste.pdf" in pg.locator("body").inner_text()
    pg.get_by_label("Enviar: Título de eleitor").set_input_files(TXT); pg.wait_for_timeout(400)
    res["F3 arquivo de texto recusado"]="Envie em PDF ou foto" in pg.locator("body").inner_text() and len(pg.evaluate("window.__UPLOADS"))==1
    pg.get_by_role("button",name="remover").first.click(); pg.wait_for_timeout(400)
    res["F4 remover tira da lista"]="cpf_teste.pdf" not in pg.locator("body").inner_text()
    pg.get_by_label("Você tem conta no Itaú?").select_option("nao")
    res["F5 sem Itaú: aviso da conta salário"]="conta salário" in pg.locator("body").inner_text()
    pg.get_by_role("radio",name="GG",exact=True).check(); pg.get_by_label("Tamanho da calça").fill("42"); pg.get_by_label("Tamanho do calçado de segurança").fill("40")
    pg.get_by_label("Utilizará vale-transporte?").select_option("sim")
    pg.get_by_role("button",name="+ Trajeto de ida").click(); pg.get_by_role("button",name="+ Trajeto de volta").click()
    linhas=pg.get_by_label("Linha de ônibus"); linhas.nth(0).fill("4105"); linhas.nth(1).fill("4105")
    pg.get_by_label("Empresa de transporte").nth(0).fill("Saritur"); pg.get_by_label("Valor (R$)").nth(0).fill("5,50")
    pg.get_by_label("Quantidade total de passagens por dia").fill("2")
    # obrigatórios da ficha (fictícios)
    for k,v in [("Nome completo *","Carlos Teste da Silva"),("Nome da mãe *","Maria Teste"),("Naturalidade (cidade/UF) *","Vespasiano/MG"),("Telefone *","31999990000"),
                ("Rua / avenida *","Rua A"),("Número *","10"),("Bairro *","Centro"),("CEP *","33200000"),("Cidade/UF *","Vespasiano/MG"),("RG (identidade) *","MG123"),("CPF *","52998224725")]:
        loc=pg.get_by_label(k)
        if loc.count(): loc.first.fill(v)
    for k,v in [("Sexo *","M"),("Raça/cor *",None),("Escolaridade *",None),("Estado civil *",None)]:
        loc=pg.get_by_label(k)
        if loc.count():
            if v: loc.first.select_option(v)
            else: loc.first.select_option(index=1)
    nasc=pg.get_by_label("Data de nascimento *")
    if nasc.count(): nasc.first.fill("1995-05-05")
    pg.locator("label:has-text('Declaro que as informações')").locator("input").check()
    pg.get_by_role("button",name=re.compile("Enviar ficha")).click(); pg.wait_for_timeout(800)
    f=pg.evaluate("window.__FICHA")
    if not f: print("ERRO NA TELA:", [l for l in pg.locator("body").inner_text().split("\n") if "Preencha" in l or "inválid" in l][:3])
    res["F6 ficha enviada com uniforme, VT (trajetos) e Itaú"]=bool(f) and f.get("camiseta")=="GG" and f.get("calca")=="42" and f.get("vt")=="sim" and len(f.get("vt_trajetos",[]))==2 and f["vt_trajetos"][0]["linha"]=="4105" and f.get("tem_itau")=="nao"
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
