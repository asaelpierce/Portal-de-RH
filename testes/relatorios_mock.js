// Banco simulado mínimo para os testes de tela dos relatórios (seguro de vida e odonto). Dados FICTÍCIOS.
(()=>{const RH={id:1,name:"Ana RH",email:"ana@teste.local",role:"rh",setor:"rh",status:"ativo",cadastro:"1"};
 const COLAB={id:2,name:"Bia Colab",email:"bia@teste.local",role:"colaborador",setor:"producao",status:"ativo",cadastro:"2"};
 const CC={"11144477735":"VULCANIZACAO - MÃO DE OBRA","02233344405":"ADMINISTRATIVE BOARD"};
 window.__EMAILS=[];window.__REL={};const ok=d=>Promise.resolve({data:d,error:null}),er=m=>Promise.resolve({data:null,error:{message:m}});
 const USERS=[{id:1,name:"Ana RH",role:"rh",setor:"rh",status:"ativo",centro_custo:"RECURSOS HUMANOS"},{id:2,name:"Bia Colab",role:"colaborador",setor:"producao",status:"ativo",centro_custo:"VULCANIZACAO - MÃO DE OBRA"},
   {id:3,name:"Maria Titular",role:"colaborador",setor:"producao",status:"ativo",centro_custo:"REVESTIMENTO - MÃO DE OBRA"},{id:4,name:"Pedro Saiu",role:"colaborador",setor:"producao",status:"desligado",centro_custo:null}];
 window.__VINC={"0000001":{uid:3},"0000002":{uid:4,cc:"CORTE CERAMICA MAO DE OBRA"}};window.__ODO={};
 const q=(tab)=>{const dados=tab==="usuarios"?USERS:tab==="ferias"?(window.__FERIAS||[]):[];const o={select:()=>o,eq:()=>o,neq:()=>o,in:()=>o,order:()=>o,limit:()=>o,gte:()=>o,lte:()=>o,is:()=>o,not:()=>o,or:()=>o,
   single:()=>ok(null),maybeSingle:()=>ok(null),insert:()=>o,update:()=>o,delete:()=>o,upsert:()=>o,then:(r,j)=>Promise.resolve({data:dados,error:null}).then(r,j)};return o;};
 const eu=()=>{const s=JSON.parse(sessionStorage.getItem("ses")||"null");return s?[RH,COLAB].find(u=>u.id===s):null;};
 const client={from:(t)=>q(t),channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel(){},
  auth:{signInWithPassword:async({email})=>{const u=[RH,COLAB].find(x=>x.email===email);if(!u)return{data:{},error:{message:"Invalid login credentials"}};sessionStorage.setItem("ses",u.id);return{data:{session:{access_token:"t"}},error:null};},
        getSession:async()=>({data:{session:sessionStorage.getItem("ses")?{access_token:"t"}:null}}),signOut:async()=>{sessionStorage.removeItem("ses");return{}},onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),updateUser:async()=>({data:{},error:null})},
  rpc:(fn,a)=>{const u=eu();
   if(fn==="meu_usuario")return ok(u?[u]:[]);
   if(fn.startsWith("seguro_vida_")&&(!u||u.role!=="rh"))return er("Só o RH acessa os relatórios do seguro de vida.");
   if(fn==="seguro_vida_historico")return ok(Object.values(window.__REL).map(r=>({competencia:r.competencia,total:r.total,pessoas:r.pessoas,gerado_por:"Ana RH",gerado_em:new Date().toISOString()})));
   if(fn==="seguro_vida_obter")return ok(window.__REL[a.p_competencia]);
   if(fn==="seguro_vida_conferir"){const UID={"11144477735":101,"02233344405":102,"44455566677":103};window.__CCU=window.__CCU||{};
     const linhas=a.p_linhas.map(l=>({...l,centro_custo:window.__CCU[UID[l.cpf]]||CC[l.cpf]||null,usuario_id:CC[l.cpf]||l.cpf==="44455566677"?UID[l.cpf]:null,status:l.cpf==="44455566677"?"desligado":"ativo"}));
     const cob=linhas.filter(l=>l.premio>0),g={};cob.forEach(l=>{const k=l.centro_custo||"SEM CENTRO DE CUSTO (verificar)";g[k]=g[k]||{centro_custo:k,pessoas:0,valor:0};g[k].pessoas++;g[k].valor=Math.round((g[k].valor+l.premio)*100)/100;});
     const r={competencia:a.p_competencia,arquivo_nome:a.p_arquivo,total:Math.round(cob.reduce((s,l)=>s+l.premio,0)*100)/100,pessoas:cob.length,linhas,rateio:Object.values(g).sort((x,y)=>x.centro_custo.localeCompare(y.centro_custo)),
       conferencia:{premio_padrao:4.47,nao_encontrados:[],sem_centro_custo:["PEDRO DESLIGADO TESTE"],desligados_cobrados:[{nome:"PEDRO DESLIGADO TESTE",desligamento:"2026-10-15"}],exclusoes:["ANA EXCLUÍDA TESTE"],inclusoes:[],
         premio_diferente:[{nome:"JOSÉ CONCEIÇÃO FICTÍCIO",premio:12.87,capital:119876}],ativos_fora_do_seguro:[{nome:"Aprendiz Teste",cargo:"Aprendiz",admissao:"2025-10-06",aprendiz:true}],achados_pelo_nome:[]}};
     window.__REL[r.competencia]=r;return ok(r);}
   if(fn.startsWith("odonto_")&&(!u||u.role!=="rh"))return er("Só o RH acessa os relatórios do plano odontológico.");
   if(fn==="odonto_historico")return ok(Object.values(window.__ODO).map(r=>({competencia:r.competencia,vigencia:r.vigencia,total:r.total,titulares:r.titulares,beneficiarios:r.beneficiarios,gerado_por:"Ana RH",gerado_em:new Date().toISOString()})));
   if(fn==="odonto_obter")return ok(window.__ODO[a.p_competencia]);
   if(fn==="odonto_vincular"){window.__VINC[a.p_certificado]={uid:a.p_usuario_id,cc:a.p_centro_custo_fixo||null};return ok({certificado:a.p_certificado});}
   if(fn==="odonto_conferir"){const ben=a.p_beneficiarios;const tit=c=>ben.find(b=>b.certificado===c&&b.seq==="00")?.nome;
     const linhas=ben.map(b=>{const v=window.__VINC[b.certificado];const us=v&&USERS.find(x=>x.id===Number(v.uid));return{...b,titular:tit(b.certificado),responsavel_id:us?.id||null,responsavel:us?.name||null,responsavel_status:us?.status||null,centro_custo:(v&&v.cc)||us?.centro_custo||null};});
     const g={};linhas.forEach(l=>{const k=l.centro_custo||"SEM CENTRO DE CUSTO (verificar)";g[k]=g[k]||{centro_custo:k,titulares:new Set(),beneficiarios:0,valor:0};g[k].titulares.add(l.certificado);g[k].beneficiarios++;g[k].valor=Math.round((g[k].valor+l.valor)*100)/100;});
     const r={competencia:a.p_competencia,vigencia:a.p_vigencia,arquivo_nome:a.p_arquivo,total:Math.round(linhas.reduce((s,l)=>s+l.valor,0)*100)/100,titulares:new Set(linhas.map(l=>l.certificado)).size,beneficiarios:linhas.length,linhas,
       rateio:Object.values(g).map(x=>({...x,titulares:x.titulares.size})).sort((x,y)=>x.centro_custo.localeCompare(y.centro_custo)),
       conferencia:{mensalidade_padrao:21.75,titulares_sem_vinculo:linhas.filter(l=>l.seq==="00"&&!l.responsavel_id&&!l.centro_custo).map(l=>({certificado:l.certificado,titular:l.nome})),sem_centro_custo:[],desligados_cobrados:[],
         vinculados_a_outro:[],inclusoes:["ANA NOVA TESTE"],cancelamentos:["PEDRO SAIU TESTE"],valor_diferente:[]}};
     window.__ODO[r.competencia]=r;return ok(r);}
   if(fn.startsWith("araujo_")&&(!u||u.role!=="rh"))return er("Só o RH acessa os relatórios do convênio Araujo.");
   window.__ARA=window.__ARA||{};
   if(fn==="araujo_historico")return ok(Object.values(window.__ARA).map(r=>({competencia:r.competencia,periodo:r.periodo,total:r.total,pessoas:r.pessoas,gerado_por:"Ana RH",gerado_em:new Date().toISOString()})));
   if(fn==="araujo_obter")return ok(window.__ARA[a.p_competencia]);
   if(fn==="araujo_conferir"){const MAP={"100":{c:"Maria Teste da Silva",cc:"VULCANIZACAO - MÃO DE OBRA",cad:"100"},"00007":{c:"Joao Nome Curto Completo",cc:"FINANCEIRO",cad:"70",vinc:true}};
     const linhas=a.p_linhas.map(l=>{const x=MAP[l.matricula];return{...l,usuario_id:x?1:null,colaborador:x?.c||null,centro_custo:x?.cc||null,cadastro:x?.cad||null,achado_por:x?(x.vinc?"vinculo":"matricula"):null};});
     const g={};linhas.filter(l=>l.convenio>0).forEach(l=>{const k=l.centro_custo||"SEM CENTRO DE CUSTO (verificar)";g[k]=g[k]||{centro_custo:k,pessoas:0,valor:0};g[k].pessoas++;g[k].valor=Math.round((g[k].valor+l.convenio)*100)/100;});
     const r={competencia:a.p_competencia,periodo:a.p_periodo,arquivo_nome:a.p_arquivo,total:Math.round(linhas.reduce((s,l)=>s+l.convenio,0)*100)/100,pessoas:linhas.filter(l=>l.convenio>0).length,linhas,
       rateio:Object.values(g).sort((x,y)=>x.centro_custo.localeCompare(y.centro_custo)),
       conferencia:{nao_encontrados:linhas.filter(l=>!l.usuario_id).map(l=>({matricula:l.matricula,nome:l.nome})),matricula_diferente:linhas.filter(l=>l.achado_por==="vinculo").map(l=>({nome:l.colaborador,araujo:l.matricula,folha:l.cadastro})),
         sem_centro_custo:[],desligados_com_compra:[],compras_acima_do_convenio:linhas.filter(l=>l.compras>l.convenio).map(l=>({nome:l.colaborador||l.nome,compras:l.compras,convenio:l.convenio}))}};
     window.__ARA[r.competencia]=r;return ok(r);}
   if(fn.startsWith("sesi_")&&(!u||u.role!=="rh"))return er("Só o RH acessa os relatórios do Clube SESI.");
   window.__SESI=window.__SESI||{};
   if(fn==="sesi_historico")return ok(Object.values(window.__SESI).map(r=>({competencia:r.competencia,data_corte:r.data_corte,total:r.total,pessoas:r.pessoas,gerado_por:"Ana RH",gerado_em:new Date().toISOString()})));
   if(fn==="sesi_obter")return ok(window.__SESI[a.p_competencia]);
   if(fn==="sesi_conferir"){const MAP={"11144477735":{c:"Maria Teste",cc:"VULCANIZACAO - MÃO DE OBRA"},"02233344405":{c:"Jose Teste de Tal",cc:"RECURSOS HUMANOS",st:"desligado"}};
     const linhas=a.p_linhas.map(l=>{const x=MAP[l.cpf];return{...l,usuario_id:x?1:null,colaborador:x?.c||null,centro_custo:x?.cc||null,status:x?.st||"ativo",achado_por:x?"cpf":null};});
     const g={};linhas.forEach(l=>{const k=l.centro_custo||"SEM CENTRO DE CUSTO (verificar)";g[k]=g[k]||{centro_custo:k,pessoas:0,valor:0};g[k].pessoas++;g[k].valor=Math.round((g[k].valor+l.valor)*100)/100;});
     const r={competencia:a.p_competencia,data_corte:a.p_cabecalho.data_corte,contrato:a.p_cabecalho.contrato,vigencia:a.p_cabecalho.vigencia,arquivo_nome:a.p_arquivo,
       total:Math.round(linhas.reduce((s,l)=>s+l.valor,0)*100)/100,pessoas:linhas.length,linhas,rateio:Object.values(g).sort((x,y)=>x.centro_custo.localeCompare(y.centro_custo)),
       conferencia:{nao_encontrados:linhas.filter(l=>!l.usuario_id).map(l=>l.nome),achados_pelo_nome:[],sem_centro_custo:[],desligados_conveniados:linhas.filter(l=>l.status==="desligado").map(l=>({nome:l.colaborador,desligamento:"2026-10-01",valor:l.valor}))}};
     window.__SESI[r.competencia]=r;return ok(r);}
   if(fn.startsWith("unimed_")&&(!u||u.role!=="rh"))return er("Só o RH acessa os relatórios da Unimed.");
   window.__UNI=window.__UNI||{};window.__UFAM=window.__UFAM||{"11111111111111":3,"44444444444444":4};
   if(fn==="unimed_vincular"){const o={};a.p_familias.forEach(f=>{const id=window.__UFAM[f.familia];const us=USERS.find(x=>x.id===id);
     if(us)o[f.familia]={usuario_id:us.id,colaborador:us.name,centro_custo:us.centro_custo||"CORTE CERAMICA MAO DE OBRA",status:us.status,data_desligamento:us.status==="desligado"?"2026-10-15":null};});return ok(o);}
   if(fn==="unimed_vincular_manual"){window.__UFAM[a.p_familia]=a.p_usuario_id;return ok({familia:a.p_familia});}
   if(fn==="unimed_salvar"){const r={...a.p_relatorio,competencia:a.p_competencia,arquivo_nome:a.p_arquivo,gerado_em:new Date().toISOString()};window.__UNI[a.p_competencia]=r;return ok(r);}
   if(fn==="unimed_historico")return ok(Object.values(window.__UNI).map(r=>({competencia:r.competencia,total:r.total,colaboradores:(r.descontos||[]).length,gerado_por:"Ana RH",gerado_em:r.gerado_em})));
   if(fn==="unimed_obter")return ok(window.__UNI[a.p_competencia]);
   if(fn==="ferias_confirmar_ciencia"){const f=(window.__FERIAS||[]).find(x=>x.id===a.p_ferias_id);if(!f||f.user_id!==u.id)return er("Só o próprio colaborador confirma a ciência das férias dele.");
     f.ciente_colaborador_em=new Date().toISOString();return ok({...f});}
   if(fn==="ferias_ciencia_ver"||fn==="ferias_ciencia_confirmar_link"){if(a.p_token!=="a1".repeat(18))return fn==="ferias_ciencia_ver"?ok(null):er("Link inválido.");
     window.__CIENTE=window.__CIENTE||(fn==="ferias_ciencia_confirmar_link"?new Date().toISOString():null);
     return ok({nome:"Bia",inicio:"2026-12-01",fim:"2026-12-30",dias:30,periodo_aquisitivo:"01/03/2025 a 28/02/2026",abono:false,adiantamento_13:true,status:"em_aprovacao",ciente_em:window.__CIENTE});}
   window.__MOVS=window.__MOVS||[];
   if(fn==="mov_listar")return ok(window.__MOVS);
   if(fn==="mov_abrir"){const d=a.p_dados,c=USERS.find(x=>x.id===d.user_id);window.__ULTIMO_MOV=a;
     const r={id:window.__MOVS.length+1,tipo:a.p_tipo,status:"pendente_gestor",solicitante_id:u.id,solicitante_name:u.name,user_id:d.user_id,nome:c&&c.name,cargo:c&&c.cargo,setor:c&&c.setor,
       lider_id:u.id,gestor_id:d.gestor_id,motivo:d.motivo,data_prevista:d.data_vigencia,
       ...(a.p_tipo==="admissao"?{cargo:d.cargo,salario:d.salario,setor:d.setor,requisitos:d.requisitos,motivo_requisicao:d.motivo_requisicao,substituido_id:d.substituido_id,quantidade:d.quantidade,tipo_contratacao:d.tipo_contratacao,turno:d.turno,centro_custo:d.centro_custo}:{}),mov_tipos:d.tipos,atual:{cargo:c&&c.cargo,setor:c&&c.setor,centro_custo:c&&c.centro_custo},proposta:d.proposta,created_at:new Date().toISOString()};
     window.__MOVS=[r,...window.__MOVS];return ok(r);}
   if(fn==="mov_detalhar"){const r=window.__MOVS.find(x=>x.id===a.p_id);Object.assign(r,{status:"pendente_rh",gestor_em:new Date().toISOString(),gestor_obs:a.p_dados.obs||null,data_prevista:a.p_dados.data_vigencia||r.data_prevista});return ok({...r});}
   if(fn==="mov_decidir"){const r=window.__MOVS.find(x=>x.id===a.p_id);const hoje=new Date().toISOString().slice(0,10);
     Object.assign(r,{status:a.p_decisao,rh_decisao:a.p_decisao,rh_em:new Date().toISOString(),aplicado_em:a.p_decisao==="aprovado"&&r.data_prevista<=hoje?new Date().toISOString():null});return ok({movimentacao:{...r},vaga:null});}
   if(fn==="seguro_vida_movimentacao"){window.__ATIVOS_ENVIADOS=a.p_ativos;const ap=a.p_ativos.filter(x=>/aprendiz/i.test(x.cargo));
     return ok({base_competencia:"2026-09",segurados_base:79,ativos:a.p_ativos.length,inclusoes:a.p_ativos.filter(x=>!/aprendiz/i.test(x.cargo)).map(x=>({...x,nascimento:null})),
       aprendizes:ap,sem_nascimento:a.p_ativos.filter(x=>!/aprendiz/i.test(x.cargo)).map(x=>x.nome),
       exclusoes:[{nome:"PEDRO SAIU",cpf:"33322211100",nascimento:"1995-05-05",centro_custo:"CORTE",status_portal:"desligado",desligamento:"2026-10-15"}]});}
   if(fn==="centro_custo_ajustar"){window.__CCU=window.__CCU||{};window.__AJUSTES=(window.__AJUSTES||[]).concat([a]);window.__CCU[a.p_usuario_id]=a.p_centro_custo;return ok({mudou:true,para:a.p_centro_custo});}
   if(fn==="form_publico_contexto")return ok({solicitantes:[{id:1,nome:"Ana RH",equipe:[2,3]},{id:3,nome:"Maria Titular",equipe:[3]}],colaboradores:USERS.filter(x=>x.status==="ativo").map(x=>({id:x.id,nome:x.name,cargo:"Auxiliar",setor:x.setor,admissao:"2024-03-01",centro_custo:x.centro_custo})),
     lideres:USERS.filter(x=>x.role!=="colaborador").map(x=>({id:x.id,nome:x.name})),gestores:USERS.filter(x=>x.role==="rh").map(x=>({id:x.id,nome:x.name})),
     centros_custo:["RECURSOS HUMANOS","VULCANIZACAO - MÃO DE OBRA"],areas:["vulcanizacao"]});
   if(fn==="form_publico_enviar"){const MAT={1:"100",2:"200",3:"300"};window.__FORM_ENVIADO=a;
     const EQ={1:[2,3],3:[3]};if(!EQ[a.p_dados.solicitante_id])return er("Escolha o seu nome na lista de quem pode pedir. Se não estiver, fale com o RH.");
     if(a.p_dados.user_id&&!EQ[a.p_dados.solicitante_id].includes(a.p_dados.user_id))return er("Este colaborador não é da sua equipe. Fale com o RH.");
     return ok({ok:true,tipo:a.p_tipo,id:77,colaborador:(USERS.find(x=>x.id===a.p_dados.user_id)||{}).name||null});}
   if(fn==="teams_config_status")return ok(window.__TEAMS?{configurado:true,mascarado:window.__TEAMS.slice(0,38)+"…"+window.__TEAMS.slice(-6),atualizado_por:"Ana RH",atualizado_em:new Date().toISOString()}:{configurado:false});
   if(fn==="teams_config_salvar"){if(a.p_url&&!/logic\.azure\.com/.test(a.p_url))return er("Cole a URL do gatilho \"Quando uma solicitação HTTP é recebida\" do Power Automate (começa com https://).");window.__TEAMS=a.p_url||null;
     return ok(window.__TEAMS?{configurado:true,mascarado:window.__TEAMS.slice(0,38)+"…"+window.__TEAMS.slice(-6),atualizado_por:"Ana RH",atualizado_em:new Date().toISOString()}:{configurado:false});}
   if(fn==="teams_testar"){window.__TEAMS_TESTE=(window.__TEAMS_TESTE||0)+1;return ok({enviado:!!window.__TEAMS});}
   if(fn==="admissao_ficha")return ok([{nome:"Carlos Teste",email:"",telefone:"",cargo:"Auxiliar de Produção",status:"aguardando",token_expira_em:new Date(Date.now()+5*864e5).toISOString(),dados_candidato:{},documentos:window.__DOCS||[],prazo_documentos:"2026-11-10"}]);
   if(fn==="admissao_documento_registrar"){window.__DOCS=(window.__DOCS||[]).concat([{tipo:a.p_tipo,caminho:a.p_caminho,nome:a.p_nome,tamanho:a.p_tamanho}]);return ok(window.__DOCS);}
   if(fn==="admissao_documento_remover"){window.__DOCS=(window.__DOCS||[]).filter(x=>x.caminho!==a.p_caminho);return ok(window.__DOCS);}
   if(fn==="admissao_enviar"){window.__FICHA=a.p_dados;return ok(new Date().toISOString());}
   return ok(null);},
  functions:{invoke:async(nome,opt)=>{window.__INVOKES=(window.__INVOKES||[]).concat([{nome,body:opt&&opt.body}]);
    if(nome==="ferias-ciencia")return{data:{ok:true,link:location.origin+"/?ciencia="+"a1".repeat(18),enviado:!!(opt&&opt.body&&opt.body.enviar),para:"bi***@teste.local"},error:null};
    return{data:null,error:null};}},storage:{from:()=>({upload:async(c,f)=>{window.__UPLOADS=(window.__UPLOADS||[]).concat([c]);return{data:{},error:null};},createSignedUrl:async()=>({data:{signedUrl:"about:blank"},error:null})})}};
 window.supabase={createClient:()=>client};
 const f=window.fetch;window.fetch=async(u,o)=>{if(String(u).includes("/functions/v1/secure-proxy")){const b=JSON.parse(o.body);if(b.action==="email"){window.__EMAILS.push(b);return new Response(JSON.stringify({ok:true}));}return new Response(JSON.stringify({ok:true,text:""}));}return f(u,o);};
})();
