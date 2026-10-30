# Teste da ficha de admissão pelo link, em 2 etapas: 1ª dados cadastrais; 2ª conta corrente e documentos. Dados FICTÍCIOS.
import os, re, sys
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read(); res={}
TOKEN="t"*48
PDF="/tmp/cpf_teste.pdf"; open(PDF,"wb").write(b"%PDF-1.4\n%ficticio\n")
TXT="/tmp/nota.txt"; open(TXT,"w").write("x")
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    pg=b.new_page(viewport={"width":900,"height":1200}); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort()); pg.add_init_script(MOCK)
    pg.goto(f"http://localhost:5173/?admissao={TOKEN}"); pg.wait_for_timeout(1300)
    t=pg.locator("body").inner_text()
    res["F1 abre na 1ª etapa, com abas e prazo"]="1ª etapa · Dados cadastrais" in t and "2ª etapa · Conta bancária e documentos" in t and "10/11/2026" in t and "Você tem conta corrente" not in t
    for k,v in [("Nome completo *","Carlos Teste da Silva"),("Naturalidade (cidade/UF) *","Vespasiano/MG"),("Telefone *","31999990000"),("E-mail particular *","carlos@exemplo.com"),
                ("Rua / avenida *","Rua A"),("Número *","10"),("Bairro *","Centro"),("CEP *","33200000"),("Cidade/UF *","Vespasiano/MG"),("RG (identidade) *","MG123"),("CPF *","52998224725"),
                ("Título de eleitor *","123456789012"),("Zona *","100"),("Seção *","200")]:
        pg.get_by_label(k).first.fill(v)
    pg.get_by_label("Sexo *").first.select_option("M")
    for k in ["Raça/cor *","Escolaridade *","Estado civil *"]: pg.get_by_label(k).first.select_option(index=1)
    pg.get_by_label("Data de nascimento *").first.fill("1995-05-05")
    pg.get_by_role("radio",name="GG",exact=True).check()
    pg.get_by_role("button",name="+ Adicionar dependente").click()
    pg.get_by_label("Nome do dependente 1").fill("Filho Teste"); pg.get_by_label("Vínculo").fill("Filho")
    pg.get_by_label("Dependente no Imposto de Renda? *").select_option("sim")
    res["F2 IRRF 'Sim' pede o CPF do dependente"]=pg.get_by_label("CPF do dependente *").count()==1
    pg.locator("label:has-text('Declaro que as informações')").locator("input").check()
    pg.get_by_role("button",name=re.compile("Enviar 1ª etapa")).click(); pg.wait_for_timeout(500)
    t=pg.locator("body").inner_text()
    res["F3 sem PIS e sem CPF do dependente: não envia (mãe não é obrigatória)"]="PIS" in t and "Preencha" in t and "nome da mãe" not in t.lower().split("preencha")[-1][:200] and not pg.evaluate("window.__FICHA")
    pg.get_by_label("PIS/PASEP/NIT *").fill("12345678900"); pg.get_by_label("CPF do dependente *").fill("111.444.777-35")
    pg.get_by_role("button",name=re.compile("Enviar 1ª etapa")).click(); pg.wait_for_timeout(700)
    f=pg.evaluate("window.__FICHA")
    res["F4 1ª etapa enviada: IRRF sim + CPF, sem mãe, e botão para a 2ª etapa"]=bool(f) and f["dependentes"][0]["irrf"]=="sim" and f["dependentes"][0]["cpf"]=="111.444.777-35" and not f.get("mae") and pg.get_by_role("button",name="Ir para a 2ª etapa").count()==1
    pg.get_by_role("button",name="Ir para a 2ª etapa").click(); pg.wait_for_timeout(400)
    pg.get_by_label("Você tem conta corrente? *").select_option("nao")
    lk=pg.get_by_role("link",name=re.compile("veja como abrir"))
    res["F5 sem conta corrente: aviso e link do vídeo"]="Não aceitamos conta poupança nem conta salário de outra empresa" in pg.locator("body").inner_text() and lk.count()==1 and lk.get_attribute("href")=="https://youtu.be/exemplo"
    pg.get_by_label("Você tem conta corrente? *").select_option("sim")
    pg.get_by_label("Banco *").fill("Itaú"); pg.get_by_label("Agência *").fill("1234"); pg.get_by_label("Conta corrente (com dígito) *").fill("56789-0")
    pg.get_by_role("button",name=re.compile("Salvar conta")).click(); pg.wait_for_timeout(400)
    bk=pg.evaluate("window.__BANCO")
    res["F6 conta corrente salva à parte"]=bk and bk["tem_corrente"]=="sim" and bk["conta"]=="56789-0" and "Conta salva" in pg.locator("body").inner_text()
    pg.get_by_label("Enviar: CPF",exact=True).set_input_files(PDF); pg.wait_for_timeout(700)
    up=pg.evaluate("window.__UPLOADS||[]")
    res["F7 documento enviado na 2ª etapa"]=len(up)==1 and up[0].startswith(TOKEN+"/cpf/") and "cpf_teste.pdf" in pg.locator("body").inner_text()
    pg.get_by_label("Enviar: Título de eleitor").set_input_files(TXT); pg.wait_for_timeout(400)
    res["F8 arquivo de texto recusado"]="Envie em PDF ou foto" in pg.locator("body").inner_text()
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
