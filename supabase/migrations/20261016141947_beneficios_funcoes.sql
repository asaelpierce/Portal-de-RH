-- Aplicada em 16/10/2026 (versão 20261016141947). ben_catalogo_salvar é substituída em 20261016142042 (padrões).
-- Verificado como anon (com rollback): RH vê os 644; pessoa vê só os seus; pedido repetido e de benefício que já tem
-- recusados; não-RH não responde; RH aprova (inclui benefício); não responde 2 vezes; outra pessoa não cancela;
-- dono cancela; pedir de novo e aprovar reativa (sem erro de duplicado); não-RH não mexe no catálogo; RH desativa item.
--
-- Benefícios estava quebrado em produção (16/10/2026): beneficios_usuarios e beneficios_solicitacoes têm RLS sem
-- política para o navegador (a tela não via os 644 benefícios cadastrados nem gravava pedidos) e o catálogo só aceita
-- leitura (cadastrar falhava; editar "funcionava" na tela sem mudar nada). Passa a usar estas funções:
--   colaborador: vê os próprios benefícios e pedidos, solicita, cancela o próprio benefício;
--   RH: vê tudo, aprova/rejeita pedidos (aprovar inclui o benefício da pessoa), mantém o catálogo.
-- As linhas voltam no mesmo formato que a tela usava (registro + "beneficio" com os dados do catálogo).
-- Limite conhecido: sem Supabase Auth, o id de quem pede vem do navegador (próxima etapa: login do Supabase).

CREATE OR REPLACE FUNCTION public.ben_com_catalogo(p_linha jsonb, p_beneficio_id integer) RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT p_linha || jsonb_build_object('beneficio', (SELECT to_jsonb(c) FROM beneficios_catalogo c WHERE c.id = p_beneficio_id));
$$;

CREATE OR REPLACE FUNCTION public.ben_listar(p_pedido_por integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE u usuarios; rh boolean;
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_pedido_por AND coalesce(status,'ativo') = 'ativo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  rh := nivel_perfil(u.role) >= 4;
  RETURN jsonb_build_object(
    'usuarios', coalesce((SELECT jsonb_agg(ben_com_catalogo(to_jsonb(b), b.beneficio_id) ORDER BY b.created_at)
                          FROM beneficios_usuarios b WHERE rh OR b.user_id = p_pedido_por), '[]'::jsonb),
    'solicitacoes', coalesce((SELECT jsonb_agg(ben_com_catalogo(to_jsonb(s), s.beneficio_id) ORDER BY s.created_at DESC)
                          FROM beneficios_solicitacoes s WHERE rh OR s.user_id = p_pedido_por), '[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.ben_solicitar(p_pedido_por integer, p_beneficio_id integer, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u usuarios; c beneficios_catalogo; s beneficios_solicitacoes;
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_pedido_por AND coalesce(status,'ativo') = 'ativo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  SELECT * INTO c FROM beneficios_catalogo WHERE id = p_beneficio_id AND coalesce(ativo, true);
  IF NOT FOUND THEN RAISE EXCEPTION 'Benefício não disponível.'; END IF;
  IF EXISTS (SELECT 1 FROM beneficios_usuarios b WHERE b.user_id = u.id AND b.beneficio_id = c.id AND b.status = 'ativo') THEN
    RAISE EXCEPTION 'Você já tem este benefício.'; END IF;
  IF EXISTS (SELECT 1 FROM beneficios_solicitacoes x WHERE x.user_id = u.id AND x.beneficio_id = c.id AND x.status = 'pendente') THEN
    RAISE EXCEPTION 'Já existe um pedido deste benefício aguardando o RH.'; END IF;
  INSERT INTO beneficios_solicitacoes (user_id, user_name, beneficio_id, status, motivo)
  VALUES (u.id, u.name, c.id, 'pendente', coalesce(nullif(btrim(coalesce(p_motivo,'')),''), 'Solicitação sem observação.'))
  RETURNING * INTO s;
  RETURN ben_com_catalogo(to_jsonb(s), s.beneficio_id);
END; $$;

CREATE OR REPLACE FUNCTION public.ben_responder(p_pedido_por integer, p_id integer, p_status text, p_obs text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s beneficios_solicitacoes; b beneficios_usuarios;
BEGIN
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH responde pedidos de benefício.'; END IF;
  IF p_status NOT IN ('aprovado','rejeitado') THEN RAISE EXCEPTION 'Resposta inválida.'; END IF;
  SELECT * INTO s FROM beneficios_solicitacoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF s.status <> 'pendente' THEN RAISE EXCEPTION 'Este pedido já foi respondido.'; END IF;
  UPDATE beneficios_solicitacoes SET status = p_status, resp_obs = nullif(btrim(coalesce(p_obs,'')),''), aprovado_por = p_pedido_por, aprovado_em = now()
  WHERE id = p_id RETURNING * INTO s;
  IF p_status = 'aprovado' THEN
    -- Um registro por pessoa e benefício (UNIQUE): se já existia (ex.: cancelado), é reativado.
    INSERT INTO beneficios_usuarios AS x (user_id, beneficio_id, status, data_inicio, aprovado_por)
    VALUES (s.user_id, s.beneficio_id, 'ativo', (now() AT TIME ZONE 'America/Sao_Paulo')::date, p_pedido_por)
    ON CONFLICT (user_id, beneficio_id) DO UPDATE SET status = 'ativo', data_inicio = EXCLUDED.data_inicio, data_fim = NULL, aprovado_por = p_pedido_por
    RETURNING * INTO b;
  END IF;
  RETURN jsonb_build_object('solicitacao', ben_com_catalogo(to_jsonb(s), s.beneficio_id),
                            'beneficio_usuario', CASE WHEN b.id IS NULL THEN NULL ELSE ben_com_catalogo(to_jsonb(b), b.beneficio_id) END);
END; $$;

CREATE OR REPLACE FUNCTION public.ben_catalogo_salvar(p_pedido_por integer, p_id integer, p_dados jsonb)
RETURNS public.beneficios_catalogo LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c beneficios_catalogo; d jsonb := coalesce(p_dados,'{}'::jsonb);
BEGIN
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH altera o catálogo de benefícios.'; END IF;
  IF length(btrim(coalesce(d->>'nome',''))) < 2 THEN RAISE EXCEPTION 'Informe o nome do benefício.'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO beneficios_catalogo (nome, descricao, categoria, icone, valor_empresa, valor_collab, elegibilidade, ativo, criado_por_id)
    VALUES (btrim(d->>'nome'), d->>'descricao', d->>'categoria', d->>'icone', coalesce((d->>'valor_empresa')::numeric,0),
            coalesce((d->>'valor_collab')::numeric,0), d->>'elegibilidade', coalesce((d->>'ativo')::boolean, true), p_pedido_por)
    RETURNING * INTO c;
  ELSE
    UPDATE beneficios_catalogo SET nome = btrim(d->>'nome'), descricao = d->>'descricao', categoria = d->>'categoria', icone = d->>'icone',
      valor_empresa = coalesce((d->>'valor_empresa')::numeric,0), valor_collab = coalesce((d->>'valor_collab')::numeric,0),
      elegibilidade = d->>'elegibilidade', ativo = coalesce((d->>'ativo')::boolean, ativo)
    WHERE id = p_id RETURNING * INTO c;
    IF NOT FOUND THEN RAISE EXCEPTION 'Benefício não encontrado.'; END IF;
  END IF;
  RETURN c;
END; $$;

CREATE OR REPLACE FUNCTION public.ben_catalogo_ativo(p_pedido_por integer, p_id integer, p_ativo boolean)
RETURNS public.beneficios_catalogo LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c beneficios_catalogo;
BEGIN
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH altera o catálogo de benefícios.'; END IF;
  UPDATE beneficios_catalogo SET ativo = p_ativo WHERE id = p_id RETURNING * INTO c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Benefício não encontrado.'; END IF;
  RETURN c;
END; $$;

CREATE OR REPLACE FUNCTION public.ben_cancelar(p_pedido_por integer, p_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b beneficios_usuarios;
BEGIN
  SELECT * INTO b FROM beneficios_usuarios WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Benefício não encontrado.'; END IF;
  IF b.user_id <> p_pedido_por AND NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só a própria pessoa ou o RH cancelam um benefício.'; END IF;
  UPDATE beneficios_usuarios SET status = 'cancelado', data_fim = (now() AT TIME ZONE 'America/Sao_Paulo')::date WHERE id = p_id RETURNING * INTO b;
  RETURN ben_com_catalogo(to_jsonb(b), b.beneficio_id);
END; $$;

REVOKE ALL ON FUNCTION public.ben_com_catalogo(jsonb,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ben_listar(integer), public.ben_solicitar(integer,integer,text), public.ben_responder(integer,integer,text,text),
  public.ben_catalogo_salvar(integer,integer,jsonb), public.ben_catalogo_ativo(integer,integer,boolean), public.ben_cancelar(integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ben_listar(integer), public.ben_solicitar(integer,integer,text), public.ben_responder(integer,integer,text,text),
  public.ben_catalogo_salvar(integer,integer,jsonb), public.ben_catalogo_ativo(integer,integer,boolean), public.ben_cancelar(integer,integer) TO anon, authenticated;
