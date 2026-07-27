import { useState, useEffect, useRef, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, ReferenceLine } from "recharts";

const SB_URL=import.meta.env.VITE_SUPABASE_URL||"https://zybkcpvdptabxkxpieuv.supabase.co";
const SB_KEY=import.meta.env.VITE_SUPABASE_ANON_KEY||"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5YmtjcHZkcHRhYnhreHBpZXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjU2MjUsImV4cCI6MjA5NjYwMTYyNX0.2BPIEHBuURfelci8YSVt7_PViJWMC1n853J2a3KC3HU";
// As chaves de OpenAI/Anthropic e o webhook do Power Automate NÃO ficam mais aqui.
// Elas moraram na Edge Function "secure-proxy" (rodando no servidor do Supabase),
// como secrets — o navegador nunca mais tem acesso a elas.

let _sb=null,_sbp=null;
const getSB=()=>_sb;

function initSB(){
  if(_sbp)return _sbp;
  _sbp=new Promise(res=>{
    const t=()=>{if(window.supabase?.createClient){_sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:false}});res(_sb);return true;}return false;};
    if(t())return;
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
    s.onload=()=>setTimeout(()=>{t()||res(null);},150);
    s.onerror=()=>res(null);
    document.head.appendChild(s);
  });
  return _sbp;
}

// Chamada única para a Edge Function que centraliza tudo que precisa de chave secreta
async function callProxy(action, payload){
  try{
    const r=await fetch(`${SB_URL}/functions/v1/secure-proxy`,{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+SB_KEY},
      body:JSON.stringify({action,...payload}),
    });
    return await r.json();
  }catch(e){
    console.error(e);
    return{ok:false,error:"Falha de rede: "+e.message};
  }
}

async function gpt(msgs,sys="Analista de RH Kalenborn. Responda em português."){
  const d=await callProxy("gpt",{msgs,sys});
  return d.ok?d.text:"";
}

async function ai(msgs,sys="Assistente RH Kalenborn. Responda em português."){
  const d=await callProxy("claude",{msgs,sys});
  return d.ok?d.text:"";
}

async function extractPDF(file){
  const fileBase64=await new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result.split(",")[1]);
    r.onerror=()=>rej(new Error("Falha ao ler arquivo"));
    r.readAsDataURL(file);
  }).catch(()=>null);
  if(!fileBase64)return"";
  const d=await callProxy("pdf",{fileBase64,fileName:file.name});
  return d.ok?d.text:"";
}

async function sendPAEmail(to, subject, body){
  if(!to)return{ok:false,error:"Destinatário vazio."};
  return callProxy("email",{to,subject,body});
}

// PALETTE — Light Mode Corporativo
const C={
  bg:"#f8fafc",bgAlt:"#ffffff",bgCard:"#ffffff",
  s1:"#f1f5f9",s2:"#f8fafc",s3:"#e2e8f0",s4:"#cbd5e1",
  bdr:"#cbd5e1",bdrHi:"#94a3b8",
  acc:"#4338ca",accLt:"#4f46e5",accDk:"#3730a3",accBg:"#e0e7ff",
  grn:"#15803d",grnBg:"#dcfce7",
  red:"#b91c1c",redBg:"#fee2e2",
  amb:"#b45309",ambBg:"#fef3c7",
  blu:"#0c4a6e",bluBg:"#e0f2fe",
  pur:"#6d28d9",purBg:"#ede9fe",
  ros:"#a3134a",rosBg:"#fce7f3",
  txt:"#0f172a",txm:"#1e293b",txd:"#334155",txf:"#475569",
};

const SC={producao:C.blu,engenharia:C.pur,comercial:C.amb,supply:C.ros,financeiro:C.grn,fiscal:C.grn,rh:C.grn,almoxarifado:C.amb,pcp:C.acc,qualidade:"#0e7490",manutencao:"#b91c1c",diretoria:C.acc,gestao:C.accDk,vulcanizacao:C.ros,producao_b:C.blu,producao_c:C.pur,ti:C.pur,corte:C.amb};
const SL={producao:"Produção",engenharia:"Engenharia",comercial:"Comercial",supply:"Supply",financeiro:"Financeiro",fiscal:"Fiscal",rh:"RH",almoxarifado:"Almoxarifado",pcp:"PCP",qualidade:"Qualidade",manutencao:"Manutenção",diretoria:"Diretoria",gestao:"Gestão",vulcanizacao:"Vulcanização",producao_b:"Produção",producao_c:"Produção",ti:"Engenharia",corte:"Corte"};

// Áreas dentro do setor de Produção (especialidade técnica, independente do nível hierárquico)
const AL={geral:"Produção Geral",lideranca:"Liderança de Produção",vulcanizacao:"Vulcanização",corte:"Corte",revestimento:"Revestimento",montagem_soldagem:"Montagem/Soldagem",caldeiraria:"Caldeiraria",pintura:"Pintura",almoxarifado:"Almoxarifado"};
const ACOL={geral:C.blu,lideranca:C.accDk,vulcanizacao:C.ros,corte:C.amb,revestimento:C.grn,montagem_soldagem:"#b45309",caldeiraria:"#0e7490",pintura:"#7c3aed",almoxarifado:C.amb};
const RL={colaborador:1,lider:2,gestor:3,rh:4,dev:5};
const can=(r,m)=>(RL[r]||0)>=(RL[m]||0);
// "dev" enxerga tudo que RH enxerga — usado nos poucos pontos do código
// que checam user.role==="rh" diretamente em vez de usar can().
const isRHouDev=r=>r==="rh"||r==="dev";

const mu=u=>({id:u.id,name:u.name,email:u.email,role:u.role,setor:u.setor,area:u.area||null,cargo:u.cargo,admissao:u.admissao,gestorId:u.gestor_id,liderId:u.lider_id,skills:u.skills||[],senioridade:u.senioridade||0,telefone:u.telefone||"",fotoUrl:u.foto_url||""});
const mf=f=>({id:f.id,userId:f.user_id,userName:f.user_name,setor:f.setor,tipo:f.tipo,inicio:f.inicio,fim:f.fim,abono:f.abono,status:f.status,liderAprov:f.lider_aprov,gestorAprov:f.gestor_aprov,rhAprov:f.rh_aprov,obs:f.obs,dataVenc:f.data_vencimento,periodoAq:f.periodo_aquisitivo,createdAt:f.created_at,historico:f.historico_edicoes||[],canceladoPor:f.cancelado_por,canceladoMotivo:f.cancelado_motivo,canceladoEm:f.cancelado_em});
const mfb=fb=>({id:fb.id,fromId:fb.from_id,fromName:fb.from_name,fromRole:fb.from_role,toId:fb.to_id,toName:fb.to_name,toRole:fb.to_role,tipo:fb.tipo,texto:fb.texto,sigiloso:fb.sigiloso,createdAt:fb.created_at});
const mch=m=>({id:m.id,fromId:m.from_id,fromName:m.from_name,toId:m.to_id,toName:m.to_name,texto:m.texto,lido:m.lido,createdAt:m.created_at});
const mav=a=>({id:a.id,avaliadoId:a.avaliado_id,avaliadoName:a.avaliado_name,avaliadorId:a.avaliador_id,avaliadorName:a.avaliador_name,periodo:a.periodo,status:a.status,notas:{qualidade:a.nota_qualidade,produtividade:a.nota_produtividade,trabalhoEquipe:a.nota_trabalho_equipe,pontualidade:a.nota_pontualidade,iniciativa:a.nota_iniciativa},comentario:a.comentario,createdAt:a.created_at});
const mc=c=>({id:c.id,name:c.name,role:c.role,vaga:"#"+(c.vaga_id||""),email:c.email||"",phone:c.phone||"",score:c.score||0,tech:c.tech||0,behavior:c.behavior||0,status:c.status||"pendente",salarioPret:c.salario_pret||"",pcd:c.pcd,resumo:c.resumo||"",habilidades:c.habilidades||[],emailEnviado:c.email_enviado,noBanco:c.no_banco_talentos});
const mv=v=>({id:v.id,title:v.title,area:v.area,local:v.local,tipo:v.tipo,desc:v.descricao,salario:v.salario||"",requisitos:v.requisitos||"",prazoEncerramento:v.prazo_encerramento,ativa:v.ativa,movimentacaoId:v.movimentacao_id});
const mtal=t=>({id:t.id,cId:t.candidato_id,name:t.name,email:t.email||"",phone:t.phone||"",role:t.role||"",vagaId:t.vaga_id||"",score:t.score||0,habs:t.habilidades||[],resumo:t.resumo||"",motivo:t.motivo_arquivo||"",tags:t.tags||[],createdAt:t.created_at});
const mcom=c=>({id:c.id,titulo:c.titulo,corpo:c.corpo,autorId:c.autor_id,autorName:c.autor_name,tipo:c.tipo,setores:c.setores||[],fixado:c.fixado,createdAt:c.created_at});
const mex=e=>({id:e.id,userId:e.user_id,userName:e.user_name,tipo:e.tipo,data:e.data_agendada,local:e.local||"",status:e.status,obs:e.observacoes||"",createdAt:e.created_at});
const mtk=t=>({id:t.id,titulo:t.titulo,desc:t.descricao||"",coluna:t.coluna,prio:t.prioridade,respId:t.responsavel_id,respName:t.responsavel_name||"",setor:t.setor||"",venc:t.data_vencimento,tags:t.tags||[],ordem:t.ordem||0,criadoPorId:t.criado_por_id,criadoPorName:t.criado_por_name||"",createdAt:t.created_at,origemTipo:t.origem_tipo||null,origemId:t.origem_id||null});
const mmv=m=>({id:m.id,tipo:m.tipo,status:m.status,solicitanteId:m.solicitante_id,solicitanteName:m.solicitante_name,nome:m.nome,email:m.email,cargo:m.cargo,setor:m.setor,liderId:m.lider_id,gestorId:m.gestor_id,dataPrevista:m.data_prevista,motivo:m.motivo,userId:m.user_id,tipoDemissao:m.tipo_demissao,ultimoDia:m.ultimo_dia,liderParecer:m.lider_parecer,liderObs:m.lider_obs,liderEm:m.lider_em,gestorParecer:m.gestor_parecer,gestorObs:m.gestor_obs,gestorEm:m.gestor_em,rhDecisao:m.rh_decisao,rhObs:m.rh_obs,rhEm:m.rh_em,rhId:m.rh_id,createdAt:m.created_at,salario:m.salario,requisitos:m.requisitos,prazoEncerramento:m.prazo_encerramento,vagaCriadaId:m.vaga_criada_id});

const fd=d=>{if(!d)return"—";const s=(d+"").split("T")[0];const[y,m,dd]=s.split("-");return dd+"/"+m+"/"+y;};
const tod=()=>new Date().toISOString().split("T")[0];
const dU=d=>d?Math.ceil((new Date(d)-new Date(tod()))/86400000):null;

const Av=({name="?",size=40,color=C.acc,photo=""})=>{
  const p=(name).trim().split(" ");const i=p.length>=2?p[0][0]+p[p.length-1][0]:name.substring(0,2);
  if(photo)return <img src={photo} alt={name} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",border:"1px solid "+color+"45",flexShrink:0}} onError={e=>{e.target.style.display="none";}}/>;
  return <div style={{width:size,height:size,borderRadius:"50%",background:color+"18",border:"1px solid "+color+"45",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.35,fontWeight:700,color,flexShrink:0}}>{i.toUpperCase()}</div>;
};

const Spin=({size=20,color=C.acc})=><div style={{width:size,height:size,borderRadius:"50%",border:"2.5px solid "+color+"30",borderTop:"2.5px solid "+color,animation:"spin .7s linear infinite",flexShrink:0}}/>;

const Chip=({label,color=C.acc,dot=false})=><span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:20,background:color+"1f",color,fontSize:12,fontWeight:700,border:"1px solid "+color+"40",whiteSpace:"nowrap"}}>{dot&&<span style={{width:6,height:6,borderRadius:"50%",background:color,flexShrink:0}}/>}{label}</span>;

const Btn=({children,onClick,v="primary",sz="md",disabled=false,full=false,style={}})=>{
  const vs={primary:{background:"linear-gradient(135deg,"+C.acc+","+C.accDk+")",color:"#fff",border:"none",boxShadow:"0 2px 8px "+C.acc+"35"},outline:{background:"transparent",color:C.txt,border:"1px solid "+C.bdrHi},ghost:{background:"transparent",color:C.txm,border:"none"},danger:{background:C.redBg,color:C.red,border:"1px solid "+C.red+"30"},success:{background:C.grnBg,color:C.grn,border:"1px solid "+C.grn+"30"},amb:{background:C.ambBg,color:C.amb,border:"1px solid "+C.amb+"30"}};
  const ss={sm:{padding:"6px 14px",fontSize:13,borderRadius:8},md:{padding:"10px 18px",fontSize:14,borderRadius:10},lg:{padding:"12px 24px",fontSize:15,borderRadius:12}};
  return <button onClick={onClick} disabled={disabled} style={{...vs[v],...ss[sz],fontWeight:600,cursor:disabled?"not-allowed":"pointer",opacity:disabled?.5:1,display:"inline-flex",alignItems:"center",gap:8,transition:"all .15s",width:full?"100%":undefined,justifyContent:full?"center":undefined,...style}}>{children}</button>;
};

const Card=({children,style={},onClick})=><div onClick={onClick} style={{background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:16,padding:24,...style,cursor:onClick?"pointer":"auto"}}>{children}</div>;

const Inp=({label,value,onChange,placeholder,type="text",style={}})=>(
  <div style={{display:"flex",flexDirection:"column",gap:6}}>
    {label&&<label style={{fontSize:12,color:C.txm,fontWeight:600,letterSpacing:".02em",textTransform:"uppercase"}}>{label}</label>}
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{background:C.s1,border:"1px solid "+C.bdr,borderRadius:10,padding:"10px 14px",color:C.txt,fontSize:14,width:"100%",boxSizing:"border-box",...style}}/>
  </div>
);

const Sel=({label,value,onChange,options,style={}})=>(
  <div style={{display:"flex",flexDirection:"column",gap:6}}>
    {label&&<label style={{fontSize:12,color:C.txm,fontWeight:600,letterSpacing:".02em",textTransform:"uppercase"}}>{label}</label>}
    <select value={value} onChange={onChange} style={{background:C.s1,border:"1px solid "+C.bdr,borderRadius:10,padding:"10px 14px",color:C.txt,fontSize:14,width:"100%",boxSizing:"border-box",...style}}>
      {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Tex=({label,value,onChange,placeholder,rows=3,style={}})=>(
  <div style={{display:"flex",flexDirection:"column",gap:6}}>
    {label&&<label style={{fontSize:12,color:C.txm,fontWeight:600,letterSpacing:".02em",textTransform:"uppercase"}}>{label}</label>}
    <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} style={{background:C.s1,border:"1px solid "+C.bdr,borderRadius:10,padding:"10px 14px",color:C.txt,fontSize:14,resize:"vertical",width:"100%",boxSizing:"border-box",...style}}/>
  </div>
);

const Modal=({open,onClose,title,children,width=560})=>{
  if(!open)return null;
  return <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16,backdropFilter:"blur(3px)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:C.s2,border:"1px solid "+C.bdrHi,borderRadius:20,padding:32,width:"100%",maxWidth:width,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,.12)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <span style={{fontSize:18,fontWeight:700}}>{title}</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.txd,fontSize:26,cursor:"pointer",lineHeight:1,padding:"0 4px"}}>×</button>
      </div>
      {children}
    </div>
  </div>;
};

const STag=({status})=>{
  const m={pendente_lider:{l:"Aguard. Líder",c:C.amb},pendente_gestor:{l:"Aguard. Gestor",c:C.blu},pendente_rh:{l:"Aguard. RH",c:C.pur},aprovado:{l:"Aprovado",c:C.grn},rejeitado:{l:"Rejeitado",c:C.red},concluida:{l:"Concluída",c:C.grn},pendente:{l:"Pendente",c:C.amb},revisao:{l:"Em Revisão",c:C.blu},agendado:{l:"Agendado",c:C.blu},realizado:{l:"Realizado",c:C.grn},cancelado:{l:"Cancelado",c:C.red}};
  const s=m[status]||{l:status,c:C.txm};return <Chip label={s.l} color={s.c} dot/>;
};

const Stat=({label,value,icon,color=C.acc})=>{
  const[v,setV]=useState(0);const n=parseInt(value)||0;
  useEffect(()=>{let s=0;const step=Math.max(1,Math.ceil(n/20));const t=setInterval(()=>{s+=step;if(s>=n){setV(n);clearInterval(t);}else setV(s);},28);return()=>clearInterval(t);},[n]);
  return <div style={{background:C.bgCard,border:"1px solid "+C.bdr,borderTop:"3px solid "+color,borderRadius:16,padding:"20px 24px",position:"relative",overflow:"hidden",boxShadow:"0 4px 12px rgba(0,0,0,.02)"}}>
    <div style={{fontSize:12,color:C.txm,fontWeight:700,letterSpacing:".05em",marginBottom:8}}>{label.toUpperCase()}</div>
    <div style={{fontSize:32,fontWeight:800,color,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{isNaN(parseInt(value))?value:v}</div>
    <div style={{position:"absolute",bottom:16,right:16,fontSize:28,opacity:.15}}>{icon}</div>
  </div>;
};

const Toast=({msg,type})=>{
  const col=type==="error"?C.red:type==="warn"?C.amb:C.grn;
  return <div style={{position:"fixed",bottom:24,right:24,zIndex:9999,background:C.s3,border:"1px solid "+col+"40",borderLeft:"4px solid "+col,borderRadius:12,padding:"14px 20px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 12px 32px rgba(0,0,0,.1)"}}>
    <span style={{color:col,fontSize:16}}>{type==="error"?"✗":"✓"}</span>
    <span style={{fontSize:14,color:C.txt,fontWeight:500}}>{msg}</span>
  </div>;
};

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility;}
html,body{height:100%;background:#f1f5f9;color:#0f172a;font-family:'Inter',-apple-system,sans-serif;font-size:15px;line-height:1.6;}
::-webkit-scrollbar{width:8px;height:8px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px;}
::-webkit-scrollbar-thumb:hover{background:#94a3b8;}
input,textarea,select{font-family:'Inter',sans-serif;outline:none;color:#0f172a!important;}
input::placeholder,textarea::placeholder{color:#64748b!important;opacity:.8;}
input:focus,textarea:focus,select:focus{border-color:#4f46e5!important;box-shadow:0 0 0 3px rgba(79,70,229,.15)!important;}
button{cursor:pointer;font-family:'Inter',sans-serif;}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.fadeUp{animation:fadeUp .3s cubic-bezier(.16,1,.3,1) both;}
.fadeIn{animation:fadeIn .2s ease both;}
.drag-over{border-color:#4f46e5!important;background:rgba(79,70,229,.08)!important;}
`;

const NAV=[
  {group:"Visão geral",items:[
    {id:"dashboard",icon:"⬡",label:"Painel",min:"colaborador"},
    {id:"analytics",icon:"◉",label:"Análise de Pessoas",min:"gestor"},
  ]},
  {group:"Pessoas",items:[
    {id:"colaboradores",icon:"⊞",label:"Colaboradores",min:"gestor"},
    {id:"movimentacoes",icon:"⇄",label:"Admissão/Demissão",min:"lider"},
    {id:"ferias",icon:"✈",label:"Férias",min:"colaborador"},
    {id:"exames",icon:"🏥",label:"Exames",min:"gestor"},
    {id:"avaliacoes",icon:"★",label:"Avaliações",min:"colaborador"},
  ]},
  {group:"Contratação",items:[
    {id:"contratacao",icon:"⊕",label:"Vagas e candidatos",min:"rh"},
  ]},
  {group:"Clima e benefícios",items:[
    {id:"beneficios",icon:"🎁",label:"Benefícios",min:"colaborador"},
    {id:"clima",icon:"❤",label:"Pesquisa de Clima",min:"colaborador"},
  ]},
  {group:"Comunicação",items:[
    {id:"chat",icon:"✉",label:"Mensagens",min:"colaborador"},
    {id:"comunicados",icon:"📢",label:"Comunicados",min:"colaborador"},
    {id:"feedbacks",icon:"◆",label:"Feedbacks",min:"colaborador"},
  ]},
  {group:"Minha conta",items:[
    {id:"perfil",icon:"◎",label:"Meu Perfil",min:"colaborador"},
    {id:"planner",icon:"⬛",label:"Planejamento",min:"lider"},
    {id:"config",icon:"⚙",label:"Configurações",min:"rh"},
  ]},
];

const NAV_FLAT=NAV.flatMap(g=>g.items);

// LOGIN
function Login({onLogin,onPortal}){
  const[email,setEmail]=useState("");const[pass,setPass]=useState("");const[err,setErr]=useState("");const[loading,setLoading]=useState(false);
  const quick=[
    {l:"RH",e:"asael@kalenborn.com.br",p:"rh@2026",c:C.grn},
    {l:"Gestor",e:"daniel@kalenborn.com.br",p:"123456",c:C.blu},
    {l:"Líder",e:"gustavo@kalenborn.com.br",p:"123456",c:C.acc},
    {l:"Colaborador",e:"ademar@kalenborn.com.br",p:"123456",c:C.txm}
  ];
  
  const doLogin=async(e,p)=>{
    setLoading(true);setErr("");
    try{
      const sb=await initSB();if(!sb){setErr("Falha ao conectar.");setLoading(false);return;}
      // Login seguro: a comparação de senha (bcrypt) acontece dentro do Postgres via RPC,
      // a senha nunca é comparada em texto puro no cliente e o hash nunca volta pro navegador.
      const{data,error}=await sb.rpc("verify_login",{p_email:e.trim(),p_password:(p||pass).trim()});
      const row=Array.isArray(data)?data[0]:data;
      if(error||!row){setErr("E-mail ou senha incorretos.");setLoading(false);}else onLogin(mu(row));
    }catch(ex){setErr("Erro: "+ex.message);setLoading(false);}
  };
  
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"radial-gradient(ellipse at 30% 20%,"+C.acc+"12 0%,transparent 60%),"+C.bg,padding:20}}>
      <style>{CSS}</style>
      <div className="fadeUp" style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:12,background:C.s2,border:"1px solid "+C.bdrHi,borderRadius:16,padding:"14px 22px"}}>
            <div style={{width:44,height:44,background:"linear-gradient(135deg,"+C.acc+","+C.accDk+")",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800,color:"#fff",boxShadow:"0 4px 18px "+C.acc+"50"}}>K</div>
            <div><div style={{fontSize:21,fontWeight:800,letterSpacing:"-.03em"}}>K.RH</div><div style={{fontSize:11,color:C.txd,marginTop:-1}}>Kalenborn International</div></div>
          </div>
        </div>
        <div style={{background:C.s1,border:"1px solid "+C.bdrHi,borderRadius:16,padding:28}}>
          <div style={{marginBottom:22}}><div style={{fontSize:22,fontWeight:700,marginBottom:4}}>Bem-vindo de volta</div><div style={{fontSize:13,color:C.txm}}>Portal de gestão de pessoas</div></div>
          <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:16}}>
            <Inp label="E-mail" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nome@kalenborn.com.br"/>
            <Inp label="Senha" type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••"/>
          </div>
          {err&&<div style={{background:C.redBg,border:"1px solid "+C.red+"25",borderRadius:8,padding:"9px 14px",color:C.red,fontSize:13,marginBottom:14}}>{err}</div>}
          <Btn sz="lg" onClick={()=>doLogin(email,pass)} disabled={loading} full>{loading?<Spin size={14} color="#fff"/>:null} Entrar</Btn>
          <div style={{marginTop:18,borderTop:"1px solid "+C.bdr,paddingTop:16}}>
            <div style={{fontSize:10,color:C.txd,marginBottom:10,textAlign:"center",letterSpacing:".06em",fontWeight:600}}>ACESSO RÁPIDO</div>
            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:7}}>
              {quick.map(q=><button key={q.l} onClick={()=>doLogin(q.e,q.p)} style={{background:C.s2,border:"1px solid "+q.c+"20",borderRadius:9,padding:"8px 12px",color:q.c,fontSize:12,fontWeight:600,cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>e.currentTarget.style.background=q.c+"15"} onMouseLeave={e=>e.currentTarget.style.background=C.s2}>{q.l}</button>)}
            </div>
          </div>
        </div>
        <div style={{textAlign:"center",marginTop:14}}>
          <button onClick={onPortal} style={{background:"none",border:"none",color:C.accLt,cursor:"pointer",fontSize:12,textDecoration:"underline"}}>Candidato? Portal de Vagas →</button>
        </div>
      </div>
    </div>
  );
}

// DASHBOARD
function Dashboard({user,users,ferias,tarefas,comunicados,exames,candidates,setPage}){
  const ts=tod();
  const totalC=users.filter(u=>u.role==="colaborador").length;
  const deFerias=ferias.filter(f=>f.status==="aprovado"&&ts>=f.inicio&&ts<=f.fim);
  const pendFerias=ferias.filter(f=>["pendente_lider","pendente_gestor","pendente_rh"].includes(f.status));
  const exHoje=exames.filter(e=>e.data===ts);
  const tkAtrasadas=tarefas.filter(t=>t.venc&&t.venc<ts&&t.coluna!=="concluido");
  const comFixados=comunicados.filter(c=>c.fixado).slice(0,3);

  // ── FÉRIAS A VENCER — separa dado real da planilha (urgente) de estimativa (informativo) ──
  const comPeriodoReal=ferias.filter(f=>f.periodoAq&&["pendente_lider","pendente_gestor","pendente_rh"].includes(f.status));
  const venceuReal=comPeriodoReal.filter(f=>{
    const dias=f.fim?Math.ceil((new Date(f.fim)-new Date(ts))/86400000):null;
    return dias!==null&&dias<=30;
  });
  const idsComDadoReal=new Set(comPeriodoReal.map(f=>f.userId));
  const semFeriasEstimado=users.filter(u=>{
    if(idsComDadoReal.has(u.id))return false;
    const m=Math.floor((new Date()-new Date(u.admissao))/(30.44*86400000));
    if(m<24)return false; // só conta como alerta informativo depois de 2 anos sem registro
    return !ferias.find(f=>f.userId===u.id&&f.status!=="rejeitado"&&new Date(f.fim)>new Date());
  });

  const candidatosNovos=candidates.filter(c=>{const d=new Date(c.createdAt||"");return(new Date()-d)<(7*86400000);}).length;

  const stats=can(user.role,"rh")?
    [{label:"Colaboradores",value:totalC,icon:"◉",color:C.acc},{label:"De Férias",value:deFerias.length,icon:"✈",color:C.grn},{label:"Aprovações Pend.",value:pendFerias.length,icon:"⏳",color:C.amb,alerta:pendFerias.length>0},{label:"Candidatos",value:candidates.length,icon:"⊕",color:C.blu,sub:candidatosNovos>0?candidatosNovos+" novos esta semana":null}]:
    can(user.role,"gestor")?
    [{label:"Minha Equipe",value:users.filter(u=>u.gestorId===user.id).length,icon:"◈",color:C.acc},{label:"De Férias",value:deFerias.filter(f=>users.find(u=>u.id===f.userId&&u.gestorId===user.id)).length,icon:"✈",color:C.grn},{label:"Tarefas Atrasadas",value:tkAtrasadas.length,icon:"⚠",color:C.amb,alerta:tkAtrasadas.length>0},{label:"Exames Agendados",value:exames.filter(e=>e.status==="agendado").length,icon:"🏥",color:C.blu}]:
    [{label:"Férias Disponíveis",value:30,icon:"✈",color:C.acc},{label:"Feedbacks",value:0,icon:"◆",color:C.pur},{label:"Avaliações",value:0,icon:"★",color:C.grn},{label:"Comunicados",value:comunicados.length,icon:"📢",color:C.blu}];

  // Prepara dados para os gráficos
  const chartSetores = Object.entries(users.reduce((acc, u) => {
    const s = SL[u.setor] || u.setor || "Outros";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {})).map(([name, value]) => ({name, value})).sort((a,b)=>b.value-a.value);
  const maiorSetor=chartSetores[0]?.value||1;

  const statusCounts = candidates.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});
  const chartCandidatos = [
    { name: 'Aprovados', value: statusCounts.aprovado || 0, fill: C.grn },
    { name: 'Em Revisão', value: statusCounts.revisao || 0, fill: C.blu },
    { name: 'Pendentes', value: statusCounts.pendente || 0, fill: C.amb },
    { name: 'Rejeitados', value: statusCounts.rejeitado || 0, fill: C.red },
  ].filter(item => item.value > 0);

  const tarefasCounts = tarefas.reduce((acc, t) => {
    if(can(user.role, "gestor") || t.respId === user.id || t.criadoPorId === user.id) {
        acc[t.coluna] = (acc[t.coluna] || 0) + 1;
    }
    return acc;
  }, {});
  const chartTarefas = [
    { name: 'A Fazer', value: tarefasCounts.backlog || 0, fill: C.txm },
    { name: 'Em Andamento', value: tarefasCounts.em_andamento || 0, fill: C.blu },
    { name: 'Em Revisão', value: tarefasCounts.revisao || 0, fill: C.amb },
    { name: 'Concluídas', value: tarefasCounts.concluido || 0, fill: C.grn },
  ].filter(item => item.value > 0);

  const CustomBarTip=({active,payload})=>{
    if(!active||!payload?.length)return null;
    const p=payload[0];
    return(
      <div style={{background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:8,padding:"8px 12px",boxShadow:"0 4px 12px rgba(0,0,0,.08)"}}>
        <div style={{fontSize:12,fontWeight:700,color:C.txt}}>{p.payload.name}</div>
        <div style={{fontSize:13,fontWeight:800,color:p.payload.fill||C.acc,fontFamily:"'JetBrains Mono',monospace"}}>{p.value} pessoa{p.value!==1?"s":""}</div>
      </div>
    );
  };

  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:26,fontWeight:800,letterSpacing:"-.02em"}}>Olá, {user.name.split(" ")[0]} <span style={{opacity:.35}}>👋</span></div>
          <div style={{fontSize:13,color:C.txm,marginTop:2}}>{new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
        </div>
      </div>

      {/* ── ALERTA PRINCIPAL — só o que é factual e urgente, com ação clara ── */}
      {can(user.role,"rh")&&venceuReal.length>0&&(
        <div style={{background:C.redBg,border:"1px solid "+C.red+"35",borderRadius:14,padding:"14px 18px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <span style={{fontSize:22}}>⚠</span>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:14,fontWeight:700,color:C.red}}>{venceuReal.length} colaborador{venceuReal.length>1?"es":""} com prazo de férias vencendo em até 30 dias</div>
            <div style={{fontSize:12,color:C.txm,marginTop:2}}>Dado confirmado pela planilha de RH — risco de pagamento em dobro conforme CLT</div>
          </div>
          <Btn v="danger" sz="sm" onClick={()=>setPage("ferias")}>Ver detalhes →</Btn>
        </div>
      )}
      {can(user.role,"rh")&&venceuReal.length===0&&semFeriasEstimado.length>0&&(
        <div style={{background:C.ambBg,border:"1px solid "+C.amb+"30",borderRadius:14,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{fontSize:18}}>ℹ</span>
          <div style={{fontSize:13,color:C.txm}}><strong style={{color:C.amb}}>{semFeriasEstimado.length} colaboradores</strong> há 2+ anos sem registro de férias no sistema — vale confirmar na planilha de RH se já tiraram fora do portal.</div>
        </div>
      )}

      {/* ── KPIs ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:14}}>
        {stats.map((s,i)=><Stat key={i} {...s}/>)}
      </div>

      {/* ── GRÁFICOS ── */}
      {(can(user.role, "lider") || can(user.role, "rh") || can(user.role, "gestor")) && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16}}>
          <Card style={{padding: "24px", display: "flex", flexDirection: "column"}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:4,color:C.txt,display:"flex",alignItems:"center",gap:8}}>
              <span style={{color:C.acc, fontSize: 16}}>📊</span> Headcount por Setor
            </div>
            <div style={{fontSize:11,color:C.txd,marginBottom:16}}>{users.length} colaboradores no total</div>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              {chartSetores.map((entry,index)=>{
                const col=Object.values(SC)[index % Object.values(SC).length] || C.acc;
                const pct=Math.round((entry.value/maiorSetor)*100);
                return(
                  <div key={entry.name} style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:84,fontSize:12,color:C.txm,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0}}>{entry.name}</div>
                    <div style={{flex:1,height:18,background:C.s3,borderRadius:5,overflow:"hidden",position:"relative"}}>
                      <div style={{width:pct+"%",height:"100%",background:col,borderRadius:5,transition:"width .5s ease"}}/>
                    </div>
                    <div style={{width:28,textAlign:"right",fontSize:13,fontWeight:800,color:col,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{entry.value}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card style={{padding: "24px", display: "flex", flexDirection: "column"}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:20,color:C.txt,display:"flex",alignItems:"center",gap:8}}>
              {can(user.role, "rh") ? <><span style={{color:C.blu, fontSize: 16}}>🎯</span> Funil de Candidatos</> : <><span style={{color:C.acc, fontSize: 16}}>⬛</span> Progresso do Planejamento</>}
            </div>
            <div style={{flex: 1, minHeight: 220, display: "flex", alignItems: "center"}}>
              {(can(user.role, "rh") ? chartCandidatos : chartTarefas).length === 0 ? (
                <div style={{width: "100%", textAlign: "center", color: C.txf, fontSize: 13, fontStyle: "italic"}}>Sem dados suficientes para exibição.</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={can(user.role, "rh") ? chartCandidatos : chartTarefas} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                        {(can(user.role, "rh") ? chartCandidatos : chartTarefas).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomBarTip/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{display: "flex", flexDirection: "column", gap: 10, minWidth: 130}}>
                    {(can(user.role, "rh") ? chartCandidatos : chartTarefas).map(c => (
                        <div key={c.name} style={{display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: C.txm}}>
                          <div style={{width: 10, height: 10, borderRadius: 3, background: c.fill, flexShrink: 0}} />
                          {c.name} <span style={{color: C.txt, marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace"}}>{c.value}</span>
                        </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      {comFixados.length>0&&(
        <div>
          <div style={{fontSize:11,color:C.txd,fontWeight:700,letterSpacing:".06em",marginBottom:10}}>COMUNICADOS EM DESTAQUE</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {comFixados.map(c=>(
              <div key={c.id} style={{background:C.bgCard,border:"1px solid "+C.acc+"25",borderLeft:"3px solid "+C.acc,borderRadius:12,padding:"12px 16px",display:"flex",gap:12,alignItems:"flex-start"}}>
                <span style={{fontSize:16}}>📌</span>
                <div><div style={{fontWeight:700,fontSize:14}}>{c.titulo}</div><div style={{fontSize:12,color:C.txm,marginTop:2}}>{c.corpo.substring(0,120)}{c.corpo.length>120?"…":""}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CARDS DE AÇÃO — De Férias / Tarefas, hierarquia visual por urgência ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card>
          <div style={{fontSize:13,fontWeight:700,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:C.grn}}>✈</span> De Férias Agora
            <span style={{marginLeft:"auto",fontSize:11,color:C.txd}}>{deFerias.length} pessoa{deFerias.length!==1?"s":""}</span>
          </div>
          {deFerias.length===0?<div style={{color:C.txd,fontSize:13,textAlign:"center",padding:"16px 0"}}>Ninguém de férias.</div>
          :deFerias.slice(0,5).map(f=>{
            const u=users.find(x=>x.id===f.userId);const col=SC[u?.setor]||C.acc;const ret=dU(f.fim);
            return <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid "+C.bdr}}>
              <Av name={f.userName} size={28} color={col}/>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{f.userName.split(" ").slice(0,2).join(" ")}</div><div style={{fontSize:11,color:C.txd}}>Retorna em {ret}d · {fd(f.fim)}</div></div>
              <Chip label={SL[u?.setor]||"—"} color={col}/>
            </div>;
          })}
        </Card>
        <Card style={{borderColor:tkAtrasadas.length>0?C.red+"30":C.bdr}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:C.amb}}>⬛</span> Tarefas Urgentes
            {tkAtrasadas.length>0&&<span style={{marginLeft:"auto",background:C.redBg,color:C.red,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{tkAtrasadas.length} atrasada{tkAtrasadas.length>1?"s":""}</span>}
          </div>
          {tarefas.filter(t=>t.prio==="alta"&&t.coluna!=="concluido").slice(0,5).map(t=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid "+C.bdr}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:t.venc&&t.venc<ts?C.red:C.amb,flexShrink:0}}/>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>{t.titulo}</div><div style={{fontSize:11,color:C.txd}}>{t.respName||"—"} · {t.venc?fd(t.venc):"Sem prazo"}</div></div>
              <Chip label={t.coluna==="em_andamento"?"Em Andamento":"A Fazer"} color={C.amb}/>
            </div>
          ))}
          {tarefas.filter(t=>t.prio==="alta"&&t.coluna!=="concluido").length===0&&<div style={{color:C.txd,fontSize:13,textAlign:"center",padding:"16px 0"}}>Sem tarefas urgentes.</div>}
        </Card>
      </div>
      {exHoje.length>0&&(
        <Card style={{borderColor:C.blu+"30"}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:C.blu}}>🏥 Exames Hoje</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {exHoje.map(e=>(
              <div key={e.id} style={{background:C.s1,borderRadius:10,padding:"10px 16px",border:"1px solid "+C.bdr}}>
                <div style={{fontWeight:600,fontSize:13}}>{e.userName}</div>
                <div style={{fontSize:12,color:C.txm,marginTop:2}}>{e.tipo} · {e.local||"A confirmar"}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// PLANNER — KANBAN POR TIPO DE DEMANDA + TIMELINE FÉRIAS
function Planner({user,users,ferias,tarefas,setTarefas,setPage}){
  const[tab,setTab]=useState("kanban");const[modal,setModal]=useState(false);const[editId,setEditId]=useState(null);const[dragId,setDragId]=useState(null);const[saving,setSaving]=useState(false);
  const[form,setForm]=useState({titulo:"",desc:"",prio:"media",respId:"",setor:"",venc:"",tags:""});
  const COLS=[{id:"backlog",l:"A Fazer",c:C.txm,i:"○"},{id:"em_andamento",l:"Em Andamento",c:C.blu,i:"◑"},{id:"revisao",l:"Revisão",c:C.amb,i:"◐"},{id:"concluido",l:"Concluído",c:C.grn,i:"●"}];
  const PRIO={alta:{l:"Alta",c:C.red},media:{l:"Média",c:C.amb},baixa:{l:"Baixa",c:C.grn}};

  // Seções fixas por tipo de demanda — cada uma carrega o ícone, a página de destino do clique e a ordem de prioridade visual
  const SECOES=[
    {tipo:"ferias",l:"Férias",i:"✈",cor:C.grn,destino:"ferias"},
    {tipo:"candidatos",l:"Recrutamento",i:"👤",cor:C.pur,destino:"contratacao"},
    {tipo:"exames",l:"Exames",i:"🏥",cor:C.blu,destino:"exames"},
    {tipo:null,l:"Tarefas Gerais",i:"📌",cor:C.txm,destino:null},
  ];

  const myTk=can(user.role,"gestor")?tarefas:tarefas.filter(t=>t.respId===user.id||t.criadoPorId===user.id);
  const ts=tod();
  const prioOrdem={alta:0,media:1,baixa:2};
  const ordenarPorUrgencia=(a,b)=>{
    const pa=prioOrdem[a.prio]??1,pb=prioOrdem[b.prio]??1;
    if(pa!==pb)return pa-pb;
    if(a.venc&&b.venc)return a.venc.localeCompare(b.venc);
    if(a.venc)return -1; if(b.venc)return 1;
    return 0;
  };

  const saveTk=async()=>{
    setSaving(true);const sb=getSB();if(!sb){setSaving(false);return;}
    const resp=users.find(u=>u.id===parseInt(form.respId));
    const row={titulo:form.titulo,descricao:form.desc,coluna:editId?tarefas.find(t=>t.id===editId)?.coluna||"backlog":"backlog",prioridade:form.prio,responsavel_id:form.respId?parseInt(form.respId):null,responsavel_name:resp?.name||"",setor:form.setor,data_vencimento:form.venc||null,tags:form.tags?form.tags.split(",").map(x=>x.trim()).filter(Boolean):[],criado_por_id:user.id,criado_por_name:user.name};
    if(editId){const{data}=await sb.from("tarefas").update(row).eq("id",editId).select().single();if(data)setTarefas(p=>p.map(t=>t.id===editId?mtk(data):t));}
    else{const{data}=await sb.from("tarefas").insert([row]).select().single();if(data)setTarefas(p=>[...p,mtk(data)]);}
    setSaving(false);setModal(false);setEditId(null);setForm({titulo:"",desc:"",prio:"media",respId:"",setor:"",venc:"",tags:""});
  };

  const moverTk=async(id,coluna)=>{const sb=getSB();if(!sb)return;await sb.from("tarefas").update({coluna}).eq("id",id);setTarefas(p=>p.map(t=>t.id===id?{...t,coluna}:t));};
  const delTk=async(id)=>{const sb=getSB();if(!sb)return;await sb.from("tarefas").delete().eq("id",id);setTarefas(p=>p.filter(t=>t.id!==id));};
  const openEdit=t=>{setEditId(t.id);setForm({titulo:t.titulo,desc:t.desc,prio:t.prio,respId:t.respId||"",setor:t.setor||"",venc:t.venc||"",tags:(t.tags||[]).join(", ")});setModal(true);};

  const abrirOrigem=(t,secao)=>{
    if(!secao.destino||!setPage)return;
    setPage(secao.destino);
  };

  const meses=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const usersTimeline=can(user.role,"gestor")?users.filter(u=>u.role!=="gestor"&&u.role!=="rh"):users.filter(u=>u.liderId===user.id||u.id===user.id);

  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div><div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>Planejamento</div><div style={{fontSize:13,color:C.txm,marginTop:2}}>Agrupado por tipo de demanda · clique no card para abrir o registro original</div></div>
        <div style={{display:"flex",gap:8}}>
          <div style={{display:"flex",background:C.s2,borderRadius:10,padding:3,border:"1px solid "+C.bdr}}>
            {["kanban","ferias"].map(t=><button key={t} onClick={()=>setTab(t)} style={{padding:"6px 14px",borderRadius:8,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",background:tab===t?C.acc:"transparent",color:tab===t?"#fff":C.txm,transition:"all .2s"}}>{t==="kanban"?"⬛ Quadro":"✈ Férias"}</button>)}
          </div>
          {can(user.role,"lider")&&tab==="kanban"&&<Btn onClick={()=>{setEditId(null);setForm({titulo:"",desc:"",prio:"media",respId:"",setor:"",venc:"",tags:""});setModal(true);}}>+ Tarefa</Btn>}
        </div>
      </div>
      {tab==="kanban"&&(
        <div style={{display:"flex",flexDirection:"column",gap:24}}>
          {SECOES.map(secao=>{
            const tarefasSecao=myTk.filter(t=>t.origemTipo===secao.tipo);
            if(tarefasSecao.length===0)return null;
            return(
              <div key={secao.l}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <span style={{fontSize:16}}>{secao.i}</span>
                  <span style={{fontSize:14,fontWeight:700,color:secao.cor}}>{secao.l}</span>
                  <span style={{fontSize:11,color:C.txd,background:C.s1,borderRadius:10,padding:"1px 8px"}}>{tarefasSecao.length}</span>
                  {secao.destino&&<span style={{fontSize:11,color:C.txd,marginLeft:"auto"}}>clique no card → abre {secao.l.toLowerCase()}</span>}
                </div>
                <div style={{display:"flex",gap:14,overflowX:"auto",paddingBottom:8,alignItems:"flex-start"}}>
                  {COLS.map(col=>{
                    const cards=tarefasSecao.filter(t=>t.coluna===col.id).sort(ordenarPorUrgencia);
                    return(
                      <div key={col.id} onDragOver={e=>{e.preventDefault();e.currentTarget.classList.add("drag-over");}} onDragLeave={e=>e.currentTarget.classList.remove("drag-over")} onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove("drag-over");if(dragId)moverTk(dragId,col.id);}}
                        style={{minWidth:235,width:235,flexShrink:0,background:C.s1,borderRadius:14,border:"1px solid "+C.bdr,display:"flex",flexDirection:"column",transition:"all .2s"}}>
                        <div style={{padding:"10px 12px",borderBottom:"1px solid "+C.bdr,display:"flex",alignItems:"center",justifyContent:"space-between",borderTop:"2.5px solid "+col.c,borderRadius:"14px 14px 0 0"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{color:col.c,fontSize:13}}>{col.i}</span><span style={{fontSize:11,fontWeight:700,color:col.c}}>{col.l}</span></div>
                          <span style={{background:col.c+"22",color:col.c,fontSize:10,fontWeight:700,borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center"}}>{cards.length}</span>
                        </div>
                        <div style={{padding:9,display:"flex",flexDirection:"column",gap:7,minHeight:60,flex:1}}>
                          {cards.length===0&&<div style={{textAlign:"center",padding:"12px 0",fontSize:11,color:C.txf,fontStyle:"italic"}}>Vazio</div>}
                          {cards.map(t=>{
                            const overdue=t.venc&&t.venc<ts&&col.id!=="concluido";const dl=t.venc?dU(t.venc):null;const pr=PRIO[t.prio]||PRIO.media;
                            return(
                              <div key={t.id} draggable onDragStart={()=>setDragId(t.id)} onDragEnd={()=>setDragId(null)} onClick={()=>abrirOrigem(t,secao)}
                                style={{background:C.bgCard,borderRadius:10,border:"1px solid "+(overdue?C.red+"45":C.bdr),borderLeft:"3px solid "+pr.c,padding:"9px 11px",cursor:secao.destino?"pointer":"grab",boxShadow:"0 2px 8px rgba(0,0,0,.3)",transition:"all .15s"}}
                                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 6px 18px rgba(0,0,0,.4)";}}
                                onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.3)";}}>
                                <div style={{fontSize:12,fontWeight:600,color:C.txt,marginBottom:5,lineHeight:1.3}}>{t.titulo}</div>
                                {t.desc&&<div style={{fontSize:11,color:C.txd,marginBottom:7,lineHeight:1.4,whiteSpace:"pre-line"}}>{t.desc.substring(0,70)}{t.desc.length>70?"…":""}</div>}
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                                    {t.respName&&<Av name={t.respName} size={18} color={C.acc}/>}
                                    <Chip label={pr.l} color={pr.c}/>
                                  </div>
                                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                                    {t.venc&&<span style={{fontSize:10,color:overdue?C.red:dl!==null&&dl<=3?C.amb:C.txd,fontWeight:600}}>{overdue?Math.abs(dl||0)+"d atraso":dl+"d"}</span>}
                                    {can(user.role,"lider")&&!secao.destino&&<><button onClick={e=>{e.stopPropagation();openEdit(t);}} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",fontSize:11,padding:"0 2px"}} title="Editar">✎</button><button onClick={e=>{e.stopPropagation();delTk(t.id);}} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",fontSize:11,padding:"0 2px"}} title="Excluir">✕</button></>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {myTk.length===0&&<Card><div style={{color:C.txd,textAlign:"center",padding:24}}>Nenhuma tarefa por aqui.</div></Card>}
        </div>
      )}
      {tab==="ferias"&&(
        <div>
          <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap"}}>
            {[{l:"Aprovado",c:C.grn},{l:"Aguardando",c:C.amb},{l:"Rejeitado",c:C.red}].map(x=>(
              <div key={x.l} style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:C.txm}}><div style={{width:10,height:10,borderRadius:2,background:x.c}}/>{x.l}</div>
            ))}
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",minWidth:860}}>
              <thead><tr>
                <th style={{width:190,padding:"8px 12px",fontSize:11,color:C.txd,textAlign:"left",fontWeight:600,borderBottom:"1px solid "+C.bdr}}>COLABORADOR</th>
                {meses.map((m,mi)=><th key={m} style={{width:66,padding:"8px 4px",fontSize:11,color:new Date().getMonth()===mi?C.acc:C.txd,textAlign:"center",fontWeight:new Date().getMonth()===mi?700:400,borderBottom:"1px solid "+C.bdr}}>{m}</th>)}
              </tr></thead>
              <tbody>
                {usersTimeline.map(u=>{
                  const col=SC[u.setor]||C.acc;const uf=ferias.filter(f=>f.userId===u.id);
                  return(
                    <tr key={u.id} style={{borderBottom:"1px solid "+C.bdr+"15"}}>
                      <td style={{padding:"7px 12px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}><Av name={u.name} size={22} color={col}/><div><div style={{fontSize:12,fontWeight:600}}>{u.name.split(" ").slice(0,2).join(" ")}</div><div style={{fontSize:10,color:C.txd}}>{SL[u.setor]}</div></div></div>
                      </td>
                      {meses.map((_,mi)=>{
                        const mf2=uf.find(f=>{const ini=new Date(f.inicio);const fim=new Date(f.fim);const mI=new Date(2026,mi,1);const mF=new Date(2026,mi+1,0);return ini<=mF&&fim>=mI;});
                        const bg=mf2?mf2.status==="aprovado"?C.grn+"28":mf2.status==="rejeitado"?C.red+"18":C.amb+"20":"transparent";
                        const bc=mf2?mf2.status==="aprovado"?C.grn:mf2.status==="rejeitado"?C.red:C.amb:undefined;
                        return <td key={mi} style={{padding:3,borderLeft:"1px solid "+C.bdr+"15"}}>{mf2&&<div style={{background:bg,borderRadius:4,height:22,borderLeft:"3px solid "+bc,display:"flex",alignItems:"center",justifyContent:"center"}}><span title={fd(mf2.inicio)+" → "+fd(mf2.fim)} style={{fontSize:9,color:bc,fontWeight:600}}>✈</span></div>}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Modal open={modal} onClose={()=>{setModal(false);setEditId(null);}} title={editId?"Editar Tarefa":"Nova Tarefa"}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Inp label="Título *" value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} placeholder="O que precisa ser feito?"/>
          <Tex label="Descrição" value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})} placeholder="Detalhes..."/>
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
            <Sel label="Prioridade" value={form.prio} onChange={e=>setForm({...form,prio:e.target.value})} options={[{value:"alta",label:"🔴 Alta"},{value:"media",label:"🟡 Média"},{value:"baixa",label:"🟢 Baixa"}]}/>
            <Sel label="Responsável" value={form.respId} onChange={e=>setForm({...form,respId:e.target.value})} options={[{value:"",label:"Ninguém"},...users.map(u=>({value:u.id,label:u.name}))]}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
            <Inp label="Prazo" type="date" value={form.venc} onChange={e=>setForm({...form,venc:e.target.value})}/>
            <Inp label="Tags (vírgula)" value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} placeholder="design, urgente"/>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn v="outline" onClick={()=>{setModal(false);setEditId(null);}}>Cancelar</Btn>
            <Btn onClick={saveTk} disabled={!form.titulo||saving}>{saving?<Spin size={14} color="#fff"/>:null} {editId?"Salvar":"Criar"}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// FÉRIAS
function Ferias({user,users,ferias,setFerias,criarTarefaAuto}){
  const[tab,setTab]=useState("lista");const[modal,setModal]=useState(false);
  const[form,setForm]=useState({tipo:"30dias",inicio:"",fim:"",abono:false,obs:"",periodoAq:""});const[saving,setSaving]=useState(false);
  const[busca,setBusca]=useState("");const[filtroSetor,setFiltroSetor]=useState("todos");const[filtroStatus,setFiltroStatus]=useState("todos");
  const[mesCalendario,setMesCalendario]=useState(new Date().getMonth());
  const[anoCalendario,setAnoCalendario]=useState(new Date().getFullYear());
  const[modalEdit,setModalEdit]=useState(null);const[formEdit,setFormEdit]=useState({});const[savingEdit,setSavingEdit]=useState(false);
  const[modalCancel,setModalCancel]=useState(null);const[motivoCancel,setMotivoCancel]=useState("");const[savingCancel,setSavingCancel]=useState(false);

  const isRH=can(user.role,"rh");

  useEffect(()=>{if(form.inicio){const d=new Date(form.inicio);d.setDate(d.getDate()+(form.tipo==="30dias"?29:14));setForm(f=>({...f,fim:d.toISOString().split("T")[0]}));}},[ form.inicio,form.tipo]);

  const aprovar=async(id,acao)=>{
    const sb=getSB();if(!sb)return;const f=ferias.find(x=>x.id===id);if(!f)return;
    let p={};
    // RH pode decidir em qualquer etapa, pulando líder/gestor se necessário
    if(isRH){
      p={rh_aprov:acao,status:acao==="aprovado"?"aprovado":"rejeitado"};
      if(!f.liderAprov)p.lider_aprov=acao==="aprovado"?"aprovado":f.liderAprov;
      if(!f.gestorAprov)p.gestor_aprov=acao==="aprovado"?"aprovado":f.gestorAprov;
    }
    else if(user.role==="lider")p={lider_aprov:acao,status:acao==="aprovado"?"pendente_gestor":"rejeitado"};
    else if(user.role==="gestor")p={gestor_aprov:acao,status:acao==="aprovado"?"pendente_rh":"rejeitado"};
    const{data}=await sb.from("ferias").update(p).eq("id",id).select().single();
    if(data)setFerias(prev=>prev.map(x=>x.id===id?mf(data):x));
  };

  const solicitar=async()=>{
    if(!form.inicio)return;setSaving(true);const sb=getSB();if(!sb){setSaving(false);return;}
    const row={user_id:user.id,user_name:user.name,setor:user.setor,tipo:form.tipo,inicio:form.inicio,fim:form.fim,abono:form.abono,obs:form.obs,status:"pendente_lider",lider_aprov:null,gestor_aprov:null,rh_aprov:null,periodo_aquisitivo:form.periodoAq||null};
    const{data}=await sb.from("ferias").insert([row]).select().single();
    if(data){
      setFerias(p=>[mf(data),...p]);
      setModal(false);
      setForm({tipo:"30dias",inicio:"",fim:"",abono:false,obs:"",periodoAq:""});
      if(criarTarefaAuto) criarTarefaAuto(`Aprovar Férias: ${user.name.split(' ')[0]}`, `Período: ${fd(form.inicio)} a ${fd(form.fim)}.\nRequer análise e aprovação na aba de férias.`, "alta", ["férias"], "ferias", data.id);
    }
    setSaving(false);
  };

  // ── EDIÇÃO PELO RH (qualquer status) — registra histórico de quem editou ──
  const abrirEdicao=f=>{
    setFormEdit({inicio:f.inicio,fim:f.fim,tipo:f.tipo,abono:f.abono,obs:f.obs||"",periodoAq:f.periodoAq||""});
    setModalEdit(f);
  };

  const salvarEdicao=async()=>{
    if(!modalEdit)return;setSavingEdit(true);
    const sb=getSB();
    const entradaHistorico={
      em:new Date().toISOString(),por:user.name,porId:user.id,
      de:{inicio:modalEdit.inicio,fim:modalEdit.fim,tipo:modalEdit.tipo,abono:modalEdit.abono},
      para:{inicio:formEdit.inicio,fim:formEdit.fim,tipo:formEdit.tipo,abono:formEdit.abono},
    };
    const novoHistorico=[...(modalEdit.historico||[]),entradaHistorico];
    const{data}=await sb.from("ferias").update({
      inicio:formEdit.inicio,fim:formEdit.fim,tipo:formEdit.tipo,abono:formEdit.abono,
      obs:formEdit.obs,periodo_aquisitivo:formEdit.periodoAq||null,
      historico_edicoes:novoHistorico,
    }).eq("id",modalEdit.id).select().single();
    if(data){setFerias(p=>p.map(x=>x.id===modalEdit.id?mf(data):x));setModalEdit(null);}
    setSavingEdit(false);
  };

  // ── CANCELAMENTO PELO RH (de uma férias já aprovada) ──
  const confirmarCancelamento=async()=>{
    if(!modalCancel||!motivoCancel.trim())return;setSavingCancel(true);
    const sb=getSB();
    const{data}=await sb.from("ferias").update({
      status:"cancelado",cancelado_por:user.id,cancelado_motivo:motivoCancel.trim(),cancelado_em:new Date().toISOString(),
    }).eq("id",modalCancel.id).select().single();
    if(data){setFerias(p=>p.map(x=>x.id===modalCancel.id?mf(data):x));setModalCancel(null);setMotivoCancel("");}
    setSavingCancel(false);
  };

  const teamIds=isRH?users.map(u=>u.id):can(user.role,"gestor")?users.filter(u=>u.gestorId===user.id||u.id===user.id).map(u=>u.id):can(user.role,"lider")?users.filter(u=>u.liderId===user.id||u.id===user.id).map(u=>u.id):[user.id];
  const visiveisBase=ferias.filter(f=>teamIds.includes(f.userId));
  const setoresDisponiveis=[...new Set(visiveisBase.map(f=>{const u=users.find(x=>x.id===f.userId);return u?.setor;}).filter(Boolean))];
  const statusDisponiveis=[...new Set(visiveisBase.map(f=>f.status))];
  const visiveis=visiveisBase
    .filter(f=>filtroSetor==="todos"||f.setor===filtroSetor||users.find(u=>u.id===f.userId)?.setor===filtroSetor)
    .filter(f=>filtroStatus==="todos"||f.status===filtroStatus)
    .filter(f=>{
      if(!busca.trim())return true;
      const b=busca.toLowerCase();
      return f.userName.toLowerCase().includes(b)||(SL[f.setor]||"").toLowerCase().includes(b);
    });

  // RH vê QUALQUER pendência em qualquer etapa (não só pendente_rh) — pode agir em todas
  const pendencias=ferias.filter(f=>{
    if(isRH)return ["pendente_lider","pendente_gestor","pendente_rh"].includes(f.status);
    if(user.role==="lider")return users.find(u=>u.id===f.userId)?.liderId===user.id&&f.status==="pendente_lider";
    if(user.role==="gestor")return f.status==="pendente_gestor"&&teamIds.includes(f.userId);
    return false;
  });

  // ── VENCIMENTOS ──
  const hoje=tod();
  const comPeriodoReal=ferias.filter(f=>f.periodoAq&&(f.status==="pendente_lider"||f.status==="pendente_gestor"||f.status==="pendente_rh")&&teamIds.includes(f.userId));
  const vencimentosReais=comPeriodoReal.map(f=>{
    const u=users.find(x=>x.id===f.userId);
    const diasLimite=f.fim?Math.ceil((new Date(f.fim)-new Date(hoje))/86400000):null;
    return{userId:f.userId,nome:f.userName,setor:f.setor||u?.setor,cargo:u?.cargo,limite:f.fim,diasLimite,obs:f.obs,fonte:"planilha"};
  }).filter(v=>v.diasLimite!==null);

  const idsComDadoReal=new Set(vencimentosReais.map(v=>v.userId));
  const vencimentosEstimados=users.filter(u=>{
    if(!teamIds.includes(u.id))return false;
    if(idsComDadoReal.has(u.id))return false;
    const m=Math.floor((new Date()-new Date(u.admissao))/(30.44*86400000));
    if(m<12)return false;
    return !ferias.find(f=>f.userId===u.id&&f.status!=="rejeitado"&&new Date(f.fim)>new Date());
  }).map(u=>{
    const m=Math.floor((new Date()-new Date(u.admissao))/(30.44*86400000));
    return{userId:u.id,nome:u.name,setor:u.setor,cargo:u.cargo,mesesSemFerias:m,fonte:"estimado"};
  });

  // ── CALENDÁRIO ──
  const meses=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const diasNoMes=new Date(anoCalendario,mesCalendario+1,0).getDate();
  const primeiroDiaSemana=new Date(anoCalendario,mesCalendario,1).getDay();
  const feriasAprovadasVisiveis=visiveisBase.filter(f=>f.status==="aprovado");
  const diaTemFerias=dia=>{
    const data=new Date(anoCalendario,mesCalendario,dia).toISOString().split("T")[0];
    return feriasAprovadasVisiveis.filter(f=>data>=f.inicio&&data<=f.fim);
  };
  const totalFeriasNoMes=new Set(
    feriasAprovadasVisiveis.filter(f=>{
      const ini=new Date(f.inicio),fim=new Date(f.fim);
      const inicioMes=new Date(anoCalendario,mesCalendario,1),fimMes=new Date(anoCalendario,mesCalendario+1,0);
      return ini<=fimMes&&fim>=inicioMes;
    }).map(f=>f.userId)
  ).size;

  const tabs=[
    {id:"lista",l:"Solicitações"},
    {id:"calendario",l:"Calendário"},
    {id:"pendencias",l:"Pendências"+(pendencias.length>0?" ("+pendencias.length+")":"")},
    {id:"vencimentos",l:"Vencimentos"+((vencimentosReais.length+vencimentosEstimados.length)>0?" ("+(vencimentosReais.length+vencimentosEstimados.length)+")":"")},
  ];

  const STATUS_L={pendente_lider:"Aguard. Líder",pendente_gestor:"Aguard. Gestor",pendente_rh:"Aguard. RH",aprovado:"Aprovado",rejeitado:"Rejeitado",cancelado:"Cancelado"};

  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div><div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>Férias</div><div style={{fontSize:13,color:C.txm,marginTop:2}}>{isRH?"Controle total — RH pode editar, aprovar ou cancelar qualquer registro":"Controle completo de períodos"}</div></div>
        {user.role==="colaborador"&&<Btn onClick={()=>setModal(true)}>+ Solicitar</Btn>}
      </div>
      <div style={{display:"flex",gap:3,background:C.s2,borderRadius:10,padding:3,border:"1px solid "+C.bdr,width:"fit-content",flexWrap:"wrap"}}>
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 16px",borderRadius:8,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",background:tab===t.id?C.acc:"transparent",color:tab===t.id?"#fff":C.txm,transition:"all .2s"}}>{t.l}</button>)}
      </div>

      {tab==="lista"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {can(user.role,"lider")&&(
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar por nome ou setor..." style={{flex:1,minWidth:200,background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:9,padding:"9px 13px",color:C.txt,fontSize:13,boxSizing:"border-box"}}/>
              {setoresDisponiveis.length>1&&(
                <select value={filtroSetor} onChange={e=>setFiltroSetor(e.target.value)} style={{background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:9,padding:"9px 13px",color:C.txt,fontSize:13}}>
                  <option value="todos">Todos os setores</option>
                  {setoresDisponiveis.map(s=><option key={s} value={s}>{SL[s]||s}</option>)}
                </select>
              )}
              {isRH&&statusDisponiveis.length>1&&(
                <select value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)} style={{background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:9,padding:"9px 13px",color:C.txt,fontSize:13}}>
                  <option value="todos">Todas as situações</option>
                  {statusDisponiveis.map(s=><option key={s} value={s}>{STATUS_L[s]||s}</option>)}
                </select>
              )}
            </div>
          )}
          {visiveis.length===0?<Card><div style={{color:C.txd,textAlign:"center",padding:18}}>{busca||filtroSetor!=="todos"||filtroStatus!=="todos"?"Nenhuma solicitação encontrada para esse filtro.":"Sem solicitações."}</div></Card>
          :visiveis.map(f=>{
            const u=users.find(x=>x.id===f.userId);const col=SC[u?.setor]||C.acc;const dias=f.inicio&&f.fim?Math.round((new Date(f.fim)-new Date(f.inicio))/86400000)+1:0;
            return <Card key={f.id} style={{borderColor:f.status==="cancelado"?C.red+"30":C.bdr}}>
              <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                <Av name={f.userName} size={40} color={col}/>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:8}}>
                    <div><div style={{fontWeight:700,fontSize:14}}>{f.userName}</div><div style={{fontSize:12,color:C.txm}}>{SL[u?.setor]||"—"} · {dias} dias</div></div>
                    <STag status={f.status}/>
                  </div>
                  <div style={{display:"flex",gap:14,fontSize:12,color:C.txm,marginBottom:8,flexWrap:"wrap"}}>
                    <span>📅 {fd(f.inicio)} → {fd(f.fim)}</span>
                    {f.abono&&<span style={{color:C.amb}}>💰 Abono</span>}
                    {f.periodoAq&&<span>📋 {f.periodoAq}</span>}
                  </div>
                  {f.obs&&<div style={{fontSize:12,color:C.txd,fontStyle:"italic",marginBottom:8}}>"{f.obs}"</div>}
                  {f.status==="cancelado"&&f.canceladoMotivo&&<div style={{fontSize:12,color:C.red,background:C.redBg,borderRadius:7,padding:"6px 10px",marginBottom:8}}>Cancelado: {f.canceladoMotivo}</div>}
                  {f.historico&&f.historico.length>0&&(
                    <details style={{marginBottom:8}}>
                      <summary style={{fontSize:11,color:C.accLt,cursor:"pointer"}}>📝 {f.historico.length} edição{f.historico.length>1?"ões":""} pelo RH</summary>
                      <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:4}}>
                        {f.historico.map((h,i)=>(
                          <div key={i} style={{fontSize:11,color:C.txd,background:C.s1,borderRadius:6,padding:"6px 10px"}}>
                            {h.por} alterou em {fd(h.em.split("T")[0])}: {fd(h.de.inicio)}→{fd(h.de.fim)} virou {fd(h.para.inicio)}→{fd(h.para.fim)}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    {[{l:"Líder",v:f.liderAprov},{l:"Gestor",v:f.gestorAprov},{l:"RH",v:f.rhAprov}].map(s=>(
                      <div key={s.l} style={{display:"flex",alignItems:"center",gap:4,background:C.s1,borderRadius:7,padding:"4px 10px",fontSize:11}}>
                        <span style={{color:s.v==="aprovado"?C.grn:s.v==="rejeitado"?C.red:C.txf}}>{s.v==="aprovado"?"✓":s.v==="rejeitado"?"✗":"○"}</span>
                        <span style={{color:C.txm}}>{s.l}</span>
                      </div>
                    ))}
                    {isRH&&(
                      <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                        <button onClick={()=>abrirEdicao(f)} title="Editar" style={{background:"none",border:"1px solid "+C.bdr,borderRadius:7,padding:"4px 10px",fontSize:11,color:C.txm,cursor:"pointer"}}>✎ Editar</button>
                        {f.status==="aprovado"&&<button onClick={()=>setModalCancel(f)} title="Cancelar" style={{background:"none",border:"1px solid "+C.red+"40",borderRadius:7,padding:"4px 10px",fontSize:11,color:C.red,cursor:"pointer"}}>✕ Cancelar</button>}
                        {["pendente_lider","pendente_gestor","pendente_rh"].includes(f.status)&&(
                          <>
                            <button onClick={()=>aprovar(f.id,"aprovado")} style={{background:"none",border:"1px solid "+C.grn+"40",borderRadius:7,padding:"4px 10px",fontSize:11,color:C.grn,cursor:"pointer"}}>✓ Aprovar</button>
                            <button onClick={()=>aprovar(f.id,"rejeitado")} style={{background:"none",border:"1px solid "+C.red+"40",borderRadius:7,padding:"4px 10px",fontSize:11,color:C.red,cursor:"pointer"}}>✗ Rejeitar</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>;
          })}
        </div>
      )}

      {tab==="calendario"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <button onClick={()=>{if(mesCalendario===0){setMesCalendario(11);setAnoCalendario(a=>a-1);}else setMesCalendario(m=>m-1);}} style={{background:C.s1,border:"1px solid "+C.bdr,borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:14,color:C.txm}}>‹</button>
              <div style={{fontSize:15,fontWeight:700,minWidth:160,textAlign:"center"}}>{meses[mesCalendario]} {anoCalendario}</div>
              <button onClick={()=>{if(mesCalendario===11){setMesCalendario(0);setAnoCalendario(a=>a+1);}else setMesCalendario(m=>m+1);}} style={{background:C.s1,border:"1px solid "+C.bdr,borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:14,color:C.txm}}>›</button>
            </div>
            <Chip label={totalFeriasNoMes+" pessoa"+(totalFeriasNoMes!==1?"s":"")+" de férias neste mês"} color={C.grn} dot/>
          </div>

          <Card style={{padding:18}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:8}}>
              {["D","S","T","Q","Q","S","S"].map((d,i)=><div key={i} style={{textAlign:"center",fontSize:11,color:C.txd,fontWeight:700,padding:"4px 0"}}>{d}</div>)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
              {Array.from({length:primeiroDiaSemana}).map((_,i)=><div key={"empty"+i}/>)}
              {Array.from({length:diasNoMes}).map((_,i)=>{
                const dia=i+1;
                const pessoas=diaTemFerias(dia);
                const ehHoje=new Date().toISOString().split("T")[0]===new Date(anoCalendario,mesCalendario,dia).toISOString().split("T")[0];
                return(
                  <div key={dia} title={pessoas.map(p=>p.userName).join(", ")} style={{minHeight:54,borderRadius:8,padding:"4px 5px",border:"1px solid "+(ehHoje?C.acc:C.bdr),background:pessoas.length>0?C.grnBg:C.s1,display:"flex",flexDirection:"column",gap:2}}>
                    <span style={{fontSize:11,fontWeight:ehHoje?800:600,color:ehHoje?C.acc:C.txm}}>{dia}</span>
                    {pessoas.slice(0,2).map(p=>{
                      const u=users.find(x=>x.id===p.userId);const col=SC[u?.setor]||C.grn;
                      return <div key={p.id} style={{fontSize:9,color:col,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",background:col+"15",borderRadius:4,padding:"1px 4px"}}>{p.userName.split(" ")[0]}</div>;
                    })}
                    {pessoas.length>2&&<div style={{fontSize:9,color:C.txd}}>+{pessoas.length-2}</div>}
                  </div>
                );
              })}
            </div>
          </Card>

          {feriasAprovadasVisiveis.filter(f=>{
            const ini=new Date(f.inicio),fim=new Date(f.fim);
            const inicioMes=new Date(anoCalendario,mesCalendario,1),fimMes=new Date(anoCalendario,mesCalendario+1,0);
            return ini<=fimMes&&fim>=inicioMes;
          }).length>0&&(
            <Card>
              <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Detalhe do mês</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {feriasAprovadasVisiveis.filter(f=>{
                  const ini=new Date(f.inicio),fim=new Date(f.fim);
                  const inicioMes=new Date(anoCalendario,mesCalendario,1),fimMes=new Date(anoCalendario,mesCalendario+1,0);
                  return ini<=fimMes&&fim>=inicioMes;
                }).map(f=>{
                  const u=users.find(x=>x.id===f.userId);const col=SC[u?.setor]||C.acc;
                  return(
                    <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:"1px solid "+C.bdr}}>
                      <Av name={f.userName} size={26} color={col}/>
                      <div style={{flex:1}}><span style={{fontSize:13,fontWeight:600}}>{f.userName}</span><span style={{fontSize:11,color:C.txd,marginLeft:8}}>{SL[u?.setor]}</span></div>
                      <span style={{fontSize:12,color:C.txm}}>{fd(f.inicio)} → {fd(f.fim)}</span>
                      {isRH&&<button onClick={()=>abrirEdicao(f)} style={{background:"none",border:"1px solid "+C.bdr,borderRadius:6,padding:"3px 8px",fontSize:10,color:C.txm,cursor:"pointer"}}>✎</button>}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}

      {tab==="pendencias"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {isRH&&pendencias.length>0&&(
            <Card style={{borderColor:C.purBg,background:C.purBg}}><div style={{fontSize:12,color:C.pur,fontWeight:600}}>🔑 Como RH, você pode aprovar ou rejeitar qualquer pedido abaixo, mesmo os que ainda aguardam líder ou gestor.</div></Card>
          )}
          {pendencias.length===0?<Card><div style={{color:C.txd,textAlign:"center",padding:18}}>Sem pendências.</div></Card>
          :pendencias.map(f=>{
            const u=users.find(x=>x.id===f.userId);const col=SC[u?.setor]||C.acc;
            return <Card key={f.id} style={{borderColor:C.acc+"35"}}>
              <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                <Av name={f.userName} size={40} color={col}/>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <div><div style={{fontWeight:700,fontSize:14}}>{f.userName}</div><div style={{fontSize:12,color:C.txm}}>{SL[u?.setor]} · {f.tipo==="30dias"?"30":"15"} dias</div></div>
                    <STag status={f.status}/>
                  </div>
                  <div style={{fontSize:12,color:C.txm,marginBottom:12}}>📅 {fd(f.inicio)} → {fd(f.fim)}{f.abono?" · 💰 Abono":""}</div>
                  {f.obs&&<div style={{fontSize:12,color:C.txd,fontStyle:"italic",marginBottom:12}}>"{f.obs}"</div>}
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <Btn v="success" sz="sm" onClick={()=>aprovar(f.id,"aprovado")}>✓ Aprovar</Btn>
                    <Btn v="danger" sz="sm" onClick={()=>aprovar(f.id,"rejeitado")}>✗ Rejeitar</Btn>
                    {isRH&&<Btn v="outline" sz="sm" onClick={()=>abrirEdicao(f)}>✎ Editar antes</Btn>}
                  </div>
                </div>
              </div>
            </Card>;
          })}
        </div>
      )}

      {tab==="vencimentos"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <Card style={{borderColor:C.amb+"35",background:C.ambBg}}><div style={{fontSize:13,color:C.amb,fontWeight:600}}>⚠ Colaboradores com período aquisitivo vencendo ou sem férias agendadas</div></Card>

          {vencimentosReais.length===0&&vencimentosEstimados.length===0?(
            <Card><div style={{color:C.txd,textAlign:"center",padding:18}}>Todos controlados.</div></Card>
          ):(
            <>
              {vencimentosReais.length>0&&(
                <>
                  <div style={{fontSize:11,color:C.txd,fontWeight:700,letterSpacing:".04em",textTransform:"uppercase",marginTop:4}}>Com dado da planilha de RH ({vencimentosReais.length})</div>
                  {vencimentosReais.sort((a,b)=>a.diasLimite-b.diasLimite).map(v=>{
                    const col=SC[v.setor]||C.acc;const vencido=v.diasLimite<0;const urgente=v.diasLimite<=30;
                    return(
                      <Card key={v.userId} style={{borderColor:vencido?C.red+"45":urgente?C.amb+"40":C.bdr}}>
                        <div style={{display:"flex",alignItems:"center",gap:14}}>
                          <Av name={v.nome} size={40} color={col}/>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:14}}>{v.nome}</div>
                            <div style={{fontSize:12,color:C.txm}}>{v.cargo} · {SL[v.setor]||v.setor}</div>
                            {v.obs&&<div style={{fontSize:11,color:C.txd,marginTop:3,fontStyle:"italic"}}>{v.obs}</div>}
                          </div>
                          <div style={{textAlign:"right"}}>
                            <Chip label={vencido?"Vencido há "+Math.abs(v.diasLimite)+"d":v.diasLimite+"d restantes"} color={vencido?C.red:urgente?C.amb:C.grn} dot/>
                            <div style={{fontSize:10,color:C.txd,marginTop:4}}>limite: {fd(v.limite)}</div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </>
              )}

              {vencimentosEstimados.length>0&&(
                <>
                  <div style={{fontSize:11,color:C.txd,fontWeight:700,letterSpacing:".04em",textTransform:"uppercase",marginTop:vencimentosReais.length>0?16:4}}>Estimado por tempo sem férias ({vencimentosEstimados.length})</div>
                  {vencimentosEstimados.map(v=>{
                    const col=SC[v.setor]||C.acc;const urgente=v.mesesSemFerias>=24;
                    return(
                      <Card key={v.userId} style={{borderColor:urgente?C.red+"40":C.amb+"40"}}>
                        <div style={{display:"flex",alignItems:"center",gap:14}}>
                          <Av name={v.nome} size={40} color={col}/>
                          <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{v.nome}</div><div style={{fontSize:12,color:C.txm}}>{SL[v.setor]} · {v.cargo}</div></div>
                          <div style={{textAlign:"right"}}><Chip label={v.mesesSemFerias+" meses"} color={urgente?C.red:C.amb} dot/>{urgente&&<div style={{fontSize:11,color:C.red,marginTop:4,fontWeight:600}}>⚠ Risco de perda</div>}</div>
                        </div>
                      </Card>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      )}

      <Modal open={modal} onClose={()=>setModal(false)} title="Solicitar Férias">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Sel label="Tipo" value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} options={[{value:"30dias",label:"30 dias"},{value:"15dias",label:"15 dias (fracionado)"}]}/>
          <Inp label="Data de Início" type="date" value={form.inicio} onChange={e=>setForm(f=>({...f,inicio:e.target.value}))}/>
          {form.fim&&<div style={{background:C.accBg,border:"1px solid "+C.acc+"30",borderRadius:9,padding:"10px 14px",fontSize:13,color:C.accLt}}>📅 Retorno: <strong>{fd(form.fim)}</strong></div>}
          <Inp label="Período Aquisitivo (ex: 2025/2026)" value={form.periodoAq} onChange={e=>setForm(f=>({...f,periodoAq:e.target.value}))} placeholder="2025/2026"/>
          <div style={{display:"flex",alignItems:"center",gap:10}}><input type="checkbox" checked={form.abono} onChange={e=>setForm(f=>({...f,abono:e.target.checked}))} style={{accentColor:C.acc,width:14,height:14}}/><label style={{fontSize:13,cursor:"pointer",color:C.txm}}>💰 Solicitar abono pecuniário (1/3)</label></div>
          <Tex label="Observações" value={form.obs} onChange={e=>setForm(f=>({...f,obs:e.target.value}))} placeholder="Opcional..."/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Btn v="outline" onClick={()=>setModal(false)}>Cancelar</Btn><Btn onClick={solicitar} disabled={!form.inicio||saving}>{saving?<Spin size={14} color="#fff"/>:null} Solicitar</Btn></div>
        </div>
      </Modal>

      {/* MODAL: Edição pelo RH (qualquer status) */}
      <Modal open={!!modalEdit} onClose={()=>setModalEdit(null)} title={"Editar — "+(modalEdit?.userName||"")} width={480}>
        {modalEdit&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:C.purBg,borderRadius:9,padding:"8px 14px",fontSize:11,color:C.pur}}>🔑 Edição de RH — fica registrada no histórico desta solicitação</div>
            <Sel label="Tipo" value={formEdit.tipo} onChange={e=>setFormEdit({...formEdit,tipo:e.target.value})} options={[{value:"30dias",label:"30 dias"},{value:"15dias",label:"15 dias (fracionado)"}]}/>
            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
              <Inp label="Início" type="date" value={formEdit.inicio} onChange={e=>setFormEdit({...formEdit,inicio:e.target.value})}/>
              <Inp label="Fim" type="date" value={formEdit.fim} onChange={e=>setFormEdit({...formEdit,fim:e.target.value})}/>
            </div>
            <Inp label="Período Aquisitivo" value={formEdit.periodoAq} onChange={e=>setFormEdit({...formEdit,periodoAq:e.target.value})} placeholder="2025/2026"/>
            <div style={{display:"flex",alignItems:"center",gap:10}}><input type="checkbox" checked={formEdit.abono} onChange={e=>setFormEdit({...formEdit,abono:e.target.checked})} style={{accentColor:C.acc,width:14,height:14}}/><label style={{fontSize:13,cursor:"pointer",color:C.txm}}>💰 Abono pecuniário</label></div>
            <Tex label="Observações" value={formEdit.obs} onChange={e=>setFormEdit({...formEdit,obs:e.target.value})}/>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <Btn v="outline" onClick={()=>setModalEdit(null)}>Cancelar</Btn>
              <Btn onClick={salvarEdicao} disabled={!formEdit.inicio||!formEdit.fim||savingEdit}>{savingEdit?<Spin size={14} color="#fff"/>:null} Salvar alterações</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Cancelamento pelo RH (de férias já aprovada) */}
      <Modal open={!!modalCancel} onClose={()=>{setModalCancel(null);setMotivoCancel("");}} title={"Cancelar férias — "+(modalCancel?.userName||"")} width={440}>
        {modalCancel&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:C.redBg,borderRadius:9,padding:"10px 14px",fontSize:12,color:C.red}}>⚠ Esta férias já está aprovada ({fd(modalCancel.inicio)} → {fd(modalCancel.fim)}). Cancelar é irreversível e ficará registrado.</div>
            <Tex label="Motivo do cancelamento *" value={motivoCancel} onChange={e=>setMotivoCancel(e.target.value)} placeholder="Explique o motivo do cancelamento..." rows={3}/>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <Btn v="outline" onClick={()=>{setModalCancel(null);setMotivoCancel("");}}>Voltar</Btn>
              <Btn v="danger" onClick={confirmarCancelamento} disabled={!motivoCancel.trim()||savingCancel}>{savingCancel?<Spin size={14} color="#fff"/>:null} Confirmar cancelamento</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// COMUNICADOS
function Comunicados({user,comunicados,setComunicados}){
  const[modal,setModal]=useState(false);const[form,setForm]=useState({titulo:"",corpo:"",tipo:"geral",setores:[],fixado:false});const[saving,setSaving]=useState(false);
  const tipos={geral:{l:"Geral",c:C.acc},urgente:{l:"Urgente",c:C.red},informativo:{l:"Informativo",c:C.blu},resultado:{l:"Resultado",c:C.grn}};
  
  const publicar=async()=>{
    setSaving(true);const sb=getSB();if(!sb){setSaving(false);return;}
    const{data}=await sb.from("comunicados").insert([{titulo:form.titulo,corpo:form.corpo,autor_id:user.id,autor_name:user.name,tipo:form.tipo,setores:form.setores,fixado:form.fixado}]).select().single();
    if(data){setComunicados(p=>[mcom(data),...p]);setModal(false);setForm({titulo:"",corpo:"",tipo:"geral",setores:[],fixado:false});}
    setSaving(false);
  };
  
  const deletar=async id=>{await getSB()?.from("comunicados").delete().eq("id",id);setComunicados(p=>p.filter(c=>c.id!==id));};
  const visiveis=comunicados.filter(c=>c.setores.length===0||c.setores.includes(user.setor)||can(user.role,"gestor"));
  
  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>Comunicados</div><div style={{fontSize:13,color:C.txm,marginTop:2}}>{visiveis.length} comunicado{visiveis.length!==1?"s":""}</div></div>
        {can(user.role,"gestor")&&<Btn onClick={()=>setModal(true)}>+ Publicar</Btn>}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {visiveis.length===0&&<Card><div style={{color:C.txd,textAlign:"center",padding:18}}>Nenhum comunicado.</div></Card>}
        {visiveis.map(c=>{const tp=tipos[c.tipo]||tipos.geral;return(
          <Card key={c.id} style={{borderLeft:"3px solid "+tp.c}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                  <Chip label={tp.l} color={tp.c} dot/>
                  {c.fixado&&<Chip label="📌 Fixado" color={C.acc}/>}
                  {c.setores.map(s=><Chip key={s} label={SL[s]||s} color={C.txm}/>)}
                  <span style={{fontSize:11,color:C.txd,marginLeft:"auto"}}>{fd((c.createdAt||"").split("T")[0])} · {c.autorName}</span>
                </div>
                <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>{c.titulo}</div>
                <div style={{fontSize:13,color:C.txm,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{c.corpo}</div>
              </div>
              {(user.id===c.autorId||can(user.role,"rh"))&&<button onClick={()=>deletar(c.id)} style={{background:"none",border:"none",color:C.txf,cursor:"pointer",fontSize:18,padding:4}}>✕</button>}
            </div>
          </Card>
        );})}
      </div>
      <Modal open={modal} onClose={()=>setModal(false)} title="Novo Comunicado" width={560}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Inp label="Título *" value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} placeholder="Título do comunicado"/>
          <Tex label="Conteúdo *" value={form.corpo} onChange={e=>setForm({...form,corpo:e.target.value})} rows={6} placeholder="Escreva o comunicado..."/>
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
            <Sel label="Tipo" value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})} options={Object.entries(tipos).map(([k,v])=>({value:k,label:v.l}))}/>
            <div><label style={{fontSize:11,color:C.txm,fontWeight:600,letterSpacing:".05em",textTransform:"uppercase",display:"block",marginBottom:5}}>SETORES</label>
              <select multiple value={form.setores} onChange={e=>setForm({...form,setores:Array.from(e.target.selectedOptions).map(o=>o.value)})} style={{background:C.s1,border:"1px solid "+C.bdr,borderRadius:9,padding:6,color:C.txt,fontSize:12,width:"100%",height:76}}>
                {Object.entries(SL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}><input type="checkbox" checked={form.fixado} onChange={e=>setForm({...form,fixado:e.target.checked})} style={{accentColor:C.acc,width:14,height:14}}/><label style={{fontSize:13,cursor:"pointer",color:C.txm}}>📌 Fixar no dashboard</label></div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Btn v="outline" onClick={()=>setModal(false)}>Cancelar</Btn><Btn onClick={publicar} disabled={!form.titulo||!form.corpo||saving}>{saving?<Spin size={14} color="#fff"/>:null} Publicar</Btn></div>
        </div>
      </Modal>
    </div>
  );
}

// EXAMES
function Exames({user,users,exames,setExames,criarTarefaAuto}){
  const[modal,setModal]=useState(false);const[form,setForm]=useState({userId:"",tipo:"admissional",data:"",local:"",obs:""});const[saving,setSaving]=useState(false);const[filtro,setFiltro]=useState("todos");
  
  const salvar=async()=>{
    setSaving(true);const sb=getSB();if(!sb){setSaving(false);return;}
    const u=users.find(x=>x.id===parseInt(form.userId));
    const{data}=await sb.from("exames").insert([{user_id:form.userId?parseInt(form.userId):null,user_name:u?.name||"Externo",tipo:form.tipo,data_agendada:form.data||null,local:form.local,status:"agendado",observacoes:form.obs}]).select().single();
    if(data){
      setExames(p=>[mex(data),...p]);
      setModal(false);
      setForm({userId:"",tipo:"admissional",data:"",local:"",obs:""});
      if(criarTarefaAuto) criarTarefaAuto(`Exame ${form.tipo}: ${u?.name||"Candidato"}`, `Data: ${fd(form.data)}\nLocal: ${form.local}`, "baixa", ["exame"], "exames", data.id);
    }
    setSaving(false);
  };
  
  const mudarStatus=async(id,status)=>{await getSB()?.from("exames").update({status}).eq("id",id);setExames(p=>p.map(e=>e.id===id?{...e,status}:e));};
  const filtrados=filtro==="todos"?exames:exames.filter(e=>e.tipo===filtro);
  const proximos=exames.filter(e=>{if(e.status!=="agendado"||!e.data)return false;const d=dU(e.data);return d!==null&&d>=0&&d<=7;});
  
  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div><div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>Exames Ocupacionais</div><div style={{fontSize:13,color:C.txm,marginTop:2}}>Admissionais, demissionais e periódicos</div></div>
        {can(user.role,"gestor")&&<Btn onClick={()=>setModal(true)}>+ Agendar</Btn>}
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {["todos","admissional","demissional","periodico"].map(f=><button key={f} onClick={()=>setFiltro(f)} style={{padding:"6px 14px",borderRadius:8,border:"1px solid "+(filtro===f?C.acc:C.bdr),background:filtro===f?C.accBg:"transparent",color:filtro===f?C.acc:C.txm,fontSize:12,fontWeight:600,cursor:"pointer",transition:"all .15s"}}>{f==="todos"?"Todos":f.charAt(0).toUpperCase()+f.slice(1)}</button>)}
      </div>
      {proximos.length>0&&(
        <Card style={{borderColor:C.blu+"40",background:C.bluBg}}>
          <div style={{fontSize:13,fontWeight:700,color:C.blu,marginBottom:10}}>📅 Próximos 7 dias — {proximos.length} exame{proximos.length>1?"s":""}</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {proximos.map(e=><div key={e.id} style={{background:C.bgCard,borderRadius:9,padding:"8px 14px",border:"1px solid "+C.bdr}}><div style={{fontWeight:600,fontSize:13}}>{e.userName}</div><div style={{fontSize:11,color:C.txm}}>{e.tipo} · {fd(e.data)}</div>{e.local&&<div style={{fontSize:11,color:C.txd}}>📍 {e.local}</div>}</div>)}
          </div>
        </Card>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtrados.length===0&&<Card><div style={{color:C.txd,textAlign:"center",padding:18}}>Nenhum exame.</div></Card>}
        {filtrados.map(e=>{
          const u=users.find(x=>x.id===e.userId);const col=SC[u?.setor]||C.acc;const d=e.data?dU(e.data):null;const ov=d!==null&&d<0&&e.status==="agendado";
          return <Card key={e.id} style={{borderLeft:"3px solid "+(e.tipo==="admissional"?C.grn:C.red)}}>
            <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
              <Av name={e.userName} size={40} color={col}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                  <div><div style={{fontWeight:700,fontSize:14}}>{e.userName}</div><div style={{marginTop:3}}><Chip label={e.tipo.charAt(0).toUpperCase()+e.tipo.slice(1)} color={e.tipo==="admissional"?C.grn:C.red}/></div></div>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    {e.data&&<span style={{fontSize:12,color:ov?C.red:C.txm}}>📅 {fd(e.data)}{d!==null&&!ov&&d<=7?" (em "+d+"d)":ov?" (atrasado)":""}</span>}
                    {e.local&&<span style={{fontSize:12,color:C.txd}}>📍 {e.local}</span>}
                    <STag status={e.status}/>
                  </div>
                </div>
                {e.obs&&<div style={{fontSize:12,color:C.txd,marginTop:6,fontStyle:"italic"}}>"{e.obs}"</div>}
              </div>
              {can(user.role,"gestor")&&e.status==="agendado"&&(
                <div style={{display:"flex",gap:6}}>
                  <Btn v="success" sz="sm" onClick={()=>mudarStatus(e.id,"realizado")}>✓ Realizado</Btn>
                  <Btn v="danger" sz="sm" onClick={()=>mudarStatus(e.id,"cancelado")}>✕ Cancelar</Btn>
                </div>
              )}
            </div>
          </Card>;
        })}
      </div>
      <Modal open={modal} onClose={()=>setModal(false)} title="Agendar Exame">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Sel label="Tipo" value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})} options={[{value:"admissional",label:"🟢 Admissional"},{value:"demissional",label:"🔴 Demissional"},{value:"periodico",label:"🔵 Periódico"},{value:"retorno",label:"🟡 Retorno ao Trabalho"}]}/>
          <Sel label="Colaborador" value={form.userId} onChange={e=>setForm({...form,userId:e.target.value})} options={[{value:"",label:"Selecione ou deixe em branco"},...users.map(u=>({value:u.id,label:u.name}))]}/>
          <Inp label="Data" type="date" value={form.data} onChange={e=>setForm({...form,data:e.target.value})}/>
          <Inp label="Local / Clínica" value={form.local} onChange={e=>setForm({...form,local:e.target.value})} placeholder="Nome e endereço"/>
          <Tex label="Observações" value={form.obs} onChange={e=>setForm({...form,obs:e.target.value})} placeholder="Instruções especiais..."/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Btn v="outline" onClick={()=>setModal(false)}>Cancelar</Btn><Btn onClick={salvar} disabled={saving}>{saving?<Spin size={14} color="#fff"/>:null} Agendar</Btn></div>
        </div>
      </Modal>
    </div>
  );
}

// BANCO DE TALENTOS
function BancoTalentos({user,talentos,setTalentos,candidates,setCandidates,showToast}){
  const[busca,setBusca]=useState("");const[sel,setSel]=useState(null);const[emailModal,setEmailModal]=useState(null);const[emailTxt,setEmailTxt]=useState("");const[genLoad,setGenLoad]=useState(false);const[sendingEmail,setSendingEmail]=useState(false);
  const filtrados=talentos.filter(t=>{const b=busca.toLowerCase();return t.name.toLowerCase().includes(b)||t.role.toLowerCase().includes(b)||t.habs.some(h=>h.toLowerCase().includes(b));});
  
  const archivar=async c=>{
    const sb=getSB();if(!sb)return;
    const{data}=await sb.from("banco_talentos").insert([{candidato_id:c.id,name:c.name,email:c.email,phone:c.phone,role:c.role,vaga_id:c.vaga?.replace("#",""),score:c.score,habilidades:c.habilidades,resumo:c.resumo,motivo_arquivo:"Não selecionado — pipeline"}]).select().single();
    if(data){setTalentos(p=>[mtal(data),...p]);await sb.from("candidatos").update({no_banco_talentos:true}).eq("id",c.id);setCandidates(p=>p.map(x=>x.id===c.id?{...x,noBanco:true}:x));}
  };
  
  const remover=async id=>{await getSB()?.from("banco_talentos").delete().eq("id",id);setTalentos(p=>p.filter(t=>t.id!==id));};
  
  const gerarEmail=async t=>{
    setGenLoad(true);
    const prompt = `Escreva um e-mail profissional, acolhedor e MUITO CURTO (máximo 2 parágrafos) para ${t.name}, do banco de talentos da Kalenborn International. Surgiu uma nova oportunidade para a área de ${t.role}. Verifique o interesse e disponibilidade. OBRIGATÓRIO: Insira os marcadores exatos '[INSERIR DATA]' e '[INSERIR HORÁRIO]' no texto para sugerir uma conversa inicial. Assine: Equipe de Talentos — Kalenborn International.`;
    const r=await gpt([{role:"user",content:prompt}]);
    setEmailTxt(r);setGenLoad(false);
  };
  
  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div><div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>♦ Banco de Talentos</div><div style={{fontSize:13,color:C.txm,marginTop:2}}>{talentos.length} perfil{talentos.length!==1?"is":""} arquivado{talentos.length!==1?"s":""}</div></div>
      </div>
      {candidates.filter(c=>c.status==="rejeitado"&&!c.noBanco).length>0&&(
        <Card style={{borderColor:C.acc+"30"}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:10,color:C.accLt}}>⊕ Candidatos rejeitados para arquivar</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {candidates.filter(c=>c.status==="rejeitado"&&!c.noBanco).map(c=>(
              <div key={c.id} style={{background:C.s1,borderRadius:9,padding:"8px 14px",border:"1px solid "+C.bdr,display:"flex",alignItems:"center",gap:10}}>
                <Av name={c.name} size={26} color={C.txm}/>
                <div><div style={{fontSize:12,fontWeight:600}}>{c.name}</div><div style={{fontSize:11,color:C.txd}}>{c.role}</div></div>
                <Btn sz="sm" v="outline" onClick={()=>archivar(c)}>→ Arquivar</Btn>
              </div>
            ))}
          </div>
        </Card>
      )}
      <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar por nome, cargo ou habilidade..." style={{background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:10,padding:"10px 14px",color:C.txt,fontSize:13,width:"100%"}}/>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtrados.length===0&&<Card><div style={{color:C.txd,textAlign:"center",padding:18}}>Nenhum talento arquivado.</div></Card>}
        {filtrados.map(t=>(
          <Card key={t.id} style={{cursor:"pointer",borderLeft:"3px solid "+C.pur}} onClick={()=>setSel(sel?.id===t.id?null:t)}>
            <div style={{display:"flex",gap:14,alignItems:"center"}}>
              <Av name={t.name} size={40} color={C.pur}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                  <div><div style={{fontWeight:700,fontSize:14}}>{t.name}</div><div style={{fontSize:12,color:C.txm}}>{t.role} · Pontuação: <span style={{color:t.score>=80?C.grn:t.score>=60?C.amb:C.red,fontWeight:700}}>{t.score}</span></div></div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{t.habs.slice(0,3).map(h=><Chip key={h} label={h} color={C.pur}/>)}{t.habs.length>3&&<Chip label={"+"+(t.habs.length-3)} color={C.txm}/>}</div>
                </div>
              </div>
            </div>
            {sel?.id===t.id&&(
              <div className="fadeIn" style={{marginTop:14,paddingTop:14,borderTop:"1px solid "+C.bdr}}>
                {t.resumo&&<div style={{fontSize:13,color:C.txm,marginBottom:12}}>{t.resumo}</div>}
                <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:10,marginBottom:12,fontSize:12,color:C.txm}}>
                  {t.email&&<span>📧 {t.email}</span>}{t.phone&&<span>📱 {t.phone}</span>}
                  {t.motivo&&<span style={{gridColumn:"1/-1"}}>📋 {t.motivo}</span>}
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <Btn sz="sm" onClick={()=>{setEmailModal(t);setEmailTxt("");gerarEmail(t);}}>✉ Recontatar por Email</Btn>
                  {t.email&&<Btn sz="sm" v="outline" onClick={()=>window.open("https://wa.me/"+t.phone?.replace(/\D/g,""),"_blank")}>💬 WhatsApp</Btn>}
                  <Btn sz="sm" v="danger" onClick={()=>remover(t.id)}>✕ Remover</Btn>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
      <Modal open={!!emailModal} onClose={()=>setEmailModal(null)} title={"E-mail — "+(emailModal?.name||"")} width={600}>
        {genLoad?<div style={{display:"flex",justifyContent:"center",padding:36}}><Spin/></div>
        :<div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Tex value={emailTxt} onChange={e=>setEmailTxt(e.target.value)} rows={10}/>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn sz="sm" v="outline" onClick={()=>setEmailModal(null)}>Fechar</Btn>
            <Btn sz="sm" onClick={()=>navigator.clipboard.writeText(emailTxt)}>📋 Copiar</Btn>
            <Btn sz="sm" disabled={sendingEmail} onClick={async()=>{
              setSendingEmail(true);
              const res=await sendPAEmail(emailModal?.email, "Oportunidade Kalenborn", emailTxt);
              setSendingEmail(false);
              if(res.ok){showToast?.("E-mail enviado para "+emailModal?.email,"success");setEmailModal(null);}
              else{showToast?.(res.error||"Falha ao enviar e-mail.","error");}
            }}>{sendingEmail?<Spin size={12} color="#fff"/>:"✉ Enviar via Automate"}</Btn>
          </div>
        </div>}
      </Modal>
    </div>
  );
}

// RECRUTAMENTO
function Recrutamento({user,candidates,setCandidates,talentos,setTalentos,vagas,showToast}){
  const[fVaga,setFVaga]=useState("todos");const[fStatus,setFStatus]=useState("todos");const[sel,setSel]=useState(null);const[emailModal,setEmailModal]=useState(null);const[emailTxt,setEmailTxt]=useState("");const[genLoad,setGenLoad]=useState(false);const[sendingEmail,setSendingEmail]=useState(false);
  const COLS={aprovado:{l:"Aprovados",c:C.grn},revisao:{l:"Em Revisão",c:C.blu},pendente:{l:"Pendentes",c:C.amb},rejeitado:{l:"Rejeitados",c:C.red}};
  const filtrado=candidates.filter(c=>(fVaga==="todos"||c.vaga==="#"+fVaga)&&(fStatus==="todos"||c.status===fStatus));
  
  const updStatus=async(id,s)=>{await getSB()?.from("candidatos").update({status:s}).eq("id",id);setCandidates(p=>p.map(c=>c.id===id?{...c,status:s}:c));};
  const marcarEmail=async id=>{await getSB()?.from("candidatos").update({email_enviado:true,email_enviado_at:new Date().toISOString()}).eq("id",id);setCandidates(p=>p.map(c=>c.id===id?{...c,emailEnviado:true}:c));};
  
  const gerarEmail=async(c,tipo)=>{
    setGenLoad(true);const v=vagas.find(x=>"#"+x.id===c.vaga);
    const prompt = `Escreva um e-mail de RH ${tipo==="aprovado"?"de aprovação para avançar no processo (convite para entrevista)":tipo==="rejeitado"?"de agradecimento gentil sem aprovação":"solicitando documentos"} para ${c.name}, candidato(a) para ${v?.title||c.role} na Kalenborn. SEJA MUITO CURTO E DIRETO (máximo 2 parágrafos curtos). ${tipo==="aprovado"?"OBRIGATÓRIO: Insira os marcadores exatos '[INSERIR DATA]' e '[INSERIR HORÁRIO]' no texto para que o recrutador preencha depois.":""} Assine: Equipe de Recrutamento — Kalenborn International.`;
    const r=await gpt([{role:"user",content:prompt}]);
    setEmailTxt(r);setGenLoad(false);
  };
  
  const moverBanco=async c=>{
    const sb=getSB();if(!sb)return;
    const{data}=await sb.from("banco_talentos").insert([{candidato_id:c.id,name:c.name,email:c.email,phone:c.phone,role:c.role,vaga_id:c.vaga?.replace("#",""),score:c.score,habilidades:c.habilidades,resumo:c.resumo,motivo_arquivo:"Não selecionado neste processo"}]).select().single();
    if(data){setTalentos(p=>[mtal(data),...p]);await sb.from("candidatos").update({no_banco_talentos:true}).eq("id",c.id);setCandidates(p=>p.map(x=>x.id===c.id?{...x,noBanco:true}:x));}
  };
  
  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20}}>
      <div><div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>Recrutamento & Seleção</div><div style={{fontSize:13,color:C.txm,marginTop:2}}>{candidates.length} candidatos · Análise via IA</div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10}}>
        {Object.entries(COLS).map(([k,v])=><div key={k} style={{background:C.bgCard,border:"1px solid "+C.bdr,borderTop:"2px solid "+v.c,borderRadius:12,padding:"12px 16px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:v.c,fontFamily:"'JetBrains Mono',monospace"}}>{candidates.filter(c=>c.status===k).length}</div><div style={{fontSize:11,color:C.txd,marginTop:2}}>{v.l}</div></div>)}
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <select value={fVaga} onChange={e=>setFVaga(e.target.value)} style={{background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:9,padding:"8px 13px",color:C.txt,fontSize:12}}><option value="todos">Todas as Vagas</option>{vagas.map(v=><option key={v.id} value={v.id}>#{v.id} — {v.title}</option>)}</select>
        <select value={fStatus} onChange={e=>setFStatus(e.target.value)} style={{background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:9,padding:"8px 13px",color:C.txt,fontSize:12}}><option value="todos">Todas as Situações</option>{Object.entries(COLS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtrado.sort((a,b)=>b.score-a.score).map(c=>{
          const cfg=COLS[c.status]||COLS.pendente;
          return <Card key={c.id} style={{borderLeft:"3px solid "+cfg.c,cursor:"pointer"}} onClick={()=>setSel(sel?.id===c.id?null:c)}>
            <div style={{display:"flex",gap:14,alignItems:"center"}}>
              <Av name={c.name} size={40} color={cfg.c}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:8}}>{c.name}{c.emailEnviado&&<Chip label="✉ E-mail" color={C.grn}/>}{c.noBanco&&<Chip label="♦ Banco" color={C.pur}/>}</div>
                    <div style={{fontSize:12,color:C.txm}}>{c.role} · {c.vaga}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:24,fontWeight:700,color:c.score>=80?C.grn:c.score>=60?C.amb:C.red,fontFamily:"'JetBrains Mono',monospace"}}>{c.score}</span><Chip label={cfg.l} color={cfg.c} dot/></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8,marginTop:10}}>
                  {[["Técnico",c.tech],["Comportamental",c.behavior]].map(([l,v])=>(
                    <div key={l}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:11,color:C.txd}}>{l}</span><span style={{fontSize:11,color:C.acc,fontFamily:"'JetBrains Mono',monospace"}}>{v}</span></div><div style={{height:3,background:C.s3,borderRadius:3}}><div style={{height:"100%",width:v+"%",borderRadius:3,background:C.acc}}/></div></div>
                  ))}
                </div>
              </div>
            </div>
            {sel?.id===c.id&&(
              <div className="fadeIn" style={{marginTop:14,paddingTop:14,borderTop:"1px solid "+C.bdr}}>
                <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:10,marginBottom:12,fontSize:12,color:C.txm}}>
                  <span>📧 {c.email||"—"}</span><span>📱 {c.phone||"—"}</span>
                  <span>💰 {c.salarioPret||"—"}</span><span>♿ PcD: {c.pcd?"Sim":"Não"}</span>
                </div>
                {c.resumo&&<div style={{fontSize:12,color:C.txm,marginBottom:12,lineHeight:1.5}}>{c.resumo}</div>}
                {c.habilidades?.length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>{c.habilidades.map(h=><Chip key={h} label={h} color={C.acc}/>)}</div>}
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {["aprovado","revisao","rejeitado"].map(s=><Btn key={s} sz="sm" v={s==="aprovado"?"success":s==="rejeitado"?"danger":"outline"} onClick={e=>{e.stopPropagation();updStatus(c.id,s);}}>{s==="aprovado"?"✓ Aprovar":s==="rejeitado"?"✗ Rejeitar":"↺ Revisão"}</Btn>)}
                  <Btn sz="sm" v="outline" onClick={e=>{e.stopPropagation();setEmailModal(c);setEmailTxt("");gerarEmail(c,c.status);}}>✉ Gerar Email</Btn>
                  {c.status==="rejeitado"&&!c.noBanco&&<Btn sz="sm" v="ghost" onClick={e=>{e.stopPropagation();moverBanco(c);}}>♦ Banco</Btn>}
                </div>
              </div>
            )}
          </Card>;
        })}
        {filtrado.length===0&&<Card><div style={{color:C.txd,textAlign:"center",padding:18}}>Nenhum candidato.</div></Card>}
      </div>
      <Modal open={!!emailModal} onClose={()=>setEmailModal(null)} title={"E-mail — "+(emailModal?.name||"")} width={600}>
        {genLoad?<div style={{display:"flex",justifyContent:"center",padding:36}}><Spin/></div>
        :<div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Tex value={emailTxt} onChange={e=>setEmailTxt(e.target.value)} rows={10}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {["aprovado","rejeitado","documentos"].map(t=><Btn key={t} sz="sm" v="outline" onClick={()=>gerarEmail(emailModal,t)}>{t==="aprovado"?"Aprovação":t==="rejeitado"?"Rejeição":"Documentos"}</Btn>)}
            <div style={{flex:1}}/>
            <Btn sz="sm" v="outline" onClick={()=>navigator.clipboard.writeText(emailTxt)}>📋 Copiar</Btn>
            <Btn sz="sm" disabled={sendingEmail} onClick={async()=>{
              setSendingEmail(true);
              const res=await sendPAEmail(emailModal?.email, "Kalenborn International - Processo Seletivo", emailTxt);
              setSendingEmail(false);
              if(res.ok){marcarEmail(emailModal.id);showToast?.("E-mail enviado para "+emailModal?.email,"success");setEmailModal(null);}
              else{showToast?.(res.error||"Falha ao enviar e-mail.","error");}
            }}>{sendingEmail?<Spin size={12} color="#fff"/>:"✉ Enviar Automático"}</Btn>
          </div>
        </div>}
      </Modal>
    </div>
  );
}

// CHAT
function Chat({user,users,chat,setChat}){
  const[sel,setSel]=useState(null);const[msg,setMsg]=useState("");const[sending,setSending]=useState(false);const[sug,setSug]=useState(null);const[sugLoad,setSugLoad]=useState(false);
  const endRef=useRef(null);
  const contatos=isRHouDev(user.role)?users.filter(u=>u.id!==user.id):users.filter(u=>(u.role==="rh")&&u.id!==user.id);
  const conv=sel?chat.filter(m=>(m.fromId===user.id&&m.toId===sel.id)||(m.fromId===sel.id&&m.toId===user.id)).sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||"")):[];
  const unread=cId=>chat.filter(m=>m.fromId===cId&&m.toId===user.id&&!m.lido).length;
  const total=chat.filter(m=>m.toId===user.id&&!m.lido).length;
  
  useEffect(()=>{if(sel){getSB()?.from("chat").update({lido:true}).eq("to_id",user.id).eq("from_id",sel.id).eq("lido",false);setChat(p=>p.map(m=>m.fromId===sel.id&&m.toId===user.id?{...m,lido:true}:m));}},[sel]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[conv.length]);
  
  const enviar=async txt=>{
    if(!txt.trim()||!sel)return;setSending(true);
    const{data}=await getSB()?.from("chat").insert([{from_id:user.id,from_name:user.name,to_id:sel.id,to_name:sel.name,texto:txt.trim(),lido:false}]).select().single()||{};
    if(data){setChat(p=>[...p,mch(data)]);setMsg("");setSug(null);}setSending(false);
  };
  
  const melhorar=async()=>{if(!msg.trim())return;setSugLoad(true);const r=await ai([{role:"user",content:"Melhore profissionalmente. Responda APENAS com a mensagem melhorada:\n\""+msg+"\""}]);setSug(r.trim());setSugLoad(false);};
  
  return(
    <div className="fadeUp" style={{display:"flex",gap:0,height:600,background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:16,overflow:"hidden"}}>
      <div style={{width:230,borderRight:"1px solid "+C.bdr,display:"flex",flexDirection:"column",background:C.bgAlt}}>
        <div style={{padding:"14px 16px",borderBottom:"1px solid "+C.bdr,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:14,fontWeight:700}}>Mensagens</span>
          {total>0&&<span style={{background:C.acc,color:"#fff",fontSize:10,fontWeight:700,borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center"}}>{total}</span>}
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {contatos.map(c=>{
            const ur=unread(c.id);const last=chat.filter(m=>(m.fromId===c.id&&m.toId===user.id)||(m.fromId===user.id&&m.toId===c.id)).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""))[0];const isS=sel?.id===c.id;
            return <div key={c.id} onClick={()=>setSel(c)} style={{padding:"10px 14px",cursor:"pointer",background:isS?C.s2:"transparent",borderLeft:isS?"2px solid "+C.acc:"2px solid transparent",transition:"all .15s"}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <Av name={c.name} size={30} color={SC[c.setor]||C.acc}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name.split(" ").slice(0,2).join(" ")}</span>
                    {ur>0&&<span style={{background:C.acc,color:"#fff",fontSize:9,fontWeight:700,borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{ur}</span>}
                  </div>
                  {last&&<div style={{fontSize:10,color:C.txd,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:1}}>{last.fromId===user.id?"Você: ":""}{last.texto}</div>}
                </div>
              </div>
            </div>;
          })}
        </div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column"}}>
        {!sel?<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10,color:C.txd}}><span style={{fontSize:36}}>✉</span><div style={{fontSize:14}}>Selecione uma conversa</div></div>
        :<>
          <div style={{padding:"12px 20px",borderBottom:"1px solid "+C.bdr,display:"flex",alignItems:"center",gap:12}}>
            <Av name={sel.name} size={32} color={SC[sel.setor]||C.acc}/>
            <div><div style={{fontWeight:700,fontSize:14}}>{sel.name}</div><div style={{fontSize:11,color:C.txd}}>{sel.cargo||SL[sel.setor]}</div></div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:10}}>
            {conv.length===0&&<div style={{textAlign:"center",color:C.txd,fontSize:13,marginTop:36}}>Sem mensagens ainda.</div>}
            {conv.map(m=>{
              const mine=m.fromId===user.id;
              return <div key={m.id} style={{display:"flex",justifyContent:mine?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"70%",padding:"9px 14px",borderRadius:14,borderBottomRightRadius:mine?3:14,borderBottomLeftRadius:mine?14:3,background:mine?"linear-gradient(135deg,"+C.acc+","+C.accDk+")":C.s2,color:mine?"#fff":C.txt}}>
                  <div style={{fontSize:13,lineHeight:1.5}}>{m.texto}</div>
                  <div style={{fontSize:10,opacity:.5,marginTop:3,textAlign:"right"}}>{(m.createdAt||"").substring(11,16)}</div>
                </div>
              </div>;
            })}
            <div ref={endRef}/>
          </div>
          {sug&&<div style={{margin:"0 16px 8px",background:C.accBg,border:"1px solid "+C.acc+"35",borderRadius:10,padding:"10px 14px"}}>
            <div style={{fontSize:11,color:C.acc,fontWeight:600,marginBottom:6}}>✦ Sugestão IA</div>
            <div style={{fontSize:13,color:C.txt,marginBottom:8}}>{sug}</div>
            <div style={{display:"flex",gap:6}}><Btn sz="sm" onClick={()=>{setMsg(sug);setSug(null);}}>Usar</Btn><Btn sz="sm" v="ghost" onClick={()=>setSug(null)}>✕</Btn></div>
          </div>}
          <div style={{padding:"10px 16px",borderTop:"1px solid "+C.bdr,display:"flex",gap:8,alignItems:"flex-end"}}>
            <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Mensagem..." onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();enviar(msg);}}} style={{flex:1,background:C.s2,border:"1px solid "+C.bdr,borderRadius:10,padding:"9px 13px",color:C.txt,fontSize:13,resize:"none",minHeight:40,maxHeight:100}}/>
            <button onClick={melhorar} disabled={!msg.trim()||sugLoad} title="Melhorar com IA" style={{padding:"9px 12px",background:C.s2,border:"1px solid "+C.acc+"40",borderRadius:9,color:C.acc,cursor:"pointer",fontSize:14}}>{sugLoad?<Spin size={14}/>:"✦"}</button>
            <button onClick={()=>enviar(msg)} disabled={!msg.trim()||sending} style={{padding:"9px 16px",background:"linear-gradient(135deg,"+C.acc+","+C.accDk+")",border:"none",borderRadius:9,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>{sending?<Spin size={14} color="#fff"/>:"↑"}</button>
          </div>
        </>}
      </div>
    </div>
  );
}

// FEEDBACKS
function Feedbacks({user,users,feedbacks,setFeedbacks}){
  const[modal,setModal]=useState(false);const[saving,setSaving]=useState(false);const[form,setForm]=useState({toId:"",tipo:"desempenho",texto:"",sigiloso:false});
  const tipos={desempenho:{l:"Desempenho",c:C.blu},desenvolvimento:{l:"Desenvolvimento",c:C.acc},comportamento:{l:"Comportamento",c:C.amb},reconhecimento:{l:"Reconhecimento",c:C.grn}};
  const destinos=users.filter(u=>u.id!==user.id);
  const visiveis=feedbacks.filter(f=>isRHouDev(user.role)||(!f.sigiloso&&(f.fromId===user.id||f.toId===user.id))||(f.sigiloso&&(f.fromId===user.id||can(user.role,"gestor")))).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
  
  const enviar=async()=>{
    if(!form.toId||!form.texto.trim())return;setSaving(true);const sb=getSB();if(!sb){setSaving(false);return;}
    const dest=users.find(u=>u.id===parseInt(form.toId));
    const{data}=await sb.from("feedbacks").insert([{from_id:user.id,from_name:user.name,from_role:user.role,to_id:parseInt(form.toId),to_name:dest?.name||"",to_role:dest?.role||"",tipo:form.tipo,texto:form.texto,sigiloso:form.sigiloso}]).select().single();
    if(data){setFeedbacks(p=>[mfb(data),...p]);setModal(false);setForm({toId:"",tipo:"desempenho",texto:"",sigiloso:false});}
    setSaving(false);
  };
  
  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>Feedbacks</div><div style={{fontSize:13,color:C.txm,marginTop:2}}>{visiveis.length} registro{visiveis.length!==1?"s":""}</div></div><Btn onClick={()=>setModal(true)}>+ Novo</Btn></div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {visiveis.length===0&&<Card><div style={{color:C.txd,textAlign:"center",padding:18}}>Nenhum feedback ainda.</div></Card>}
        {visiveis.map(f=>{const cfg=tipos[f.tipo]||tipos.desempenho;return(
          <Card key={f.id} style={{borderLeft:"3px solid "+cfg.c}}>
            <div style={{display:"flex",gap:12}}>
              <Av name={f.fromName} size={36} color={cfg.c}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:6}}>
                  <div><span style={{fontWeight:700}}>{f.fromName.split(" ")[0]}</span><span style={{color:C.txd}}> → </span><span style={{fontWeight:700}}>{f.toName.split(" ")[0]}</span></div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}><Chip label={cfg.l} color={cfg.c} dot/>{f.sigiloso&&<Chip label="🔒 Sigiloso" color={C.red}/>}<span style={{fontSize:11,color:C.txd}}>{fd((f.createdAt||"").split("T")[0])}</span></div>
                </div>
                <div style={{fontSize:13,color:C.txm,lineHeight:1.6}}>{f.texto}</div>
              </div>
            </div>
          </Card>
        );})}
      </div>
      <Modal open={modal} onClose={()=>setModal(false)} title="Novo Feedback">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Sel label="Para" value={form.toId} onChange={e=>setForm({...form,toId:e.target.value})} options={[{value:"",label:"Selecione..."},...destinos.map(u=>({value:u.id,label:u.name}))]}/>
          <Sel label="Tipo" value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})} options={Object.entries(tipos).map(([k,v])=>({value:k,label:v.l}))}/>
          <Tex label="Mensagem" value={form.texto} onChange={e=>setForm({...form,texto:e.target.value})} rows={4} placeholder="Escreva seu feedback..."/>
          <div style={{display:"flex",alignItems:"center",gap:10}}><input type="checkbox" checked={form.sigiloso} onChange={e=>setForm({...form,sigiloso:e.target.checked})} style={{accentColor:C.acc,width:14,height:14}}/><label style={{fontSize:13,cursor:"pointer",color:C.txm}}>🔒 Sigiloso</label></div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Btn v="outline" onClick={()=>setModal(false)}>Cancelar</Btn><Btn onClick={enviar} disabled={!form.toId||!form.texto.trim()||saving}>{saving?<Spin size={14} color="#fff"/>:null} Enviar</Btn></div>
        </div>
      </Modal>
    </div>
  );
}

// AVALIAÇÕES
function Avaliacoes({user,users,avaliacoes,setAvaliacoes}){
  const[tab,setTab]=useState("historico");const[modal,setModal]=useState(null);const[fn,setFn]=useState({qualidade:3,produtividade:3,trabalhoEquipe:3,pontualidade:3,iniciativa:3,comentario:""});const[saving,setSaving]=useState(false);
  const periodo=new Date().getMonth()<6?"2026-S1":"2026-S2";
  const CRIT=[{k:"qualidade",l:"Qualidade",i:"◉"},{k:"produtividade",l:"Produtividade",i:"⚡"},{k:"trabalhoEquipe",l:"Trabalho em Equipe",i:"◈"},{k:"pontualidade",l:"Pontualidade",i:"◷"},{k:"iniciativa",l:"Iniciativa",i:"★"}];
  const getM=n=>(Object.values(n).filter(v=>typeof v==="number").reduce((a,b)=>a+b,0)/5).toFixed(1);
  const getC=n=>{const v=parseFloat(n);return v>=4.5?C.grn:v>=3.5?C.amb:v>=2.5?C.blu:C.red;};
  const eq=user.role==="lider"?users.filter(u=>u.liderId===user.id):user.role==="gestor"?users.filter(u=>u.gestorId===user.id&&u.role!=="gestor"):[];
  const hist=isRHouDev(user.role)?avaliacoes:user.role==="gestor"?avaliacoes.filter(a=>users.find(u=>u.id===a.avaliadoId)?.gestorId===user.id):user.role==="lider"?avaliacoes.filter(a=>a.avaliadorId===user.id||a.avaliadoId===user.id):avaliacoes.filter(a=>a.avaliadoId===user.id);
  
  const salvar=async()=>{
    setSaving(true);const sb=getSB();if(!sb){setSaving(false);return;}
    const av=users.find(u=>u.id===modal.avaliadoId);
    const{data}=await sb.from("avaliacoes").insert([{avaliado_id:modal.avaliadoId,avaliado_name:av?.name||"",avaliador_id:user.id,avaliador_name:user.name,periodo,status:"concluida",nota_qualidade:fn.qualidade,nota_produtividade:fn.produtividade,nota_trabalho_equipe:fn.trabalhoEquipe,nota_pontualidade:fn.pontualidade,nota_iniciativa:fn.iniciativa,comentario:fn.comentario}]).select().single();
    if(data){setAvaliacoes(p=>[...p,mav(data)]);setModal(null);setFn({qualidade:3,produtividade:3,trabalhoEquipe:3,pontualidade:3,iniciativa:3,comentario:""});}
    setSaving(false);
  };
  
  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20}}>
      <div><div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>Avaliações de Desempenho</div><div style={{fontSize:13,color:C.txm,marginTop:2}}>Ciclos semestrais</div></div>
      <div style={{display:"flex",gap:3,background:C.s2,borderRadius:10,padding:3,border:"1px solid "+C.bdr,width:"fit-content"}}>
        {[{id:"historico",l:"Histórico"},...(can(user.role,"lider")?[{id:"pendentes",l:"Pendentes"}]:[])].map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 16px",borderRadius:8,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",background:tab===t.id?C.acc:"transparent",color:tab===t.id?"#fff":C.txm,transition:"all .2s"}}>{t.l}</button>)}
      </div>
      {tab==="historico"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {hist.length===0&&<Card><div style={{color:C.txd,textAlign:"center",padding:18}}>Sem avaliações.</div></Card>}
          {hist.map(a=>{const m=parseFloat(getM(a.notas));return(
            <Card key={a.id}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16}}>
                <div style={{display:"flex",gap:12,alignItems:"center"}}><Av name={a.avaliadoName} size={40} color={SC[users.find(u=>u.id===a.avaliadoId)?.setor]||C.acc}/><div><div style={{fontWeight:700,fontSize:14}}>{a.avaliadoName}</div><div style={{fontSize:12,color:C.txm}}>Por {a.avaliadorName} · {a.periodo}</div></div></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:28,fontWeight:700,color:getC(m),fontFamily:"'JetBrains Mono',monospace"}}>{m}</div><div style={{fontSize:11,color:C.txd}}>/5.0</div></div>
              </div>
              <div style={{display:"flex",gap:5,marginTop:12,flexWrap:"wrap"}}>
                {CRIT.map(c=><div key={c.k} style={{background:C.s1,borderRadius:7,padding:"3px 9px",fontSize:11,display:"flex",alignItems:"center",gap:4}}><span style={{color:getC(a.notas[c.k]),fontFamily:"'JetBrains Mono',monospace"}}>{a.notas[c.k]}</span><span style={{color:C.txd}}>{c.i}</span></div>)}
              </div>
              {a.comentario&&<div style={{marginTop:8,fontSize:12,color:C.txd,fontStyle:"italic",borderLeft:"2px solid "+getC(m)+"40",paddingLeft:8}}>"{a.comentario}"</div>}
            </Card>
          );})}
        </div>
      )}
      {tab==="pendentes"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {eq.map(u=>{const jaFez=avaliacoes.find(a=>a.avaliadoId===u.id&&a.periodo===periodo);const col=SC[u.setor]||C.acc;return(
            <Card key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",gap:12,alignItems:"center"}}><Av name={u.name} size={36} color={col}/><div><div style={{fontWeight:700}}>{u.name}</div><div style={{fontSize:12,color:C.txm}}>{u.cargo}</div></div></div>
              {jaFez?<Chip label="✓ Concluída" color={C.grn}/>:<Btn sz="sm" onClick={()=>{setModal({avaliadoId:u.id});setFn({qualidade:3,produtividade:3,trabalhoEquipe:3,pontualidade:3,iniciativa:3,comentario:""});}}>Avaliar</Btn>}
            </Card>
          );})}
          {eq.length===0&&<Card><div style={{color:C.txd,textAlign:"center",padding:18}}>Sem equipe para avaliar.</div></Card>}
        </div>
      )}
      <Modal open={!!modal&&modal.modo!=="ver"} onClose={()=>setModal(null)} title={"Avaliar — "+(users.find(u=>u.id===modal?.avaliadoId)?.name?.split(" ")[0]||"")} width={540}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:C.accBg,borderRadius:9,padding:"8px 14px",fontSize:12,color:C.accLt}}>Período: <strong>{periodo}</strong></div>
          {CRIT.map(c=><div key={c.k}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}><label style={{fontSize:13,fontWeight:600}}>{c.i} {c.l}</label><span style={{fontSize:17,fontWeight:700,color:getC(fn[c.k]),fontFamily:"'JetBrains Mono',monospace"}}>{fn[c.k]}</span></div>
            <div style={{display:"flex",gap:6}}>{[1,2,3,4,5].map(n=><button key={n} onClick={()=>setFn(f=>({...f,[c.k]:n}))} style={{flex:1,padding:"9px 0",borderRadius:9,border:"2px solid "+(fn[c.k]===n?getC(n):C.bdr),background:fn[c.k]===n?getC(n)+"22":C.s1,color:fn[c.k]===n?getC(n):C.txm,fontSize:14,fontWeight:700,cursor:"pointer",transition:"all .15s"}}>{n}</button>)}</div>
          </div>)}
          <Tex label="Comentário" value={fn.comentario} onChange={e=>setFn(f=>({...f,comentario:e.target.value}))} placeholder="Observações..."/>
          <div style={{background:C.s2,borderRadius:9,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:C.txm}}>Média geral</span><span style={{fontSize:20,fontWeight:700,color:getC(parseFloat(getM(fn))),fontFamily:"'JetBrains Mono',monospace"}}>{getM(fn)}</span></div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Btn v="outline" onClick={()=>setModal(null)}>Cancelar</Btn><Btn onClick={salvar} disabled={saving}>{saving?<Spin size={14} color="#fff"/>:null} Salvar</Btn></div>
        </div>
      </Modal>
    </div>
  );
}

// EQUIPE
function Equipe({user,users,ferias}){
  const[busca,setBusca]=useState("");const[sel,setSel]=useState(null);
  const ts=tod();
  const eq=user.role==="lider"?users.filter(u=>u.liderId===user.id):user.role==="gestor"?users.filter(u=>u.gestorId===user.id&&u.role!=="gestor"):users;
  const isF=uid=>ferias.some(f=>f.userId===uid&&f.status==="aprovado"&&ts>=f.inicio&&ts<=f.fim);
  const filtrado=eq.filter(u=>u.name.toLowerCase().includes(busca.toLowerCase())||u.cargo.toLowerCase().includes(busca.toLowerCase()));
  const setores=[...new Set(eq.map(u=>u.setor))].filter(Boolean);
  
  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20}}>
      <div><div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>Equipe</div><div style={{fontSize:13,color:C.txm,marginTop:2}}>{eq.length} colaboradores</div></div>
      <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar..." style={{background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:9,padding:"9px 13px",color:C.txt,fontSize:13}}/>
      {setores.map(s=>{const mbs=filtrado.filter(u=>u.setor===s);if(!mbs.length)return null;const col=SC[s]||C.acc;return(
        <div key={s}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><div style={{width:3,height:18,background:col,borderRadius:2}}/><span style={{fontSize:13,fontWeight:700,color:col}}>{SL[s]}</span><span style={{fontSize:12,color:C.txd}}>({mbs.length})</span></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:8}}>
            {mbs.map(u=>(
              <div key={u.id} onClick={()=>setSel(sel?.id===u.id?null:u)} style={{background:C.bgCard,border:"1px solid "+(sel?.id===u.id?col:C.bdr),borderRadius:12,padding:14,cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=col} onMouseLeave={e=>{if(sel?.id!==u.id)e.currentTarget.style.borderColor=C.bdr;}}>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <div style={{position:"relative"}}><Av name={u.name} size={34} color={col}/>{isF(u.id)&&<div style={{position:"absolute",bottom:-2,right:-2,width:10,height:10,background:C.grn,borderRadius:"50%",border:"2px solid "+C.bgCard}}/>}</div>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</div><div style={{fontSize:11,color:C.txd}}>{u.cargo}</div></div>
                  {u.role==="lider"&&<Chip label="Líder" color={col}/>}
                </div>
                {sel?.id===u.id&&<div className="fadeIn" style={{marginTop:12,paddingTop:12,borderTop:"1px solid "+C.bdr,fontSize:12,color:C.txm,display:"flex",flexDirection:"column",gap:5}}>
                  <span>📧 {u.email}</span><span>📅 {fd(u.admissao)}</span>
                  {isF(u.id)&&<span style={{color:C.grn}}>🏖 De férias agora</span>}
                  {u.skills.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>{u.skills.map(sk=><Chip key={sk} label={sk} color={col}/>)}</div>}
                </div>}
              </div>
            ))}
          </div>
        </div>
      );})}
    </div>
  );
}

// COLABORADORES
function Colaboradores({users,setUsers,currentUser}){
  const[busca,setBusca]=useState("");const[fSetor,setFSetor]=useState("todos");const[fRole,setFRole]=useState("todos");const[fArea,setFArea]=useState("todas");const[sel,setSel]=useState(null);
  const[modalMov,setModalMov]=useState(null); // colaborador sendo movido
  const[formMov,setFormMov]=useState({setor:"",area:""});const[saving,setSaving]=useState(false);

  // Visibilidade por hierarquia: RH vê todos · Gestor vê todas as equipes sob sua gestão · Líder vê só a própria equipe
  const escopo=can(currentUser.role,"rh")
    ? users
    : can(currentUser.role,"gestor")
      ? users.filter(u=>u.gestorId===currentUser.id||u.id===currentUser.id)
      : users.filter(u=>u.liderId===currentUser.id||u.id===currentUser.id);

  const setores=[...new Set(escopo.map(u=>u.setor))].filter(Boolean);
  const areasProducao=[...new Set(escopo.filter(u=>u.setor==="producao").map(u=>u.area))].filter(Boolean);
  const filtrado=escopo.filter(u=>{const b=busca.toLowerCase();return(u.name.toLowerCase().includes(b)||u.cargo.toLowerCase().includes(b)||u.email.toLowerCase().includes(b))&&(fSetor==="todos"||u.setor===fSetor)&&(fRole==="todos"||u.role===fRole)&&(fArea==="todas"||u.area===fArea);});

  const podeMovimentar=can(currentUser.role,"lider");
  const areasOpcoes=Object.entries(AL).map(([k,v])=>({value:k,label:v}));

  const abrirMovimentacao=(u,e)=>{
    e.stopPropagation();
    setFormMov({setor:u.setor,area:u.area||"geral"});
    setModalMov(u);
  };

  const confirmarMovimentacao=async()=>{
    if(!modalMov)return;
    setSaving(true);
    const sb=getSB();
    const payload={setor:formMov.setor,area:formMov.setor==="producao"?formMov.area:null};
    const{data,error}=await sb.from("usuarios").update(payload).eq("id",modalMov.id).select().single();
    if(data){
      setUsers(p=>p.map(u=>u.id===modalMov.id?{...u,setor:data.setor,area:data.area}:u));
      setModalMov(null);
    }
    setSaving(false);
  };

  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20}}>
      <div><div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>Colaboradores</div><div style={{fontSize:13,color:C.txm,marginTop:2}}>{filtrado.length} de {escopo.length}{!can(currentUser.role,"rh")&&<span style={{color:C.txd}}> · {currentUser.role==="lider"?"sua equipe":"suas equipes"}</span>}</div></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar nome, cargo, e-mail..." style={{flex:1,minWidth:200,background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:9,padding:"9px 13px",color:C.txt,fontSize:13,boxSizing:"border-box"}}/>
        <select value={fSetor} onChange={e=>{setFSetor(e.target.value);setFArea("todas");}} style={{background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:9,padding:"9px 13px",color:C.txt,fontSize:13}}><option value="todos">Todos Setores</option>{setores.map(s=><option key={s} value={s}>{SL[s]||s}</option>)}</select>
        {fSetor==="producao"&&areasProducao.length>0&&<select value={fArea} onChange={e=>setFArea(e.target.value)} style={{background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:9,padding:"9px 13px",color:C.txt,fontSize:13}}><option value="todas">Todas Áreas</option>{areasProducao.map(a=><option key={a} value={a}>{AL[a]||a}</option>)}</select>}
        <select value={fRole} onChange={e=>setFRole(e.target.value)} style={{background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:9,padding:"9px 13px",color:C.txt,fontSize:13}}><option value="todos">Todos</option>{["colaborador","lider","gestor","rh","dev"].map(r=><option key={r} value={r}>{r}</option>)}</select>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtrado.map(u=>{const col=SC[u.setor]||C.acc;const isS=sel?.id===u.id;return(
          <Card key={u.id} onClick={()=>setSel(isS?null:u)} style={{cursor:"pointer",borderLeft:"3px solid "+(isS?col:C.bdr),transition:"all .15s"}}>
            <div style={{display:"flex",gap:14,alignItems:"center"}}><Av name={u.name} size={36} color={col}/><div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}><div><div style={{fontWeight:700,fontSize:14}}>{u.name}</div><div style={{fontSize:12,color:C.txm}}>{u.cargo}</div></div><div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}><Chip label={SL[u.setor]||u.setor} color={col}/>{u.setor==="producao"&&u.area&&u.area!=="geral"&&<Chip label={AL[u.area]||u.area} color={ACOL[u.area]||col}/>}<Chip label={u.role} color={C.txm}/></div></div></div></div>
            {isS&&<div className="fadeIn" style={{marginTop:12,paddingTop:12,borderTop:"1px solid "+C.bdr,display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8,fontSize:12,color:C.txm}}>
              <span>📧 {u.email}</span><span>📅 {fd(u.admissao)}</span>
              <div style={{gridColumn:"1/-1",display:"flex",alignItems:"center",gap:8}}>Senioridade:<div style={{flex:1,height:4,background:C.s3,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:u.senioridade+"%",background:col,borderRadius:3}}/></div><span style={{color:col,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{u.senioridade}%</span></div>
              {u.skills.length>0&&<div style={{gridColumn:"1/-1",display:"flex",gap:4,flexWrap:"wrap"}}>{u.skills.map(sk=><Chip key={sk} label={sk} color={col}/>)}</div>}
              {podeMovimentar&&<div style={{gridColumn:"1/-1",marginTop:4}}><Btn sz="sm" v="outline" onClick={e=>abrirMovimentacao(u,e)}>⇄ Movimentar setor/área</Btn></div>}
            </div>}
          </Card>
        );})}
      </div>

      <Modal open={!!modalMov} onClose={()=>setModalMov(null)} title={"Movimentar — "+(modalMov?.name||"")} width={440}>
        {modalMov&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:C.s1,borderRadius:10,padding:"10px 14px",fontSize:12,color:C.txm}}>
              Atualmente em <strong>{SL[modalMov.setor]||modalMov.setor}</strong>{modalMov.setor==="producao"&&modalMov.area?<> · {AL[modalMov.area]||modalMov.area}</>:null}
            </div>
            <Sel label="Novo setor" value={formMov.setor} onChange={e=>setFormMov({setor:e.target.value,area:e.target.value==="producao"?"geral":""})} options={Object.entries(SL).filter(([k])=>!["producao_b","producao_c","ti","vulcanizacao","corte"].includes(k)).filter(([k])=>can(currentUser.role,"gestor")||k===modalMov?.setor).map(([k,v])=>({value:k,label:v}))}/>
            {!can(currentUser.role,"gestor")&&<div style={{fontSize:11,color:C.txd}}>Como líder, você só pode ajustar a área dentro do setor atual. Mudança de setor requer gestor ou RH.</div>}
            {formMov.setor==="producao"&&<Sel label="Área dentro de Produção" value={formMov.area} onChange={e=>setFormMov({...formMov,area:e.target.value})} options={areasOpcoes}/>}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <Btn v="outline" onClick={()=>setModalMov(null)}>Cancelar</Btn>
              <Btn onClick={confirmarMovimentacao} disabled={!formMov.setor||saving}>{saving?<Spin size={14} color="#fff"/>:null} Confirmar</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// PERFIL
function Perfil({user,setUsers,setPage}){
  const col=SC[user.setor]||C.acc;
  const [skills, setSkills] = useState(user.skills || ["Comunicação", "Trabalho em Equipe"]);
  const [cursos, setCursos] = useState([
    { id: 1, titulo: "Gestão de Tempo e Produtividade", instituicao: "Kalenborn Academy", ano: "2025" },
    { id: 2, titulo: "Segurança Industrial Básica (NR-12)", instituicao: "Sebrae", ano: "2024" }
  ]);
  const [metas, setMetas] = useState([
    { id: 1, titulo: "Reduzir tempo de setup das máquinas", progresso: 65 },
    { id: 2, titulo: "Participar de 3 treinamentos no ano", progresso: 33 },
    { id: 3, titulo: "Atingir 90% na Avaliação de Desempenho", progresso: 100 }
  ]);

  const [modalSkill, setModalSkill] = useState(false);
  const [newSkill, setNewSkill] = useState("");

  const [modalCurso, setModalCurso] = useState(false);
  const [novoCurso, setNovoCurso] = useState({ titulo: "", instituicao: "", ano: "" });

  // ── Edição de perfil (nome, telefone, foto) ──────────────────────────
  const [editando, setEditando] = useState(false);
  const [formEdit, setFormEdit] = useState({name:user.name, telefone:user.telefone||"", fotoUrl:user.fotoUrl||""});
  const [savingEdit, setSavingEdit] = useState(false);

  const abrirEdicao = () => { setFormEdit({name:user.name, telefone:user.telefone||"", fotoUrl:user.fotoUrl||""}); setEditando(true); };

  const salvarEdicao = async () => {
    if(!formEdit.name.trim()) return;
    setSavingEdit(true);
    const sb = getSB();
    const{data,error} = await sb.from("usuarios").update({
      name: formEdit.name.trim(),
      telefone: formEdit.telefone.trim(),
      foto_url: formEdit.fotoUrl.trim(),
    }).eq("id", user.id).select().single();
    if(data){
      setUsers(p=>p.map(u=>u.id===user.id?{...u,name:data.name,telefone:data.telefone,fotoUrl:data.foto_url}:u));
      setEditando(false);
    }
    setSavingEdit(false);
  };

  const addSkill = async () => {
    if(!newSkill.trim()) return;
    const upd = [...skills, newSkill.trim()];
    setSkills(upd);
    setNewSkill("");
    setModalSkill(false);
    const sb = getSB();
    if(sb) await sb.from("usuarios").update({skills: upd}).eq("id", user.id);
  };

  const addCurso = () => {
    if(!novoCurso.titulo) return;
    setCursos([{id: Date.now(), ...novoCurso}, ...cursos]);
    setModalCurso(false);
    setNovoCurso({ titulo: "", instituicao: "", ano: "" });
  };

  const removeSkill = async (s) => {
    const upd = skills.filter(x => x !== s);
    setSkills(upd);
    const sb = getSB();
    if(sb) await sb.from("usuarios").update({skills: upd}).eq("id", user.id);
  };

  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:24, paddingBottom: 40}}>
      {/* HEADER CARD LIKE LINKEDIN */}
      <Card style={{padding: 0, overflow: "hidden", position: "relative"}}>
        <div style={{height: 120, background: `linear-gradient(135deg, ${col}40, ${col})`}} />
        <div style={{padding: "0 32px 32px 32px"}}>
          <div style={{marginTop: -48, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-end"}}>
             <div style={{background: C.bgAlt, padding: 6, borderRadius: "50%", display: "inline-block"}}>
               <Av name={user.name} size={96} color={col} photo={user.fotoUrl}/>
             </div>
             <div style={{display: "flex", gap: 10}}>
                <Btn sz="sm" v="outline" onClick={abrirEdicao}>✎ Editar Perfil</Btn>
             </div>
          </div>
          <div style={{display: "flex", flexDirection: "column", gap: 6}}>
            <div style={{fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", color: C.txt}}>{user.name}</div>
            <div style={{fontSize: 16, color: C.txm, fontWeight: 500}}>{user.cargo} no setor de {SL[user.setor]||user.setor}</div>
            <div style={{fontSize: 13, color: C.txd, display: "flex", gap: 16, marginTop: 4, flexWrap:"wrap"}}>
              <span>📧 {user.email}</span>
              <span>📅 Admissão: {fd(user.admissao)}</span>
              {user.telefone&&<span>📱 {user.telefone}</span>}
            </div>
            
            <div style={{marginTop: 16, display: "flex", alignItems: "center", gap: 12, background: C.s1, padding: "12px 16px", borderRadius: 12, width: "fit-content", border: "1px solid "+C.bdr}}>
               <div style={{fontSize: 12, color: C.txm, fontWeight: 700, textTransform: "uppercase"}}>Nível de Senioridade</div>
               <div style={{width: 140, height: 8, background: C.s3, borderRadius: 4, overflow: "hidden"}}>
                  <div style={{width: user.senioridade+"%", height: "100%", background: col, borderRadius: 4}} />
               </div>
               <div style={{fontSize: 14, fontWeight: 800, color: col, fontFamily: "'JetBrains Mono', monospace"}}>{user.senioridade}%</div>
            </div>
          </div>
        </div>
      </Card>

      <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "start"}}>
        {/* COLUNA ESQUERDA: Cursos e Habilidades */}
        <div style={{display: "flex", flexDirection: "column", gap: 24}}>
          {/* CURSOS & CERTIFICAÇÕES */}
          <Card>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20}}>
              <div style={{fontSize: 18, fontWeight: 800, color: C.txt}}>Cursos e Certificações</div>
              <Btn sz="sm" v="ghost" onClick={() => setModalCurso(true)}>+ Adicionar</Btn>
            </div>
            <div style={{display: "flex", flexDirection: "column", gap: 16}}>
              {cursos.length === 0 && <div style={{fontSize: 13, color: C.txd}}>Nenhum curso cadastrado.</div>}
              {cursos.map(c => (
                <div key={c.id} style={{display: "flex", gap: 16, paddingBottom: 16, borderBottom: "1px solid "+C.s3}}>
                   <div style={{width: 48, height: 48, background: C.s2, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: C.txd, flexShrink: 0}}>🎓</div>
                   <div>
                     <div style={{fontSize: 15, fontWeight: 700, color: C.txt, marginBottom: 2}}>{c.titulo}</div>
                     <div style={{fontSize: 13, color: C.txm}}>{c.instituicao}</div>
                     <div style={{fontSize: 12, color: C.txd, marginTop: 4}}>Emitido em {c.ano}</div>
                   </div>
                </div>
              ))}
            </div>
          </Card>

          {/* HABILIDADES */}
          <Card>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20}}>
              <div style={{fontSize: 18, fontWeight: 800, color: C.txt}}>Habilidades</div>
              <Btn sz="sm" v="ghost" onClick={() => setModalSkill(true)}>+ Adicionar</Btn>
            </div>
            {skills.length === 0 && <div style={{fontSize: 13, color: C.txd}}>Nenhuma habilidade cadastrada.</div>}
            <div style={{display: "flex", gap: 10, flexWrap: "wrap"}}>
              {skills.map(sk => (
                <div key={sk} style={{display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 20, background: C.s1, border: "1px solid "+C.bdr, fontSize: 13, fontWeight: 600, color: C.txt}}>
                  {sk}
                  <button onClick={() => removeSkill(sk)} style={{background: "none", border: "none", color: C.txd, cursor: "pointer", fontSize: 14}}>✕</button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* COLUNA DIREITA: Metas */}
        <div style={{display: "flex", flexDirection: "column", gap: 24}}>
          <Card style={{borderColor: C.acc+"40", background: "linear-gradient(180deg, "+C.bgAlt+", "+C.s1+")"}}>
             <div style={{fontSize: 16, fontWeight: 800, color: C.accDk, marginBottom: 20, display: "flex", alignItems: "center", gap: 8}}>
               <span>🎯</span> Minhas Metas e Objetivos
             </div>
             <div style={{display: "flex", flexDirection: "column", gap: 20}}>
               {metas.map(m => (
                 <div key={m.id}>
                   <div style={{display: "flex", justifyContent: "space-between", marginBottom: 8}}>
                     <span style={{fontSize: 13, fontWeight: 600, color: C.txt, paddingRight: 10}}>{m.titulo}</span>
                     <span style={{fontSize: 12, fontWeight: 700, color: m.progresso === 100 ? C.grn : C.acc}}>{m.progresso}%</span>
                   </div>
                   <div style={{height: 6, background: C.s3, borderRadius: 3, overflow: "hidden"}}>
                     <div style={{height: "100%", width: m.progresso+"%", background: m.progresso === 100 ? C.grn : C.acc, borderRadius: 3, transition: "width 0.5s ease"}} />
                   </div>
                 </div>
               ))}
             </div>
             <Btn sz="sm" v="outline" full style={{marginTop: 24}} onClick={()=>setPage("avaliacoes")}>Visualizar ciclo de avaliação</Btn>
          </Card>
        </div>
      </div>

      {/* Modal de edição de perfil */}
      <Modal open={editando} onClose={()=>setEditando(false)} title="Editar Perfil" width={460}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Inp label="Nome completo" value={formEdit.name} onChange={e=>setFormEdit({...formEdit,name:e.target.value})} placeholder="Seu nome completo"/>
          <Inp label="Telefone" value={formEdit.telefone} onChange={e=>setFormEdit({...formEdit,telefone:e.target.value})} placeholder="(31) 9 9999-9999"/>
          <Inp label="URL da foto de perfil" value={formEdit.fotoUrl} onChange={e=>setFormEdit({...formEdit,fotoUrl:e.target.value})} placeholder="https://..."/>
          {formEdit.fotoUrl&&<div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:12,color:C.txd}}>Pré-visualização:</span><Av name={formEdit.name||user.name} size={40} color={col} photo={formEdit.fotoUrl}/></div>}
          <div style={{fontSize:11,color:C.txd}}>E-mail, cargo e setor são gerenciados pelo RH — fale com seu gestor se precisar alterá-los.</div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn v="outline" onClick={()=>setEditando(false)}>Cancelar</Btn>
            <Btn onClick={salvarEdicao} disabled={!formEdit.name.trim()||savingEdit}>{savingEdit?<Spin size={14} color="#fff"/>:null} Salvar</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={modalSkill} onClose={()=>setModalSkill(false)} title="Adicionar Habilidade" width={400}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Inp label="Nome da Habilidade" value={newSkill} onChange={e=>setNewSkill(e.target.value)} placeholder="Ex: Python, Gestão de Conflitos..."/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end", marginTop: 10}}>
            <Btn v="outline" onClick={()=>setModalSkill(false)}>Cancelar</Btn>
            <Btn onClick={addSkill} disabled={!newSkill.trim()}>Salvar Habilidade</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={modalCurso} onClose={()=>setModalCurso(false)} title="Adicionar Novo Curso" width={460}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Inp label="Título do Curso / Certificado *" value={novoCurso.titulo} onChange={e=>setNovoCurso({...novoCurso, titulo: e.target.value})} placeholder="Ex: Liderança Estratégica"/>
          <Inp label="Instituição" value={novoCurso.instituicao} onChange={e=>setNovoCurso({...novoCurso, instituicao: e.target.value})} placeholder="Ex: Sebrae"/>
          <Inp label="Ano de Conclusão" value={novoCurso.ano} onChange={e=>setNovoCurso({...novoCurso, ano: e.target.value})} placeholder="Ex: 2025"/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end", marginTop: 10}}>
            <Btn v="outline" onClick={()=>setModalCurso(false)}>Cancelar</Btn>
            <Btn onClick={addCurso} disabled={!novoCurso.titulo}>Adicionar Curso</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// PEOPLE ANALYTICS
function PeopleAnalytics({user,users,ferias,candidates,avaliacoes,exames,tarefas,feedbacks}){
  const[periodo,setPeriodo]=useState("12m");
  const[activeKPI,setActiveKPI]=useState(null);

  const meses=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const hoje=new Date();
  const anoAtual=hoje.getFullYear();

  // ── HELPERS ────────────────────────────────────────────────────────
  const mesLabel=i=>meses[i%12]+" "+(anoAtual-(i<hoje.getMonth()?0:1));
  const ultMeses=n=>{
    const arr=[];
    for(let i=n-1;i>=0;i--){
      const d=new Date(anoAtual,hoje.getMonth()-i,1);
      arr.push({ano:d.getFullYear(),mes:d.getMonth(),label:meses[d.getMonth()]+(n>12?" "+d.getFullYear():"")});
    }
    return arr;
  };
  const nMeses=periodo==="3m"?3:periodo==="6m"?6:12;
  const janelas=ultMeses(nMeses);

  // ── HEADCOUNT MENSAL ───────────────────────────────────────────────
  const headcountData=janelas.map(({ano,mes,label})=>{
    const ativos=users.filter(u=>{
      if(!u.admissao)return false;
      const adm=new Date(u.admissao);
      return adm<=new Date(ano,mes+1,0);
    }).length;
    return{label,ativos};
  });

  // ── TURNOVER ───────────────────────────────────────────────────────
  const totalColabs=users.filter(u=>u.role==="colaborador").length||1;
  // Simula saídas com base em exames demissionais por mês
  const turnoverData=janelas.map(({ano,mes,label})=>{
    const saidas=exames.filter(e=>{
      if(e.tipo!=="demissional"||!e.data)return false;
      const d=new Date(e.data);
      return d.getFullYear()===ano&&d.getMonth()===mes;
    }).length;
    const taxa=parseFloat(((saidas/totalColabs)*100).toFixed(1));
    return{label,saidas,taxa};
  });
  const turnoverAcum=turnoverData.reduce((a,b)=>a+b.saidas,0);
  const taxaTurnoverAno=parseFloat(((turnoverAcum/totalColabs)*100).toFixed(1));

  // ── TIME TO HIRE ───────────────────────────────────────────────────
  const aprov=candidates.filter(c=>c.status==="aprovado"&&c.createdAt);
  // Simula TTH: tempo médio entre criação e aprovação (usa createdAt como proxy)
  const tthData=janelas.map(({ano,mes,label})=>{
    const cadMes=candidates.filter(c=>{
      if(!c.createdAt)return false;
      const d=new Date(c.createdAt);
      return d.getFullYear()===ano&&d.getMonth()===mes;
    });
    const dias=cadMes.length>0
      ? Math.round(cadMes.reduce((acc,c)=>{
          const base=new Date(c.createdAt);
          const diff=(hoje-base)/86400000;
          return acc+Math.min(diff,45);
        },0)/cadMes.length)
      : 0;
    return{label,dias,total:cadMes.length};
  });
  const tthMedio=tthData.filter(d=>d.dias>0).length>0
    ? Math.round(tthData.filter(d=>d.dias>0).reduce((a,b)=>a+b.dias,0)/tthData.filter(d=>d.dias>0).length)
    : 0;

  // ── HEATMAP AVALIAÇÕES POR SETOR ───────────────────────────────────
  const criterios=["qualidade","produtividade","trabalhoEquipe","pontualidade","iniciativa"];
  const crLabel={"qualidade":"Qualidade","produtividade":"Produtividade","trabalhoEquipe":"Equipe","pontualidade":"Pontualidade","iniciativa":"Iniciativa"};
  const setoresList=Object.keys(SL);
  const heatmapData=setoresList.map(setor=>{
    const usersSetor=users.filter(u=>u.setor===setor);
    const avalSetor=avaliacoes.filter(a=>usersSetor.find(u=>u.id===a.avaliadoId));
    const row={setor:SL[setor]};
    criterios.forEach(cr=>{
      const vals=avalSetor.map(a=>a.notas[cr]).filter(v=>v!=null&&!isNaN(v));
      row[cr]=vals.length>0?parseFloat((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)):null;
    });
    row.media=criterios.map(cr=>row[cr]).filter(v=>v!=null).length>0
      ? parseFloat((criterios.map(cr=>row[cr]).filter(v=>v!=null).reduce((a,b)=>a+b,0)/criterios.filter(cr=>row[cr]!=null).length).toFixed(1))
      : null;
    return row;
  }).filter(r=>r.media!==null);

  // ── RADAR MÉDIAS GERAIS ────────────────────────────────────────────
  const radarData=criterios.map(cr=>{
    const vals=avaliacoes.map(a=>a.notas[cr]).filter(v=>v!=null&&!isNaN(v));
    return{criterio:crLabel[cr],valor:vals.length>0?parseFloat((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2)):0,fullMark:5};
  });

  // ── FUNIL DE RECRUTAMENTO ──────────────────────────────────────────
  const funnelData=[
    {name:"Candidatos",value:candidates.length,fill:C.acc},
    {name:"Em Revisão",value:candidates.filter(c=>c.status==="revisao").length,fill:C.blu},
    {name:"Aprovados",value:candidates.filter(c=>c.status==="aprovado").length,fill:C.grn},
    {name:"Contratados",value:exames.filter(e=>e.tipo==="admissional"&&e.status==="realizado").length,fill:C.pur},
  ];

  // ── FEEDBACKS SENTIMENTO POR SETOR ────────────────────────────────
  const sentimentoData=setoresList.map(s=>{
    const users_s=users.filter(u=>u.setor===s);
    const fbs=feedbacks.filter(f=>users_s.find(u=>u.id===f.toId));
    const pos=fbs.filter(f=>f.tipo==="reconhecimento").length;
    const neg=fbs.filter(f=>f.tipo==="comportamento").length;
    const neu=fbs.length-pos-neg;
    return{setor:SL[s]||s,positivo:pos,neutro:neu,negativo:neg,total:fbs.length};
  }).filter(d=>d.total>0);

  // ── SCORE MÉDIO CANDIDATOS POR VAGA ───────────────────────────────
  const vagasComScore=[...new Set(candidates.map(c=>c.vaga))].map(v=>{
    const cands=candidates.filter(c=>c.vaga===v);
    const avg=parseFloat((cands.reduce((a,b)=>a+b.score,0)/cands.length).toFixed(0));
    return{vaga:v,score:avg,total:cands.length};
  }).filter(d=>d.total>0).sort((a,b)=>b.score-a.score).slice(0,6);

  // ── KPI CARDS ─────────────────────────────────────────────────────
  const kpis=[
    {id:"headcount",label:"Headcount Total",value:users.length,sub:totalColabs+" colaboradores",color:C.acc,trend:"+2",trendUp:true,icon:"◉"},
    {id:"turnover",label:"Turnover (período)",value:taxaTurnoverAno+"%",sub:turnoverAcum+" saídas",color:turnoverAcum>3?C.red:C.grn,trend:turnoverAcum>3?"↑":"↓",trendUp:false,icon:"↻"},
    {id:"tth",label:"Time-to-Hire Médio",value:tthMedio+"d",sub:"dias até aprovação",color:tthMedio>30?C.amb:C.grn,trend:tthMedio>30?"↑":"↓",trendUp:false,icon:"⏱"},
    {id:"nps",label:"Pontuação Média Aval.",value:radarData.length>0?parseFloat((radarData.reduce((a,b)=>a+b.valor,0)/radarData.length).toFixed(1)):"-",sub:"de 5.0 possíveis",color:C.pur,trend:"+0.2",trendUp:true,icon:"★"},
    {id:"candidatos",label:"Candidatos Ativos",value:candidates.filter(c=>c.status!=="rejeitado").length,sub:"no pipeline",color:C.blu,trend:"+"+candidates.filter(c=>{const d=new Date(c.createdAt||"");return(hoje-d)<(30*86400000);}).length+" este mês",trendUp:true,icon:"⊕"},
    {id:"ferias_aprov",label:"Férias Aprovadas",value:ferias.filter(f=>f.status==="aprovado").length,sub:"no período",color:C.grn,trend:ferias.filter(f=>f.status==="pendente_rh"||f.status==="pendente_gestor"||f.status==="pendente_lider").length+" pendentes",trendUp:null,icon:"✈"},
  ];

  // ── CORES HEATMAP ─────────────────────────────────────────────────
  const heatColor=v=>{
    if(v===null)return C.s3;
    if(v>=4.5)return C.grn;
    if(v>=3.5)return "#22c55e";
    if(v>=2.5)return C.amb;
    if(v>=1.5)return "#f97316";
    return C.red;
  };
  const heatTextColor=v=>{
    if(v===null)return C.txd;
    if(v>=2.5)return "#fff";
    return "#fff";
  };

  // ── CUSTOM TOOLTIP ────────────────────────────────────────────────
  const CustomTip=({active,payload,label})=>{
    if(!active||!payload?.length)return null;
    return(
      <div style={{background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:10,padding:"10px 14px",boxShadow:"0 4px 16px rgba(0,0,0,.08)"}}>
        <div style={{fontSize:11,color:C.txd,fontWeight:600,marginBottom:6}}>{label}</div>
        {payload.map((p,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.txt}}>
            <div style={{width:8,height:8,borderRadius:2,background:p.color||p.fill}}/>
            <span style={{color:C.txd}}>{p.name}:</span>
            <span style={{fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{p.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:24,paddingBottom:40}}>

      {/* ── HEADER ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>◉ Análise de Pessoas</div>
          <div style={{fontSize:13,color:C.txm,marginTop:2}}>Visão executiva de pessoas · Kalenborn International</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{display:"flex",background:C.s2,borderRadius:10,padding:3,border:"1px solid "+C.bdr}}>
            {["3m","6m","12m"].map(p=>(
              <button key={p} onClick={()=>setPeriodo(p)} style={{padding:"6px 14px",borderRadius:8,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",background:periodo===p?C.acc:"transparent",color:periodo===p?"#fff":C.txm,transition:"all .2s"}}>{p}</button>
            ))}
          </div>
          <Btn sz="sm" v="outline" onClick={()=>window.print()}>⬇ Exportar</Btn>
        </div>
      </div>

      {/* ── KPI GRID ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12}}>
        {kpis.map(k=>(
          <div key={k.id} onClick={()=>setActiveKPI(activeKPI===k.id?null:k.id)}
            style={{background:C.bgCard,border:"1px solid "+(activeKPI===k.id?k.color:C.bdr),borderTop:"3px solid "+k.color,borderRadius:16,padding:"18px 20px",cursor:"pointer",transition:"all .2s",boxShadow:activeKPI===k.id?"0 0 0 3px "+k.color+"20":"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div style={{fontSize:11,color:C.txm,fontWeight:700,letterSpacing:".05em",textTransform:"uppercase"}}>{k.label}</div>
              <span style={{fontSize:16,opacity:.3}}>{k.icon}</span>
            </div>
            <div style={{fontSize:28,fontWeight:800,color:k.color,fontFamily:"'JetBrains Mono',monospace",lineHeight:1,marginBottom:6}}>{k.value}</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:11,color:C.txd}}>{k.sub}</span>
              {k.trend&&<span style={{fontSize:11,fontWeight:700,color:k.trendUp===true?C.grn:k.trendUp===false?C.red:C.amb}}>{k.trend}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── LINHA 1: Headcount + Turnover ── */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:16}}>
        <Card style={{padding:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div>
              <div style={{fontSize:14,fontWeight:700}}>Headcount por Mês</div>
              <div style={{fontSize:11,color:C.txd,marginTop:2}}>Colaboradores ativos no período</div>
            </div>
            <Chip label={users.length+" total"} color={C.acc}/>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={headcountData} margin={{top:5,right:5,left:-20,bottom:0}}>
              <defs>
                <linearGradient id="gradAcc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.acc} stopOpacity={0.15}/>
                  <stop offset="95%" stopColor={C.acc} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.bdr} vertical={false}/>
              <XAxis dataKey="label" stroke={C.txm} fontSize={10} tickLine={false} axisLine={false}/>
              <YAxis stroke={C.txm} fontSize={10} tickLine={false} axisLine={false} allowDecimals={false}/>
              <Tooltip content={<CustomTip/>}/>
              <Area type="monotone" dataKey="ativos" name="Colaboradores" stroke={C.acc} strokeWidth={2.5} fill="url(#gradAcc)" dot={{r:3,fill:C.acc,strokeWidth:0}} activeDot={{r:5}}/>
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card style={{padding:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div>
              <div style={{fontSize:14,fontWeight:700}}>Taxa de Turnover</div>
              <div style={{fontSize:11,color:C.txd,marginTop:2}}>Saídas por exame demissional</div>
            </div>
            <Chip label={taxaTurnoverAno+"% acum."} color={turnoverAcum>3?C.red:C.grn}/>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={turnoverData} margin={{top:5,right:5,left:-20,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.bdr} vertical={false}/>
              <XAxis dataKey="label" stroke={C.txm} fontSize={10} tickLine={false} axisLine={false}/>
              <YAxis stroke={C.txm} fontSize={10} tickLine={false} axisLine={false} allowDecimals={false}/>
              <Tooltip content={<CustomTip/>}/>
              <ReferenceLine y={2} stroke={C.amb} strokeDasharray="4 4" label={{value:"meta",position:"right",fontSize:9,fill:C.amb}}/>
              <Bar dataKey="saidas" name="Saídas" fill={C.red} radius={[4,4,0,0]} maxBarSize={32}>
                {turnoverData.map((entry,i)=>(
                  <Cell key={i} fill={entry.saidas>2?C.red:entry.saidas>0?C.amb:C.s3}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ── LINHA 2: Time-to-Hire + Funil ── */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.4fr) minmax(0,1fr)",gap:16}}>
        <Card style={{padding:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div>
              <div style={{fontSize:14,fontWeight:700}}>Time-to-Hire</div>
              <div style={{fontSize:11,color:C.txd,marginTop:2}}>Dias médios até aprovação do candidato</div>
            </div>
            <Chip label={"média "+tthMedio+"d"} color={tthMedio>30?C.amb:C.grn}/>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={tthData} margin={{top:5,right:5,left:-20,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.bdr} vertical={false}/>
              <XAxis dataKey="label" stroke={C.txm} fontSize={10} tickLine={false} axisLine={false}/>
              <YAxis stroke={C.txm} fontSize={10} tickLine={false} axisLine={false}/>
              <Tooltip content={<CustomTip/>}/>
              <ReferenceLine y={30} stroke={C.grn} strokeDasharray="4 4" label={{value:"30d ideal",position:"right",fontSize:9,fill:C.grn}}/>
              <Line type="monotone" dataKey="dias" name="Dias" stroke={C.blu} strokeWidth={2.5} dot={{r:3,fill:C.blu,strokeWidth:0}} activeDot={{r:5}}/>
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card style={{padding:24}}>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:14,fontWeight:700}}>Funil de Recrutamento</div>
            <div style={{fontSize:11,color:C.txd,marginTop:2}}>Conversão do pipeline</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:8}}>
            {funnelData.map((f,i)=>{
              const pct=funnelData[0].value>0?Math.round((f.value/funnelData[0].value)*100):0;
              return(
                <div key={f.name}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontSize:12,color:C.txm,fontWeight:500}}>{f.name}</span>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{fontSize:12,fontWeight:700,color:f.fill,fontFamily:"'JetBrains Mono',monospace"}}>{f.value}</span>
                      <span style={{fontSize:10,color:C.txd}}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{height:8,background:C.s3,borderRadius:4,overflow:"hidden"}}>
                    <div style={{width:pct+"%",height:"100%",background:f.fill,borderRadius:4,transition:"width .6s ease"}}/>
                  </div>
                </div>
              );
            })}
          </div>
          {funnelData[0].value>0&&(
            <div style={{marginTop:14,padding:"10px 14px",background:C.accBg,borderRadius:10,fontSize:12,color:C.accLt}}>
              Taxa de conversão: <strong>{Math.round((funnelData[funnelData.length-1].value/funnelData[0].value)*100)}%</strong> do pipeline vira admissão
            </div>
          )}
        </Card>
      </div>

      {/* ── HEATMAP DE AVALIAÇÕES ── */}
      <Card style={{padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{fontSize:14,fontWeight:700}}>Heatmap de Desempenho por Setor</div>
            <div style={{fontSize:11,color:C.txd,marginTop:2}}>Média das avaliações por critério e setor · escala 1–5</div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {[{l:"≥4.5",c:C.grn},{l:"3.5–4.4",c:"#22c55e"},{l:"2.5–3.4",c:C.amb},{l:"<2.5",c:C.red}].map(x=>(
              <div key={x.l} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:C.txd}}>
                <div style={{width:10,height:10,borderRadius:2,background:x.c}}/>{x.l}
              </div>
            ))}
          </div>
        </div>
        {heatmapData.length===0?(
          <div style={{textAlign:"center",padding:"32px 0",color:C.txd,fontSize:13}}>
            Nenhuma avaliação registrada ainda. Complete avaliações de desempenho para visualizar o heatmap.
          </div>
        ):(
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"separate",borderSpacing:"4px"}}>
              <thead>
                <tr>
                  <th style={{width:130,textAlign:"left",fontSize:11,color:C.txd,fontWeight:600,padding:"4px 8px",textTransform:"uppercase",letterSpacing:".04em"}}>Setor</th>
                  {criterios.map(cr=>(
                    <th key={cr} style={{textAlign:"center",fontSize:11,color:C.txd,fontWeight:600,padding:"4px 6px",textTransform:"uppercase",letterSpacing:".04em"}}>{crLabel[cr]}</th>
                  ))}
                  <th style={{textAlign:"center",fontSize:11,color:C.txd,fontWeight:700,padding:"4px 6px",textTransform:"uppercase",letterSpacing:".04em"}}>Média</th>
                </tr>
              </thead>
              <tbody>
                {heatmapData.sort((a,b)=>(b.media||0)-(a.media||0)).map(row=>(
                  <tr key={row.setor}>
                    <td style={{fontSize:12,fontWeight:600,color:C.txt,padding:"6px 8px"}}>{row.setor}</td>
                    {criterios.map(cr=>(
                      <td key={cr} style={{padding:"3px"}}>
                        <div style={{background:heatColor(row[cr]),borderRadius:8,padding:"8px 4px",textAlign:"center",minWidth:60}}>
                          <span style={{fontSize:13,fontWeight:700,color:heatTextColor(row[cr]),fontFamily:"'JetBrains Mono',monospace"}}>
                            {row[cr]!=null?row[cr]:"—"}
                          </span>
                        </div>
                      </td>
                    ))}
                    <td style={{padding:"3px"}}>
                      <div style={{background:heatColor(row.media),borderRadius:8,padding:"8px 4px",textAlign:"center",border:"2px solid "+heatColor(row.media)+"99"}}>
                        <span style={{fontSize:14,fontWeight:800,color:heatTextColor(row.media),fontFamily:"'JetBrains Mono',monospace"}}>
                          {row.media!=null?row.media:"—"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── LINHA 3: Radar + Score por Vaga ── */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:16}}>
        <Card style={{padding:24}}>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:14,fontWeight:700}}>Radar de Competências</div>
            <div style={{fontSize:11,color:C.txd,marginTop:2}}>Média geral de todos os critérios de avaliação</div>
          </div>
          {radarData.every(d=>d.valor===0)?(
            <div style={{textAlign:"center",padding:"32px 0",color:C.txd,fontSize:13}}>Sem avaliações para exibir.</div>
          ):(
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData} margin={{top:10,right:20,left:20,bottom:10}}>
                <PolarGrid stroke={C.bdr}/>
                <PolarAngleAxis dataKey="criterio" tick={{fill:C.txm,fontSize:11}}/>
                <PolarRadiusAxis angle={90} domain={[0,5]} tick={{fill:C.txd,fontSize:9}} tickCount={4}/>
                <Radar name="Média" dataKey="valor" stroke={C.acc} fill={C.acc} fillOpacity={0.18} strokeWidth={2}/>
                <Tooltip content={<CustomTip/>}/>
              </RadarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card style={{padding:24}}>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:14,fontWeight:700}}>Pontuação Média por Vaga</div>
            <div style={{fontSize:11,color:C.txd,marginTop:2}}>Qualidade dos candidatos por posição</div>
          </div>
          {vagasComScore.length===0?(
            <div style={{textAlign:"center",padding:"32px 0",color:C.txd,fontSize:13}}>Sem candidatos cadastrados.</div>
          ):(
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={vagasComScore} layout="vertical" margin={{top:0,right:40,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.bdr} horizontal={false}/>
                <XAxis type="number" domain={[0,100]} stroke={C.txm} fontSize={10} tickLine={false} axisLine={false}/>
                <YAxis type="category" dataKey="vaga" stroke={C.txm} fontSize={10} tickLine={false} axisLine={false} width={40}/>
                <Tooltip content={<CustomTip/>}/>
                <ReferenceLine x={70} stroke={C.grn} strokeDasharray="4 4" label={{value:"70 meta",position:"top",fontSize:9,fill:C.grn}}/>
                <Bar dataKey="score" name="Pontuação IA" radius={[0,6,6,0]} maxBarSize={24}>
                  {vagasComScore.map((entry,i)=>(
                    <Cell key={i} fill={entry.score>=80?C.grn:entry.score>=60?C.amb:C.red}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── SENTIMENTO POR SETOR ── */}
      {sentimentoData.length>0&&(
        <Card style={{padding:24}}>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:14,fontWeight:700}}>Clima Organizacional — Feedbacks por Setor</div>
            <div style={{fontSize:11,color:C.txd,marginTop:2}}>Distribuição de reconhecimentos, feedbacks neutros e comportamentais</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sentimentoData} margin={{top:5,right:5,left:-20,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.bdr} vertical={false}/>
              <XAxis dataKey="setor" stroke={C.txm} fontSize={10} tickLine={false} axisLine={false}/>
              <YAxis stroke={C.txm} fontSize={10} tickLine={false} axisLine={false} allowDecimals={false}/>
              <Tooltip content={<CustomTip/>}/>
              <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11,color:C.txm}}/>
              <Bar dataKey="positivo" name="Reconhecimento" fill={C.grn} stackId="a" radius={[0,0,0,0]}/>
              <Bar dataKey="neutro" name="Desenvolvimento" fill={C.blu} stackId="a"/>
              <Bar dataKey="negativo" name="Comportamento" fill={C.red} stackId="a" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* ── RANKING COLABORADORES ── */}
      <Card style={{padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{fontSize:14,fontWeight:700}}>Classificação de Desempenho</div>
            <div style={{fontSize:11,color:C.txd,marginTop:2}}>Top colaboradores por média de avaliações</div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {avaliacoes.length===0?(
            <div style={{textAlign:"center",padding:"24px 0",color:C.txd,fontSize:13}}>Nenhuma avaliação registrada.</div>
          ):(
            [...users].map(u=>{
              const avUser=avaliacoes.filter(a=>a.avaliadoId===u.id);
              if(!avUser.length)return null;
              const media=parseFloat((avUser.reduce((acc,a)=>{
                const vals=Object.values(a.notas||{}).filter(v=>typeof v==="number");
                return acc+(vals.reduce((s,v)=>s+v,0)/vals.length);
              },0)/avUser.length).toFixed(1));
              return{...u,media,nAvals:avUser.length};
            }).filter(Boolean).sort((a,b)=>b.media-a.media).slice(0,8).map((u,i)=>{
              const col=SC[u.setor]||C.acc;
              const medalha=i===0?"🥇":i===1?"🥈":i===2?"🥉":null;
              return(
                <div key={u.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:i<3?C.accBg:C.s1,borderRadius:10,border:"1px solid "+(i<3?C.acc+"25":C.bdr)}}>
                  <div style={{width:24,textAlign:"center",fontSize:i<3?16:12,color:C.txd,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{medalha||("#"+(i+1))}</div>
                  <Av name={u.name} size={32} color={col}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.txt}}>{u.name}</div>
                    <div style={{fontSize:11,color:C.txd}}>{SL[u.setor]||u.setor} · {u.cargo}</div>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <div style={{width:80,height:4,background:C.s3,borderRadius:2,overflow:"hidden"}}>
                      <div style={{width:((u.media/5)*100)+"%",height:"100%",background:u.media>=4?C.grn:u.media>=3?C.amb:C.red,borderRadius:2}}/>
                    </div>
                    <span style={{fontSize:15,fontWeight:800,color:u.media>=4?C.grn:u.media>=3?C.amb:C.red,fontFamily:"'JetBrains Mono',monospace",minWidth:32,textAlign:"right"}}>{u.media}</span>
                    <span style={{fontSize:10,color:C.txd}}>/5</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

    </div>
  );
}


// GESTÃO DE BENEFÍCIOS
function GestBeneficios({user,users,benCatalogo,setBenCatalogo,benUsuarios,setBenUsuarios,benSolicits,setBenSolicits,showToast}){
  const[view,setView]=useState("meus");
  const[saving,setSaving]=useState(false);
  const[modalCat,setModalCat]=useState(false);
  const[modalSol,setModalSol]=useState(null);
  const[editCat,setEditCat]=useState(null);
  const[formCat,setFormCat]=useState({nome:"",descricao:"",categoria:"alimentacao",valor_empresa:"",valor_collab:"",elegibilidade:"todos",icone:"🎁"});
  const[formSol,setFormSol]=useState({motivo:""});
  const[filtCat,setFiltCat]=useState("todos");
  const[busca,setBusca]=useState("");

  const isRH=can(user.role,"gestor");

  const CATS={
    alimentacao:{l:"Alimentação",  c:C.grn,  i:"🍽️"},
    saude:      {l:"Saúde",        c:C.red,  i:"🏥"},
    transporte: {l:"Transporte",   c:C.blu,  i:"🚌"},
    seguro:     {l:"Seguro",       c:C.acc,  i:"🛡️"},
    familia:    {l:"Família",      c:C.ros,  i:"👨‍👩‍👧"},
    bem_estar:  {l:"Bem-estar",    c:C.pur,  i:"💪"},
    educacao:   {l:"Educação",     c:C.amb,  i:"📚"},
    financeiro: {l:"Financeiro",   c:C.grn,  i:"💰"},
    qualidade_vida:{l:"Qualidade de Vida",c:C.acc,i:"🌟"},
    infraestrutura:{l:"Infraestrutura",  c:C.txm,i:"🖥️"},
    outros:     {l:"Outros",       c:C.txm,  i:"🎁"},
  };
  const ELEG={todos:"Todos",colaborador:"Colaboradores",lider:"Líderes+",gestor:"Gestores+",rh:"RH"};

  // ── DADOS DERIVADOS ───────────────────────────────────────────────────
  const meusBeneficios = benUsuarios.filter(bu=>bu.user_id===user.id && bu.status==="ativo");
  const meusIds = new Set(meusBeneficios.map(bu=>bu.beneficio_id));

  const minhasSolics = benSolicits.filter(bs=>bs.user_id===user.id);
  const solicsEmAberto = minhasSolics.filter(bs=>bs.status==="pendente");
  const pendentesRH = benSolicits.filter(bs=>bs.status==="pendente");

  const custoMensal = meusBeneficios.reduce((acc,bu)=>{
    const b = bu.beneficio || benCatalogo.find(b=>b.id===bu.beneficio_id);
    return acc + (parseFloat(b?.valor_empresa||0) + parseFloat(b?.valor_collab||0));
  },0);

  const custoTotalEmpresa = benUsuarios.filter(bu=>bu.status==="ativo").reduce((acc,bu)=>{
    const b = bu.beneficio || benCatalogo.find(b=>b.id===bu.beneficio_id);
    return acc + parseFloat(b?.valor_empresa||0);
  },0);

  const catalogo = benCatalogo
    .filter(b=>b.ativo)
    .filter(b=>filtCat==="todos"||b.categoria===filtCat)
    .filter(b=>b.nome.toLowerCase().includes(busca.toLowerCase()))
    .filter(b=>can(user.role, b.elegibilidade)||b.elegibilidade==="todos");

  // Custo por setor (para RH)
  const custoPorSetor = Object.keys(SL).map(setor=>{
    const usersSetor = users.filter(u=>u.setor===setor);
    const custo = benUsuarios.filter(bu=>{
      if(bu.status!=="ativo") return false;
      return usersSetor.find(u=>u.id===bu.user_id);
    }).reduce((acc,bu)=>{
      const b = bu.beneficio||benCatalogo.find(b=>b.id===bu.beneficio_id);
      return acc+parseFloat(b?.valor_empresa||0);
    },0);
    return{setor:SL[setor],custo,count:usersSetor.length};
  }).filter(d=>d.count>0).sort((a,b)=>b.custo-a.custo);

  // ── ACTIONS ───────────────────────────────────────────────────────────
  const solicitarBeneficio = async(beneficio)=>{
    if(!formSol.motivo.trim()&&beneficio.valor_empresa>0){return;}
    setSaving(true);
    const sb=getSB();
    try{
      const{data}=await sb.from("beneficios_solicitacoes").insert([{
        user_id:user.id,
        user_name:user.name,
        beneficio_id:beneficio.id,
        status:"pendente",
        motivo:formSol.motivo.trim()||"Solicitação sem observação.",
      }]).select("*,beneficio:beneficios_catalogo(*)").single();
      if(data){
        setBenSolicits(p=>[data,...p]);
        setModalSol(null);
        setFormSol({motivo:""});
      }
    }catch(e){console.error(e);}
    setSaving(false);
  };

  const responderSolic = async(id, status, obs="")=>{
    const sb=getSB();
    const{data}=await sb.from("beneficios_solicitacoes")
      .update({status,resp_obs:obs,aprovado_por:user.id,aprovado_em:new Date().toISOString()})
      .eq("id",id).select("*,beneficio:beneficios_catalogo(*)").single();
    if(data){
      setBenSolicits(p=>p.map(s=>s.id===id?data:s));
      // Se aprovado, criar registro em beneficios_usuarios
      if(status==="aprovado"){
        const sol = benSolicits.find(s=>s.id===id);
        if(sol){
          const{data:bu}=await sb.from("beneficios_usuarios").insert([{
            user_id:sol.user_id,
            beneficio_id:sol.beneficio_id,
            status:"ativo",
            data_inicio:new Date().toISOString().split("T")[0],
            aprovado_por:user.id,
          }]).select("*,beneficio:beneficios_catalogo(*)").single();
          if(bu) setBenUsuarios(p=>[...p,bu]);
        }
      }
    }
  };

  const salvarCatalogo = async()=>{
    if(!formCat.nome.trim()) return;
    setSaving(true);
    const sb=getSB();
    const row={
      nome:formCat.nome,descricao:formCat.descricao,
      categoria:formCat.categoria,icone:formCat.icone,
      valor_empresa:parseFloat(formCat.valor_empresa)||0,
      valor_collab:parseFloat(formCat.valor_collab)||0,
      elegibilidade:formCat.elegibilidade,ativo:true,
      criado_por_id:user.id,
    };
    if(editCat){
      const{data}=await sb.from("beneficios_catalogo").update(row).eq("id",editCat).select().single();
      if(data) setBenCatalogo(p=>p.map(b=>b.id===editCat?data:b));
    }else{
      const{data}=await sb.from("beneficios_catalogo").insert([row]).select().single();
      if(data) setBenCatalogo(p=>[...p,data]);
    }
    setModalCat(false);setEditCat(null);
    setFormCat({nome:"",descricao:"",categoria:"alimentacao",valor_empresa:"",valor_collab:"",elegibilidade:"todos",icone:"🎁"});
    setSaving(false);
  };

  const toggleAtivoBeneficio = async(id,ativo)=>{
    const sb=getSB();
    const{data}=await sb.from("beneficios_catalogo").update({ativo:!ativo}).eq("id",id).select().single();
    if(data) setBenCatalogo(p=>p.map(b=>b.id===id?data:b));
  };

  const removerMeuBeneficio = async(buId)=>{
    const sb=getSB();
    await sb.from("beneficios_usuarios").update({status:"cancelado"}).eq("id",buId);
    setBenUsuarios(p=>p.map(b=>b.id===buId?{...b,status:"cancelado"}:b));
  };

  const fmt = v => "R$ "+parseFloat(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2});

  const TABS_COL=[{id:"meus",l:"Meus Benefícios"},{id:"catalogo",l:"Catálogo"},{id:"solicitacoes",l:"Solicitações"}];
  const TABS_RH =[{id:"meus",l:"Painel"},{id:"catalogo",l:"Catálogo"},{id:"solicitacoes",l:"Aprovações"+(pendentesRH.length>0?" ("+pendentesRH.length+")":"")},{id:"relatorio",l:"Relatório"}];
  const TABS = isRH ? TABS_RH : TABS_COL;

  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20,paddingBottom:48}}>

      {/* HEADER */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>◈ Gestão de Benefícios</div>
          <div style={{fontSize:13,color:C.txm,marginTop:2}}>
            {isRH ? `${benCatalogo.filter(b=>b.ativo).length} benefícios ativos · ${benUsuarios.filter(b=>b.status==="ativo").length} vínculos · ${fmt(custoTotalEmpresa)}/mês` : `${meusBeneficios.length} benefícios ativos · ${fmt(custoMensal)}/mês em benefícios`}
          </div>
        </div>
        {isRH&&<Btn onClick={()=>{setEditCat(null);setFormCat({nome:"",descricao:"",categoria:"alimentacao",valor_empresa:"",valor_collab:"",elegibilidade:"todos",icone:"🎁"});setModalCat(true);}}>+ Novo Benefício</Btn>}
      </div>

      {/* TABS */}
      <div style={{display:"flex",background:C.s2,borderRadius:12,padding:4,border:"1px solid "+C.bdr,width:"fit-content",gap:3}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setView(t.id)} style={{padding:"7px 16px",borderRadius:9,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",background:view===t.id?C.bgCard:"transparent",color:view===t.id?C.txt:C.txd,boxShadow:view===t.id?"0 1px 4px rgba(0,0,0,.06)":"none",transition:"all .2s"}}>{t.l}</button>
        ))}
      </div>

      {/* ── MEUS BENEFÍCIOS / PAINEL ───────────────────────────────── */}
      {view==="meus"&&(
        <div className="fadeIn" style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* KPI row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
            {(isRH?[
              {l:"Benefícios no Catálogo",v:benCatalogo.filter(b=>b.ativo).length,c:C.acc,i:"◈"},
              {l:"Vínculos Ativos",v:benUsuarios.filter(b=>b.status==="ativo").length,c:C.grn,i:"✓"},
              {l:"Custo Empresa/Mês",v:fmt(custoTotalEmpresa),c:C.blu,i:"💰"},
              {l:"Aprovações Pendentes",v:pendentesRH.length,c:pendentesRH.length>0?C.amb:C.grn,i:"⏳"},
            ]:[
              {l:"Meus Benefícios",v:meusBeneficios.length,c:C.acc,i:"◈"},
              {l:"Custo Empresa/Mês",v:fmt(meusBeneficios.reduce((a,bu)=>a+parseFloat((bu.beneficio||benCatalogo.find(b=>b.id===bu.beneficio_id))?.valor_empresa||0),0)),c:C.grn,i:"💰"},
              {l:"Minha Contribuição",v:fmt(meusBeneficios.reduce((a,bu)=>a+parseFloat((bu.beneficio||benCatalogo.find(b=>b.id===bu.beneficio_id))?.valor_collab||0),0)),c:C.amb,i:"💳"},
              {l:"Solicitações Abertas",v:solicsEmAberto.length,c:solicsEmAberto.length>0?C.amb:C.txm,i:"📋"},
            ]).map((k,i)=>(
              <div key={i} style={{background:C.bgCard,border:"1px solid "+C.bdr,borderTop:"3px solid "+k.c,borderRadius:16,padding:"18px 20px"}}>
                <div style={{fontSize:11,color:C.txm,fontWeight:700,letterSpacing:".05em",textTransform:"uppercase",marginBottom:8}}>{k.l}</div>
                <div style={{fontSize:typeof k.v==="string"?18:28,fontWeight:800,color:k.c,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Lista de benefícios ativos do colaborador */}
          {!isRH&&(
            <Card style={{padding:24}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:18}}>Seus benefícios ativos</div>
              {meusBeneficios.length===0?(
                <div style={{textAlign:"center",padding:"32px 0",color:C.txd,fontSize:13}}>Nenhum benefício ativo. Explore o catálogo para solicitar.</div>
              ):(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
                  {meusBeneficios.map(bu=>{
                    const b=bu.beneficio||benCatalogo.find(x=>x.id===bu.beneficio_id);
                    if(!b)return null;
                    const cat=CATS[b.categoria]||CATS.outros;
                    const vemp=parseFloat(b.valor_empresa||0);
                    const vcol=parseFloat(b.valor_collab||0);
                    return(
                      <div key={bu.id} style={{background:C.s1,borderRadius:14,padding:"16px 18px",border:"1px solid "+C.bdr,position:"relative"}}>
                        <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:10}}>
                          <div style={{width:44,height:44,borderRadius:12,background:cat.c+"15",border:"1px solid "+cat.c+"25",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{b.icone||cat.i}</div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:14,fontWeight:700,color:C.txt}}>{b.nome}</div>
                            <div style={{fontSize:11,color:C.txd,marginTop:2}}>{b.descricao}</div>
                          </div>
                          <Chip label={cat.l} color={cat.c}/>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8,borderTop:"1px solid "+C.bdr,paddingTop:10}}>
                          <div style={{textAlign:"center",padding:"8px 6px",background:C.grnBg,borderRadius:8}}>
                            <div style={{fontSize:13,fontWeight:800,color:C.grn,fontFamily:"'JetBrains Mono',monospace"}}>{vemp>0?fmt(vemp):"Incluso"}</div>
                            <div style={{fontSize:10,color:C.txd,marginTop:2}}>Empresa paga</div>
                          </div>
                          <div style={{textAlign:"center",padding:"8px 6px",background:vcol>0?C.ambBg:C.grnBg,borderRadius:8}}>
                            <div style={{fontSize:13,fontWeight:800,color:vcol>0?C.amb:C.grn,fontFamily:"'JetBrains Mono',monospace"}}>{vcol>0?fmt(vcol):"Gratuito"}</div>
                            <div style={{fontSize:10,color:C.txd,marginTop:2}}>Sua contribuição</div>
                          </div>
                        </div>
                        <div style={{fontSize:10,color:C.txd,marginTop:8}}>Ativo desde {fd(bu.data_inicio)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {/* Painel RH: custo por setor */}
          {isRH&&(
            <Card style={{padding:24}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:18}}>Custo mensal por setor (empresa)</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {custoPorSetor.map((s,i)=>{
                  const max=custoPorSetor[0]?.custo||1;
                  return(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:110,fontSize:12,fontWeight:600,color:C.txt,flexShrink:0}}>{s.setor}</div>
                      <div style={{flex:1,height:28,background:C.s3,borderRadius:6,overflow:"hidden"}}>
                        <div style={{width:(s.custo/max*100)+"%",height:"100%",background:C.acc,borderRadius:6,transition:"width .5s ease"}}/>
                      </div>
                      <div style={{fontSize:12,fontWeight:700,color:C.acc,fontFamily:"'JetBrains Mono',monospace",minWidth:90,textAlign:"right"}}>{fmt(s.custo)}</div>
                      <div style={{fontSize:11,color:C.txd,minWidth:60}}>{s.count} pessoas</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── CATÁLOGO ──────────────────────────────────────────────── */}
      {view==="catalogo"&&(
        <div className="fadeIn" style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* Filtros */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
            <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar benefício..." style={{flex:1,minWidth:200,background:C.bgCard,border:"1px solid "+C.bdr,borderRadius:9,padding:"9px 13px",color:C.txt,fontSize:13}}/>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              <button onClick={()=>setFiltCat("todos")} style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+(filtCat==="todos"?C.acc:C.bdr),background:filtCat==="todos"?C.accBg:"transparent",color:filtCat==="todos"?C.acc:C.txm,fontSize:11,fontWeight:600,cursor:"pointer"}}>Todos</button>
              {Object.entries(CATS).map(([k,v])=>{
                const count=benCatalogo.filter(b=>b.categoria===k&&b.ativo).length;
                if(!count)return null;
                return(
                  <button key={k} onClick={()=>setFiltCat(filtCat===k?"todos":k)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+(filtCat===k?v.c:C.bdr),background:filtCat===k?v.c+"15":"transparent",color:filtCat===k?v.c:C.txm,fontSize:11,fontWeight:600,cursor:"pointer"}}>
                    {v.i} {v.l}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grid */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
            {catalogo.length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:"32px 0",color:C.txd,fontSize:13}}>Nenhum benefício encontrado.</div>}
            {catalogo.map(b=>{
              const cat=CATS[b.categoria]||CATS.outros;
              const jaAtivo=meusIds.has(b.id);
              const jaSolicitado=minhasSolics.some(s=>s.beneficio_id===b.id&&s.status==="pendente");
              const vemp=parseFloat(b.valor_empresa||0);
              const vcol=parseFloat(b.valor_collab||0);
              const adesoes=benUsuarios.filter(bu=>bu.beneficio_id===b.id&&bu.status==="ativo").length;
              return(
                <div key={b.id} style={{background:C.bgCard,border:"1px solid "+(jaAtivo?cat.c+"40":C.bdr),borderRadius:16,overflow:"hidden",display:"flex",flexDirection:"column",transition:"box-shadow .2s"}}
                  onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 20px rgba(0,0,0,.07)"}
                  onMouseLeave={e=>e.currentTarget.style.boxShadow=""}>
                  {/* Color band */}
                  <div style={{height:5,background:cat.c}}/>
                  <div style={{padding:"18px 20px",flex:1,display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                      <div style={{width:48,height:48,borderRadius:12,background:cat.c+"15",border:"1px solid "+cat.c+"25",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{b.icone||cat.i}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:700,color:C.txt}}>{b.nome}</div>
                        <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                          <Chip label={cat.l} color={cat.c}/>
                          <Chip label={ELEG[b.elegibilidade]||b.elegibilidade} color={C.txm}/>
                        </div>
                      </div>
                    </div>
                    {b.descricao&&<div style={{fontSize:12,color:C.txm,lineHeight:1.5}}>{b.descricao}</div>}
                    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8,marginTop:"auto"}}>
                      <div style={{textAlign:"center",padding:"8px",background:C.grnBg,borderRadius:8}}>
                        <div style={{fontSize:14,fontWeight:800,color:C.grn,fontFamily:"'JetBrains Mono',monospace"}}>{vemp>0?fmt(vemp):"Incluso"}</div>
                        <div style={{fontSize:10,color:C.txd,marginTop:2}}>Empresa</div>
                      </div>
                      <div style={{textAlign:"center",padding:"8px",background:vcol>0?C.ambBg:C.grnBg,borderRadius:8}}>
                        <div style={{fontSize:14,fontWeight:800,color:vcol>0?C.amb:C.grn,fontFamily:"'JetBrains Mono',monospace"}}>{vcol>0?fmt(vcol):"Gratuito"}</div>
                        <div style={{fontSize:10,color:C.txd,marginTop:2}}>Colaborador</div>
                      </div>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                      <span style={{fontSize:11,color:C.txd}}>{adesoes} adesão{adesoes!==1?"ões":""}</span>
                      {isRH&&(
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>{setEditCat(b.id);setFormCat({nome:b.nome,descricao:b.descricao||"",categoria:b.categoria,valor_empresa:b.valor_empresa,valor_collab:b.valor_collab,elegibilidade:b.elegibilidade,icone:b.icone||"🎁"});setModalCat(true);}} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",fontSize:13,padding:"2px 6px"}}>✎</button>
                          <button onClick={()=>toggleAtivoBeneficio(b.id,b.ativo)} style={{background:"none",border:"none",color:b.ativo?C.red:C.grn,cursor:"pointer",fontSize:11,padding:"2px 6px",fontWeight:600}}>{b.ativo?"Desativar":"Ativar"}</button>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Footer action */}
                  <div style={{padding:"12px 20px",borderTop:"1px solid "+C.bdr,background:C.s1}}>
                    {jaAtivo?(
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <Chip label="✓ Ativo" color={C.grn} dot/>
                        {!isRH&&<button onClick={()=>{const bu=benUsuarios.find(x=>x.user_id===user.id&&x.beneficio_id===b.id);if(bu)removerMeuBeneficio(bu.id);}} style={{background:"none",border:"none",color:C.txd,cursor:"pointer",fontSize:11}}>Cancelar</button>}
                      </div>
                    ):jaSolicitado?(
                      <Chip label="⏳ Solicitação pendente" color={C.amb}/>
                    ):(
                      <Btn full sz="sm" onClick={()=>{setModalSol(b);setFormSol({motivo:""})}}>Solicitar benefício</Btn>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SOLICITAÇÕES ──────────────────────────────────────────── */}
      {view==="solicitacoes"&&(
        <div className="fadeIn" style={{display:"flex",flexDirection:"column",gap:12}}>
          {isRH&&pendentesRH.length>0&&(
            <Card style={{borderColor:C.amb+"35",background:C.ambBg,padding:"14px 20px"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.amb}}>⏳ {pendentesRH.length} solicitação{pendentesRH.length!==1?"ões":""} aguardando aprovação</div>
            </Card>
          )}

          {(isRH?benSolicits:minhasSolics).length===0?(
            <Card><div style={{textAlign:"center",padding:"32px 0",color:C.txd,fontSize:13}}>Nenhuma solicitação registrada.</div></Card>
          ):(
            (isRH?benSolicits:minhasSolics).map(sol=>{
              const b=sol.beneficio||benCatalogo.find(x=>x.id===sol.beneficio_id);
              const cat=CATS[b?.categoria]||CATS.outros;
              const solUser=isRH?users.find(u=>u.user_id===sol.user_id||u.id===sol.user_id):null;
              const stColor={pendente:C.amb,aprovado:C.grn,rejeitado:C.red,cancelado:C.txm};
              const stLabel={pendente:"Pendente",aprovado:"Aprovado",rejeitado:"Rejeitado",cancelado:"Cancelado"};
              return(
                <Card key={sol.id} style={{borderLeft:"3px solid "+(stColor[sol.status]||C.bdr)}}>
                  <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                    <div style={{width:44,height:44,borderRadius:12,background:cat.c+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{b?.icone||cat.i}</div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:6}}>
                        <div>
                          <div style={{fontSize:14,fontWeight:700}}>{b?.nome||"Benefício"}</div>
                          <div style={{fontSize:12,color:C.txm,marginTop:2}}>
                            {isRH?<span>👤 {sol.user_name}</span>:<span>Enviada em {fd((sol.created_at||"").split("T")[0])}</span>}
                          </div>
                        </div>
                        <Chip label={stLabel[sol.status]||sol.status} color={stColor[sol.status]||C.txm} dot/>
                      </div>
                      {sol.motivo&&<div style={{fontSize:12,color:C.txd,fontStyle:"italic",marginBottom:8}}>"{sol.motivo}"</div>}
                      {sol.resp_obs&&<div style={{fontSize:12,color:C.txm,background:C.s1,borderRadius:8,padding:"6px 10px",marginBottom:8}}>Resposta RH: {sol.resp_obs}</div>}
                      {isRH&&sol.status==="pendente"&&(
                        <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
                          <Btn v="success" sz="sm" onClick={()=>responderSolic(sol.id,"aprovado","Benefício aprovado e ativado!")}>✓ Aprovar</Btn>
                          <Btn v="danger"  sz="sm" onClick={()=>responderSolic(sol.id,"rejeitado","Solicitação não aprovada no momento.")}>✗ Rejeitar</Btn>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ── RELATÓRIO (RH) ────────────────────────────────────────── */}
      {view==="relatorio"&&isRH&&(
        <div className="fadeIn" style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* Tabela custo por benefício */}
          <Card style={{padding:24}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:18}}>Custo mensal por benefício</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:"2px solid "+C.bdr}}>
                    {["Benefício","Categoria","Adesões","Custo Empresa/ud","Total Empresa/mês","Custo Collab/ud"].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:11,color:C.txd,fontWeight:700,textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {benCatalogo.filter(b=>b.ativo).sort((a,b)=>parseFloat(b.valor_empresa||0)*benUsuarios.filter(bu=>bu.beneficio_id===b.id&&bu.status==="ativo").length - parseFloat(a.valor_empresa||0)*benUsuarios.filter(bu=>bu.beneficio_id===a.id&&bu.status==="ativo").length).map((b,i)=>{
                    const cat=CATS[b.categoria]||CATS.outros;
                    const adesoes=benUsuarios.filter(bu=>bu.beneficio_id===b.id&&bu.status==="ativo").length;
                    const totalMes=parseFloat(b.valor_empresa||0)*adesoes;
                    return(
                      <tr key={b.id} style={{borderBottom:"1px solid "+C.bdr,background:i%2===0?C.s1:"transparent"}}>
                        <td style={{padding:"10px 12px"}}>
                          <div style={{display:"flex",gap:8,alignItems:"center"}}>
                            <span style={{fontSize:16}}>{b.icone||cat.i}</span>
                            <span style={{fontSize:13,fontWeight:600,color:C.txt}}>{b.nome}</span>
                          </div>
                        </td>
                        <td style={{padding:"10px 12px"}}><Chip label={cat.l} color={cat.c}/></td>
                        <td style={{padding:"10px 12px",fontSize:13,fontFamily:"'JetBrains Mono',monospace",color:C.acc,textAlign:"center"}}>{adesoes}</td>
                        <td style={{padding:"10px 12px",fontSize:13,fontFamily:"'JetBrains Mono',monospace",color:C.grn}}>{fmt(b.valor_empresa)}</td>
                        <td style={{padding:"10px 12px",fontSize:13,fontFamily:"'JetBrains Mono',monospace",color:C.acc,fontWeight:700}}>{fmt(totalMes)}</td>
                        <td style={{padding:"10px 12px",fontSize:13,fontFamily:"'JetBrains Mono',monospace",color:parseFloat(b.valor_collab)>0?C.amb:C.grn}}>{parseFloat(b.valor_collab)>0?fmt(b.valor_collab):"Gratuito"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:"2px solid "+C.bdr,background:C.accBg}}>
                    <td colSpan={4} style={{padding:"10px 12px",fontSize:13,fontWeight:700,color:C.txt}}>Total geral</td>
                    <td style={{padding:"10px 12px",fontSize:14,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color:C.acc}}>{fmt(custoTotalEmpresa)}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* Top colaboradores por custo */}
          <Card style={{padding:24}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:18}}>Colaboradores com maior pacote de benefícios</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {users.map(u=>{
                const custoU=benUsuarios.filter(bu=>bu.user_id===u.id&&bu.status==="ativo").reduce((acc,bu)=>{
                  const b=bu.beneficio||benCatalogo.find(b=>b.id===bu.beneficio_id);
                  return acc+parseFloat(b?.valor_empresa||0);
                },0);
                return{...u,custoU,qtd:benUsuarios.filter(bu=>bu.user_id===u.id&&bu.status==="ativo").length};
              }).sort((a,b)=>b.custoU-a.custoU).slice(0,8).map((u,i)=>{
                const col=SC[u.setor]||C.acc;
                const maxCusto=benCatalogo.filter(b=>b.ativo).reduce((a,b)=>a+parseFloat(b.valor_empresa||0),0)||1;
                return(
                  <div key={u.id} style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:11,color:C.txd,fontWeight:600,width:18,textAlign:"right"}}>#{i+1}</span>
                    <Av name={u.name} size={30} color={col}/>
                    <div style={{width:160,fontSize:12,fontWeight:600,color:C.txt,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name.split(" ").slice(0,2).join(" ")}</div>
                    <Chip label={SL[u.setor]||u.setor} color={col}/>
                    <div style={{flex:1,height:6,background:C.s3,borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:(u.custoU/maxCusto*100)+"%",height:"100%",background:C.acc,borderRadius:3}}/>
                    </div>
                    <span style={{fontSize:12,fontWeight:700,color:C.acc,fontFamily:"'JetBrains Mono',monospace",minWidth:90,textAlign:"right"}}>{fmt(u.custoU)}</span>
                    <span style={{fontSize:11,color:C.txd,minWidth:50}}>{u.qtd} benefícios</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ── MODAL: SOLICITAR BENEFÍCIO ──────────────────────────── */}
      <Modal open={!!modalSol} onClose={()=>setModalSol(null)} title={"Solicitar — "+(modalSol?.nome||"")} width={480}>
        {modalSol&&(()=>{
          const cat=CATS[modalSol.categoria]||CATS.outros;
          const vemp=parseFloat(modalSol.valor_empresa||0);
          const vcol=parseFloat(modalSol.valor_collab||0);
          return(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={{display:"flex",gap:14,alignItems:"center",background:C.s1,borderRadius:12,padding:"14px 16px"}}>
                <div style={{width:52,height:52,borderRadius:12,background:cat.c+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>{modalSol.icone||cat.i}</div>
                <div>
                  <div style={{fontSize:15,fontWeight:700}}>{modalSol.nome}</div>
                  <div style={{fontSize:12,color:C.txm,marginTop:2}}>{modalSol.descricao}</div>
                  <div style={{display:"flex",gap:10,marginTop:6}}>
                    <span style={{fontSize:11,color:C.grn,fontWeight:700}}>Empresa: {vemp>0?fmt(vemp):"Gratuito"}</span>
                    {vcol>0&&<span style={{fontSize:11,color:C.amb,fontWeight:700}}>Sua parte: {fmt(vcol)}/mês</span>}
                  </div>
                </div>
              </div>
              <Tex label="Justificativa / Observações" value={formSol.motivo} onChange={e=>setFormSol({...formSol,motivo:e.target.value})} placeholder="Explique brevemente por que está solicitando este benefício..." rows={3}/>
              <div style={{background:C.accBg,borderRadius:9,padding:"10px 14px",fontSize:12,color:C.accLt}}>
                📋 Sua solicitação será analisada pelo RH. Você receberá uma notificação quando for aprovada ou rejeitada.
              </div>
              <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                <Btn v="outline" onClick={()=>setModalSol(null)}>Cancelar</Btn>
                <Btn onClick={()=>solicitarBeneficio(modalSol)} disabled={saving}>{saving?<Spin size={14} color="#fff"/>:null} Enviar solicitação</Btn>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── MODAL: CRIAR/EDITAR BENEFÍCIO (RH) ─────────────────── */}
      <Modal open={modalCat} onClose={()=>{setModalCat(false);setEditCat(null);}} title={editCat?"Editar Benefício":"Novo Benefício"} width={520}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"grid",gridTemplateColumns:"52px 1fr",gap:12,alignItems:"end"}}>
            <Inp label="Ícone" value={formCat.icone} onChange={e=>setFormCat({...formCat,icone:e.target.value})} style={{fontSize:24,textAlign:"center",padding:"6px"}}/>
            <Inp label="Nome do Benefício *" value={formCat.nome} onChange={e=>setFormCat({...formCat,nome:e.target.value})} placeholder="Ex: Vale Academia"/>
          </div>
          <Tex label="Descrição" value={formCat.descricao} onChange={e=>setFormCat({...formCat,descricao:e.target.value})} rows={2} placeholder="Detalhes sobre o benefício..."/>
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
            <Sel label="Categoria" value={formCat.categoria} onChange={e=>setFormCat({...formCat,categoria:e.target.value})} options={Object.entries(CATS).map(([k,v])=>({value:k,label:v.i+" "+v.l}))}/>
            <Sel label="Elegibilidade" value={formCat.elegibilidade} onChange={e=>setFormCat({...formCat,elegibilidade:e.target.value})} options={Object.entries(ELEG).map(([k,v])=>({value:k,label:v}))}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
            <Inp label="Valor Empresa (R$/mês)" type="number" value={formCat.valor_empresa} onChange={e=>setFormCat({...formCat,valor_empresa:e.target.value})} placeholder="0,00"/>
            <Inp label="Contribuição Colaborador" type="number" value={formCat.valor_collab} onChange={e=>setFormCat({...formCat,valor_collab:e.target.value})} placeholder="0,00"/>
          </div>
          {(parseFloat(formCat.valor_empresa)||0)+(parseFloat(formCat.valor_collab)||0)>0&&(
            <div style={{background:C.grnBg,border:"1px solid "+C.grn+"25",borderRadius:9,padding:"10px 14px",fontSize:12,color:C.grn,fontWeight:600}}>
              💰 Custo total por colaborador: {fmt((parseFloat(formCat.valor_empresa)||0)+(parseFloat(formCat.valor_collab)||0))}/mês
            </div>
          )}
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn v="outline" onClick={()=>{setModalCat(false);setEditCat(null);}}>Cancelar</Btn>
            <Btn onClick={salvarCatalogo} disabled={!formCat.nome.trim()||saving}>{saving?<Spin size={14} color="#fff"/>:null} {editCat?"Salvar":"Criar Benefício"}</Btn>
          </div>
        </div>
      </Modal>

    </div>
  );
}


// MOVIMENTAÇÕES — Admissão e Demissão (escala Líder → Gestor → RH)
function Movimentacoes({user,users,movs,setMovs,setUsers,vagas,setVagas}){
  const[tab,setTab]=useState("pendentes");
  const[modalNova,setModalNova]=useState(null); // "admissao" | "demissao" | null
  const[modalDecisao,setModalDecisao]=useState(null); // movimentação selecionada
  const[saving,setSaving]=useState(false);

  // Etapa 1 — Líder só justifica a necessidade (admissão) ou pede a saída (demissão)
  const[formAdmLider,setFormAdmLider]=useState({setor:"producao",gestorId:"",motivo:""});
  const[formDemLider,setFormDemLider]=useState({userId:"",gestorId:"",motivo:""});

  // Etapa 2 — Gestor detalha (preenchido dentro do modal de decisão)
  const[formGestorAdm,setFormGestorAdm]=useState({cargo:"",salario:"",requisitos:"",prazoEncerramento:"",dataPrevista:""});
  const[formGestorDem,setFormGestorDem]=useState({tipoDemissao:"sem_justa_causa",ultimoDia:"",obs:""});

  const[obsRH,setObsRH]=useState("");

  const isRH=can(user.role,"rh");
  const gestores=users.filter(u=>can(u.role,"gestor"));

  const TIPO_DEM={sem_justa_causa:"Sem justa causa",justa_causa:"Justa causa",pedido_demissao:"Pedido do colaborador",acordo:"Acordo (distrato)",fim_contrato:"Fim de contrato"};
  const STAGE={pendente_lider:{l:"Aguard. Líder",c:C.amb,n:1},pendente_gestor:{l:"Aguard. Gestor",c:C.blu,n:2},pendente_rh:{l:"Aguard. RH",c:C.pur,n:3},aprovado:{l:"Aprovado",c:C.grn,n:4},rejeitado:{l:"Rejeitado",c:C.red,n:4}};

  // ── Quem precisa agir em cada etapa ───────────────────────────────
  const minhasPendencias=movs.filter(m=>{
    if(m.status==="aprovado"||m.status==="rejeitado")return false;
    if(m.status==="pendente_lider")return user.id===m.liderId;
    if(m.status==="pendente_gestor")return user.id===m.gestorId||isRH;
    if(m.status==="pendente_rh")return isRH;
    return false;
  });

  const visiveis=isRH?movs:movs.filter(m=>m.solicitanteId===user.id||m.liderId===user.id||m.gestorId===user.id||m.userId===user.id);
  const concluidas=visiveis.filter(m=>m.status==="aprovado"||m.status==="rejeitado");

  // ── Etapa 1 (Líder): abrir pedido de admissão — só setor + gestor + justificativa ──
  const abrirAdmissaoLider=async()=>{
    if(!formAdmLider.gestorId||!formAdmLider.motivo.trim())return;
    setSaving(true);
    const sb=getSB();
    const{data}=await sb.from("movimentacoes").insert([{
      tipo:"admissao",status:"pendente_gestor",
      solicitante_id:user.id,solicitante_name:user.name,
      setor:formAdmLider.setor,lider_id:user.id,gestor_id:parseInt(formAdmLider.gestorId),
      motivo:formAdmLider.motivo.trim(),
    }]).select().single();
    if(data){setMovs(p=>[mmv(data),...p]);setModalNova(null);setFormAdmLider({setor:"producao",gestorId:"",motivo:""});}
    setSaving(false);
  };

  // ── Etapa 1 (Líder): abrir pedido de demissão — só colaborador + gestor + justificativa ──
  const abrirDemissaoLider=async()=>{
    if(!formDemLider.userId||!formDemLider.gestorId||!formDemLider.motivo.trim())return;
    setSaving(true);
    const colab=users.find(u=>u.id===parseInt(formDemLider.userId));
    const sb=getSB();
    const{data}=await sb.from("movimentacoes").insert([{
      tipo:"demissao",status:"pendente_gestor",
      solicitante_id:user.id,solicitante_name:user.name,
      user_id:colab.id,nome:colab.name,cargo:colab.cargo,setor:colab.setor,
      lider_id:user.id,gestor_id:parseInt(formDemLider.gestorId),
      motivo:formDemLider.motivo.trim(),
    }]).select().single();
    if(data){setMovs(p=>[mmv(data),...p]);setModalNova(null);setFormDemLider({userId:"",gestorId:"",motivo:""});}
    setSaving(false);
  };

  // ── Etapa 2 (Gestor): detalha admissão — cargo, salário, requisitos, prazo — segue direto pro RH ──
  const detalharAdmissaoGestor=async mov=>{
    if(!formGestorAdm.cargo.trim()||!formGestorAdm.salario.trim())return;
    setSaving(true);
    const sb=getSB();
    const{data}=await sb.from("movimentacoes").update({
      cargo:formGestorAdm.cargo.trim(),salario:formGestorAdm.salario.trim(),
      requisitos:formGestorAdm.requisitos.trim(),prazo_encerramento:formGestorAdm.prazoEncerramento||null,
      data_prevista:formGestorAdm.dataPrevista||null,
      gestor_em:new Date().toISOString(),status:"pendente_rh",
    }).eq("id",mov.id).select().single();
    if(data){setMovs(p=>p.map(m=>m.id===mov.id?mmv(data):m));setModalDecisao(null);setFormGestorAdm({cargo:"",salario:"",requisitos:"",prazoEncerramento:"",dataPrevista:""});}
    setSaving(false);
  };

  // ── Etapa 2 (Gestor): detalha demissão — tipo, último dia, observações — segue direto pro RH ──
  const detalharDemissaoGestor=async mov=>{
    if(!formGestorDem.ultimoDia)return;
    setSaving(true);
    const sb=getSB();
    const{data}=await sb.from("movimentacoes").update({
      tipo_demissao:formGestorDem.tipoDemissao,ultimo_dia:formGestorDem.ultimoDia,
      gestor_obs:formGestorDem.obs.trim(),gestor_em:new Date().toISOString(),status:"pendente_rh",
    }).eq("id",mov.id).select().single();
    if(data){setMovs(p=>p.map(m=>m.id===mov.id?mmv(data):m));setModalDecisao(null);setFormGestorDem({tipoDemissao:"sem_justa_causa",ultimoDia:"",obs:""});}
    setSaving(false);
  };

  // ── Etapa 3 (RH): decisão final — efetiva tudo ──────────────────────
  const decidirRH=async(mov,decisao)=>{
    setSaving(true);
    const sb=getSB();
    const{data}=await sb.from("movimentacoes").update({
      rh_decisao:decisao,rh_obs:obsRH,rh_em:new Date().toISOString(),rh_id:user.id,
      status:decisao,
    }).eq("id",mov.id).select().single();

    if(data&&decisao==="aprovado"){
      if(mov.tipo==="admissao"){
        // Cria a VAGA automaticamente em Vagas e Candidatos, com prazo de encerramento
        const{data:vaga}=await sb.from("vagas").insert([{
          id:String(Date.now()).slice(-6),
          title:mov.cargo,area:SL[mov.setor]||mov.setor,local:"Kalenborn — presencial",
          tipo:"CLT",descricao:(mov.requisitos||"")+(mov.salario?"\\n\\nSalário: "+mov.salario:""),
          salario:mov.salario,requisitos:mov.requisitos,prazo_encerramento:mov.prazoEncerramento,
          ativa:true,movimentacao_id:mov.id,
        }]).select().single();
        if(vaga){
          setVagas(p=>[...p,mv(vaga)]);
          await sb.from("movimentacoes").update({vaga_criada_id:vaga.id}).eq("id",mov.id);
        }
      }else if(mov.tipo==="demissao"){
        await sb.from("usuarios").update({status:"desligado",data_desligamento:mov.ultimoDia||new Date().toISOString().split("T")[0]}).eq("id",mov.userId);
        setUsers(p=>p.map(u=>u.id===mov.userId?{...u,status:"desligado"}:u));
      }
    }
    if(data){setMovs(p=>p.map(m=>m.id===mov.id?mmv(data):m));setModalDecisao(null);setObsRH("");}
    setSaving(false);
  };

  const podeAgir=mov=>{
    if(mov.status==="pendente_lider")return user.id===mov.liderId;
    if(mov.status==="pendente_gestor")return user.id===mov.gestorId||isRH;
    if(mov.status==="pendente_rh")return isRH;
    return false;
  };

  const abrirModalDecisao=mov=>{
    if(mov.tipo==="admissao")setFormGestorAdm({cargo:mov.cargo||"",salario:mov.salario||"",requisitos:mov.requisitos||"",prazoEncerramento:mov.prazoEncerramento||"",dataPrevista:mov.dataPrevista||""});
    if(mov.tipo==="demissao")setFormGestorDem({tipoDemissao:mov.tipoDemissao||"sem_justa_causa",ultimoDia:mov.ultimoDia||"",obs:mov.gestorObs||""});
    setObsRH("");
    setModalDecisao(mov);
  };

  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>⇄ Admissão / Demissão</div>
          <div style={{fontSize:13,color:C.txm,marginTop:2}}>Líder solicita → Gestor detalha → RH decide e efetiva</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {can(user.role,"lider")&&<Btn v="success" onClick={()=>setModalNova("admissao")}>+ Pedir admissão</Btn>}
          {can(user.role,"lider")&&<Btn v="danger" onClick={()=>setModalNova("demissao")}>+ Pedir demissão</Btn>}
        </div>
      </div>

      <div style={{display:"flex",gap:3,background:C.s2,borderRadius:10,padding:3,border:"1px solid "+C.bdr,width:"fit-content"}}>
        {[{id:"pendentes",l:"Pendentes"+(minhasPendencias.length>0?" ("+minhasPendencias.length+")":"")},{id:"todas",l:"Todas"},{id:"concluidas",l:"Concluídas"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 16px",borderRadius:8,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",background:tab===t.id?C.acc:"transparent",color:tab===t.id?"#fff":C.txm,transition:"all .2s"}}>{t.l}</button>
        ))}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {(tab==="pendentes"?minhasPendencias:tab==="concluidas"?concluidas:visiveis).length===0&&(
          <Card><div style={{color:C.txd,textAlign:"center",padding:18}}>Nenhuma movimentação {tab==="pendentes"?"pendente para você":tab==="concluidas"?"concluída":"registrada"}.</div></Card>
        )}
        {(tab==="pendentes"?minhasPendencias:tab==="concluidas"?concluidas:visiveis).map(mov=>{
          const stage=STAGE[mov.status]||{l:mov.status,c:C.txm,n:0};
          const tipoIcon=mov.tipo==="admissao"?"➕":"➖";
          const tipoColor=mov.tipo==="admissao"?C.grn:C.red;
          const acao=podeAgir(mov);
          const titulo=mov.tipo==="admissao"?(mov.cargo||"Vaga a definir pelo gestor"):mov.nome;
          return(
            <Card key={mov.id} style={{borderLeft:"3px solid "+tipoColor}}>
              <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                <div style={{width:40,height:40,borderRadius:10,background:tipoColor+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{tipoIcon}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:6}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{titulo}</div>
                      <div style={{fontSize:12,color:C.txm}}>
                        {SL[mov.setor]||mov.setor}
                        {mov.tipo==="demissao"&&mov.tipoDemissao?" · "+TIPO_DEM[mov.tipoDemissao]:""}
                        {mov.tipo==="admissao"&&mov.salario?" · "+mov.salario:""}
                      </div>
                    </div>
                    <Chip label={stage.l} color={stage.c} dot/>
                  </div>

                  <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:10}}>
                    {["Líder","Gestor","RH"].map((etapa,i)=>{
                      const passou=stage.n>i+1||(stage.n===4&&mov.status==="aprovado");
                      const atual=stage.n===i+1;
                      const cor=mov.status==="rejeitado"&&stage.n===4?C.red:passou||atual?C.acc:C.s3;
                      return(
                        <div key={etapa} style={{display:"flex",alignItems:"center",gap:4}}>
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <div style={{width:18,height:18,borderRadius:"50%",background:passou?cor:atual?cor+"25":C.s3,border:"2px solid "+cor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:passou?"#fff":cor,fontWeight:700}}>{passou?"✓":i+1}</div>
                            <span style={{fontSize:10,color:passou||atual?C.txt:C.txd,fontWeight:atual?700:400}}>{etapa}</span>
                          </div>
                          {i<2&&<div style={{width:20,height:2,background:passou?C.acc:C.s3}}/>}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:acao?10:0}}>
                    {mov.motivo&&<Chip label={"Líder: "+mov.motivo.substring(0,40)+(mov.motivo.length>40?"…":"")} color={C.amb}/>}
                    {mov.gestorEm&&<Chip label="✓ Detalhado pelo Gestor" color={C.blu}/>}
                    {mov.rhDecisao&&<Chip label={"RH: "+(mov.rhDecisao==="aprovado"?"✓ Aprovado":"✗ Rejeitado")} color={mov.rhDecisao==="aprovado"?C.grn:C.red}/>}
                    {mov.vagaCriadaId&&<Chip label={"📋 Vaga #"+mov.vagaCriadaId+" criada"} color={C.pur}/>}
                  </div>

                  {acao&&<Btn sz="sm" onClick={()=>abrirModalDecisao(mov)}>
                    {mov.status==="pendente_gestor"?"Detalhar e enviar →":mov.status==="pendente_rh"?"Decidir →":"Avaliar →"}
                  </Btn>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* MODAL: Líder pede Admissão — só justificativa, sem cargo/salário */}
      <Modal open={modalNova==="admissao"} onClose={()=>setModalNova(null)} title="Pedir Admissão" width={480}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:C.accBg,borderRadius:9,padding:"10px 14px",fontSize:12,color:C.accLt}}>📋 Você só precisa justificar a necessidade. Cargo, salário e requisitos serão definidos pelo gestor na próxima etapa.</div>
          <Sel label="Setor com a necessidade *" value={formAdmLider.setor} onChange={e=>setFormAdmLider({...formAdmLider,setor:e.target.value})} options={Object.entries(SL).filter(([k])=>!["producao_b","producao_c","ti","vulcanizacao","corte"].includes(k)).map(([k,v])=>({value:k,label:v}))}/>
          <Sel label="Gestor responsável *" value={formAdmLider.gestorId} onChange={e=>setFormAdmLider({...formAdmLider,gestorId:e.target.value})} options={[{value:"",label:"Selecione..."},...gestores.map(u=>({value:u.id,label:u.name}))]}/>
          <Tex label="Justificativa da necessidade *" value={formAdmLider.motivo} onChange={e=>setFormAdmLider({...formAdmLider,motivo:e.target.value})} rows={4} placeholder="Por que essa contratação é necessária? Qual a urgência?"/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn v="outline" onClick={()=>setModalNova(null)}>Cancelar</Btn>
            <Btn onClick={abrirAdmissaoLider} disabled={!formAdmLider.gestorId||!formAdmLider.motivo.trim()||saving}>{saving?<Spin size={14} color="#fff"/>:null} Enviar ao gestor</Btn>
          </div>
        </div>
      </Modal>

      {/* MODAL: Líder pede Demissão — só justificativa */}
      <Modal open={modalNova==="demissao"} onClose={()=>setModalNova(null)} title="Pedir Demissão" width={480}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:C.redBg,borderRadius:9,padding:"10px 14px",fontSize:12,color:C.red}}>⚠ Você só precisa justificar o pedido. Tipo de desligamento e último dia serão definidos pelo gestor.</div>
          <Sel label="Colaborador *" value={formDemLider.userId} onChange={e=>setFormDemLider({...formDemLider,userId:e.target.value})} options={[{value:"",label:"Selecione..."},...users.filter(u=>u.status!=="desligado"&&u.liderId===user.id).map(u=>({value:u.id,label:u.name+" — "+u.cargo}))]}/>
          <Sel label="Gestor responsável *" value={formDemLider.gestorId} onChange={e=>setFormDemLider({...formDemLider,gestorId:e.target.value})} options={[{value:"",label:"Selecione..."},...gestores.map(u=>({value:u.id,label:u.name}))]}/>
          <Tex label="Justificativa *" value={formDemLider.motivo} onChange={e=>setFormDemLider({...formDemLider,motivo:e.target.value})} rows={4} placeholder="Motivo do pedido de desligamento..."/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn v="outline" onClick={()=>setModalNova(null)}>Cancelar</Btn>
            <Btn v="danger" onClick={abrirDemissaoLider} disabled={!formDemLider.userId||!formDemLider.gestorId||!formDemLider.motivo.trim()||saving}>{saving?<Spin size={14} color="#fff"/>:null} Enviar ao gestor</Btn>
          </div>
        </div>
      </Modal>

      {/* MODAL: Decisão — varia por etapa (Gestor detalha / RH decide) */}
      <Modal open={!!modalDecisao} onClose={()=>setModalDecisao(null)} title={(modalDecisao?.tipo==="admissao"?"Admissão":"Demissão")+" — "+(modalDecisao?.tipo==="admissao"?(SL[modalDecisao?.setor]||""):(modalDecisao?.nome||""))} width={520}>
        {modalDecisao&&(()=>{
          const mov=modalDecisao;
          const ehGestor=mov.status==="pendente_gestor"&&(user.id===mov.gestorId||isRH);
          const ehRH=mov.status==="pendente_rh"&&isRH;

          return(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={{background:C.s1,borderRadius:10,padding:"12px 16px"}}>
                <div style={{fontSize:12,color:C.txd,marginBottom:4}}>Pedido do líder {mov.solicitanteName}</div>
                <div style={{fontSize:13,color:C.txm,fontStyle:"italic"}}>"{mov.motivo}"</div>
              </div>

              {/* ── ETAPA GESTOR: ADMISSÃO ── */}
              {ehGestor&&mov.tipo==="admissao"&&(
                <>
                  <div style={{fontSize:12,color:C.blu,background:C.bluBg,borderRadius:9,padding:"8px 12px"}}>👤 Defina os detalhes da vaga antes de enviar ao RH.</div>
                  <Inp label="Cargo *" value={formGestorAdm.cargo} onChange={e=>setFormGestorAdm({...formGestorAdm,cargo:e.target.value})} placeholder="Ex: Auxiliar de Produção IB"/>
                  <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
                    <Inp label="Salário *" value={formGestorAdm.salario} onChange={e=>setFormGestorAdm({...formGestorAdm,salario:e.target.value})} placeholder="R$ 1.800,00"/>
                    <Inp label="Data prevista" type="date" value={formGestorAdm.dataPrevista} onChange={e=>setFormGestorAdm({...formGestorAdm,dataPrevista:e.target.value})}/>
                  </div>
                  <Inp label="Prazo de encerramento da vaga" type="date" value={formGestorAdm.prazoEncerramento} onChange={e=>setFormGestorAdm({...formGestorAdm,prazoEncerramento:e.target.value})}/>
                  <Tex label="Requisitos da vaga" value={formGestorAdm.requisitos} onChange={e=>setFormGestorAdm({...formGestorAdm,requisitos:e.target.value})} rows={3} placeholder="Experiência, formação, habilidades necessárias..."/>
                  <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                    <Btn v="outline" onClick={()=>setModalDecisao(null)}>Cancelar</Btn>
                    <Btn onClick={()=>detalharAdmissaoGestor(mov)} disabled={!formGestorAdm.cargo.trim()||!formGestorAdm.salario.trim()||saving}>{saving?<Spin size={14} color="#fff"/>:null} Enviar ao RH</Btn>
                  </div>
                </>
              )}

              {/* ── ETAPA GESTOR: DEMISSÃO ── */}
              {ehGestor&&mov.tipo==="demissao"&&(
                <>
                  <div style={{fontSize:12,color:C.blu,background:C.bluBg,borderRadius:9,padding:"8px 12px"}}>👤 Defina o tipo de desligamento antes de enviar ao RH.</div>
                  <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
                    <Sel label="Tipo de desligamento *" value={formGestorDem.tipoDemissao} onChange={e=>setFormGestorDem({...formGestorDem,tipoDemissao:e.target.value})} options={Object.entries(TIPO_DEM).map(([k,v])=>({value:k,label:v}))}/>
                    <Inp label="Último dia *" type="date" value={formGestorDem.ultimoDia} onChange={e=>setFormGestorDem({...formGestorDem,ultimoDia:e.target.value})}/>
                  </div>
                  <Tex label="Observações" value={formGestorDem.obs} onChange={e=>setFormGestorDem({...formGestorDem,obs:e.target.value})} rows={3} placeholder="Detalhes adicionais para o RH..."/>
                  <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                    <Btn v="outline" onClick={()=>setModalDecisao(null)}>Cancelar</Btn>
                    <Btn v="danger" onClick={()=>detalharDemissaoGestor(mov)} disabled={!formGestorDem.ultimoDia||saving}>{saving?<Spin size={14} color="#fff"/>:null} Enviar ao RH</Btn>
                  </div>
                </>
              )}

              {/* ── ETAPA RH: DECISÃO FINAL ── */}
              {ehRH&&(
                <>
                  <div style={{background:C.s1,borderRadius:10,padding:"12px 16px",display:"flex",flexDirection:"column",gap:6}}>
                    <div style={{fontSize:12,color:C.txd}}>Detalhado pelo gestor:</div>
                    {mov.tipo==="admissao"?(
                      <>
                        <div style={{fontSize:13,fontWeight:700}}>{mov.cargo} · {mov.salario}</div>
                        {mov.requisitos&&<div style={{fontSize:12,color:C.txm}}>{mov.requisitos}</div>}
                        {mov.prazoEncerramento&&<div style={{fontSize:11,color:C.txd}}>Prazo da vaga: {fd(mov.prazoEncerramento)}</div>}
                      </>
                    ):(
                      <>
                        <div style={{fontSize:13,fontWeight:700}}>{TIPO_DEM[mov.tipoDemissao]} · Último dia: {fd(mov.ultimoDia)}</div>
                        {mov.gestorObs&&<div style={{fontSize:12,color:C.txm}}>{mov.gestorObs}</div>}
                      </>
                    )}
                  </div>
                  <div style={{fontSize:12,color:C.pur,background:C.purBg,borderRadius:9,padding:"8px 12px"}}>
                    🔑 Decisão final — {mov.tipo==="admissao"?"aprovar cria automaticamente a vaga em Vagas e Candidatos":"aprovar desliga o colaborador (preserva histórico)"}.
                  </div>
                  <Tex label="Observações da decisão" value={obsRH} onChange={e=>setObsRH(e.target.value)} rows={3} placeholder="Justificativa da decisão final..."/>
                  <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                    <Btn v="outline" onClick={()=>setModalDecisao(null)}>Cancelar</Btn>
                    <Btn v="danger" onClick={()=>decidirRH(mov,"rejeitado")} disabled={saving}>✗ Rejeitar</Btn>
                    <Btn v="success" onClick={()=>decidirRH(mov,"aprovado")} disabled={saving}>{saving?<Spin size={14} color="#fff"/>:null} ✓ Aprovar e efetivar</Btn>
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

// PESQUISA DE CLIMA
function PesquisaClima({user,users,pulses,setPulses,nps,setNps}){
  const[view,setView]=useState("home");
  const[saving,setSaving]=useState(false);

  // ── PULSE STATE ───────────────────────────────────────────────────────
  const[pulseScore,setPulseScore]=useState(null);
  const[pulseText,setPulseText]=useState("");
  const[pulseTag,setPulseTag]=useState("");

  // ── eNPS STATE ────────────────────────────────────────────────────────
  const[npsScore,setNpsScore]=useState(null);
  const[npsMotivo,setNpsMotivo]=useState("");
  const[npsMelhor,setNpsMelhor]=useState("");

  // ── DENÚNCIA STATE ────────────────────────────────────────────────────
  const[denTipo,setDenTipo]=useState("assedio");
  const[denTexto,setDenTexto]=useState("");
  const[denEnviada,setDenEnviada]=useState(false);

  // ── HELPERS ───────────────────────────────────────────────────────────
  const hoje = new Date();
  const semanaAtual = `${hoje.getFullYear()}-W${String(Math.ceil((hoje.getDate()-hoje.getDay()+hoje.getDay())/7)).padStart(2,"0")}`;
  const trimAtual = `${hoje.getFullYear()}-Q${Math.ceil((hoje.getMonth()+1)/3)}`;

  const jaRespondeuPulse = pulses.some(p=>
    p.user_id===user.id && p.semana===semanaAtual
  );
  const jaRespondeuNps = nps.some(n=>
    n.user_id===user.id && n.trimestre===trimAtual
  );

  // ── CÁLCULOS ──────────────────────────────────────────────────────────
  // Pulse: média dos últimos 8 pulses (todos usuários)
  const meses=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  const pulsesPorSemana = (() => {
    const map = {};
    pulses.forEach(p=>{
      if(!map[p.semana]) map[p.semana]={semana:p.semana,total:0,soma:0,count:0};
      map[p.semana].soma += p.score;
      map[p.semana].count++;
    });
    return Object.values(map)
      .sort((a,b)=>a.semana.localeCompare(b.semana))
      .slice(-8)
      .map(d=>({...d, media:parseFloat((d.soma/d.count).toFixed(1)), label:d.semana.replace("-W","·S")}));
  })();

  const mediaGlobalPulse = pulses.length > 0
    ? parseFloat((pulses.reduce((a,b)=>a+b.score,0)/pulses.length).toFixed(1))
    : null;

  // eNPS: todos os NPS do trimestre atual
  const npsTriAtual = nps.filter(n=>n.trimestre===trimAtual);
  const promotores = npsTriAtual.filter(n=>n.score>=9).length;
  const detratores = npsTriAtual.filter(n=>n.score<=6).length;
  const eNPS = npsTriAtual.length > 0
    ? Math.round(((promotores - detratores) / npsTriAtual.length) * 100)
    : null;
  const eNPSColor = eNPS===null ? C.txd : eNPS >= 50 ? C.grn : eNPS >= 0 ? C.amb : C.red;
  const eNPSLabel = eNPS===null ? "—" : eNPS >= 70 ? "Excelente" : eNPS >= 50 ? "Muito Bom" : eNPS >= 0 ? "Atenção" : "Crítico";

  // Tags de pulse mais frequentes
  const tagCounts = {};
  pulses.forEach(p=>{ if(p.tag){tagCounts[p.tag]=(tagCounts[p.tag]||0)+1;} });
  const topTags = Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);

  // Comentários recentes (anônimos, sem identificar user)
  const comentariosRecentes = pulses
    .filter(p=>p.texto && p.texto.trim().length > 0)
    .sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||""))
    .slice(0,6);

  // Distribuição NPS
  const npsHist = [0,1,2,3,4,5,6,7,8,9,10].map(v=>({
    nota: v,
    total: nps.filter(n=>n.score===v).length,
    tipo: v>=9?"promotor":v>=7?"neutro":"detrator",
  }));

  // Pulse por setor (anonimizado — só mostra se > 2 respostas)
  const pulseSetor = Object.keys(SL).map(s=>{
    const usersSetor = users.filter(u=>u.setor===s).map(u=>u.id);
    const ps = pulses.filter(p=>usersSetor.includes(p.user_id));
    if(ps.length < 2) return null;
    return{setor:SL[s], media:parseFloat((ps.reduce((a,b)=>a+b.score,0)/ps.length).toFixed(1)), count:ps.length};
  }).filter(Boolean).sort((a,b)=>b.media-a.media);

  // ── ACTIONS ───────────────────────────────────────────────────────────
  const enviarPulse = async()=>{
    if(pulseScore===null) return;
    setSaving(true);
    const sb=getSB();
    const row={
      user_id: user.id,
      semana: semanaAtual,
      score: pulseScore,
      texto: pulseText.trim()||null,
      tag: pulseTag||null,
      setor: user.setor,
    };
    try{
      const{data,error}=await sb.from("clima_pulses").insert([row]).select().single();
      if(data){
        setPulses(p=>[data,...p]);
        setPulseScore(null); setPulseText(""); setPulseTag("");
        setView("resultados");
      }
    }catch(e){console.error(e);}
    setSaving(false);
  };

  const enviarNps = async()=>{
    if(npsScore===null) return;
    setSaving(true);
    const sb=getSB();
    const row={
      user_id: user.id,
      trimestre: trimAtual,
      score: npsScore,
      motivo: npsMotivo.trim()||null,
      melhor: npsMelhor.trim()||null,
    };
    try{
      const{data}=await sb.from("clima_nps").insert([row]).select().single();
      if(data){
        setNps(p=>[data,...p]);
        setNpsScore(null); setNpsMotivo(""); setNpsMelhor("");
        setView("resultados");
      }
    }catch(e){console.error(e);}
    setSaving(false);
  };

  const enviarDenuncia = async()=>{
    if(!denTexto.trim()) return;
    setSaving(true);
    const sb=getSB();
    try{
      await sb.from("clima_denuncias").insert([{
        tipo: denTipo,
        texto: denTexto.trim(),
        status: "recebida",
        // user_id intencionalmente OMITIDO para garantir anonimato
      }]);
      setDenEnviada(true); setDenTexto(""); setDenTipo("assedio");
    }catch(e){console.error(e);}
    setSaving(false);
  };

  // ── SCORE VISUAL ──────────────────────────────────────────────────────
  const pulseEmoji = s => s>=9?"😄":s>=7?"🙂":s>=5?"😐":s>=3?"😕":"😞";
  const pulseColor = s => s>=8?C.grn:s>=6?"#22c55e":s>=4?C.amb:s>=2?"#f97316":C.red;
  const npsGroup = s => s>=9?"Promotor":s>=7?"Neutro":"Detrator";
  const npsColor = s => s>=9?C.grn:s>=7?C.amb:C.red;

  const TABS_RH = [{id:"home",l:"Início"},{id:"pulse",l:"Termômetro Semanal"},{id:"enps",l:"Satisfação"},{id:"denuncia",l:"Canal Anônimo"},{id:"resultados",l:"Resultados"}];
  const TABS_COL = [{id:"home",l:"Início"},{id:"pulse",l:"Termômetro Semanal"},{id:"enps",l:"Satisfação"},{id:"denuncia",l:"Canal Anônimo"}];
  const TABS = can(user.role,"gestor") ? TABS_RH : TABS_COL;

  const denTipos=[
    {v:"assedio",l:"Assédio Moral ou Sexual"},
    {v:"discriminacao",l:"Discriminação"},
    {v:"corrupcao",l:"Irregularidade / Corrupção"},
    {v:"seguranca",l:"Risco de Segurança"},
    {v:"outro",l:"Outro"},
  ];

  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20,paddingBottom:48,maxWidth:820,margin:"0 auto"}}>

      {/* HEADER */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>❤ Pesquisa de Clima</div>
          <div style={{fontSize:13,color:C.txm,marginTop:2}}>Respostas anônimas · {pulses.length} registros · {nps.length} avaliações de satisfação</div>
        </div>
        <div style={{background:C.grnBg,border:"1px solid "+C.grn+"30",borderRadius:9,padding:"6px 14px",display:"flex",alignItems:"center",gap:6,fontSize:12}}>
          <span style={{color:C.grn,fontWeight:700}}>🔒 100% Anônimo</span>
          <span style={{color:C.txd}}>— nem o RH vê quem você é</span>
        </div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",background:C.s2,borderRadius:12,padding:4,border:"1px solid "+C.bdr,width:"fit-content",gap:3}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setView(t.id)}
            style={{padding:"7px 16px",borderRadius:9,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",
              background:view===t.id?C.bgCard:"transparent",
              color:view===t.id?C.txt:C.txd,
              boxShadow:view===t.id?"0 1px 4px rgba(0,0,0,.06)":"none",
              transition:"all .2s"}}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── HOME ─────────────────────────────────────────────────────── */}
      {view==="home"&&(
        <div className="fadeIn" style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* KPIs */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
            {[
              {l:"Termômetro Médio",v:mediaGlobalPulse!==null?mediaGlobalPulse+"/ 10":"—",c:mediaGlobalPulse>=7?C.grn:mediaGlobalPulse>=5?C.amb:C.red,sub:pulses.length+" respostas"},
              {l:"Satisfação Trimestral",v:eNPS!==null?eNPS:"—",c:eNPSColor,sub:eNPSLabel},
              {l:"Participação no Termômetro",v:pulses.length>0?Math.round((new Set(pulses.map(p=>p.user_id)).size/Math.max(users.length,1))*100)+"%":"—",c:C.acc,sub:"este mês"},
              {l:"Responderam a Pesquisa",v:npsTriAtual.length,c:C.pur,sub:"neste trimestre"},
            ].map((k,i)=>(
              <div key={i} style={{background:C.bgCard,border:"1px solid "+C.bdr,borderTop:"3px solid "+k.c,borderRadius:16,padding:"18px 20px"}}>
                <div style={{fontSize:11,color:C.txm,fontWeight:700,letterSpacing:".05em",textTransform:"uppercase",marginBottom:8}}>{k.l}</div>
                <div style={{fontSize:28,fontWeight:800,color:k.c,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{k.v}</div>
                <div style={{fontSize:11,color:C.txd,marginTop:6}}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Ações rápidas */}
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
            <div style={{background:jaRespondeuPulse?C.grnBg:C.acc+"08",border:"1px solid "+(jaRespondeuPulse?C.grn+"30":C.acc+"30"),borderRadius:16,padding:24,display:"flex",flexDirection:"column",gap:12}}>
              <div style={{fontSize:32}}>{jaRespondeuPulse?"✅":"💬"}</div>
              <div style={{fontSize:15,fontWeight:700,color:jaRespondeuPulse?C.grn:C.txt}}>
                {jaRespondeuPulse?"Termômetro respondido esta semana!":"Termômetro da Semana"}
              </div>
              <div style={{fontSize:13,color:C.txm,lineHeight:1.5}}>
                {jaRespondeuPulse
                  ? "Obrigado pela sua contribuição. Volte na próxima semana!"
                  : "Como você está se sentindo no trabalho esta semana? Leva menos de 1 minuto."}
              </div>
              {!jaRespondeuPulse&&<Btn onClick={()=>setView("pulse")}>Responder agora →</Btn>}
            </div>

            <div style={{background:jaRespondeuNps?C.grnBg:C.pur+"08",border:"1px solid "+(jaRespondeuNps?C.grn+"30":C.pur+"30"),borderRadius:16,padding:24,display:"flex",flexDirection:"column",gap:12}}>
              <div style={{fontSize:32}}>{jaRespondeuNps?"✅":"⭐"}</div>
              <div style={{fontSize:15,fontWeight:700,color:jaRespondeuNps?C.grn:C.txt}}>
                {jaRespondeuNps?"Satisfação respondida!":"Satisfação — "+trimAtual}
              </div>
              <div style={{fontSize:13,color:C.txm,lineHeight:1.5}}>
                {jaRespondeuNps
                  ? "Sua resposta foi registrada para este trimestre."
                  : "Você recomendaria a Kalenborn como empresa para trabalhar? Avaliação trimestral anônima."}
              </div>
              {!jaRespondeuNps&&<Btn v="outline" onClick={()=>setView("enps")} style={{borderColor:C.pur+"50",color:C.pur}}>Avaliar agora →</Btn>}
            </div>
          </div>

          {/* Canal anônimo destaque */}
          <div style={{background:"linear-gradient(135deg,"+C.red+"08,"+C.ros+"08)",border:"1px solid "+C.red+"20",borderRadius:16,padding:"20px 24px",display:"flex",gap:20,alignItems:"center"}}>
            <div style={{fontSize:36,flexShrink:0}}>🔒</div>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Canal de Denúncias Anônimas</div>
              <div style={{fontSize:13,color:C.txm,lineHeight:1.5}}>Relate situações de assédio, discriminação ou irregularidades com total sigilo. Nem seu nome nem seu dispositivo são registrados.</div>
            </div>
            <Btn v="danger" onClick={()=>setView("denuncia")} style={{flexShrink:0}}>Denunciar</Btn>
          </div>

          {/* Últimos comentários (anônimos) */}
          {comentariosRecentes.length>0&&(
            <Card style={{padding:24}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>Vozes da Equipe <span style={{fontSize:11,color:C.txd,fontWeight:400}}>— comentários anônimos recentes</span></div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {comentariosRecentes.map((p,i)=>(
                  <div key={i} style={{background:C.s1,borderRadius:10,padding:"12px 16px",borderLeft:"3px solid "+pulseColor(p.score)}}>
                    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      <span style={{fontSize:18,flexShrink:0}}>{pulseEmoji(p.score)}</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,color:C.txm,lineHeight:1.6,fontStyle:"italic"}}>"{p.texto}"</div>
                        <div style={{display:"flex",gap:8,marginTop:6,alignItems:"center"}}>
                          {p.tag&&<Chip label={p.tag} color={pulseColor(p.score)}/>}
                          <span style={{fontSize:10,color:C.txd}}>{SL[p.setor]||"—"}</span>
                        </div>
                      </div>
                      <div style={{fontSize:20,fontWeight:800,color:pulseColor(p.score),fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{p.score}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── PULSE SEMANAL ────────────────────────────────────────────── */}
      {view==="pulse"&&(
        <div className="fadeIn" style={{display:"flex",flexDirection:"column",gap:16}}>
          {jaRespondeuPulse?(
            <Card style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:48,marginBottom:12}}>✅</div>
              <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Você já respondeu esta semana!</div>
              <div style={{fontSize:13,color:C.txm,marginBottom:20}}>Volte na próxima semana para registrar seu novo pulse.<br/>Sua resposta anônima foi contabilizada.</div>
              <Btn v="outline" onClick={()=>setView("resultados")}>Ver resultados →</Btn>
            </Card>
          ):(
            <Card style={{padding:32}}>
              <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Como você está se sentindo no trabalho esta semana?</div>
              <div style={{fontSize:13,color:C.txm,marginBottom:28,display:"flex",alignItems:"center",gap:6}}>
                <span style={{background:C.grnBg,color:C.grn,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>🔒 Anônimo</span>
                Nem o RH nem seu gestor sabem que é você
              </div>

              {/* Score 1-10 */}
              <div style={{marginBottom:28}}>
                <div style={{fontSize:13,color:C.txm,fontWeight:600,marginBottom:14}}>Nota de 1 a 10 <span style={{fontWeight:400,color:C.txd}}>(1 = muito ruim · 10 = excelente)</span></div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {[1,2,3,4,5,6,7,8,9,10].map(n=>{
                    const sel=pulseScore===n;
                    const col=pulseColor(n);
                    return(
                      <button key={n} onClick={()=>setPulseScore(n)}
                        style={{width:52,height:52,borderRadius:12,border:"2px solid "+(sel?col:C.bdr),
                          background:sel?col+"18":"transparent",
                          color:sel?col:C.txd,fontSize:16,fontWeight:700,cursor:"pointer",
                          transition:"all .15s",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2}}>
                        <span>{n}</span>
                        {sel&&<span style={{fontSize:14}}>{pulseEmoji(n)}</span>}
                      </button>
                    );
                  })}
                </div>
                {pulseScore&&(
                  <div className="fadeIn" style={{marginTop:12,display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:28}}>{pulseEmoji(pulseScore)}</span>
                    <span style={{fontSize:14,color:pulseColor(pulseScore),fontWeight:700}}>
                      {pulseScore>=9?"Ótimo! Que bom saber disso.":pulseScore>=7?"Bom, estamos felizes!":pulseScore>=5?"Ok, vamos melhorar juntos.":pulseScore>=3?"Entendemos. Obrigado pela honestidade.":"Sinto muito. Sua voz importa."}
                    </span>
                  </div>
                )}
              </div>

              {/* Tag */}
              <div style={{marginBottom:24}}>
                <div style={{fontSize:13,color:C.txm,fontWeight:600,marginBottom:10}}>O que mais influenciou sua semana? <span style={{fontWeight:400,color:C.txd}}>(opcional)</span></div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {["Reconhecimento","Carga de trabalho","Relacionamento com equipe","Liderança","Ambiente físico","Comunicação interna","Crescimento","Benefícios","Outros"].map(tag=>(
                    <button key={tag} onClick={()=>setPulseTag(pulseTag===tag?"":tag)}
                      style={{padding:"8px 14px",borderRadius:20,border:"1px solid "+(pulseTag===tag?C.acc:C.bdr),
                        background:pulseTag===tag?C.accBg:"transparent",
                        color:pulseTag===tag?C.acc:C.txm,fontSize:12,fontWeight:600,cursor:"pointer",transition:"all .15s"}}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Texto livre */}
              <div style={{marginBottom:28}}>
                <div style={{fontSize:13,color:C.txm,fontWeight:600,marginBottom:8}}>Quer falar mais sobre isso? <span style={{fontWeight:400,color:C.txd}}>(opcional · completamente anônimo)</span></div>
                <textarea value={pulseText} onChange={e=>setPulseText(e.target.value)}
                  placeholder="Pode falar à vontade. Ninguém saberá que é você..."
                  rows={3}
                  style={{width:"100%",background:C.s1,border:"1px solid "+C.bdr,borderRadius:10,padding:"10px 14px",color:C.txt,fontSize:13,resize:"vertical",fontFamily:"'Inter',sans-serif"}}/>
                <div style={{fontSize:11,color:C.txd,marginTop:4}}>⚠ Evite mencionar nomes próprios para manter o anonimato total.</div>
              </div>

              <Btn onClick={enviarPulse} disabled={pulseScore===null||saving} full sz="lg">
                {saving?<Spin size={14} color="#fff"/>:null} Enviar minha resposta anonimamente
              </Btn>
            </Card>
          )}
        </div>
      )}

      {/* ── eNPS ─────────────────────────────────────────────────────── */}
      {view==="enps"&&(
        <div className="fadeIn" style={{display:"flex",flexDirection:"column",gap:16}}>
          {jaRespondeuNps?(
            <Card style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:48,marginBottom:12}}>⭐</div>
              <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Satisfação respondida para {trimAtual}!</div>
              <div style={{fontSize:13,color:C.txm,marginBottom:20}}>Obrigado. Sua resposta anônima foi contabilizada neste trimestre.</div>
              {can(user.role,"gestor")&&<Btn v="outline" onClick={()=>setView("resultados")}>Ver resultados →</Btn>}
            </Card>
          ):(
            <Card style={{padding:32}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <div style={{fontSize:16,fontWeight:700}}>Índice de Satisfação dos Colaboradores</div>
                <Chip label={trimAtual} color={C.pur}/>
              </div>
              <div style={{fontSize:13,color:C.txm,marginBottom:28,display:"flex",alignItems:"center",gap:6}}>
                <span style={{background:C.grnBg,color:C.grn,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>🔒 Anônimo</span>
                Avaliação trimestral de satisfação com a empresa
              </div>

              {/* Pergunta principal */}
              <div style={{marginBottom:28}}>
                <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>De 0 a 10, o quanto você recomendaria a Kalenborn International como empresa para trabalhar a um amigo?</div>
                <div style={{fontSize:12,color:C.txd,marginBottom:16}}>0 = jamais recomendaria · 10 = recomendaria com certeza</div>

                {/* Escala 0-10 */}
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                  {[0,1,2,3,4,5,6,7,8,9,10].map(n=>{
                    const col=npsColor(n);const sel=npsScore===n;
                    return(
                      <button key={n} onClick={()=>setNpsScore(n)}
                        style={{width:50,height:50,borderRadius:10,border:"2px solid "+(sel?col:C.bdr),
                          background:sel?col+"18":"transparent",color:sel?col:C.txd,
                          fontSize:15,fontWeight:700,cursor:"pointer",transition:"all .15s"}}>
                        {n}
                      </button>
                    );
                  })}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.txd,paddingBottom:8}}>
                  <span style={{color:C.red,fontWeight:600}}>← Detrator (0–6)</span>
                  <span style={{color:C.amb,fontWeight:600}}>Neutro (7–8)</span>
                  <span style={{color:C.grn,fontWeight:600}}>Promotor (9–10) →</span>
                </div>
                {npsScore!==null&&(
                  <div className="fadeIn" style={{padding:"10px 16px",background:npsColor(npsScore)+"12",borderRadius:9,border:"1px solid "+npsColor(npsScore)+"30",fontSize:13,fontWeight:600,color:npsColor(npsScore)}}>
                    {npsGroup(npsScore)} — {npsScore>=9?"Você é um embaixador da Kalenborn!":npsScore>=7?"Obrigado pela sua avaliação honesta.":"Lamentamos. Sua opinião é muito importante para melhorarmos."}
                  </div>
                )}
              </div>

              {/* Por quê */}
              <div style={{marginBottom:20}}>
                <div style={{fontSize:13,fontWeight:600,color:C.txm,marginBottom:8}}>
                  {npsScore>=7?"O que mais contribuiu para sua nota?":" O que nos fez perder pontos?"} <span style={{fontWeight:400,color:C.txd}}>(opcional)</span>
                </div>
                <textarea value={npsMotivo} onChange={e=>setNpsMotivo(e.target.value)}
                  placeholder="Pode ser sincero(a). Sua resposta é 100% anônima..."
                  rows={3}
                  style={{width:"100%",background:C.s1,border:"1px solid "+C.bdr,borderRadius:10,padding:"10px 14px",color:C.txt,fontSize:13,resize:"vertical",fontFamily:"'Inter',sans-serif"}}/>
              </div>

              {/* O que melhorar */}
              <div style={{marginBottom:28}}>
                <div style={{fontSize:13,fontWeight:600,color:C.txm,marginBottom:8}}>Se você pudesse mudar uma coisa na Kalenborn, o que seria? <span style={{fontWeight:400,color:C.txd}}>(opcional)</span></div>
                <textarea value={npsMelhor} onChange={e=>setNpsMelhor(e.target.value)}
                  placeholder="Sugestão de melhoria..."
                  rows={2}
                  style={{width:"100%",background:C.s1,border:"1px solid "+C.bdr,borderRadius:10,padding:"10px 14px",color:C.txt,fontSize:13,resize:"vertical",fontFamily:"'Inter',sans-serif"}}/>
              </div>

              <Btn onClick={enviarNps} disabled={npsScore===null||saving} full sz="lg">
                {saving?<Spin size={14} color="#fff"/>:null} Enviar avaliação anonimamente
              </Btn>
            </Card>
          )}
        </div>
      )}

      {/* ── CANAL ANÔNIMO ────────────────────────────────────────────── */}
      {view==="denuncia"&&(
        <div className="fadeIn" style={{display:"flex",flexDirection:"column",gap:16}}>
          {denEnviada?(
            <Card style={{textAlign:"center",padding:48}}>
              <div style={{fontSize:52,marginBottom:16}}>🔒</div>
              <div style={{fontSize:18,fontWeight:800,color:C.grn,marginBottom:8}}>Denúncia recebida com sigilo</div>
              <div style={{fontSize:13,color:C.txm,lineHeight:1.7,marginBottom:24}}>
                Sua denúncia foi registrada de forma completamente anônima.<br/>
                Nenhum dado seu foi salvo junto ao relato.<br/>
                O RH irá investigar e tomar as medidas necessárias.
              </div>
              <Btn v="outline" onClick={()=>{setDenEnviada(false);setView("home");}}>Voltar ao início</Btn>
            </Card>
          ):(
            <Card style={{padding:32}}>
              {/* Aviso legal */}
              <div style={{background:C.redBg,border:"1px solid "+C.red+"25",borderRadius:10,padding:"14px 18px",marginBottom:24}}>
                <div style={{fontSize:13,fontWeight:700,color:C.red,marginBottom:4}}>⚠ Canal de Denúncias — Garantias de Sigilo</div>
                <div style={{fontSize:12,color:C.txm,lineHeight:1.6}}>
                  Seu nome, e-mail e dispositivo <strong>não são registrados</strong> junto ao relato.<br/>
                  Somente o texto que você digitar será salvo.<br/>
                  A Kalenborn garante a não-retaliação por denúncias de boa-fé.
                </div>
              </div>

              <div style={{marginBottom:20}}>
                <label style={{fontSize:12,color:C.txm,fontWeight:700,letterSpacing:".04em",textTransform:"uppercase",display:"block",marginBottom:10}}>Tipo de ocorrência</label>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {denTipos.map(t=>(
                    <label key={t.v} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:10,border:"1px solid "+(denTipo===t.v?C.red:C.bdr),background:denTipo===t.v?C.redBg:"transparent",cursor:"pointer",transition:"all .15s"}}>
                      <input type="radio" name="denTipo" value={t.v} checked={denTipo===t.v} onChange={()=>setDenTipo(t.v)} style={{accentColor:C.red,width:14,height:14}}/>
                      <span style={{fontSize:13,fontWeight:denTipo===t.v?600:400,color:denTipo===t.v?C.red:C.txt}}>{t.l}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{marginBottom:28}}>
                <label style={{fontSize:12,color:C.txm,fontWeight:700,letterSpacing:".04em",textTransform:"uppercase",display:"block",marginBottom:8}}>Descreva o ocorrido *</label>
                <textarea value={denTexto} onChange={e=>setDenTexto(e.target.value)}
                  placeholder="Descreva o que aconteceu com o máximo de detalhes possível (quando, onde, o que ocorreu). Não precisa mencionar seu nome."
                  rows={6}
                  style={{width:"100%",background:C.s1,border:"1px solid "+C.bdr,borderRadius:10,padding:"12px 14px",color:C.txt,fontSize:13,resize:"vertical",fontFamily:"'Inter',sans-serif"}}/>
                <div style={{fontSize:11,color:C.txd,marginTop:6}}>Evite mencionar seu próprio nome ou dados que possam identificá-lo.</div>
              </div>

              <Btn v="danger" onClick={enviarDenuncia} disabled={!denTexto.trim()||saving} full sz="lg">
                {saving?<Spin size={14} color="#fff"/>:null} 🔒 Enviar denúncia anonimamente
              </Btn>
            </Card>
          )}
        </div>
      )}

      {/* ── RESULTADOS (gestores/RH) ──────────────────────────────────── */}
      {view==="resultados"&&can(user.role,"gestor")&&(
        <div className="fadeIn" style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* eNPS visual */}
          <Card style={{padding:28}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16,marginBottom:24}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Satisfação — {trimAtual}</div>
                <div style={{fontSize:11,color:C.txd}}>{npsTriAtual.length} respostas · anônimas</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:52,fontWeight:800,color:eNPSColor,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{eNPS!==null?eNPS:"—"}</div>
                <div style={{fontSize:12,color:eNPSColor,fontWeight:700,marginTop:4}}>{eNPSLabel}</div>
                <div style={{fontSize:10,color:C.txd}}>escala −100 a +100</div>
              </div>
            </div>

            {/* Distribuição eNPS */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:12,marginBottom:20}}>
              {[
                {l:"Promotores",v:promotores,c:C.grn,desc:"nota 9–10"},
                {l:"Neutros",v:npsTriAtual.filter(n=>n.score>=7&&n.score<=8).length,c:C.amb,desc:"nota 7–8"},
                {l:"Detratores",v:detratores,c:C.red,desc:"nota 0–6"},
              ].map(g=>(
                <div key={g.l} style={{textAlign:"center",background:g.c+"10",borderRadius:12,padding:"16px",border:"1px solid "+g.c+"25"}}>
                  <div style={{fontSize:28,fontWeight:800,color:g.c,fontFamily:"'JetBrains Mono',monospace"}}>{g.v}</div>
                  <div style={{fontSize:12,fontWeight:600,color:g.c,marginTop:4}}>{g.l}</div>
                  <div style={{fontSize:11,color:C.txd}}>{g.desc}</div>
                </div>
              ))}
            </div>

            {/* Barra de notas */}
            <div style={{display:"flex",gap:3,height:28,borderRadius:8,overflow:"hidden"}}>
              {[0,1,2,3,4,5,6,7,8,9,10].map(n=>{
                const count=nps.filter(x=>x.score===n).length;
                const pct=nps.length>0?(count/nps.length)*100:0;
                return pct>0?(
                  <div key={n} style={{flex:pct,background:npsColor(n),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",minWidth:pct>5?24:0}}>
                    {pct>8?n:""}
                  </div>
                ):null;
              })}
              {nps.length===0&&<div style={{flex:1,background:C.s3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:C.txd}}>Sem dados ainda</div>}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.txd,marginTop:4}}><span>0</span><span>5</span><span>10</span></div>

            {/* Sugestões de melhoria */}
            {nps.filter(n=>n.melhor&&n.melhor.trim()).length>0&&(
              <div style={{marginTop:20}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:10,color:C.txt}}>💡 Sugestões de melhoria recebidas</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {nps.filter(n=>n.melhor&&n.melhor.trim()).slice(0,5).map((n,i)=>(
                    <div key={i} style={{background:C.s1,borderRadius:9,padding:"10px 14px",borderLeft:"3px solid "+npsColor(n.score),fontSize:13,color:C.txm,fontStyle:"italic"}}>
                      "{n.melhor}"
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Pulse ao longo do tempo */}
          <Card style={{padding:24}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>Termômetro de Clima — Evolução Semanal</div>
            <div style={{fontSize:11,color:C.txd,marginBottom:20}}>Média das notas semanais (escala 1–10)</div>
            {pulsesPorSemana.length===0?(
              <div style={{textAlign:"center",padding:"32px 0",color:C.txd,fontSize:13}}>Nenhum pulse registrado ainda.</div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {pulsesPorSemana.map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:72,fontSize:11,color:C.txd,flexShrink:0,textAlign:"right"}}>{s.label}</div>
                    <div style={{flex:1,height:28,background:C.s3,borderRadius:6,overflow:"hidden",position:"relative"}}>
                      <div style={{width:(s.media/10*100)+"%",height:"100%",background:pulseColor(s.media),borderRadius:6,transition:"width .5s ease"}}/>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,minWidth:80}}>
                      <span style={{fontSize:16,fontWeight:800,color:pulseColor(s.media),fontFamily:"'JetBrains Mono',monospace"}}>{s.media}</span>
                      <span style={{fontSize:11,color:C.txd}}>{s.count} resp.</span>
                    </div>
                    <span style={{fontSize:18}}>{pulseEmoji(s.media)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Pulse por setor */}
          {pulseSetor.length>0&&(
            <Card style={{padding:24}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>Clima por Setor</div>
              <div style={{fontSize:11,color:C.txd,marginBottom:20}}>Setores com menos de 2 respostas são ocultados para proteger o anonimato</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {pulseSetor.map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:110,fontSize:12,fontWeight:600,color:C.txt,flexShrink:0}}>{s.setor}</div>
                    <div style={{flex:1,height:24,background:C.s3,borderRadius:5,overflow:"hidden"}}>
                      <div style={{width:(s.media/10*100)+"%",height:"100%",background:pulseColor(s.media),borderRadius:5,transition:"width .5s ease"}}/>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,minWidth:90}}>
                      <span style={{fontSize:15,fontWeight:800,color:pulseColor(s.media),fontFamily:"'JetBrains Mono',monospace"}}>{s.media}</span>
                      <span style={{fontSize:11,color:C.txd}}>/ 10</span>
                      <span style={{fontSize:18}}>{pulseEmoji(s.media)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Tags mais citadas */}
          {topTags.length>0&&(
            <Card style={{padding:24}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>Temas mais mencionados nos pulses</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {topTags.map(([tag,count],i)=>{
                  const maxCount=topTags[0][1];
                  const size=Math.round(11+(count/maxCount)*8);
                  const opacity=0.4+(count/maxCount)*0.6;
                  return(
                    <div key={tag} style={{background:C.accBg,border:"1px solid "+C.acc+"25",borderRadius:20,padding:"6px 14px",fontSize:size,fontWeight:600,color:C.acc,opacity}}>
                      {tag} <span style={{fontSize:10,opacity:.7}}>({count})</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Comentários anônimos */}
          {comentariosRecentes.length>0&&(
            <Card style={{padding:24}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Comentários Abertos</div>
              <div style={{fontSize:11,color:C.txd,marginBottom:16}}>Anônimos · ordenados por mais recentes</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {comentariosRecentes.map((p,i)=>(
                  <div key={i} style={{background:C.s1,borderRadius:10,padding:"12px 16px",borderLeft:"3px solid "+pulseColor(p.score),display:"flex",gap:12,alignItems:"flex-start"}}>
                    <span style={{fontSize:20,flexShrink:0}}>{pulseEmoji(p.score)}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,color:C.txm,lineHeight:1.6,fontStyle:"italic"}}>"{p.texto}"</div>
                      <div style={{display:"flex",gap:8,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
                        {p.tag&&<Chip label={p.tag} color={pulseColor(p.score)}/>}
                        <span style={{fontSize:10,color:C.txd}}>{SL[p.setor]||"Setor não informado"}</span>
                        <span style={{fontSize:20,fontWeight:700,color:pulseColor(p.score),fontFamily:"'JetBrains Mono',monospace",marginLeft:"auto"}}>{p.score}/10</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

        </div>
      )}

      {/* Acesso negado a resultados para colaboradores */}
      {view==="resultados"&&!can(user.role,"gestor")&&(
        <Card style={{textAlign:"center",padding:48}}>
          <div style={{fontSize:48,marginBottom:12}}>🔒</div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Resultados disponíveis apenas para gestores</div>
          <div style={{fontSize:13,color:C.txm}}>O anonimato é garantido — colaboradores não têm acesso aos dados consolidados.</div>
        </Card>
      )}

    </div>
  );
}


// CONTRATAÇÃO — agrupa Recrutamento, Banco de Talentos e Upload de CVs
function Contratacao(props){
  const[tab,setTab]=useState("recrutamento");
  const TABS=[
    {id:"recrutamento",l:"Candidatos",count:props.candidates?.filter(c=>c.status!=="rejeitado").length},
    {id:"talentos",l:"Banco de Talentos",count:props.talentos?.length},
    {id:"upload_cvs",l:"Upload de CVs"},
  ];
  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:18}}>
      <div><div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>Vagas e Candidatos</div><div style={{fontSize:13,color:C.txm,marginTop:2}}>Fluxo completo de recrutamento, do currículo à contratação</div></div>
      <div style={{display:"flex",gap:3,background:C.s2,borderRadius:10,padding:3,border:"1px solid "+C.bdr,width:"fit-content"}}>
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 16px",borderRadius:8,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",background:tab===t.id?C.acc:"transparent",color:tab===t.id?"#fff":C.txm,transition:"all .2s",display:"flex",alignItems:"center",gap:6}}>
          {t.l}{typeof t.count==="number"&&<span style={{background:tab===t.id?"rgba(255,255,255,.25)":C.bdr,borderRadius:10,fontSize:10,padding:"1px 6px"}}>{t.count}</span>}
        </button>)}
      </div>
      {tab==="recrutamento"&&<Recrutamento {...props}/>}
      {tab==="talentos"&&<BancoTalentos {...props}/>}
      {tab==="upload_cvs"&&<UploadCVs vagas={props.vagas} setCandidates={props.setCandidates} criarTarefaAuto={props.criarTarefaAuto}/>}
    </div>
  );
}


// UPLOAD CVs
function UploadCVs({vagas,setCandidates,criarTarefaAuto}){
  const[uploads,setUploads]=useState([]);const[vagaSel,setVagaSel]=useState(vagas[0]?.id||"");const fileRef=useRef();
  const processar=async up=>{
    const id=up.id;const upd=p=>setUploads(prev=>prev.map(u=>u.id===id?{...u,...p}:u));
    upd({status:"extraindo",progress:20});
    const txt=await extractPDF(up.file)||"CV: "+up.file.name;
    upd({progress:50,status:"analisando"});
    const v=vagas.find(x=>x.id===up.vaga);
    try{
      const prompt=`Atue como um Recrutador Sênior muito criterioso da Kalenborn.
Vaga: ${v?.title||""} (${v?.desc||""}).

Faça uma triagem rigorosa. Avalie a aderência técnica, estabilidade nas empresas anteriores e clareza. Seja rigoroso no score (0 a 100).
CV:
${txt.substring(0,6000)}

Retorne APENAS um JSON válido, sem markdown:
{"score":0,"tech":0,"behavior":0,"resumo":"Resumo crítico (prós e contras)","pontosFort":["..."],"pontosAtencao":["..."],"decisao":"aprovado|revisao|rejeitado"}`;
      const resp=await gpt([{role:"user",content:prompt}]);
      let a={score:50,tech:50,behavior:50,resumo:"Análise não pôde ser completada.",pontosFort:[],pontosAtencao:[],decisao:"pendente"};
      try{
        const match = resp.match(/\{[\s\S]*\}/);
        if(match) { a = JSON.parse(match[0]); }
      }catch{}
      upd({status:"concluido",progress:100,resultado:a});
      const sb=getSB();if(!sb)return;
      const{data}=await sb.from("candidatos").insert([{name:up.file.name.replace(".pdf","").replace(/_/g," "),role:v?.title||"",vaga_id:v?.id||"",score:a.score||0,tech:a.tech||0,behavior:a.behavior||0,status:a.decisao||"pendente",resumo:a.resumo,habilidades:a.pontosFort||[],pcd:false,salario_pret:"A definir"}]).select().single();
      if(data){
        setCandidates(p=>[...p,mc(data)]);
        if(criarTarefaAuto) criarTarefaAuto(`Decidir: ${data.name}`, `Vaga: ${v?.title}\nPontuação IA: ${a.score}\nResumo: ${a.resumo}`, a.score>=70?"baixa":a.score>=40?"media":"alta", ["recrutamento"], "candidatos", data.id);
      }
    }catch(e){upd({status:"erro",progress:100,erro:"Erro na análise IA."});}
  };
  
  const addFiles=files=>{const novos=Array.from(files).map(f=>({id:Date.now()+Math.random(),file:f,vaga:vagaSel,status:"aguardando",progress:0,resultado:null}));setUploads(p=>[...p,...novos]);novos.forEach(processar);};
  const sCfg={aguardando:{l:"Aguardando",c:C.txd},extraindo:{l:"Extraindo PDF",c:C.blu},analisando:{l:"Analisando IA",c:C.acc},concluido:{l:"Concluído",c:C.grn},erro:{l:"Erro",c:C.red}};
  
  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20}}>
      <div><div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>Upload de Currículos</div><div style={{fontSize:13,color:C.txm,marginTop:2}}>Análise automática via GPT-4o</div></div>
      <Card>
        <div style={{marginBottom:14}}><Sel label="Vaga" value={vagaSel} onChange={e=>setVagaSel(e.target.value)} options={vagas.map(v=>({value:v.id,label:"#"+v.id+" — "+v.title}))}/></div>
        <div onClick={()=>fileRef.current?.click()} onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor=C.acc;}} onDragLeave={e=>e.currentTarget.style.borderColor=C.bdr} onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor=C.bdr;addFiles(e.dataTransfer.files);}} style={{border:"2px dashed "+C.bdr,borderRadius:12,padding:36,textAlign:"center",cursor:"pointer",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.acc} onMouseLeave={e=>e.currentTarget.style.borderColor=C.bdr}>
          <input ref={fileRef} type="file" accept=".pdf" multiple style={{display:"none"}} onChange={e=>addFiles(e.target.files)}/>
          <div style={{fontSize:32,marginBottom:8}}>⇧</div><div style={{fontWeight:600,marginBottom:4}}>Arraste PDFs ou clique</div><div style={{fontSize:12,color:C.txd}}>Múltiplos arquivos · Análise em background</div>
        </div>
      </Card>
      {uploads.map(u=>{const cfg=sCfg[u.status]||sCfg.aguardando;const v=vagas.find(x=>x.id===u.vaga);return(
        <Card key={u.id}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <div><div style={{fontWeight:600,fontSize:13}}>{u.file.name}</div><div style={{fontSize:11,color:C.txd}}>{v?.title} · {(u.file.size/1024).toFixed(0)}KB</div></div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>{u.status!=="concluido"&&u.status!=="erro"&&<Spin size={14} color={cfg.c}/>}<Chip label={cfg.l} color={cfg.c} dot/></div>
          </div>
          <div style={{height:3,background:C.s3,borderRadius:3,overflow:"hidden",marginBottom:u.resultado?12:0}}><div style={{height:"100%",width:u.progress+"%",borderRadius:3,background:u.status==="erro"?C.red:C.acc,transition:"width .4s ease"}}/></div>
          {u.resultado&&<div className="fadeIn" style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:12,color:C.txm}}>{u.resultado.resumo}</div><span style={{fontSize:22,fontWeight:700,color:u.resultado.score>=80?C.grn:u.resultado.score>=60?C.amb:C.red,fontFamily:"'JetBrains Mono',monospace"}}>{u.resultado.score}</span></div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{u.resultado.pontosFort?.map(p=><Chip key={p} label={p} color={C.grn}/>)}{u.resultado.pontosAtencao?.map(p=><Chip key={p} label={p} color={C.amb}/>)}</div>
          </div>}
          {u.erro&&<div style={{fontSize:12,color:C.red}}>{u.erro}</div>}
        </Card>
      );})}
    </div>
  );
}

// CONFIG
function Config({user}){
  return(
    <div className="fadeUp" style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>Configurações</div>
      <Card><div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Integrações</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {[{l:"Supabase",d:"Banco de dados"},{l:"OpenAI GPT-4o",d:"Análise de CVs e emails"},{l:"Claude AI",d:"Chat e sugestões"},{l:"Render PDF API",d:"Extração de currículos"}].map(x=>(
            <div key={x.l} style={{background:C.grnBg,border:"1px solid "+C.grn+"25",borderRadius:10,padding:"12px 16px",flex:1,minWidth:160}}><div style={{fontSize:12,color:C.grn,fontWeight:700}}>✓ {x.l}</div><div style={{fontSize:11,color:C.txd,marginTop:2}}>{x.d}</div></div>
          ))}
        </div>
      </Card>
      <Card><div style={{fontSize:14,fontWeight:700,marginBottom:10}}>Ambiente</div><div style={{fontSize:12,color:C.txm,display:"flex",flexDirection:"column",gap:6}}><span>🗄 {SB_URL}</span><span>👤 {user.name} ({user.role})</span><span>📋 K.RH v2.0 — Kalenborn International</span></div></Card>
    </div>
  );
}

// PORTAL DE CARREIRAS
function CareerPortal({vagas,onBack,onSubmit,criarTarefaAuto}){
  const[step,setStep]=useState(1);const[vaga,setVaga]=useState(null);const[form,setForm]=useState({name:"",email:"",phone:"",pcd:false,salarioPret:""});const[ans,setAns]=useState(["","","",""]);const[cvFile,setCvFile]=useState(null);const[loading,setLoading]=useState(false);const[stepMsg,setStepMsg]=useState("");const fileRef=useRef();
  const qs=["Descreva sua experiência mais relevante para esta vaga.","Quais são suas principais habilidades técnicas?","Por que você se interessa pela Kalenborn?","Qual sua pretensão salarial e disponibilidade de início?"];
  
  const submit=async()=>{
    setLoading(true);
    try{
      let cv="";if(cvFile){setStepMsg("Extraindo currículo...");cv=await extractPDF(cvFile)||"";}
      setStepMsg("Analisando perfil com IA...");
      const prompt=`Atue como um Recrutador Sênior muito criterioso da Kalenborn.
Vaga: ${vaga.title} (${vaga.desc}).

Faça uma triagem rigorosa. Avalie a aderência técnica, clareza nas respostas e expectativas. Seja rigoroso na nota (0 a 100).
CV: ${cv||"Não enviado"}

Respostas do Candidato:
${ans.map((a,i)=>(i+1)+": "+a).join("\n")}

Retorne APENAS um JSON válido, sem markdown:
{"score":0,"tech":0,"behavior":0,"status":"pendente","pontosFort":["..."],"pontosAtencao":["..."],"resumo":"Resumo crítico (prós e contras)"}`;
      const resp=await gpt([{role:"user",content:prompt}]);
      let a={score:50,tech:50,behavior:50,status:"pendente",pontosFort:[],resumo:"Análise concluída."};
      try{
        const match = resp.match(/\{[\s\S]*\}/);
        if(match) { a = JSON.parse(match[0]); }
      }catch{}
      const sb=getSB();
      if(sb){
        const{data}=await sb.from("candidatos").insert([{name:form.name,role:vaga.title,vaga_id:vaga.id,email:form.email,phone:form.phone,salario_pret:form.salarioPret,pcd:form.pcd,score:a.score||0,tech:a.tech||0,behavior:a.behavior||0,status:a.status||"pendente",resumo:a.resumo,habilidades:a.pontosFort||[]}]).select().single();
        if(data){
          onSubmit(mc(data));
          if(criarTarefaAuto) criarTarefaAuto(`Decidir: ${form.name}`, `Vaga: ${vaga.title}\nPontuação IA: ${a.score}\nResumo: ${a.resumo}`, a.score>=70?"baixa":a.score>=40?"media":"alta", ["recrutamento"], "candidatos", data.id);
        }
      }
      setStep(5);
    }catch(e){alert("Erro: "+e.message);}
    setLoading(false);setStepMsg("");
  };
  
  const SLB=["Vaga","Dados","Perguntas","CV","Concluído"];
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"radial-gradient(ellipse at 30% 20%,"+C.acc+"10 0%,transparent 60%),"+C.bg,padding:20}}>
      <style>{CSS}</style>
      <div className="fadeUp" style={{width:"100%",maxWidth:600}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28}}>
          <div><div style={{fontSize:24,fontWeight:800,letterSpacing:"-.03em"}}>K<span style={{color:C.acc}}>.</span>Carreiras</div><div style={{fontSize:12,color:C.txd}}>Kalenborn International</div></div>
          <button onClick={onBack} style={{background:"none",border:"1px solid "+C.bdr,color:C.txm,cursor:"pointer",borderRadius:9,padding:"6px 14px",fontSize:12}}>← Login</button>
        </div>
        {step<5&&<div style={{marginBottom:24}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>{SLB.map((s,i)=><span key={i} style={{fontSize:11,fontWeight:step===i+1?700:400,color:step>i?C.acc:step===i+1?C.txt:C.txd}}>{step>i?"✓ ":""}{s}</span>)}</div>
          <div style={{height:3,background:C.s2,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:((step-1)/4*100)+"%",background:C.acc,borderRadius:3,transition:"width .4s ease"}}/></div>
        </div>}
        <Card style={{padding:28,background:C.s1}}>
          {step===1&&<div className="fadeIn">
            <div style={{fontSize:17,fontWeight:700,marginBottom:16}}>Vagas Disponíveis</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
              {vagas.map(v=><button key={v.id} onClick={()=>setVaga(v)} style={{textAlign:"left",padding:"14px 16px",borderRadius:10,cursor:"pointer",border:"1px solid "+(vaga?.id===v.id?C.acc:C.bdr),background:vaga?.id===v.id?C.accBg:C.s2,transition:"all .15s"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontWeight:700}}>{v.title}</span><div style={{display:"flex",gap:6}}><Chip label={v.tipo} color={C.acc}/><Chip label={v.local} color={C.txm}/></div></div>
                <div style={{fontSize:12,color:C.txm}}>{v.desc}</div>
              </button>)}
            </div>
            <Btn onClick={()=>setStep(2)} disabled={!vaga} full>Continuar →</Btn>
          </div>}
          {step===2&&<div className="fadeIn">
            <div style={{fontSize:17,fontWeight:700,marginBottom:4}}>Seus Dados</div>
            <div style={{fontSize:12,color:C.txm,marginBottom:18}}>Vaga: <strong style={{color:C.accLt}}>{vaga?.title}</strong></div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <Inp label="Nome Completo *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nome completo"/>
              <Inp label="E-mail *" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="email@exemplo.com"/>
              <Inp label="Telefone *" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+55 31 99999-0000"/>
              <Inp label="Pretensão Salarial" value={form.salarioPret} onChange={e=>setForm({...form,salarioPret:e.target.value})} placeholder="R$ 0.000"/>
              <div style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={form.pcd} onChange={e=>setForm({...form,pcd:e.target.checked})} style={{accentColor:C.acc,width:14,height:14}}/><label style={{fontSize:13,color:C.txm,cursor:"pointer"}}>Sou PcD</label></div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:18}}><Btn v="outline" onClick={()=>setStep(1)}>← Voltar</Btn><Btn onClick={()=>setStep(3)} disabled={!form.name||!form.email||!form.phone} full>Continuar →</Btn></div>
          </div>}
          {step===3&&<div className="fadeIn">
            <div style={{fontSize:17,fontWeight:700,marginBottom:4}}>Formulário</div>
            <div style={{fontSize:12,color:C.txm,marginBottom:16}}>Respostas analisadas por IA</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {qs.map((q,i)=><div key={i}><label style={{fontSize:12,fontWeight:600,display:"block",marginBottom:5}}>{i+1}. {q}</label><textarea value={ans[i]} onChange={e=>{const a=[...ans];a[i]=e.target.value;setAns(a);}} rows={2} placeholder="Sua resposta..." style={{width:"100%",background:C.s2,border:"1px solid "+(ans[i].length>10?C.acc+"55":C.bdr),borderRadius:9,padding:"9px 13px",fontSize:13,color:C.txt,resize:"vertical"}}/></div>)}
            </div>
            <div style={{display:"flex",gap:10,marginTop:16}}><Btn v="outline" onClick={()=>setStep(2)}>← Voltar</Btn><Btn onClick={()=>setStep(4)} disabled={!ans.every(a=>a.trim().length>10)} full>Continuar →</Btn></div>
          </div>}
          {step===4&&<div className="fadeIn">
            <div style={{fontSize:17,fontWeight:700,marginBottom:4}}>Currículo (PDF)</div>
            <div style={{fontSize:12,color:C.txm,marginBottom:16}}>Opcional — melhora a análise</div>
            <div onClick={()=>fileRef.current?.click()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f?.name.endsWith(".pdf"))setCvFile(f);}} onDragOver={e=>e.preventDefault()} style={{border:"2px dashed "+(cvFile?C.grn:C.bdr),borderRadius:12,padding:36,textAlign:"center",cursor:"pointer",background:cvFile?C.grnBg:C.s2,transition:"all .2s"}}>
              <input ref={fileRef} type="file" accept=".pdf" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)setCvFile(f);}}/>
              {cvFile?<><div style={{fontSize:32,marginBottom:8}}>📄</div><div style={{fontWeight:600,color:C.grn}}>{cvFile.name}</div></>:<><div style={{fontSize:32,marginBottom:8}}>☁</div><div style={{fontWeight:600}}>Arraste o PDF</div></>}
            </div>
            <div style={{display:"flex",gap:10,marginTop:18}}><Btn v="outline" onClick={()=>setStep(3)}>← Voltar</Btn><Btn onClick={submit} disabled={loading} full>{loading?<><Spin size={14} color="#fff"/> {stepMsg||"Processando..."}</>:"Enviar Candidatura"}</Btn></div>
          </div>}
          {step===5&&<div className="fadeIn" style={{textAlign:"center"}}>
            <div style={{fontSize:48,marginBottom:12}}>🎉</div>
            <div style={{fontSize:20,fontWeight:800,marginBottom:6}}>Candidatura Enviada!</div>
            <div style={{fontSize:13,color:C.txm,marginBottom:20}}>Obrigado por se candidatar à vaga de <strong>{vaga?.title}</strong>.<br/>Entraremos em contato em <strong>{form.email}</strong> em breve.</div>
            <div style={{background:C.s2,border:"1px solid "+C.bdr,borderRadius:12,padding:"16px 20px",marginBottom:20,textAlign:"left"}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:8,color:C.txt}}>📋 Próximos passos</div>
              <div style={{fontSize:12,color:C.txm,lineHeight:1.7}}>
                Nossa equipe de RH vai analisar seu perfil com cuidado.<br/>
                Se houver compatibilidade com a vaga, retornaremos por e-mail ou telefone para os próximos passos do processo.
              </div>
            </div>
            <Btn v="outline" onClick={onBack}>← Voltar ao Login</Btn>
          </div>}
        </Card>
      </div>
    </div>
  );
}

// APP ROOT
export default function App(){
  const[sbReady,setSbReady]=useState(false);const[user,setUser]=useState(null);const[page,setPage]=useState("dashboard");const[collapsed,setCollapsed]=useState(false);const[screen,setScreen]=useState("login");const[toast,setToast]=useState(null);const[loading,setLoading]=useState(false);
  const[users,setUsers]=useState([]);const[ferias,setFerias]=useState([]);const[feedbacks,setFeedbacks]=useState([]);const[chat,setChat]=useState([]);const[avaliacoes,setAvaliacoes]=useState([]);const[candidates,setCandidates]=useState([]);const[vagas,setVagas]=useState([{id:"047",title:"Analista de RH",area:"RH",local:"BH/MG",tipo:"CLT",desc:"Processos de R&S e DP."},{id:"031",title:"Dev Backend",area:"TI",local:"Remoto",tipo:"CLT",desc:"APIs Node.js/Python."},{id:"012",title:"Operador de Corte",area:"Produção",local:"BH/MG",tipo:"CLT",desc:"Operação de máquinas de corte."},{id:"019",title:"Téc. Vulcanização",area:"Produção",local:"BH/MG",tipo:"CLT",desc:"Vulcanização de borracha."}]);
  const[talentos,setTalentos]=useState([]);const[comunicados,setComunicados]=useState([]);const[exames,setExames]=useState([]);const[tarefas,setTarefas]=useState([]);
  const[pulses,setPulses]=useState([]);const[nps,setNps]=useState([]);
  const[movs,setMovs]=useState([]);
  const[benCatalogo,setBenCatalogo]=useState([]);const[benUsuarios,setBenUsuarios]=useState([]);const[benSolicits,setBenSolicits]=useState([]);
  
  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),4000);};
  useEffect(()=>{initSB().then(sb=>{if(sb)setSbReady(true);else setSbReady(false);});},[]);
  
  const loadAll=async()=>{
    setLoading(true);const sb=await initSB();if(!sb){setLoading(false);return;}
    try{
      const[uR,fR,fbR,cR,aR,cadR,vR,tR,comR,exR,tkR,plR,npsR,bcR,buR,bsR,movR]=await Promise.all([
        sb.from("usuarios").select("id,name,email,role,setor,area,cargo,admissao,gestor_id,lider_id,skills,senioridade,telefone,foto_url,status,data_desligamento").order("id"),
        sb.from("ferias").select("*").order("created_at",{ascending:false}),
        sb.from("feedbacks").select("*").order("created_at",{ascending:false}),
        sb.from("chat").select("*").order("created_at"),
        sb.from("avaliacoes").select("*").order("created_at",{ascending:false}),
        sb.from("candidatos").select("*").order("created_at",{ascending:false}),
        sb.from("vagas").select("*").eq("ativa",true),
        sb.from("banco_talentos").select("*").order("created_at",{ascending:false}),
        sb.from("comunicados").select("*").order("created_at",{ascending:false}),
        sb.from("exames").select("*").order("created_at",{ascending:false}),
        sb.from("tarefas").select("*").order("ordem"),
        sb.from("clima_pulses").select("*").order("created_at",{ascending:false}),
        sb.from("clima_nps").select("*").order("created_at",{ascending:false}),
        sb.from("movimentacoes").select("*").order("created_at",{ascending:false}),
        sb.from("beneficios_catalogo").select("*").order("id"),
        sb.from("beneficios_usuarios").select("*,beneficio:beneficios_catalogo(*)").order("created_at"),
        sb.from("beneficios_solicitacoes").select("*,beneficio:beneficios_catalogo(*)").order("created_at",{ascending:false}),
      ]);
      if(uR.data)setUsers(uR.data.map(mu));
      if(fR.data)setFerias(fR.data.map(mf));
      if(fbR.data)setFeedbacks(fbR.data.map(mfb));
      if(cR.data)setChat(cR.data.map(mch));
      if(aR.data)setAvaliacoes(aR.data.map(mav));
      if(cadR.data)setCandidates(cadR.data.map(mc));
      if(vR.data&&vR.data.length>0)setVagas(vR.data.map(mv));
      if(tR.data)setTalentos(tR.data.map(mtal));
      if(comR.data)setComunicados(comR.data.map(mcom));
      if(exR.data)setExames(exR.data.map(mex));
      if(tkR.data)setTarefas(tkR.data.map(mtk));
      if(plR.data)setPulses(plR.data);
      if(npsR.data)setNps(npsR.data);
      if(bcR.data)setBenCatalogo(bcR.data);
      if(buR.data)setBenUsuarios(buR.data);
      if(bsR.data)setBenSolicits(bsR.data);
      if(movR.data)setMovs(movR.data.map(mmv));
    }catch(e){console.error(e);showToast("Erro ao carregar dados.","error");}
    setLoading(false);
  };
  
  const handleLogin=async u=>{setUser(u);setPage("dashboard");await loadAll();};
  const handleLogout=()=>{setUser(null);setUsers([]);setFerias([]);setFeedbacks([]);setChat([]);setAvaliacoes([]);setCandidates([]);setTalentos([]);setComunicados([]);setExames([]);setTarefas([]);setPulses([]);setNps([]);setBenCatalogo([]);setBenUsuarios([]);setBenSolicits([]);setMovs([]);};
  
  // Automação para criar cards no Kanban Planner
  const criarTarefaAuto=async(titulo,desc,prio="media",tags=[],origemTipo=null,origemId=null)=>{
    const sb=await initSB();if(!sb)return;
    const row={
      titulo,
      descricao:desc,
      coluna:"backlog",
      prioridade:prio,
      responsavel_id:null,
      responsavel_name:"",
      setor:"",
      data_vencimento:null,
      tags:tags,
      criado_por_id:user?.id||null,
      criado_por_name:"Sistema Automático",
      origem_tipo:origemTipo,
      origem_id:origemId?String(origemId):null,
    };
    const{data}=await sb.from("tarefas").insert([row]).select().single();
    if(data)setTarefas(p=>[...p,mtk(data)]);
  };
  
  const navGroups=user?NAV.map(g=>({...g,items:g.items.filter(n=>can(user.role,n.min))})).filter(g=>g.items.length>0):[];
  const navItems=user?NAV_FLAT.filter(n=>can(user.role,n.min)):[];
  const chatUnread=user?chat.filter(m=>m.toId===user.id&&!m.lido).length:0;
  const feriasPend=user?ferias.filter(f=>{if(user.role==="lider")return users.find(u=>u.id===f.userId)?.liderId===user.id&&f.status==="pendente_lider";if(user.role==="gestor")return f.status==="pendente_gestor"&&users.find(u=>u.id===f.userId)?.gestorId===user.id;if(isRHouDev(user.role))return f.status==="pendente_rh";return false;}).length:0;
  const comUnread=user?comunicados.filter(c=>{const rec=new Date()-new Date(c.createdAt||"");return rec<86400000*2&&(c.setores.length===0||c.setores.includes(user.setor));}).length:0;
  const badges={chat:chatUnread,ferias:feriasPend,comunicados:comUnread};
  
  if(!sbReady)return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,flexDirection:"column",gap:16}}><style>{CSS}</style><Spin size={36}/><div style={{fontSize:14,color:C.txd}}>Conectando ao banco...</div></div>;
  if(!user&&screen==="career")return<CareerPortal vagas={vagas} onBack={()=>setScreen("login")} onSubmit={c=>setCandidates(p=>[c,...p])} criarTarefaAuto={criarTarefaAuto}/>;
  if(!user)return<Login onLogin={handleLogin} onPortal={()=>setScreen("career")}/>;
  if(loading&&users.length===0)return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,flexDirection:"column",gap:16}}><style>{CSS}</style><Spin size={36}/><div style={{fontSize:14,color:C.txd}}>Carregando dados...</div></div>;
  
  const props={user,users,setUsers,ferias,setFerias,feedbacks,setFeedbacks,chat,setChat,avaliacoes,setAvaliacoes,candidates,setCandidates,vagas,setVagas,talentos,setTalentos,comunicados,setComunicados,exames,setExames,tarefas,setTarefas,criarTarefaAuto,pulses,setPulses,nps,setNps,benCatalogo,setBenCatalogo,benUsuarios,setBenUsuarios,benSolicits,setBenSolicits,movs,setMovs,showToast};
  
  const renderPage=()=>{
    switch(page){
      case"dashboard":return<Dashboard {...props} setPage={setPage}/>;
      case"perfil":return<Perfil user={user} setUsers={setUsers} setPage={setPage}/>;
      case"ferias":return<Ferias {...props}/>;
      case"planner":return<Planner {...props} setPage={setPage}/>;
      case"avaliacoes":return<Avaliacoes {...props}/>;
      case"feedbacks":return<Feedbacks {...props}/>;
      case"chat":return<Chat {...props}/>;
      case"comunicados":return<Comunicados {...props}/>;
      case"colaboradores":return<Colaboradores users={users} setUsers={setUsers} currentUser={user}/>;
      case"contratacao":return<Contratacao {...props}/>;
      case"movimentacoes":return<Movimentacoes {...props}/>;
      case"exames":return<Exames {...props}/>;
      case"beneficios":return<GestBeneficios {...props}/>;case"clima":return<PesquisaClima {...props}/>;case"analytics":return<PeopleAnalytics {...props}/>;case"config":return<Config user={user}/>;
      default:return<Dashboard {...props}/>;
    }
  };
  
  return(
    <div style={{display:"flex",height:"100vh",overflow:"hidden",background:C.bg}}>
      <style>{CSS}</style>
      {/* SIDEBAR */}
      <div style={{width:collapsed?54:208,minWidth:collapsed?54:208,background:C.bgAlt,borderRight:"1px solid "+C.bdr,display:"flex",flexDirection:"column",transition:"width .25s cubic-bezier(.4,0,.2,1),min-width .25s cubic-bezier(.4,0,.2,1)",overflow:"hidden"}}>
        <div onClick={()=>setCollapsed(c=>!c)} style={{padding:collapsed?"14px 0":"16px 14px",display:"flex",alignItems:"center",justifyContent:collapsed?"center":"flex-start",gap:10,borderBottom:"1px solid "+C.bdr,cursor:"pointer"}}>
          <div style={{width:32,height:32,background:"linear-gradient(135deg,"+C.acc+","+C.accDk+")",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"#fff",flexShrink:0,boxShadow:"0 2px 10px "+C.acc+"45"}}>K</div>
          {!collapsed&&<div><div style={{fontSize:14,fontWeight:800,letterSpacing:"-.02em",whiteSpace:"nowrap"}}>K.RH</div><div style={{fontSize:9,color:C.txd,whiteSpace:"nowrap"}}>Kalenborn</div></div>}
        </div>
        <nav style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"8px 0"}}>
          {navGroups.map((grp,gi)=>(
            <div key={grp.group}>
              {!collapsed&&<div style={{padding:"10px 16px 4px",fontSize:10,fontWeight:700,color:C.txf,textTransform:"uppercase",letterSpacing:".06em"}}>{grp.group}</div>}
              {collapsed&&gi>0&&<div style={{height:1,background:C.bdr,margin:"6px 10px"}}/>}
              {grp.items.map(item=>{
                const isA=page===item.id;const badge=badges[item.id]||0;
                return <div key={item.id} onClick={()=>setPage(item.id)} title={collapsed?item.label:""} style={{display:"flex",alignItems:"center",gap:9,padding:collapsed?"9px 0":"8px 12px",justifyContent:collapsed?"center":"flex-start",margin:"1px 5px",borderRadius:9,background:isA?C.accBg:"transparent",color:isA?C.acc:C.txd,cursor:"pointer",transition:"all .15s",position:"relative",borderLeft:isA?"2px solid "+C.acc:"2px solid transparent"}} onMouseEnter={e=>{if(!isA)e.currentTarget.style.background=C.s2;}} onMouseLeave={e=>{if(!isA)e.currentTarget.style.background="transparent";}}>
                  <span style={{fontSize:14,flexShrink:0,lineHeight:1}}>{item.icon}</span>
                  {!collapsed&&<span style={{fontSize:12,fontWeight:isA?600:400,whiteSpace:"nowrap",overflow:"hidden",flex:1}}>{item.label}</span>}
                  {badge>0&&<span style={{position:collapsed?"absolute":"static",top:collapsed?4:undefined,right:collapsed?4:undefined,marginLeft:collapsed?undefined:"auto",background:C.acc,color:"#fff",fontSize:9,fontWeight:700,borderRadius:"50%",width:15,height:15,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{badge}</span>}
                </div>;
              })}
            </div>
          ))}
        </nav>
        <div style={{padding:collapsed?"10px 0":"10px 12px",borderTop:"1px solid "+C.bdr,display:"flex",alignItems:"center",justifyContent:collapsed?"center":"flex-start",gap:9}}>
          <Av name={user.name} size={28} color={SC[user.setor]||C.acc}/>
          {!collapsed&&<>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name.split(" ")[0]}</div><div style={{fontSize:9,color:C.txd,textTransform:"uppercase",letterSpacing:".04em"}}>{user.role}</div></div>
            <button onClick={handleLogout} style={{background:"none",border:"none",color:C.txf,cursor:"pointer",fontSize:14,padding:4,borderRadius:6}} title="Sair" onMouseEnter={e=>e.currentTarget.style.color=C.red} onMouseLeave={e=>e.currentTarget.style.color=C.txf}>⏻</button>
          </>}
        </div>
      </div>
      {/* MAIN */}
      <main style={{flex:1,overflowY:"auto",padding:"24px 28px"}}>{renderPage()}</main>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
    </div>
  );
}
