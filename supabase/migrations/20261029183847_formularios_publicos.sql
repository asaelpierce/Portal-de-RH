-- Aplicada em 29/10/2026 (versão 20261029183847). Ajustada em 20261029183922 (tipo das férias). Verificado (rollback,
-- como anônimo): matrícula errada recusada; colaborador pede as próprias férias (20+10 e "12 dias"), não as de outro;
-- líder pede movimentação e admissão (matrícula com zeros à frente aceita) → pendente_rh/formulario; colaborador comum
-- não pede admissão; anônimo continua sem enxergar pedidos (RLS sem política) e sem acesso a férias; mov_abrir logado
-- continua igual (agora chama mov_abrir_como).
--
-- Formulários sem login. Decisão do Asael: no começo só o RH (Mariele, Melina, Júlia) terá login; líderes, gestores
-- e colaboradores fazem os pedidos (férias, admissão, movimentação, demissão) por LINK, sem login, como no Forms.
-- Segurança: quem pede se identifica pelo NOME + MATRÍCULA DA FOLHA (conferida aqui); limite de envios por hora; o
-- pedido vai direto para o RH (pendente_rh), que decide. Pedidos de pessoal só de líderes/gestores; férias de
-- líderes/gestores ou do próprio colaborador.
ALTER TABLE public.movimentacoes ADD COLUMN origem text NOT NULL DEFAULT 'portal' CHECK (origem IN ('portal','formulario'));
ALTER TABLE public.ferias ADD COLUMN origem text NOT NULL DEFAULT 'portal' CHECK (origem IN ('portal','formulario'));

-- Corpo de mov_abrir separado do "quem pede": mov_abrir (logado) e o formulário público usam a mesma validação.
DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.mov_abrir(integer,text,jsonb)'::regprocedure);
  novo := replace(def, 'FUNCTION public.mov_abrir(p_pedido_por integer, p_tipo text, p_dados jsonb)',
                       'FUNCTION public.mov_abrir_como(p_pedido_por integer, p_tipo text, p_dados jsonb, p_publico boolean)');
  novo := replace(novo, $$  p_pedido_por := public.quem_pede(p_pedido_por);
$$, '');
  -- no formulário público, qualquer líder/gestor pode pedir a movimentação (o RH confere e decide)
  novo := replace(novo, $$IF NOT (nivel_perfil(u.role) >= 4 OR c.lider_id = u.id OR c.gestor_id = u.id) THEN$$,
                        $$IF NOT (p_publico OR nivel_perfil(u.role) >= 4 OR c.lider_id = u.id OR c.gestor_id = u.id) THEN$$);
  IF novo = def OR position('mov_abrir_como' in novo) = 0 OR position('quem_pede' in novo) > 0 OR position('p_publico OR' in novo) = 0 THEN
    RAISE EXCEPTION 'Não consegui separar o corpo de mov_abrir.'; END IF;
  EXECUTE novo;
END $do$;
REVOKE ALL ON FUNCTION public.mov_abrir_como(integer,text,jsonb,boolean) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.mov_abrir(p_pedido_por integer, p_tipo text, p_dados jsonb)
RETURNS movimentacoes LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN public.mov_abrir_como(public.quem_pede(p_pedido_por), p_tipo, p_dados, false);
END; $$;

-- Listas para montar os formulários (só o necessário, só ativos).
CREATE OR REPLACE FUNCTION public.form_publico_contexto()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
  SELECT jsonb_build_object(
    'colaboradores', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'nome', name, 'cargo', cargo, 'setor', setor) ORDER BY name)
                     FROM usuarios WHERE coalesce(status,'ativo') = 'ativo' AND cadastro IS NOT NULL), '[]'::jsonb),
    'lideres', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'nome', name) ORDER BY name)
                     FROM usuarios WHERE coalesce(status,'ativo') = 'ativo' AND nivel_perfil(role) >= 2), '[]'::jsonb),
    'gestores', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'nome', name) ORDER BY name)
                     FROM usuarios WHERE coalesce(status,'ativo') = 'ativo' AND nivel_perfil(role) >= 3), '[]'::jsonb),
    'centros_custo', coalesce((SELECT jsonb_agg(DISTINCT centro_custo) FROM usuarios WHERE centro_custo IS NOT NULL), '[]'::jsonb),
    'areas', coalesce((SELECT jsonb_agg(DISTINCT area) FROM usuarios WHERE area IS NOT NULL), '[]'::jsonb));
$$;

-- Envio público: confere quem pede (nome + matrícula da folha), limite por hora, grava direto para o RH.
CREATE OR REPLACE FUNCTION public.form_publico_enviar(p_tipo text, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d jsonb := coalesce(p_dados,'{}'::jsonb); s usuarios; c usuarios; m movimentacoes; f ferias; v_desc int; v_abono int;
BEGIN
  IF p_tipo NOT IN ('ferias','admissao','movimentacao','demissao') THEN RAISE EXCEPTION 'Formulário inválido.'; END IF;
  IF (SELECT count(*) FROM movimentacoes WHERE origem = 'formulario' AND created_at > now() - interval '1 hour')
   + (SELECT count(*) FROM ferias WHERE origem = 'formulario' AND created_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'Muitos envios na última hora. Tente de novo mais tarde ou fale com o RH.'; END IF;
  SELECT * INTO s FROM usuarios WHERE id = nullif(d->>'solicitante_id','')::int AND coalesce(status,'ativo') = 'ativo';
  IF NOT FOUND OR s.cadastro IS NULL OR ltrim(s.cadastro,'0') <> ltrim(regexp_replace(coalesce(d->>'solicitante_matricula',''),'\D','','g'),'0')
     OR ltrim(s.cadastro,'0') = '' THEN
    RAISE EXCEPTION 'Nome e matrícula não conferem. Use a sua matrícula da folha (está no contracheque) ou fale com o RH.'; END IF;

  IF p_tipo = 'ferias' THEN
    SELECT * INTO c FROM usuarios WHERE id = nullif(d->>'user_id','')::int AND coalesce(status,'ativo') = 'ativo';
    IF NOT FOUND THEN RAISE EXCEPTION 'Escolha o colaborador.'; END IF;
    IF NOT (nivel_perfil(s.role) >= 2 OR s.id = c.id) THEN RAISE EXCEPTION 'Férias de outra pessoa: só o líder ou o gestor pedem.'; END IF;
    IF coalesce(d->>'inicio','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Informe a data de início.'; END IF;
    v_desc := nullif(d->>'descanso','')::int; v_abono := coalesce(nullif(d->>'abono','')::int, 0);
    IF v_desc IS NULL OR v_desc < 5 OR v_desc > 30 OR v_abono NOT IN (0,10) OR v_desc + v_abono > 30 THEN RAISE EXCEPTION 'Dias de férias inválidos.'; END IF;
    INSERT INTO ferias (user_id, user_name, setor, tipo, opcao, inicio, fim, abono, status, obs, periodo_aquisitivo, adiantamento_13,
                        lancado_por, lancado_por_nome, ciente_lancador, origem)
    VALUES (c.id, c.name, c.setor, left(coalesce(d->>'opcao', v_desc::text),20), left(coalesce(d->>'opcao', v_desc::text),20),
            (d->>'inicio')::date, (d->>'inicio')::date + (v_desc - 1), v_abono > 0, 'pendente_rh',
            nullif(left(btrim(coalesce(d->>'obs','')),1000),''), nullif(left(btrim(coalesce(d->>'periodo_aquisitivo','')),60),''),
            CASE d->>'adiantamento_13' WHEN 'sim' THEN true WHEN 'nao' THEN false END,
            s.id, s.name, coalesce((d->>'ciente')::boolean, false), 'formulario')
    RETURNING * INTO f;
    RETURN jsonb_build_object('ok', true, 'tipo', 'ferias', 'id', f.id, 'colaborador', c.name, 'inicio', f.inicio, 'fim', f.fim);
  END IF;

  IF nivel_perfil(s.role) < 2 THEN RAISE EXCEPTION 'Pedidos de pessoal são feitos por líderes e gestores.'; END IF;
  m := public.mov_abrir_como(s.id, p_tipo, d, true);
  UPDATE movimentacoes SET origem = 'formulario', status = 'pendente_rh' WHERE id = m.id RETURNING * INTO m;
  RETURN jsonb_build_object('ok', true, 'tipo', p_tipo, 'id', m.id, 'colaborador', m.nome);
END; $$;

REVOKE ALL ON FUNCTION public.form_publico_contexto(), public.form_publico_enviar(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.form_publico_contexto(), public.form_publico_enviar(text,jsonb) TO anon, authenticated;
