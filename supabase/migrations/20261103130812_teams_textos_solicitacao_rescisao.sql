-- Aplicada em 03/11/2026 (versão 20261103130812).
-- Pedido do Asael: "pedido de demissão" passa a se chamar "solicitação de rescisão" — avisos do Teams.
DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.teams_aviso_mov()'::regprocedure);
  novo := replace(def, $$v_tit := '➖ Novo pedido de demissão';$$, $$v_tit := '➖ Nova solicitação de rescisão';$$);
  novo := replace(novo, $$'<b>%s</b> pediu o desligamento de <b>%s</b>%s.'$$, $$'<b>%s</b> enviou a solicitação de rescisão de <b>%s</b>%s.'$$);
  IF novo = def OR position('Nova solicitação de rescisão' in novo) = 0 OR position('enviou a solicitação de rescisão' in novo) = 0 THEN RAISE EXCEPTION 'Trechos de teams_aviso_mov não encontrados.'; END IF;
  EXECUTE novo;
  def := pg_get_functiondef('public.teams_lembrete_diario()'::regprocedure);
  novo := replace(def, $$ELSE 'demissão' END,$$, $$ELSE 'solicitação de rescisão' END,$$);
  novo := replace(novo, $$'➖ Desligamento de <b>%s</b> desejado para <b>%s</b> e o pedido ainda não foi decidido.'$$,
                        $$'➖ Rescisão de <b>%s</b> desejada para <b>%s</b> e a solicitação ainda não foi decidida.'$$);
  IF novo = def OR position('solicitação de rescisão' in novo) = 0 OR position('Rescisão de <b>' in novo) = 0 THEN RAISE EXCEPTION 'Trechos do lembrete não encontrados.'; END IF;
  EXECUTE novo;
END $do$;
