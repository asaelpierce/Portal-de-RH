-- Aplicada em 28/10/2026 (versão 20261028123432). Correções achadas no teste da migration anterior:
-- • mov_abrir: apelido "v" conflitava com a variável v (movimentacoes) → "column reference v is ambiguous".
-- • mov_abrir: "tipos" que não seja lista dava erro técnico; agora cai em "Escolha o tipo da movimentação."
DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.mov_abrir(integer,text,jsonb)'::regprocedure);
  novo := replace(def, $$SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb) INTO prop FROM jsonb_each(prop) e(k, v)
      WHERE k IN ('salario','horario') OR atual->k IS DISTINCT FROM v;$$,
    $$SELECT coalesce(jsonb_object_agg(e.chave, e.valor), '{}'::jsonb) INTO prop FROM jsonb_each(prop) e(chave, valor)
      WHERE e.chave IN ('salario','horario') OR atual->e.chave IS DISTINCT FROM e.valor;$$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho 1 não encontrado.'; END IF;
  def := novo;
  novo := replace(def, $$FROM jsonb_array_elements_text(coalesce(d->'tipos','[]'::jsonb)) t$$,
    $$FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(d->'tipos') = 'array' THEN d->'tipos' ELSE '[]'::jsonb END) t$$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho 2 não encontrado.'; END IF;
  EXECUTE novo;
END $do$;
