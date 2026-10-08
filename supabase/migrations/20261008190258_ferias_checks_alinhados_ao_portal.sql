-- Aplicada em 08/10/2026 (versão 20261008190258).
--
-- As restrições da tabela ferias não aceitavam valores que o portal grava:
--   • status 'cancelado' (função "Cancelar férias" do RH) → cancelar falhava no banco (bug anterior a 08/10/2026);
--   • tipo com as 4 opções do formulário oficial ('30','15','5+10','10'), usadas pelo "Lançar férias" desde 08/10/2026
--     → o lançamento falharia. (O mock dos testes não tinha essas restrições; achado ao testar no banco real.)
-- Só amplia as listas: os valores antigos continuam válidos.
ALTER TABLE public.ferias DROP CONSTRAINT ferias_status_check;
ALTER TABLE public.ferias ADD CONSTRAINT ferias_status_check
  CHECK (status = ANY (ARRAY['pendente_lider','pendente_gestor','pendente_rh','aprovado','rejeitado','cancelado']));
ALTER TABLE public.ferias DROP CONSTRAINT ferias_tipo_check;
ALTER TABLE public.ferias ADD CONSTRAINT ferias_tipo_check
  CHECK (tipo = ANY (ARRAY['30dias','15dias','30','15','5+10','10']));
