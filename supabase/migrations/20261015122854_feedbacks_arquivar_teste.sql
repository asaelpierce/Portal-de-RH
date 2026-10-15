-- Aplicada em 15/10/2026 (versão 20261015122854). Verificado: 3 arquivados, 0 visíveis, nada apagado.
--
-- Arquivamento de feedbacks (some das telas, continua no banco; reversível: arquivado_em = NULL).
-- Pedido do Asael em 15/10/2026: limpar a tela de Feedbacks. Os 3 existentes são dados de teste, criados no
-- mesmo minuto (09/06/2026 17:23): um da conta de teste "Daniel", um para desligado (Ademar) e um sigiloso com
-- informação inventada sobre colaborador real ativo.
ALTER TABLE public.feedbacks ADD COLUMN arquivado_em timestamptz, ADD COLUMN arquivado_motivo text;
UPDATE public.feedbacks SET arquivado_em = now(),
  arquivado_motivo = 'Dado de teste (criado em 09/06/2026 junto com a carga inicial). Arquivado a pedido do RH em 15/10/2026.'
WHERE id IN (1,2,3) AND created_at >= '2026-06-09 17:23' AND created_at < '2026-06-09 17:24' AND arquivado_em IS NULL;
