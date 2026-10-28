-- Aplicada em 28/10/2026 (versão 20261028115750). Substituída em parte por 20261028115835 (o código do link saiu da
-- tabela ferias para uma tabela fechada: quem está logado lê ferias inteira, e o REVOKE de coluna abaixo não tinha
-- efeito) e por 20261028115858 (gen_random_bytes fica no esquema extensions).
--
-- Férias: link de ciência para o colaborador. Ideia do Asael: o colaborador não precisa entrar no portal — recebe
-- por e-mail (ou o líder manda pelo WhatsApp) um link individual que mostra as férias dele e tem "Estou ciente".
-- O link vale só para aquelas férias (código aleatório de 36 caracteres) e expira 60 dias depois do fim delas.
ALTER TABLE public.ferias
  ADD COLUMN ciencia_token text UNIQUE,
  ADD COLUMN ciencia_via text CHECK (ciencia_via IN ('portal','link')),
  ADD COLUMN ciencia_enviada_em timestamptz;

CREATE OR REPLACE FUNCTION public.ferias_ciencia_link(p_pedido_por integer, p_ferias_id integer, p_registrar_envio boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r ferias; u usuarios; v_tok text;
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  SELECT * INTO r FROM ferias WHERE id = p_ferias_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Férias não encontradas.'; END IF;
  SELECT * INTO u FROM usuarios WHERE id = r.user_id;
  IF NOT (eh_rh(p_pedido_por) OR r.lancado_por = p_pedido_por OR u.lider_id = p_pedido_por OR u.gestor_id = p_pedido_por) THEN
    RAISE EXCEPTION 'Só o RH, quem lançou ou o líder/gestor do colaborador enviam o link de ciência.';
  END IF;
  IF r.status IN ('cancelado','rejeitado') THEN RAISE EXCEPTION 'Estas férias foram canceladas ou recusadas.'; END IF;
  v_tok := coalesce(r.ciencia_token, encode(gen_random_bytes(18), 'hex'));
  UPDATE ferias SET ciencia_token = v_tok, ciencia_enviada_em = CASE WHEN p_registrar_envio THEN now() ELSE ciencia_enviada_em END WHERE id = r.id;
  RETURN jsonb_build_object('token', v_tok, 'email', u.email, 'nome', u.name, 'inicio', r.inicio, 'fim', r.fim,
    'dias', (r.fim - r.inicio) + 1, 'periodo_aquisitivo', r.periodo_aquisitivo, 'status', r.status, 'ciente_em', r.ciente_colaborador_em);
END; $$;

CREATE OR REPLACE FUNCTION public.ferias_ciencia_ver(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE r ferias; v_nome text;
BEGIN
  IF coalesce(p_token,'') !~ '^[0-9a-f]{36}$' THEN RETURN NULL; END IF;
  SELECT * INTO r FROM ferias WHERE ciencia_token = p_token;
  IF NOT FOUND OR r.fim < current_date - 60 THEN RETURN NULL; END IF;
  SELECT split_part(name, ' ', 1) INTO v_nome FROM usuarios WHERE id = r.user_id;
  RETURN jsonb_build_object('nome', v_nome, 'inicio', r.inicio, 'fim', r.fim, 'dias', (r.fim - r.inicio) + 1,
    'periodo_aquisitivo', r.periodo_aquisitivo, 'abono', r.abono, 'adiantamento_13', r.adiantamento_13,
    'status', CASE WHEN r.status = 'aprovado' THEN 'aprovado' WHEN r.status IN ('cancelado','rejeitado') THEN 'cancelado' ELSE 'em_aprovacao' END,
    'ciente_em', r.ciente_colaborador_em);
END; $$;

CREATE OR REPLACE FUNCTION public.ferias_ciencia_confirmar_link(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r ferias;
BEGIN
  IF coalesce(p_token,'') !~ '^[0-9a-f]{36}$' THEN RAISE EXCEPTION 'Link inválido.'; END IF;
  SELECT * INTO r FROM ferias WHERE ciencia_token = p_token;
  IF NOT FOUND OR r.fim < current_date - 60 THEN RAISE EXCEPTION 'Link inválido ou expirado.'; END IF;
  IF r.status IN ('cancelado','rejeitado') THEN RAISE EXCEPTION 'Estas férias foram canceladas.'; END IF;
  PERFORM set_config('app.ciencia_link', 'on', true);
  UPDATE ferias SET ciente_colaborador_em = coalesce(ciente_colaborador_em, now()), ciencia_via = coalesce(ciencia_via, 'link') WHERE id = r.id;
  PERFORM set_config('app.ciencia_link', 'off', true);
  RETURN public.ferias_ciencia_ver(p_token);
END; $$;

REVOKE ALL ON FUNCTION public.ferias_ciencia_link(integer,integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ferias_ciencia_link(integer,integer,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.ferias_ciencia_ver(text), public.ferias_ciencia_confirmar_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ferias_ciencia_ver(text), public.ferias_ciencia_confirmar_link(text) TO anon, authenticated;
REVOKE SELECT (ciencia_token) ON public.ferias FROM authenticated, anon;  -- sem efeito (ver cabeçalho)
-- (o gatilho ferias_ciencia_guarda e ferias_confirmar_ciencia desta versão foram redefinidos na migration seguinte)
