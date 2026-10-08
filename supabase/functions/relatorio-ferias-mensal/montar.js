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
    emails.push({ para: l.email, nome: l.name, tipo: "lider", assunto: `Saldo de férias da sua equipe — ${mes}`, corpo, equipe: equipe.length, urgentes: urgentes.length });
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
  for (const d of destinatariosRH) emails.push({ para: d.email, nome: d.name, tipo: "rh", assunto: `Saldo de férias — visão geral — ${mes}`, corpo: rh });

  return { emails, resumo: { lideres: lideres.length, rh: destinatariosRH.length, urgentes: urg.length, relatorio: imp?.data_relatorio || null } };
}
