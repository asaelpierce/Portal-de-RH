-- Aplicada em 29/10/2026 (versão 20261029183922). Achado pelo teste da migration anterior (ferias_tipo_check).
-- ferias.tipo só aceita 30/15/5+10/10/outro (+ legados): as opções novas (20+10, "___ dias") vão como "outro"; a opção
-- exata fica em ferias.opcao.
DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.form_publico_enviar(text,jsonb)'::regprocedure);
  novo := replace(def, $$VALUES (c.id, c.name, c.setor, left(coalesce(d->>'opcao', v_desc::text),20), left(coalesce(d->>'opcao', v_desc::text),20),$$,
    $$VALUES (c.id, c.name, c.setor,
            CASE WHEN coalesce(d->>'opcao','') IN ('30','15','5+10','10') THEN d->>'opcao' ELSE 'outro' END,
            left(coalesce(nullif(d->>'opcao',''), v_desc::text),20),$$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho não encontrado.'; END IF;
  EXECUTE novo;
END $do$;
