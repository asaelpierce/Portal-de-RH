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
    t=pg.locator("body").inner_text()
    res["P3 'Outro: 12 dias': período de gozo, total de dias, função e setor"]="Período de gozo: 01/12/2026 a 12/12/2026" in t and "Total: 12 dias" in t and "Função: Auxiliar" in t
    pg.get_by_role("button",name=re.compile("Enviar ao RH")).click(); pg.wait_for_timeout(600)
    env=pg.evaluate("window.__FORM_ENVIADO")
    res["P4 enviado ao RH com opção 12, sem matrícula"]="Pedido enviado ao RH" in pg.locator("body").inner_text() and env["p_tipo"]=="ferias" and env["p_dados"]["opcao"]=="12" and env["p_dados"]["descanso"]==12 and "solicitante_matricula" not in env["p_dados"]
    pg.context.close()
    pg=abrir(BASE+"/?form=ferias")
    rot=[l.strip() for l in pg.locator("label:has(input[name=op])").all_inner_texts()]
    t=pg.locator("body").inner_text().lower()
    res["P4b opções em ordem (10, 15, 30, outro), sem abono e sem 13º"]=rot[:3]==["10 dias em descanso","15 dias em descanso","30 dias em descanso"] and rot[3].startswith("Outro") and len(rot)==4 and "abono" not in t and "13º" not in t
    pg.context.close()
    pg=abrir(BASE+"/?form=movimentacao")
    pg.get_by_label("Seu nome *").select_option("1"); pg.get_by_label("Colaborador *").select_option("2")
    t=pg.locator("body").inner_text()
    res["P5 movimentação mostra função, setor, admissão e local atual (do cadastro)"]="Função: Auxiliar" in t and "Admissão: 01/03/2024" in t and "Local atual: VULCANIZACAO - MÃO DE OBRA" in t
    pg.get_by_label("Salário atual").fill("R$ 2.000,00"); pg.get_by_label("Novo cargo").fill("Oficial de Produção IA"); pg.get_by_label("Novo salário").fill("R$ 2.400,00")
    pg.get_by_label("Data a ser considerada para reajuste *").fill("2026-12-01"); pg.get_by_label("Justificativa *").fill("Promoção por desempenho")
    pg.get_by_role("radio",name="Sim").check()
    pg.get_by_role("button",name=re.compile("Enviar ao RH")).click(); pg.wait_for_timeout(600)
    d=pg.evaluate("window.__FORM_ENVIADO")["p_dados"]
    res["P5b movimentação: tipos deduzidos, proposta, salário atual, diretoria ciente"]=sorted(d["tipos"])==["funcao","salario"] and d["proposta"]=={"cargo":"Oficial de Produção IA","salario":"R$ 2.400,00"} and d["salario_atual"]=="R$ 2.000,00" and d["diretoria_ciente"]=="sim" and "gestor_id" not in d and "Pedido enviado ao RH" in pg.locator("body").inner_text()
    pg.context.close()
    pg=abrir(BASE+"/?form=admissao")
    pg.get_by_label("Seu nome *").select_option("1")
    pg.get_by_label("Setor requisitante *").select_option("producao"); pg.get_by_label("Superior imediato *").select_option("1")
    pg.get_by_label("Cargo *").fill("Auxiliar de Produção"); pg.get_by_label("Horário de trabalho *").fill("7h às 17h"); pg.get_by_label("Salário *").fill("R$ 1.900,00")
    pg.get_by_label("Idade e sexo preferenciais").fill("indiferente"); pg.get_by_label("Prazo de contratação").fill("2026-11-30")
    pg.get_by_role("radio",name="Temporário").check(); pg.get_by_role("radio",name=re.compile("^Sigilosa")).check()
    pg.get_by_role("radio",name="Demissão").check(); pg.wait_for_timeout(200)
    enviar=pg.get_by_role("button",name=re.compile("Enviar ao RH"))
    pg.get_by_label("Quais os requisitos técnicos? *").fill("Ensino médio"); pg.get_by_label("Quais os requisitos comportamentais?").fill("Proatividade")
    pg.get_by_label("Observações adicionais").fill("Urgente"); pg.get_by_role("radio",name="Sim").check()
    res["P7 demissão pede 'quem saiu' (sem isso não envia)"]=pg.get_by_label("Quem saiu? *").count()==1 and enviar.is_disabled()
    pg.get_by_label("Quem saiu? *").select_option("3")
    enviar.click(); pg.wait_for_timeout(600)
    d=pg.evaluate("window.__FORM_ENVIADO")["p_dados"]
    res["P7b requisição com as perguntas do Forms"]=d["setor"]=="producao" and d["superior_id"]==1 and d["tipo_contratacao"]=="temporario" and d["tipo_vaga"]=="sigilosa" and d["motivo_requisicao"]=="demissao" and d["substituido_id"]==3 and d["prazo_encerramento"]=="2026-11-30" and d["requisitos_comportamentais"]=="Proatividade" and d["diretoria_ciente"]=="sim" and d["perfil_idade_sexo"]=="indiferente"
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
