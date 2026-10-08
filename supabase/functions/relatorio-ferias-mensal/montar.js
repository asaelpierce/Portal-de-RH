// Monta os e-mails do relatório mensal de saldo de férias (decisão do RH em 08/10/2026:
// vai para o RH + cada líder, com só a equipe dele). Lógica pura — sem banco, sem rede —
// para poder ser testada com os dados reais fora do servidor.
//
// "Líder" aqui = qualquer usuário ativo que seja o líder imediato (usuarios.lider_id) de alguém ativo.
// Hoje isso inclui pessoas com papel "gestor" que lideram diretamente uma equipe.

const br = iso => iso ? iso.split("-").reverse().join("/") : "—";
const dias = (a, b) => { const p = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 86400000); };
const addAnos = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y + n, m - 1, d)).toISOString().slice(0, 10); };
const n = v => Number(v);

// ── HTML de e-mail ────────────────────────────────────────────────────────────
// Por quê HTML: o Power Automate envia o corpo como HTML; texto puro perdia as quebras de linha e
// chegava como um parágrafo só. Layout em tabelas e estilos inline porque o Outlook ignora CSS moderno.
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONTE = "font-family:'Segoe UI',Arial,Helvetica,sans-serif;";
const COR = { acc: "#4338ca", accLt: "#c7d2fe", txt: "#0f172a", txm: "#334155", txd: "#64748b", bdr: "#e2e8f0", fundo: "#f1f5f9",
  amb: "#b45309", ambBg: "#fef3c7", ambBd: "#fcd34d", red: "#b91c1c", redBg: "#fee2e2", redBd: "#fca5a5", grn: "#15803d" };
const caixa = (tom, titulo, html) => {
  const c = tom === "vermelho" ? [COR.red, COR.redBg, COR.redBd] : [COR.amb, COR.ambBg, COR.ambBd];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;border-collapse:separate;"><tr><td style="background:${c[1]};border:1px solid ${c[2]};border-left:4px solid ${c[0]};padding:12px 14px;${FONTE}">
    <div style="font-size:13px;font-weight:700;color:${c[0]};margin:0 0 6px 0;">${titulo}</div><div style="font-size:13px;line-height:1.6;color:${COR.txt};">${html}</div></td></tr></table>`;
};
const prazoTxt = d => d < 0 ? `<span style="color:${COR.red};font-weight:700;">prazo já passou</span>` : `faltam ${d} dia${d === 1 ? "" : "s"}`;
// Tabela de saldos: uma linha por período; nome só na primeira linha de cada pessoa.
const tabelaSaldos = (grupos, hoje, prazo) => {
  const th = t => `<th align="left" style="${FONTE}font-size:11px;font-weight:700;color:${COR.txd};text-transform:uppercase;letter-spacing:.03em;padding:8px 6px;border-bottom:2px solid ${COR.bdr};">${t}</th>`;
  let linhas = "";
  for (const g of grupos) g.ps.forEach((p, i) => {
    const d = dias(hoje, prazo(p)), fundo = d < 0 ? COR.redBg : d <= 90 ? COR.ambBg : "#ffffff";
    const td = (v, extra = "") => `<td style="${FONTE}font-size:13px;color:${COR.txt};padding:8px 6px;border-bottom:1px solid ${COR.bdr};background:${fundo};${extra}">${v}</td>`;
    linhas += `<tr>${td(i === 0 ? `<strong>${esc(g.nome)}</strong>${g.cad ? `<br><span style="color:${COR.txd};font-size:11px;">cad. ${esc(g.cad)}</span>` : ""}` : "")}${td(`${br(p.periodo_inicio)}&nbsp;a ${br(p.periodo_fim)}`)}${td(`<strong>${n(p.saldo)}</strong> dias`)}${td(`${br(prazo(p))}${d <= 90 ? `<br><span style="font-size:11px;">${prazoTxt(d)}</span>` : ""}${p.sugestao && p.sugestao > addAnos(p.periodo_fim, 1) ? `<br><span style="font-size:11px;color:${COR.red};font-weight:700;">⚠ passa do concessivo (${br(addAnos(p.periodo_fim, 1))}) — confirmar com o RH</span>` : ""}`)}</tr>`;
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px 0;"><tr>${th("Nome")}${th("Período aquisitivo")}${th("Saldo")}${th("Iniciar até")}</tr>${linhas}</table>`;
};
const indicador = (valor, rotulo, cor = COR.acc) => `<td width="33%" align="center" style="padding:12px 6px;background:${COR.fundo};border:1px solid ${COR.bdr};${FONTE}"><div style="font-size:22px;font-weight:700;color:${cor};">${valor}</div><div style="font-size:11px;color:${COR.txd};text-transform:uppercase;letter-spacing:.04em;margin-top:2px;">${rotulo}</div></td>`;
const MARCA_AVISO = "<!--AVISO-TESTE-->";
export function layoutEmail({ titulo, subtitulo, corpo, preheader }) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || "")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR.fundo};"><tr><td align="center" style="padding:20px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${COR.bdr};">
${MARCA_AVISO}
<tr><td style="background:${COR.acc};padding:20px 18px;${FONTE}">
  <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${COR.accLt};">Kalenborn do Brasil · Recursos Humanos</div>
  <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:6px;">${esc(titulo)}</div>
  ${subtitulo ? `<div style="font-size:13px;color:${COR.accLt};margin-top:4px;">${esc(subtitulo)}</div>` : ""}
</td></tr>
<tr><td style="padding:22px 16px;${FONTE}font-size:14px;line-height:1.6;color:${COR.txt};">${corpo}</td></tr>
<tr><td style="padding:16px 18px;border-top:1px solid ${COR.bdr};background:#fafafa;${FONTE}font-size:12px;line-height:1.6;color:${COR.txd};">
  Para lançar férias: <strong style="color:${COR.txm};">Portal de RH › Férias › + Lançar férias</strong>.<br>
  Mensagem automática enviada todo dia 1º. Dúvidas sobre saldos: fale com o RH.
</td></tr></table></td></tr></table></body></html>`;
}
// Faixa amarela no topo para o envio de teste.
export const comAvisoTeste = (html, destinatarioReal) => html.replace(MARCA_AVISO,
  `<tr><td style="background:#fde68a;padding:10px 18px;${FONTE}font-size:12px;color:#78350f;"><strong>E-MAIL DE TESTE</strong> — no envio real, iria para: ${esc(destinatarioReal)}</td></tr>`);

// saldos: linhas de ferias_saldos da importação mais recente; imp: a importação; usuarios: ativos com cadastro/lider_id/email.
export function montarRelatorios({ imp, saldos, usuarios, hoje, destinatariosRH }) {
  const ativos = usuarios.filter(u => (u.status || "ativo") === "ativo");
  const porCad = new Map(); for (const l of saldos) { if (!porCad.has(l.cadastro)) porCad.set(l.cadastro, []); porCad.get(l.cadastro).push(l); }
  const pendentes = cad => (porCad.get(cad) || []).filter(l => n(l.saldo) > 0 && l.periodo_fim < hoje); // períodos já adquiridos com saldo
  const prazo = l => l.sugestao || addAnos(l.periodo_fim, 1);
  const linhaPeriodo = l => `${br(l.periodo_inicio)} a ${br(l.periodo_fim)}: saldo ${n(l.saldo)} dias, iniciar até ${br(prazo(l))}`;
  const idadeRel = imp?.data_relatorio ? dias(imp.data_relatorio, hoje) : null;
  const avisoIdade = !imp ? "⚠ Nenhum relatório de férias foi importado no portal ainda.\n\n"
    : idadeRel > 40 ? `⚠ Atenção: o relatório da folha mais recente no portal é de ${br(imp.data_relatorio)} (${idadeRel} dias atrás). Os saldos podem estar desatualizados.\n\n` : "";
  const mes = new Date(hoje + "T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const emails = [];

  // ── Um e-mail por líder, com só a equipe dele
  const lideres = ativos.filter(l => ativos.some(x => x.lider_id === l.id));
  for (const l of lideres) {
    const equipe = ativos.filter(x => x.lider_id === l.id).sort((a, b) => a.name.localeCompare(b.name));
    const comSaldo = [], semSaldo = [], semCadastro = [];
    for (const x of equipe) {
      if (!x.cadastro) { semCadastro.push(x.name); continue; }
      const ps = pendentes(x.cadastro);
      (ps.length ? comSaldo : semSaldo).push({ x, ps });
    }
    const urgentes = comSaldo.flatMap(({ x, ps }) => ps.map(p => ({ x, p, d: dias(hoje, prazo(p)) }))).filter(u => u.d <= 90).sort((a, b) => a.d - b.d);
    let corpo = `Olá, ${l.name.split(" ")[0]}!\n\nSegue o saldo de férias da sua equipe${imp ? `, conforme o relatório da folha de ${br(imp.data_relatorio)}` : ""}.\n\n` + avisoIdade;
    if (urgentes.length) corpo += "⚠ PRECISAM INICIAR FÉRIAS NOS PRÓXIMOS 90 DIAS:\n" + urgentes.map(u => `• ${u.x.name} — ${n(u.p.saldo)} dias, iniciar até ${br(prazo(u.p))}${u.d < 0 ? " (PRAZO JÁ PASSOU)" : ` (faltam ${u.d} dias)`}`).join("\n") + "\n\n";
    corpo += "SALDOS DA EQUIPE (períodos já adquiridos):\n" + (comSaldo.length ? comSaldo.map(({ x, ps }) => `• ${x.name}\n` + ps.map(p => "   " + linhaPeriodo(p)).join("\n")).join("\n") : "• Ninguém com saldo pendente.") + "\n";
    if (semSaldo.length) corpo += `\nSem saldo pendente: ${semSaldo.map(s => s.x.name).join(", ")}.\n`;
    if (semCadastro.length) corpo += `\nSem vínculo com a folha (avise o RH): ${semCadastro.join(", ")}.\n`;
    corpo += "\nPara lançar férias: Portal de RH › Férias › + Lançar férias.\n\nRecursos Humanos — Kalenborn do Brasil";
    let h = `<p style="margin:0 0 12px 0;">Olá, <strong>${esc(l.name.split(" ")[0])}</strong>!</p>`
      + `<p style="margin:0 0 18px 0;">Segue o saldo de férias da sua equipe${imp ? `, conforme o relatório da folha de <strong>${br(imp.data_relatorio)}</strong>` : ""}.</p>`;
    if (avisoIdade) h += caixa("amarelo", "Atenção", esc(avisoIdade.replace(/^⚠\s*(Atenção:\s*)?/, "").trim()));
    if (urgentes.length) h += caixa(urgentes.some(u => u.d < 0) ? "vermelho" : "amarelo", "Precisam iniciar férias nos próximos 90 dias",
      urgentes.map(u => `• <strong>${esc(u.x.name)}</strong> — ${n(u.p.saldo)} dias · iniciar até <strong>${br(prazo(u.p))}</strong> (${prazoTxt(u.d)})`).join("<br>"));
    h += `<div style="${FONTE}font-size:15px;font-weight:700;color:${COR.txt};margin:6px 0 8px 0;">Saldos da equipe</div><div style="font-size:12px;color:${COR.txd};margin:0 0 8px 0;">Períodos aquisitivos já completos, com saldo a gozar.</div>`;
    h += comSaldo.length ? tabelaSaldos(comSaldo.map(({ x, ps }) => ({ nome: x.name, cad: x.cadastro, ps })), hoje, prazo)
      : `<p style="margin:0 0 14px 0;color:${COR.txd};">Ninguém da equipe tem saldo pendente.</p>`;
    if (semSaldo.length) h += `<p style="margin:0 0 8px 0;font-size:12px;color:${COR.txd};"><strong>Sem saldo pendente:</strong> ${semSaldo.map(s => esc(s.x.name)).join(", ")}.</p>`;
    if (semCadastro.length) h += `<p style="margin:0 0 8px 0;font-size:12px;color:${COR.amb};"><strong>Sem vínculo com a folha (avise o RH):</strong> ${semCadastro.map(esc).join(", ")}.</p>`;
    const html = layoutEmail({ titulo: "Saldo de férias da sua equipe", subtitulo: mes.charAt(0).toUpperCase() + mes.slice(1) + (imp ? ` · folha de ${br(imp.data_relatorio)}` : ""),
      corpo: h, preheader: urgentes.length ? `${urgentes.length} pessoa(s) precisam iniciar férias nos próximos 90 dias.` : "Saldo de férias da sua equipe." });
    emails.push({ para: l.email, nome: l.name, tipo: "lider", assunto: `Saldo de férias da sua equipe — ${mes}`, corpo, html, equipe: equipe.length, urgentes: urgentes.length });
  }

  // ── Visão geral para o RH
  const todos = [...porCad.keys()].map(c => ({ c, ps: pendentes(c), nome: porCad.get(c)[0].nome }));
  const urg = todos.flatMap(t => t.ps.map(p => ({ t, p, d: dias(hoje, prazo(p)) }))).filter(u => u.d <= 90).sort((a, b) => a.d - b.d);
  const aposPrazo = saldos.filter(l => n(l.saldo) > 0 && l.sugestao && l.sugestao > addAnos(l.periodo_fim, 1));
  const cadsPortal = new Set(ativos.map(u => u.cadastro).filter(Boolean));
  const semUsuario = todos.filter(t => !cadsPortal.has(t.c)).map(t => `${t.nome} (${t.c})`);
  const totalDias = todos.reduce((s, t) => s + t.ps.reduce((a, p) => a + n(p.saldo), 0), 0);
  let rh = `Relatório mensal de saldo de férias — ${mes}.\n\n` + avisoIdade;
  if (imp) rh += `Relatório da folha: ${br(imp.data_relatorio)} · ${imp.colaboradores} colaboradores · ${totalDias} dias de saldo em períodos já adquiridos.\n\n`;
  rh += urg.length ? "⚠ INICIAR NOS PRÓXIMOS 90 DIAS:\n" + urg.map(u => `• ${u.t.nome} (${u.t.c}) — ${n(u.p.saldo)} dias, iniciar até ${br(prazo(u.p))}${u.d < 0 ? " (PRAZO JÁ PASSOU)" : ` (faltam ${u.d} dias)`}`).join("\n") + "\n\n" : "Nenhum prazo de início nos próximos 90 dias.\n\n";
  if (aposPrazo.length) rh += "⚠ DATA SUGERIDA PELA FOLHA DEPOIS DO FIM DO CONCESSIVO (confirmar com a contabilidade):\n" + aposPrazo.map(l => `• ${l.nome} (${l.cadastro}) — aquisitivo ${br(l.periodo_inicio)} a ${br(l.periodo_fim)}, concessivo até ${br(addAnos(l.periodo_fim, 1))}, sugestão ${br(l.sugestao)}`).join("\n") + "\n\n";
  if (semUsuario.length) rh += `Cadastros da folha sem usuário no portal (${semUsuario.length}): ${semUsuario.join(", ")}.\n\n`;
  rh += `Relatórios enviados aos líderes: ${emails.length}.\n\nDetalhes por colaborador: Portal de RH › Férias › Saldos.`;
  let hr = "";
  if (imp) hr += `<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin:0 0 16px 0;"><tr>${indicador(imp.colaboradores, "colaboradores")}${indicador(totalDias, "dias de saldo")}${indicador(urg.length, "prazos em 90 dias", urg.length ? COR.amb : COR.grn)}</tr></table>`;
  if (avisoIdade) hr += caixa("amarelo", "Atenção", esc(avisoIdade.replace(/^⚠\s*(Atenção:\s*)?/, "").trim()));
  hr += urg.length ? caixa(urg.some(u => u.d < 0) ? "vermelho" : "amarelo", "Iniciar férias nos próximos 90 dias",
      urg.map(u => `• <strong>${esc(u.t.nome)}</strong> <span style="color:${COR.txd};">(cad. ${esc(u.t.c)})</span> — ${n(u.p.saldo)} dias · iniciar até <strong>${br(prazo(u.p))}</strong> (${prazoTxt(u.d)})`).join("<br>"))
    : (imp ? `<p style="margin:0 0 16px 0;color:${COR.grn};">Nenhum prazo de início de férias nos próximos 90 dias.</p>` : "");
  if (aposPrazo.length) hr += caixa("vermelho", "Data sugerida pela folha depois do fim do concessivo — confirmar com a contabilidade",
      aposPrazo.map(l => `• <strong>${esc(l.nome)}</strong> (cad. ${esc(l.cadastro)}) — aquisitivo ${br(l.periodo_inicio)} a ${br(l.periodo_fim)} · concessivo até <strong>${br(addAnos(l.periodo_fim, 1))}</strong> · sugestão da folha ${br(l.sugestao)}`).join("<br>"));
  if (semUsuario.length) hr += `<p style="margin:0 0 10px 0;font-size:12px;color:${COR.txd};"><strong>Cadastros da folha sem usuário no portal (${semUsuario.length}):</strong> ${semUsuario.map(esc).join(", ")}.</p>`;
  hr += `<p style="margin:0;font-size:12px;color:${COR.txd};">Relatórios enviados aos líderes: <strong>${emails.length}</strong>. Detalhes por colaborador: Portal de RH › Férias › Saldos.</p>`;
  const htmlRH = layoutEmail({ titulo: "Saldo de férias — visão geral", subtitulo: mes.charAt(0).toUpperCase() + mes.slice(1) + (imp ? ` · folha de ${br(imp.data_relatorio)}` : ""),
    corpo: hr, preheader: urg.length ? `${urg.length} prazo(s) de férias nos próximos 90 dias.` : "Relatório mensal de saldo de férias." });
  for (const d of destinatariosRH) emails.push({ para: d.email, nome: d.name, tipo: "rh", assunto: `Saldo de férias — visão geral — ${mes}`, corpo: rh, html: htmlRH });

  return { emails, resumo: { lideres: lideres.length, rh: destinatariosRH.length, urgentes: urg.length, relatorio: imp?.data_relatorio || null } };
}
