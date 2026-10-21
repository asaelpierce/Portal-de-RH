-- Aplicada em 21/10/2026 (versão 20261021184936). Verificado: nome_contido('CLAUDINEI LUIZ DA SILVA',
-- 'Claudinei Luiz Silva') = verdadeiro; Araujo continua ('DANIELA OLIVEIRA' em 'Daniela Jorge de Oliveira').
--
-- Ajustes da ligação por nome (21/10/2026), a partir das 35 famílias reais da Unimed:
-- • nome_contido ignora partículas (da, de, do, dos, das, e): "CLAUDINEI LUIZ DA SILVA" = "Claudinei Luiz Silva".
-- • unimed_vincular: nascimento + último sobrenome também liga (nome com primeiro nome digitado diferente).
-- • unimed_vincular_manual: o RH liga uma família a um colaborador (guardado; vale para os próximos meses).
CREATE OR REPLACE FUNCTION public.nome_contido(p_curto text, p_completo text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT NOT EXISTS (SELECT 1 FROM unnest(string_to_array(sv_norm(p_curto), ' ')) w
                     WHERE length(w) >= 2 AND w NOT IN ('DA','DE','DO','DOS','DAS')
                       AND NOT (w = ANY (string_to_array(sv_norm(p_completo), ' '))));
$$;

DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.unimed_vincular(integer,jsonb)'::regprocedure);
  novo := replace(def,
    $$WHERE d.data_nascimento = t.nasc AND split_part(sv_norm(u.name),' ',1) = split_part(sv_norm(t.nome),' ',1) ORDER BY (u.status='ativo') DESC LIMIT 1;$$,
    $$WHERE d.data_nascimento = t.nasc AND (split_part(sv_norm(u.name),' ',1) = split_part(sv_norm(t.nome),' ',1)
             OR regexp_replace(sv_norm(u.name),'^.* ','') = regexp_replace(sv_norm(t.nome),'^.* ',''))
       ORDER BY (split_part(sv_norm(u.name),' ',1) = split_part(sv_norm(t.nome),' ',1)) DESC, (u.status='ativo') DESC LIMIT 1;$$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho não encontrado em unimed_vincular.'; END IF;
  EXECUTE novo;
END $do$;

CREATE OR REPLACE FUNCTION public.unimed_vincular_manual(p_pedido_por integer, p_familia text, p_titular text, p_usuario_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH vincula famílias da Unimed.'; END IF;
  IF coalesce(p_familia,'') !~ '^\d{14}$' THEN RAISE EXCEPTION 'Família inválida.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_usuario_id) THEN RAISE EXCEPTION 'Escolha o colaborador titular.'; END IF;
  INSERT INTO unimed_familias AS f (familia, titular_unimed, usuario_id, origem, atualizado_por, atualizado_em)
  VALUES (p_familia, p_titular, p_usuario_id, 'rh', p_pedido_por, now())
  ON CONFLICT (familia) DO UPDATE SET titular_unimed = coalesce(EXCLUDED.titular_unimed, f.titular_unimed), usuario_id = EXCLUDED.usuario_id,
    origem = 'rh', atualizado_por = p_pedido_por, atualizado_em = now();
  RETURN jsonb_build_object('familia', p_familia, 'usuario_id', p_usuario_id);
END; $$;
REVOKE ALL ON FUNCTION public.unimed_vincular_manual(integer,text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unimed_vincular_manual(integer,text,text,integer) TO authenticated;
