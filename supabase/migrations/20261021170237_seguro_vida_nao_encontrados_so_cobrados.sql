-- Aplicada em 21/10/2026 (versão 20261021170237). Verificado (rollback): exclusão do mês (prêmio 0, fora do cadastro)
-- não aparece mais como "não encontrado"; CPF continua encontrando quem tem nome escrito diferente no cadastro.
--
-- Seguro de vida: "não encontrados" considera só quem tem prêmio (excluídos do mês, com prêmio 0, já saíram do seguro).
DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.seguro_vida_conferir(integer,text,text,jsonb)'::regprocedure);
  novo := replace(def,
    $$'nao_encontrados', coalesce((SELECT jsonb_agg(e->>'nome') FROM jsonb_array_elements(v_linhas) e WHERE e->>'usuario_id' IS NULL), '[]'),$$,
    $$'nao_encontrados', coalesce((SELECT jsonb_agg(e->>'nome') FROM jsonb_array_elements(v_linhas) e WHERE e->>'usuario_id' IS NULL AND (e->>'premio')::numeric > 0), '[]'),$$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho não encontrado na função.'; END IF;
  EXECUTE novo;
END $do$;
