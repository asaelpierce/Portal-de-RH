-- Aplicada em 29/10/2026 (versão 20261029191325). Verificado (rollback, como anônimo): pedido forçado com "20+10" e
-- adiantamento "sim" é gravado como 20 dias de descanso (tipo outro, opção "20"), sem abono e sem 13º; 30 dias normal.
--
-- Pedido do Asael: no formulário de férias sem login, sem abono pecuniário e sem adiantamento do 13º (geravam
-- confusão); essas opções ficam só para o RH, no portal. O banco ignora abono/13º vindos do formulário.
DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.form_publico_enviar(text,jsonb)'::regprocedure);
  novo := replace(def, $$v_desc := nullif(d->>'descanso','')::int; v_abono := coalesce(nullif(d->>'abono','')::int, 0);$$,
                       $$v_desc := nullif(d->>'descanso','')::int; v_abono := 0;  -- abono só pelo RH, no portal$$);
  novo := replace(novo, $$            CASE d->>'adiantamento_13' WHEN 'sim' THEN true WHEN 'nao' THEN false END,
            s.id, s.name,$$, $$            NULL,  -- adiantamento do 13º só pelo RH, no portal
            s.id, s.name,$$);
  novo := replace(novo, $$            CASE WHEN coalesce(d->>'opcao','') IN ('30','15','5+10','10') THEN d->>'opcao' ELSE 'outro' END,
            left(coalesce(nullif(d->>'opcao',''), v_desc::text),20),$$,
                        $$            CASE WHEN v_desc::text IN ('30','15','10') THEN v_desc::text ELSE 'outro' END,
            v_desc::text,$$);
  IF novo = def OR position('v_abono := 0' in novo) = 0 OR position('só pelo RH, no portal' in novo) = 0 OR position('v_desc::text,' in novo) = 0 THEN
    RAISE EXCEPTION 'Trechos não encontrados.'; END IF;
  EXECUTE novo;
END $do$;
