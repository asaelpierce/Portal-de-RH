-- Aplicada em 28/10/2026 (versão 20261028123319). Corrigida em 20261028123432 (apelido ambíguo em mov_abrir; "tipos"
-- fora do formato de lista). Verificado depois da correção (rollback, sessões reais): proposta guarda só o que muda;
-- aprovada com vigência hoje atualiza o cadastro na hora; vigência futura só no dia (agendamento diário); recusa
-- "nada muda", centro de custo inventado, líder de outra equipe e segunda movimentação em andamento; o colaborador
-- não vê pedidos sobre ele.
--
-- Movimentação de Pessoal (substitui o Forms "KdB 133") — 28/10/2026.
-- Terceiro tipo no módulo Admissão/Demissão: promoção, alteração salarial, transferência de setor/centro de custo,
-- mudança de função, de horário ou de líder/gestor. Mesmo fluxo (quem abre → gestor → RH). Aprovado pelo RH, o cadastro
-- é atualizado sozinho na data de vigência (cargo, setor, área, centro de custo, líder, gestor); salário e horário
-- ficam registrados no pedido (o portal não guarda esses dados no cadastro).
-- Correção junto: mov_listar mostrava o pedido também à pessoa citada (user_id) — um colaborador via o pedido de
-- demissão dele em andamento chamando a função direto. Agora só solicitante, líder, gestor indicado e RH.
ALTER TABLE public.movimentacoes DROP CONSTRAINT IF EXISTS movimentacoes_tipo_check;
ALTER TABLE public.movimentacoes ADD CONSTRAINT movimentacoes_tipo_check CHECK (tipo IN ('admissao','demissao','movimentacao'));
ALTER TABLE public.movimentacoes
  ADD COLUMN mov_tipos text[],
  ADD COLUMN atual jsonb,
  ADD COLUMN proposta jsonb,
  ADD COLUMN aplicado_em timestamptz;

CREATE OR REPLACE FUNCTION public.mov_listar(p_pedido_por integer)
RETURNS SETOF movimentacoes LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE u usuarios;
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  SELECT * INTO u FROM usuarios WHERE id = p_pedido_por AND coalesce(status,'ativo') = 'ativo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  IF nivel_perfil(u.role) >= 4 THEN RETURN QUERY SELECT * FROM movimentacoes ORDER BY created_at DESC; RETURN; END IF;
  RETURN QUERY SELECT * FROM movimentacoes m
    WHERE p_pedido_por IN (m.solicitante_id, m.lider_id, m.gestor_id) ORDER BY m.created_at DESC;
END; $function$;

-- Valida a proposta: só campos conhecidos; setor/centro de custo existentes; líder/gestor ativos com perfil adequado.
CREATE OR REPLACE FUNCTION public.mov_validar_proposta(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE r jsonb := '{}'::jsonb; k text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(coalesce(p,'{}'::jsonb)) LOOP
    IF k NOT IN ('cargo','setor','area','centro_custo','lider_id','gestor_id','salario','horario') THEN RAISE EXCEPTION 'Campo desconhecido na proposta: %', k; END IF;
    IF nullif(btrim(p->>k),'') IS NULL THEN CONTINUE; END IF;
    IF k = 'setor' AND NOT EXISTS (SELECT 1 FROM usuarios WHERE setor = p->>k) THEN RAISE EXCEPTION 'Setor inválido: %', p->>k; END IF;
    IF k = 'centro_custo' AND NOT EXISTS (SELECT 1 FROM usuarios WHERE centro_custo = p->>k) THEN RAISE EXCEPTION 'Centro de custo inválido (use um da folha): %', p->>k; END IF;
    IF k = 'lider_id' AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = (p->>k)::int AND coalesce(status,'ativo') = 'ativo' AND nivel_perfil(role) >= 2) THEN RAISE EXCEPTION 'Líder inválido.'; END IF;
    IF k = 'gestor_id' AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = (p->>k)::int AND coalesce(status,'ativo') = 'ativo' AND nivel_perfil(role) >= 3) THEN RAISE EXCEPTION 'Gestor inválido.'; END IF;
    r := r || jsonb_build_object(k, CASE WHEN k IN ('lider_id','gestor_id') THEN to_jsonb((p->>k)::int) ELSE to_jsonb(btrim(p->>k)) END);
  END LOOP;
  RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public.mov_validar_proposta(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mov_abrir(p_pedido_por integer, p_tipo text, p_dados jsonb)
RETURNS movimentacoes LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE u usuarios; g usuarios; c usuarios; v movimentacoes; d jsonb := coalesce(p_dados,'{}'::jsonb); prop jsonb; atual jsonb; tipos text[];
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  SELECT * INTO u FROM usuarios WHERE id = p_pedido_por AND coalesce(status,'ativo') = 'ativo';
  IF NOT FOUND OR nivel_perfil(u.role) < 2 THEN RAISE EXCEPTION 'Apenas líderes, gestores e RH abrem pedidos de pessoal.'; END IF;
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
  ELSIF p_tipo = 'movimentacao' THEN
    SELECT * INTO c FROM usuarios WHERE id = (d->>'user_id')::int AND coalesce(status,'ativo') = 'ativo';
    IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador não encontrado entre os ativos.'; END IF;
    IF NOT (nivel_perfil(u.role) >= 4 OR c.lider_id = u.id OR c.gestor_id = u.id) THEN
      RAISE EXCEPTION 'Só o líder ou o gestor do colaborador (ou o RH) pedem a movimentação dele.'; END IF;
    IF EXISTS (SELECT 1 FROM movimentacoes m WHERE m.user_id = c.id AND m.tipo = 'movimentacao' AND (m.status LIKE 'pendente%' OR (m.status = 'aprovado' AND m.aplicado_em IS NULL))) THEN
      RAISE EXCEPTION 'Já existe uma movimentação em andamento para este colaborador.'; END IF;
    IF coalesce(d->>'data_vigencia','') = '' THEN RAISE EXCEPTION 'Informe a data de vigência.'; END IF;
    SELECT array_agg(t) INTO tipos FROM jsonb_array_elements_text(coalesce(d->'tipos','[]'::jsonb)) t
      WHERE t IN ('promocao','salario','transferencia','funcao','horario','lideranca');
    IF tipos IS NULL THEN RAISE EXCEPTION 'Escolha o tipo da movimentação.'; END IF;
    prop := mov_validar_proposta(d->'proposta');
    atual := jsonb_build_object('cargo', c.cargo, 'setor', c.setor, 'area', c.area, 'centro_custo', c.centro_custo, 'lider_id', c.lider_id, 'gestor_id', c.gestor_id);
    -- só o que muda de fato (salário e horário sempre contam: não ficam no cadastro)
    SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb) INTO prop FROM jsonb_each(prop) e(k, v)
      WHERE k IN ('salario','horario') OR atual->k IS DISTINCT FROM v;
    IF prop = '{}'::jsonb THEN RAISE EXCEPTION 'Nada muda em relação à situação atual.'; END IF;
    INSERT INTO movimentacoes (tipo, status, solicitante_id, solicitante_name, user_id, nome, cargo, setor, lider_id, gestor_id, motivo,
                               data_prevista, mov_tipos, atual, proposta)
    VALUES ('movimentacao', 'pendente_gestor', u.id, u.name, c.id, c.name, c.cargo, c.setor, u.id, g.id, btrim(d->>'motivo'),
            (d->>'data_vigencia')::date, tipos, atual, prop)
    RETURNING * INTO v;
  ELSE RAISE EXCEPTION 'Tipo inválido.'; END IF;
  RETURN v;
END; $function$;

CREATE OR REPLACE FUNCTION public.mov_detalhar(p_pedido_por integer, p_id integer, p_dados jsonb)
RETURNS movimentacoes LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE u usuarios; m movimentacoes; d jsonb := coalesce(p_dados,'{}'::jsonb); prop jsonb;
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
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
  ELSIF m.tipo = 'movimentacao' THEN
    -- o gestor pode ajustar a proposta e a vigência antes de mandar ao RH
    prop := CASE WHEN d ? 'proposta' THEN mov_validar_proposta(d->'proposta') ELSE m.proposta END;
    IF prop = '{}'::jsonb THEN RAISE EXCEPTION 'A proposta ficou vazia.'; END IF;
    UPDATE movimentacoes SET proposta = prop, data_prevista = coalesce(nullif(d->>'data_vigencia','')::date, data_prevista),
      gestor_obs = nullif(btrim(coalesce(d->>'obs','')),''), gestor_em = now(), status = 'pendente_rh' WHERE id = p_id RETURNING * INTO m;
  ELSE
    IF coalesce(d->>'ultimo_dia','') = '' THEN RAISE EXCEPTION 'Informe o último dia.'; END IF;
    UPDATE movimentacoes SET tipo_demissao = coalesce(nullif(d->>'tipo_demissao',''),'sem_justa_causa'), ultimo_dia = (d->>'ultimo_dia')::date,
      gestor_obs = nullif(btrim(coalesce(d->>'obs','')),''), gestor_em = now(), status = 'pendente_rh' WHERE id = p_id RETURNING * INTO m;
  END IF;
  RETURN m;
END; $function$;

-- Aplica uma movimentação aprovada no cadastro (campos do cadastro; salário e horário só ficam no pedido).
CREATE OR REPLACE FUNCTION public.mov_aplicar(p_id integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m movimentacoes; p jsonb;
BEGIN
  SELECT * INTO m FROM movimentacoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR m.tipo <> 'movimentacao' OR m.status <> 'aprovado' OR m.aplicado_em IS NOT NULL THEN RETURN; END IF;
  p := m.proposta;
  UPDATE usuarios SET
    cargo = CASE WHEN p ? 'cargo' THEN p->>'cargo' ELSE cargo END,
    setor = CASE WHEN p ? 'setor' THEN p->>'setor' ELSE setor END,
    area = CASE WHEN p ? 'area' THEN p->>'area' ELSE area END,
    centro_custo = CASE WHEN p ? 'centro_custo' THEN p->>'centro_custo' ELSE centro_custo END,
    lider_id = CASE WHEN p ? 'lider_id' THEN (p->>'lider_id')::int ELSE lider_id END,
    gestor_id = CASE WHEN p ? 'gestor_id' THEN (p->>'gestor_id')::int ELSE gestor_id END
  WHERE id = m.user_id AND coalesce(status,'ativo') = 'ativo';
  UPDATE movimentacoes SET aplicado_em = now() WHERE id = p_id;
END; $$;
REVOKE ALL ON FUNCTION public.mov_aplicar(integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mov_aplicar_vencidas() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM movimentacoes WHERE tipo = 'movimentacao' AND status = 'aprovado' AND aplicado_em IS NULL
           AND data_prevista <= (now() AT TIME ZONE 'America/Sao_Paulo')::date LOOP
    PERFORM mov_aplicar(r.id); n := n + 1;
  END LOOP;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.mov_aplicar_vencidas() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mov_decidir(p_pedido_por integer, p_id integer, p_decisao text, p_obs text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE m movimentacoes; v vagas;
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH decide pedidos de pessoal.'; END IF;
  IF p_decisao NOT IN ('aprovado','rejeitado') THEN RAISE EXCEPTION 'Decisão inválida.'; END IF;
  SELECT * INTO m FROM movimentacoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF m.status <> 'pendente_rh' THEN RAISE EXCEPTION 'Este pedido não está aguardando o RH.'; END IF;
  UPDATE movimentacoes SET rh_decisao = p_decisao, rh_obs = nullif(btrim(coalesce(p_obs,'')),''), rh_em = now(), rh_id = p_pedido_por, status = p_decisao
  WHERE id = p_id RETURNING * INTO m;
  IF p_decisao = 'aprovado' AND m.tipo = 'admissao' THEN
    INSERT INTO vagas (title, area, local, tipo, descricao, salario, requisitos, prazo_encerramento, ativa, movimentacao_id)
    VALUES (m.cargo, nome_setor(m.setor), 'Kalenborn — presencial', 'CLT', coalesce(m.requisitos,'') || CASE WHEN m.salario IS NOT NULL THEN E'\n\nSalário: ' || m.salario ELSE '' END,
            m.salario, m.requisitos, m.prazo_encerramento, true, m.id)
    RETURNING * INTO v;
    UPDATE movimentacoes SET vaga_criada_id = v.id WHERE id = p_id RETURNING * INTO m;
  ELSIF p_decisao = 'aprovado' AND m.tipo = 'demissao' THEN
    UPDATE usuarios SET status = 'desligado', data_desligamento = coalesce(m.ultimo_dia, (now() AT TIME ZONE 'America/Sao_Paulo')::date) WHERE id = m.user_id;
  ELSIF p_decisao = 'aprovado' AND m.tipo = 'movimentacao' AND m.data_prevista <= (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    PERFORM mov_aplicar(m.id);
    SELECT * INTO m FROM movimentacoes WHERE id = p_id;
  END IF;
  RETURN jsonb_build_object('movimentacao', to_jsonb(m), 'vaga', CASE WHEN v.id IS NULL THEN NULL ELSE to_jsonb(v) END);
END; $function$;

-- Todo dia às 03:05 (Brasília = 06:05 UTC): aplica as movimentações aprovadas cuja vigência chegou.
SELECT cron.schedule('mov_aplicar_vencidas', '5 6 * * *', $$SELECT public.mov_aplicar_vencidas()$$);
