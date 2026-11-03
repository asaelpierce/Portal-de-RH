# Teste: a vaga criada por uma requisição mostra a requisição de origem (Vagas e candidatos). Dados FICTÍCIOS.
import os, re, sys
from playwright.sync_api import sync_playwright
AQUI=os.path.dirname(os.path.abspath(__file__)); MOCK=open(os.path.join(AQUI,"..","relatorios_mock.js")).read(); res={}
PRE='''window.__VAGAS=[{id:31,title:"Auxiliar de Produção",area:"Produção",local:"Kalenborn — presencial",tipo:"Temporário",descricao:"",ativa:true,sigilosa:true,prazo_encerramento:"2099-12-31",movimentacao_id:7,created_at:"2026-11-01T10:00:00Z"}];
window.__MOVS=[{id:7,tipo:"admissao",status:"aprovado",solicitante_id:2,solicitante_name:"Tiago Líder",setor:"producao",cargo:"Auxiliar de Produção",salario:"R$ 1.900,00",
 turno:"7h às 17h",quantidade:2,tipo_contratacao:"temporario",tipo_vaga:"sigilosa",superior_id:1,prazo_encerramento:"2026-11-30",motivo_requisicao:"demissao",substituido_id:3,
 requisitos:"Ensino médio; 6 meses em produção",requisitos_comportamentais:"Atenção e proatividade",perfil_idade_sexo:"indiferente",observacoes:"Urgente",diretoria_ciente:true,
 motivo:"Reposição — Urgente",rh_obs:"Aprovado pela Mariele",rh_em:"2026-11-02T12:00:00Z",origem:"formulario",created_at:"2026-11-01T09:00:00Z",vaga_criada_id:31}];'''
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    pg=b.new_page(viewport={"width":1300,"height":1000}); pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    pg.route("https://cdn.jsdelivr.net/**",lambda r:r.abort()); pg.add_init_script(PRE+MOCK)
    pg.goto("http://localhost:5173/"); pg.wait_for_timeout(800)
    pg.fill("input[type=email]","ana@teste.local"); pg.fill("input[type=password]","x"); pg.get_by_role("button",name=re.compile("Entrar")).click(); pg.wait_for_timeout(1300)
    pg.locator("nav").get_by_text("Vagas e candidatos",exact=True).click(); pg.wait_for_timeout(600)
    vg=pg.get_by_role("button",name=re.compile("^Vagas"))
    if vg.count(): vg.first.click(); pg.wait_for_timeout(600)
    t=pg.locator("main").inner_text()
    res["V0 vaga sigilosa aparece em 'Abertas' com o selo"]="🔒 Sigilosa — fora do site de vagas" in t and "Auxiliar de Produção" in t
    res["V1 resumo da requisição no cartão da vaga"]="Requisição #7" in t and "Tiago Líder" in t and "superior imediato: Ana RH" in t and "2 vagas" in t and "7h às 17h" in t and "Sigilosa" in t
    pg.get_by_role("button",name="Ver requisição completa").click(); pg.wait_for_timeout(300)
    t=pg.locator("main").inner_text()
    res["V2 requisição completa: requisitos, motivo com quem saiu, observações, diretoria, aprovação"]=all(x in t for x in ["Ensino médio; 6 meses em produção","Atenção e proatividade","Reposição — Maria Titular","Urgente","Aprovado pela Mariele","R$ 1.900,00"]) and "Diretoria ciente" in t
    res["sem exceções"]=not errs
    if errs: print(errs[:3])
    b.close()
falhas=0
for k,v in res.items(): print(("OK  " if v else "FALHOU ")+k); falhas+=not v
sys.exit(1 if falhas else 0)
