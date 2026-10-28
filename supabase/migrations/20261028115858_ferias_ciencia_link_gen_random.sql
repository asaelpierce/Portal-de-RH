-- Aplicada em 28/10/2026 (versão 20261028115858). Achado pelo teste da migration anterior (a função falhava ao gerar
-- o primeiro código). gen_random_bytes fica no esquema "extensions" no Supabase (a função usa search_path = public).
DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.ferias_ciencia_link(integer,integer,boolean)'::regprocedure);
  novo := replace(def, $$encode(gen_random_bytes(18), 'hex')$$, $$encode(extensions.gen_random_bytes(18), 'hex')$$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho não encontrado.'; END IF;
  EXECUTE novo;
END $do$;
