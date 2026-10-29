-- Aplicada em 29/10/2026 (versão 20261029192700). Verificado (rollback, como anônimo): sem data → recusado; data no
-- passado → recusado; com data → grava ultimo_dia; aviso do Teams com "data desejada"; lembrete (até 3 dias) lista.
--
-- Pedido do Asael: no pedido de demissão, a data em que a pessoa deseja o desligamento (grava em
-- movimentacoes.ultimo_dia). Obrigatória no formulário sem login; não pode ser no passado. Aparece no aviso do Teams e
-- no lembrete diário (desligamento em até 3 dias sem decisão).
DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.mov_abrir_como(integer,text,jsonb,boolean)'::regprocedure);
  novo := replace(def,
$$    INSERT INTO movimentacoes (tipo, status, solicitante_id, solicitante_name, user_id, nome, cargo, setor, lider_id, gestor_id, motivo)
    VALUES ('demissao', 'pendente_gestor', u.id, u.name, c.id, c.name, c.cargo, c.setor, u.id, g.id, btrim(d->>'motivo'))$$,
$$    IF coalesce(d->>'ultimo_dia','') ~ '^\d{4}-\d{2}-\d{2}$' AND (d->>'ultimo_dia')::date < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
      RAISE EXCEPTION 'A data do desligamento não pode ser no passado.'; END IF;
    INSERT INTO movimentacoes (tipo, status, solicitante_id, solicitante_name, user_id, nome, cargo, setor, lider_id, gestor_id, motivo, ultimo_dia)
    VALUES ('demissao', 'pendente_gestor', u.id, u.name, c.id, c.name, c.cargo, c.setor, u.id, g.id, btrim(d->>'motivo'),
            CASE WHEN coalesce(d->>'ultimo_dia','') ~ '^\d{4}-\d{2}-\d{2}$' THEN (d->>'ultimo_dia')::date END)$$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho de mov_abrir_como não encontrado.'; END IF;
  EXECUTE novo;

  def := pg_get_functiondef('public.form_publico_enviar(text,jsonb)'::regprocedure);
  novo := replace(def, $$  m := public.mov_abrir_como(s.id, p_tipo, d, true);$$,
$$  IF p_tipo = 'demissao' AND coalesce(d->>'ultimo_dia','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Informe a data desejada para o desligamento.'; END IF;
  m := public.mov_abrir_como(s.id, p_tipo, d, true);$$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho de form_publico_enviar não encontrado.'; END IF;
  EXECUTE novo;

  def := pg_get_functiondef('public.teams_aviso_mov()'::regprocedure);
  novo := replace(def, $$    v_msg := format('<b>%s</b> pediu o desligamento de <b>%s</b>.', NEW.solicitante_name, coalesce(NEW.nome,'—'));$$,
$$    v_msg := format('<b>%s</b> pediu o desligamento de <b>%s</b>%s.', NEW.solicitante_name, coalesce(NEW.nome,'—'),
      CASE WHEN NEW.ultimo_dia IS NOT NULL THEN ' — data desejada: <b>'||to_char(NEW.ultimo_dia,'DD/MM/YYYY')||'</b>' ELSE '' END);$$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho de teams_aviso_mov não encontrado.'; END IF;
  EXECUTE novo;

  def := pg_get_functiondef('public.teams_lembrete_diario()'::regprocedure);
  novo := replace(def, $$    UNION ALL
    SELECT 4,$$, $$    UNION ALL
    SELECT 3, format('➖ Desligamento de <b>%s</b> desejado para <b>%s</b> e o pedido ainda não foi decidido.', coalesce(nome,'—'), to_char(ultimo_dia,'DD/MM'))
      FROM movimentacoes WHERE tipo = 'demissao' AND status LIKE 'pendente%' AND ultimo_dia <= v_hoje + 3
    UNION ALL
    SELECT 4,$$);
  novo := replace(novo, $$AND NOT (tipo = 'admissao' AND prazo_encerramento <= v_hoje + 7)$$,
                        $$AND NOT (tipo = 'admissao' AND prazo_encerramento <= v_hoje + 7) AND NOT (tipo = 'demissao' AND ultimo_dia <= v_hoje + 3)$$);
  IF novo = def OR position('Desligamento de' in novo) = 0 OR position('ultimo_dia <= v_hoje + 3)' in novo) = 0 THEN RAISE EXCEPTION 'Trecho do lembrete não encontrado.'; END IF;
  EXECUTE novo;
END $do$;
