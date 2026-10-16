-- Aplicada em 16/10/2026 (versão 20261016140558). mov_decidir é substituída em 20261016140622 (nome do setor).
-- Verificado como anon (com rollback): colaborador não abre pedido; líder abre admissão e demissão (nome/cargo do
-- cadastro); gestor inválido e 2ª demissão recusados; RH não decide antes do gestor; só o gestor indicado ou RH detalha;
-- gestor não decide; RH aprova admissão (cria vaga) e demissão (desliga); não decide 2 vezes; listagem por envolvido;
-- anon não grava direto na tabela.
--
-- Admissão/Demissão estava quebrada em produção (16/10/2026): a tabela movimentacoes tem RLS sem política para o
-- navegador, então nada era gravado nem lido (e a tela não mostrava erro). Em vez de abrir a tabela, o fluxo passa a
-- usar estas funções, que conferem o perfil de quem pede em cada etapa:
--   líder (ou acima) abre o pedido → gestor indicado (ou RH) detalha → RH decide e efetiva.
-- Ao aprovar: admissão cria a vaga (código sequencial do banco); demissão marca o colaborador como desligado.
-- Limite conhecido: sem Supabase Auth, o id de quem pede vem do navegador (próxima etapa: login do Supabase).

CREATE OR REPLACE FUNCTION public.nivel_perfil(p_role text) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_role WHEN 'colaborador' THEN 1 WHEN 'lider' THEN 2 WHEN 'gestor' THEN 3 WHEN 'rh' THEN 4 WHEN 'dev' THEN 5 ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.mov_listar(p_pedido_por integer)
RETURNS SETOF public.movimentacoes LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE u usuarios;
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_pedido_por AND coalesce(status,'ativo') = 'ativo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  IF nivel_perfil(u.role) >= 4 THEN RETURN QUERY SELECT * FROM movimentacoes ORDER BY created_at DESC; RETURN; END IF;
  RETURN QUERY SELECT * FROM movimentacoes m
    WHERE p_pedido_por IN (m.solicitante_id, m.lider_id, m.gestor_id, m.user_id) ORDER BY m.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.mov_abrir(p_pedido_por integer, p_tipo text, p_dados jsonb)
RETURNS public.movimentacoes LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u usuarios; g usuarios; c usuarios; v movimentacoes; d jsonb := coalesce(p_dados,'{}'::jsonb);
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_pedido_por AND coalesce(status,'ativo') = 'ativo';
  IF NOT FOUND OR nivel_perfil(u.role) < 2 THEN RAISE EXCEPTION 'Apenas líderes, gestores e RH abrem pedidos de admissão/demissão.'; END IF;
  SELECT * INTO g FROM usuarios WHERE id = (d->>'gestor_id')::int AND coalesce(status,'ativo') = 'ativo';
  IF NOT FOUND OR nivel_perfil(g.role) < 3 THEN RAISE EXCEPTION 'Escolha um gestor válido.'; END IF;
  IF length(btrim(coalesce(d->>'motivo',''))) < 5 THEN RAISE EXCEPTION 'Explique o motivo do pedido.'; END IF;
  IF p_tipo = 'admissao' THEN
    IF length(btrim(coalesce(d->>'cargo',''))) < 2 OR length(btrim(coalesce(d->>'salario',''))) < 1 THEN RAISE EXCEPTION 'Informe cargo e salário.'; END IF;
    INSERT INTO movimentacoes (tipo, status, solicitante_id, solicitante_name, setor, lider_id, gestor_id, motivo, cargo, salario, requisitos)
    VALUES ('admissao', 'pendente_gestor', u.id, u.name, nullif(btrim(coalesce(d->>'setor','')),''), u.id, g.id,
            btrim(d->>'motivo'), btrim(d->>'cargo'), btrim(d->>'salario'), nullif(btrim(coalesce(d->>'requisitos','')),''))
    RETURNING * INTO v;
  ELSIF p_tipo = 'demissao' THEN
    SELECT * INTO c FROM usuarios WHERE id = (d->>'user_id')::int AND coalesce(status,'ativo') = 'ativo';
    IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador não encontrado entre os ativos.'; END IF;
    IF EXISTS (SELECT 1 FROM movimentacoes m WHERE m.user_id = c.id AND m.tipo = 'demissao' AND m.status LIKE 'pendente%') THEN
      RAISE EXCEPTION 'Já existe um pedido de demissão em andamento para este colaborador.'; END IF;
    INSERT INTO movimentacoes (tipo, status, solicitante_id, solicitante_name, user_id, nome, cargo, setor, lider_id, gestor_id, motivo)
    VALUES ('demissao', 'pendente_gestor', u.id, u.name, c.id, c.name, c.cargo, c.setor, u.id, g.id, btrim(d->>'motivo'))
    RETURNING * INTO v;
  ELSE RAISE EXCEPTION 'Tipo inválido.'; END IF;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.mov_detalhar(p_pedido_por integer, p_id integer, p_dados jsonb)
RETURNS public.movimentacoes LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u usuarios; m movimentacoes; d jsonb := coalesce(p_dados,'{}'::jsonb);
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_pedido_por AND coalesce(status,'ativo') = 'ativo';
  SELECT * INTO m FROM movimentacoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF u.id IS NULL OR NOT (u.id = m.gestor_id OR nivel_perfil(u.role) >= 4) THEN RAISE EXCEPTION 'Só o gestor indicado ou o RH detalham este pedido.'; END IF;
  IF m.status <> 'pendente_gestor' THEN RAISE EXCEPTION 'Este pedido não está aguardando o gestor.'; END IF;
  IF m.tipo = 'admissao' THEN
    IF length(btrim(coalesce(d->>'cargo',''))) < 2 OR length(btrim(coalesce(d->>'salario',''))) < 1 THEN RAISE EXCEPTION 'Informe cargo e salário.'; END IF;
    UPDATE movimentacoes SET cargo = btrim(d->>'cargo'), salario = btrim(d->>'salario'), requisitos = nullif(btrim(coalesce(d->>'requisitos','')),''),
      prazo_encerramento = nullif(d->>'prazo_encerramento','')::date, data_prevista = nullif(d->>'data_prevista','')::date,
      gestor_em = now(), status = 'pendente_rh' WHERE id = p_id RETURNING * INTO m;
  ELSE
    IF coalesce(d->>'ultimo_dia','') = '' THEN RAISE EXCEPTION 'Informe o último dia.'; END IF;
    UPDATE movimentacoes SET tipo_demissao = coalesce(nullif(d->>'tipo_demissao',''),'sem_justa_causa'), ultimo_dia = (d->>'ultimo_dia')::date,
      gestor_obs = nullif(btrim(coalesce(d->>'obs','')),''), gestor_em = now(), status = 'pendente_rh' WHERE id = p_id RETURNING * INTO m;
  END IF;
  RETURN m;
END; $$;

CREATE OR REPLACE FUNCTION public.mov_decidir(p_pedido_por integer, p_id integer, p_decisao text, p_obs text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m movimentacoes; v vagas; sl text;
BEGIN
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH decide pedidos de admissão/demissão.'; END IF;
  IF p_decisao NOT IN ('aprovado','rejeitado') THEN RAISE EXCEPTION 'Decisão inválida.'; END IF;
  SELECT * INTO m FROM movimentacoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF m.status <> 'pendente_rh' THEN RAISE EXCEPTION 'Este pedido não está aguardando o RH.'; END IF;
  UPDATE movimentacoes SET rh_decisao = p_decisao, rh_obs = nullif(btrim(coalesce(p_obs,'')),''), rh_em = now(), rh_id = p_pedido_por, status = p_decisao
  WHERE id = p_id RETURNING * INTO m;
  IF p_decisao = 'aprovado' AND m.tipo = 'admissao' THEN
    sl := CASE m.setor WHEN 'producao' THEN 'Produção' WHEN 'engenharia' THEN 'Engenharia' WHEN 'comercial' THEN 'Comercial' WHEN 'supply' THEN 'Supply'
          WHEN 'rh' THEN 'RH' WHEN 'financeiro' THEN 'Financeiro' WHEN 'qualidade' THEN 'Qualidade' WHEN 'pcp' THEN 'PCP' ELSE m.setor END;
    INSERT INTO vagas (title, area, local, tipo, descricao, salario, requisitos, prazo_encerramento, ativa, movimentacao_id)
    VALUES (m.cargo, sl, 'Kalenborn — presencial', 'CLT', coalesce(m.requisitos,'') || CASE WHEN m.salario IS NOT NULL THEN E'\n\nSalário: ' || m.salario ELSE '' END,
            m.salario, m.requisitos, m.prazo_encerramento, true, m.id)
    RETURNING * INTO v;
    UPDATE movimentacoes SET vaga_criada_id = v.id WHERE id = p_id RETURNING * INTO m;
  ELSIF p_decisao = 'aprovado' AND m.tipo = 'demissao' THEN
    UPDATE usuarios SET status = 'desligado', data_desligamento = coalesce(m.ultimo_dia, (now() AT TIME ZONE 'America/Sao_Paulo')::date) WHERE id = m.user_id;
  END IF;
  RETURN jsonb_build_object('movimentacao', to_jsonb(m), 'vaga', CASE WHEN v.id IS NULL THEN NULL ELSE to_jsonb(v) END);
END; $$;

REVOKE ALL ON FUNCTION public.mov_listar(integer), public.mov_abrir(integer,text,jsonb), public.mov_detalhar(integer,integer,jsonb),
  public.mov_decidir(integer,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mov_listar(integer), public.mov_abrir(integer,text,jsonb), public.mov_detalhar(integer,integer,jsonb),
  public.mov_decidir(integer,integer,text,text) TO anon, authenticated;
