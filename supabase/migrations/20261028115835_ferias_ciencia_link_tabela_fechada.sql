-- Aplicada em 28/10/2026 (versão 20261028115835). Verificado (rollback, sessões reais): RH gera o link; anônimo vê
-- (só o primeiro nome) e confirma ("via link"); colega recusado; tabela dos códigos bloqueada para logados; código
-- inventado não mostra nada.
--
-- Correção da migration anterior: o código do link ficava em ferias.ciencia_token, e quem está logado tem SELECT na
-- tabela inteira (o REVOKE de coluna não tem efeito nesse caso) — um colega que vê férias aprovadas dos outros
-- poderia ler o código e confirmar no lugar deles. O código vai para uma tabela própria, fechada ao navegador.
CREATE TABLE public.ferias_ciencia_links (
  ferias_id integer PRIMARY KEY REFERENCES public.ferias(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{36}$'),
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ferias_ciencia_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ferias_ciencia_links FROM anon, authenticated;
INSERT INTO public.ferias_ciencia_links (ferias_id, token) SELECT id, ciencia_token FROM public.ferias WHERE ciencia_token IS NOT NULL;
ALTER TABLE public.ferias DROP COLUMN ciencia_token;

CREATE OR REPLACE FUNCTION public.ferias_ciencia_guarda() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_eu int := public.eu(); v_link boolean := coalesce(current_setting('app.ciencia_link', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.ciente_colaborador_em := CASE WHEN v_eu IS NOT NULL AND v_eu = NEW.user_id THEN now() ELSE NULL END;
    NEW.ciencia_via := CASE WHEN NEW.ciente_colaborador_em IS NOT NULL THEN 'portal' ELSE NULL END;
    NEW.ciente_lancador_em := CASE WHEN NEW.ciente_lancador THEN now() ELSE NULL END;
    NEW.ciencia_enviada_em := NULL;
  ELSE
    IF (NEW.ciente_colaborador_em IS DISTINCT FROM OLD.ciente_colaborador_em OR NEW.ciencia_via IS DISTINCT FROM OLD.ciencia_via)
       AND NOT v_link AND (v_eu IS NULL OR v_eu <> NEW.user_id) THEN
      NEW.ciente_colaborador_em := OLD.ciente_colaborador_em; NEW.ciencia_via := OLD.ciencia_via;
    END IF;
    IF NEW.ciente_lancador AND NOT OLD.ciente_lancador THEN NEW.ciente_lancador_em := now();
    ELSIF NOT NEW.ciente_lancador THEN NEW.ciente_lancador_em := NULL;
    ELSE NEW.ciente_lancador_em := OLD.ciente_lancador_em; END IF;
    IF NEW.ciencia_enviada_em IS DISTINCT FROM OLD.ciencia_enviada_em AND coalesce(current_setting('app.ciencia_envio', true), '') <> 'on' THEN
      NEW.ciencia_enviada_em := OLD.ciencia_enviada_em;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.ferias_confirmar_ciencia(p_pedido_por integer, p_ferias_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r ferias;
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  SELECT * INTO r FROM ferias WHERE id = p_ferias_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Férias não encontradas.'; END IF;
  IF r.user_id <> p_pedido_por THEN RAISE EXCEPTION 'Só o próprio colaborador confirma a ciência das férias dele.'; END IF;
  IF r.status IN ('cancelado','rejeitado') THEN RAISE EXCEPTION 'Estas férias foram canceladas ou recusadas.'; END IF;
  UPDATE ferias SET ciente_colaborador_em = coalesce(ciente_colaborador_em, now()), ciencia_via = coalesce(ciencia_via, 'portal')
  WHERE id = p_ferias_id RETURNING * INTO r;
  RETURN to_jsonb(r);
END; $$;

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
  SELECT token INTO v_tok FROM ferias_ciencia_links WHERE ferias_id = r.id;
  IF v_tok IS NULL THEN
    v_tok := encode(gen_random_bytes(18), 'hex');
    INSERT INTO ferias_ciencia_links (ferias_id, token) VALUES (r.id, v_tok);
  END IF;
  IF p_registrar_envio THEN
    PERFORM set_config('app.ciencia_envio', 'on', true);
    UPDATE ferias SET ciencia_enviada_em = now() WHERE id = r.id;
    PERFORM set_config('app.ciencia_envio', 'off', true);
  END IF;
  RETURN jsonb_build_object('token', v_tok, 'email', u.email, 'nome', u.name, 'inicio', r.inicio, 'fim', r.fim,
    'dias', (r.fim - r.inicio) + 1, 'periodo_aquisitivo', r.periodo_aquisitivo, 'status', r.status, 'ciente_em', r.ciente_colaborador_em);
END; $$;

CREATE OR REPLACE FUNCTION public.ferias_ciencia_ver(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE r ferias; v_nome text;
BEGIN
  IF coalesce(p_token,'') !~ '^[0-9a-f]{36}$' THEN RETURN NULL; END IF;
  SELECT f.* INTO r FROM ferias f JOIN ferias_ciencia_links l ON l.ferias_id = f.id WHERE l.token = p_token;
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
  SELECT f.* INTO r FROM ferias f JOIN ferias_ciencia_links l ON l.ferias_id = f.id WHERE l.token = p_token;
  IF NOT FOUND OR r.fim < current_date - 60 THEN RAISE EXCEPTION 'Link inválido ou expirado.'; END IF;
  IF r.status IN ('cancelado','rejeitado') THEN RAISE EXCEPTION 'Estas férias foram canceladas.'; END IF;
  PERFORM set_config('app.ciencia_link', 'on', true);
  UPDATE ferias SET ciente_colaborador_em = coalesce(ciente_colaborador_em, now()), ciencia_via = coalesce(ciencia_via, 'link') WHERE id = r.id;
  PERFORM set_config('app.ciencia_link', 'off', true);
  RETURN public.ferias_ciencia_ver(p_token);
END; $$;
REVOKE ALL ON FUNCTION public.ferias_ciencia_ver(text), public.ferias_ciencia_confirmar_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ferias_ciencia_ver(text), public.ferias_ciencia_confirmar_link(text) TO anon, authenticated;
