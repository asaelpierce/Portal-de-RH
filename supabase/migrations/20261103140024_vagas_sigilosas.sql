-- Aplicada em 03/11/2026 (versão 20261103140024). Verificado: vaga #106 (requisição #18, sigilosa) ficou aberta e
-- sigilosa (prazo 01/12/2026); o anônimo (site de vagas) não a enxerga.
--
-- Vaga sigilosa. Problema relatado pelo Asael: a requisição sigilosa aprovada criava a vaga DESATIVADA (para não ir ao
-- site), e o RH não a via em "Abertas" (caía em "Encerradas"). Agora: a vaga fica ABERTA para o RH e marcada como
-- sigilosa; o site público (anônimo) não mostra vagas sigilosas.
ALTER TABLE public.vagas ADD COLUMN sigilosa boolean NOT NULL DEFAULT false;

DROP POLICY "vagas_publico_abertas" ON public.vagas;
CREATE POLICY "vagas_publico_abertas" ON public.vagas FOR SELECT TO anon USING (ativa AND NOT sigilosa);

DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.mov_decidir(integer,integer,text,text)'::regprocedure);
  novo := replace(def, $$INSERT INTO vagas (title, area, local, tipo, descricao, salario, requisitos, prazo_encerramento, ativa, movimentacao_id)$$,
                       $$INSERT INTO vagas (title, area, local, tipo, descricao, salario, requisitos, prazo_encerramento, ativa, movimentacao_id, sigilosa)$$);
  novo := replace(novo, $$m.prazo_encerramento, coalesce(m.tipo_vaga,'aberta') <> 'sigilosa', m.id)$$,
                        $$m.prazo_encerramento, true, m.id, coalesce(m.tipo_vaga,'') = 'sigilosa')$$);
  IF novo = def OR position('m.id, coalesce(m.tipo_vaga,'''') = ''sigilosa'')' in novo) = 0 THEN RAISE EXCEPTION 'Trecho de mov_decidir não encontrado.'; END IF;
  EXECUTE novo;
END $do$;

UPDATE vagas v SET sigilosa = true, ativa = true
FROM movimentacoes m WHERE m.id = v.movimentacao_id AND m.tipo_vaga = 'sigilosa' AND m.status = 'aprovado'
  AND (v.prazo_encerramento IS NULL OR v.prazo_encerramento >= (now() AT TIME ZONE 'America/Sao_Paulo')::date);
