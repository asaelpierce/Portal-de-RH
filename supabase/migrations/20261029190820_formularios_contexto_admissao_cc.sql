-- Aplicada em 29/10/2026 (versão 20261029190820).
-- Movimentação (Forms KdB 133) mostra data de admissão, cargo e local atuais sem digitar: o contexto do formulário
-- passa a trazer admissão (já pública) e centro de custo de cada colaborador.
DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.form_publico_contexto()'::regprocedure);
  novo := replace(def, $$jsonb_build_object('id', id, 'nome', name, 'cargo', cargo, 'setor', setor) ORDER BY name)$$,
                       $$jsonb_build_object('id', id, 'nome', name, 'cargo', cargo, 'setor', setor, 'admissao', admissao, 'centro_custo', centro_custo) ORDER BY name)$$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho não encontrado.'; END IF;
  EXECUTE novo;
END $do$;
