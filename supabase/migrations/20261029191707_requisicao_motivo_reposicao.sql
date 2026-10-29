-- Aplicada em 29/10/2026 (versão 20261029191707).
-- Pedido do Asael: no motivo da requisição, "Demissão" passa a se chamar "Reposição" (o valor gravado continua
-- 'demissao'; muda só o texto).
DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.form_publico_enviar(text,jsonb)'::regprocedure);
  novo := replace(def, $$WHEN 'demissao' THEN 'Substituição por demissão'$$, $$WHEN 'demissao' THEN 'Reposição'$$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho não encontrado.'; END IF;
  EXECUTE novo;
END $do$;
