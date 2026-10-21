// Banco simulado mínimo para os testes de tela dos relatórios (seguro de vida e odonto). Dados FICTÍCIOS.
(()=>{const RH={id:1,name:"Ana RH",email:"ana@teste.local",role:"rh",setor:"rh",status:"ativo",cadastro:"1"};
 const COLAB={id:2,name:"Bia Colab",email:"bia@teste.local",role:"colaborador",setor:"producao",status:"ativo",cadastro:"2"};
 const CC={"11144477735":"VULCANIZACAO - MÃO DE OBRA","02233344405":"ADMINISTRATIVE BOARD"};
 window.__EMAILS=[];window.__REL={};const ok=d=>Promise.resolve({data:d,error:null}),er=m=>Promise.resolve({data:null,error:{message:m}});
 const USERS=[{id:1,name:"Ana RH",role:"rh",setor:"rh",status:"ativo",centro_custo:"RECURSOS HUMANOS"},{id:2,name:"Bia Colab",role:"colaborador",setor:"producao",status:"ativo",centro_custo:"VULCANIZACAO - MÃO DE OBRA"},
   {id:3,name:"Maria Titular",role:"colaborador",setor:"producao",status:"ativo",centro_custo:"REVESTIMENTO - MÃO DE OBRA"},{id:4,name:"Pedro Saiu",role:"colaborador",setor:"producao",status:"desligado",centro_custo:null}];
 window.__VINC={"0000001":{uid:3},"0000002":{uid:4,cc:"CORTE CERAMICA MAO DE OBRA"}};window.__ODO={};
 const q=(tab)=>{const dados=tab==="usuarios"?USERS:[];const o={select:()=>o,eq:()=>o,neq:()=>o,in:()=>o,order:()=>o,limit:()=>o,gte:()=>o,lte:()=>o,is:()=>o,not:()=>o,or:()=>o,
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
   if(fn==="seguro_vida_conferir"){const linhas=a.p_linhas.map(l=>({...l,centro_custo:CC[l.cpf]||null,usuario_id:CC[l.cpf]||l.cpf==="44455566677"?9:null,status:l.cpf==="44455566677"?"desligado":"ativo"}));
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
   return ok(null);},
  functions:{invoke:async()=>({data:null,error:null})},storage:{from:()=>({upload:async()=>({data:{},error:null})})}};
 window.supabase={createClient:()=>client};
 const f=window.fetch;window.fetch=async(u,o)=>{if(String(u).includes("/functions/v1/secure-proxy")){const b=JSON.parse(o.body);if(b.action==="email"){window.__EMAILS.push(b);return new Response(JSON.stringify({ok:true}));}return new Response(JSON.stringify({ok:true,text:""}));}return f(u,o);};
})();
