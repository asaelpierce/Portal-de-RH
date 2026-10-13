-- Aplicada em 13/10/2026 (versão 20261013142259).
--
-- Durações fora das 4 opções do formulário oficial (ex.: 14 ou 20 dias) existem na programação real de férias
-- (planilha KdB 163). 'outro' registra a duração pelas datas, com opcao NULL. O cálculo de saldo já usa as datas.
ALTER TABLE public.ferias DROP CONSTRAINT ferias_tipo_check;
ALTER TABLE public.ferias ADD CONSTRAINT ferias_tipo_check
  CHECK (tipo = ANY (ARRAY['30dias','15dias','30','15','5+10','10','outro']));
