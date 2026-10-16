-- Aplicada em 16/10/2026 (versão 20261016145551).
-- Verificado como anon (com rollback): semana/trimestre do banco (2026-W42 / 2026-Q4); 1 resposta por semana;
-- colaborador vê notas sem id, sem comentário e sem setor, com "minha"; gestor vê comentários e setor, sem id;
-- respondentes distintos contáveis; nota fora da escala recusada; denúncia anônima gravada; denúncia curta recusada;
-- colaborador e gestor não leem denúncias; RH lê e muda andamento; navegador não lê as tabelas direto.
--
-- Pesquisa de Clima estava quebrada em produção (16/10/2026) e não cumpria o anonimato que promete:
--  • envios do termômetro e da satisfação pediam a linha de volta (sem permissão de leitura) → falhavam;
--  • a denúncia era bloqueada pelo banco, mas a tela mostrava "enviada" (denúncia perdida em silêncio);
--  • resultados eram lidos com o id de quem respondeu (qualquer um via quem disse o quê);
--  • ninguém conseguia ler as denúncias no portal;
--  • a "semana" era a semana do MÊS (1–5), e não do ano.
-- Agora (funções abaixo):
--  • respostas voltam SEM id de pessoa: "respondente" é um código embaralhado (só serve para contar participantes)
--    e "minha" diz se a resposta é de quem pede; comentários e setor só para gestor/RH;
--  • semana (ISO, ex.: 2026-W42) e trimestre (ex.: 2026-Q4) são definidos pelo banco; 1 resposta por período;
--  • denúncia é gravada SEM identificar quem denunciou; só o RH lê e muda o andamento.
-- Limite conhecido: sem Supabase Auth, o id de quem pede vem do navegador (próxima etapa: login do Supabase).

INSERT INTO private.config VALUES ('clima_sal', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.clima_periodo(p_tipo text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE p_tipo WHEN 'semana' THEN to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'IYYY"-W"IW')
                     ELSE to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY"-Q"Q') END;
$$;

CREATE OR REPLACE FUNCTION public.clima_listar(p_pedido_por integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private' STABLE AS $$
DECLARE u usuarios; ger boolean; sal text;
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_pedido_por AND coalesce(status,'ativo') = 'ativo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  ger := nivel_perfil(u.role) >= 3;
  SELECT valor INTO sal FROM private.config WHERE chave = 'clima_sal';
  RETURN jsonb_build_object(
    'semana', clima_periodo('semana'), 'trimestre', clima_periodo('trimestre'),
    'pulses', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'semana', p.semana, 'score', p.score, 'tag', p.tag,
                 'created_at', p.created_at, 'minha', p.user_id = p_pedido_por, 'respondente', md5(p.user_id::text || sal),
                 'setor', CASE WHEN ger THEN p.setor END, 'texto', CASE WHEN ger THEN p.texto END) ORDER BY p.created_at DESC)
               FROM clima_pulses p), '[]'::jsonb),
    'nps', coalesce((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'trimestre', n.trimestre, 'score', n.score,
                 'created_at', n.created_at, 'minha', n.user_id = p_pedido_por, 'respondente', md5(n.user_id::text || sal),
                 'motivo', CASE WHEN ger THEN n.motivo END, 'melhor', CASE WHEN ger THEN n.melhor END) ORDER BY n.created_at DESC)
               FROM clima_nps n), '[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.clima_pulse_enviar(p_pedido_por integer, p_score integer, p_texto text, p_tag text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u usuarios; sem text := clima_periodo('semana');
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_pedido_por AND coalesce(status,'ativo') = 'ativo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  IF p_score IS NULL OR p_score < 1 OR p_score > 10 THEN RAISE EXCEPTION 'Escolha uma nota de 1 a 10.'; END IF;
  IF EXISTS (SELECT 1 FROM clima_pulses WHERE user_id = u.id AND semana = sem) THEN RAISE EXCEPTION 'Você já respondeu o termômetro desta semana.'; END IF;
  INSERT INTO clima_pulses (user_id, semana, score, texto, tag, setor)
  VALUES (u.id, sem, p_score, nullif(left(btrim(coalesce(p_texto,'')),1000),''), nullif(left(btrim(coalesce(p_tag,'')),60),''), u.setor);
  RETURN clima_listar(p_pedido_por);
END; $$;

CREATE OR REPLACE FUNCTION public.clima_nps_enviar(p_pedido_por integer, p_score integer, p_motivo text, p_melhor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u usuarios; tri text := clima_periodo('trimestre');
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_pedido_por AND coalesce(status,'ativo') = 'ativo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 10 THEN RAISE EXCEPTION 'Escolha uma nota de 0 a 10.'; END IF;
  IF EXISTS (SELECT 1 FROM clima_nps WHERE user_id = u.id AND trimestre = tri) THEN RAISE EXCEPTION 'Você já respondeu a pesquisa deste trimestre.'; END IF;
  INSERT INTO clima_nps (user_id, trimestre, score, motivo, melhor)
  VALUES (u.id, tri, p_score, nullif(left(btrim(coalesce(p_motivo,'')),2000),''), nullif(left(btrim(coalesce(p_melhor,'')),2000),''));
  RETURN clima_listar(p_pedido_por);
END; $$;

-- Denúncia: anônima (não recebe nem grava quem denuncia). Limite contra abuso: 30 por hora no portal todo.
CREATE OR REPLACE FUNCTION public.clima_denuncia_enviar(p_tipo text, p_texto text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_tipo NOT IN ('assedio','discriminacao','corrupcao','seguranca','outro') THEN RAISE EXCEPTION 'Escolha o tipo da denúncia.'; END IF;
  IF length(btrim(coalesce(p_texto,''))) < 10 THEN RAISE EXCEPTION 'Descreva o que aconteceu (pelo menos algumas palavras).'; END IF;
  IF (SELECT count(*) FROM clima_denuncias WHERE created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Muitas denúncias agora. Tente de novo em alguns minutos.'; END IF;
  INSERT INTO clima_denuncias (tipo, texto, status) VALUES (p_tipo, left(btrim(p_texto), 5000), 'recebida');
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.clima_denuncias_listar(p_pedido_por integer)
RETURNS SETOF public.clima_denuncias LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
BEGIN
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH lê as denúncias.'; END IF;
  RETURN QUERY SELECT * FROM clima_denuncias ORDER BY created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.clima_denuncia_status(p_pedido_por integer, p_id integer, p_status text)
RETURNS public.clima_denuncias LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d clima_denuncias;
BEGIN
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH altera o andamento das denúncias.'; END IF;
  IF p_status NOT IN ('recebida','em_analise','concluida','arquivada') THEN RAISE EXCEPTION 'Andamento inválido.'; END IF;
  UPDATE clima_denuncias SET status = p_status WHERE id = p_id RETURNING * INTO d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Denúncia não encontrada.'; END IF;
  RETURN d;
END; $$;

REVOKE ALL ON FUNCTION public.clima_listar(integer), public.clima_pulse_enviar(integer,integer,text,text), public.clima_nps_enviar(integer,integer,text,text),
  public.clima_denuncia_enviar(text,text), public.clima_denuncias_listar(integer), public.clima_denuncia_status(integer,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clima_listar(integer), public.clima_pulse_enviar(integer,integer,text,text), public.clima_nps_enviar(integer,integer,text,text),
  public.clima_denuncia_enviar(text,text), public.clima_denuncias_listar(integer), public.clima_denuncia_status(integer,integer,text) TO anon, authenticated;
-- O navegador não lê mais as tabelas do clima direto (era assim que se via quem respondeu o quê).
REVOKE SELECT, INSERT ON public.clima_pulses, public.clima_nps FROM anon, authenticated;
REVOKE INSERT ON public.clima_denuncias FROM anon, authenticated;
