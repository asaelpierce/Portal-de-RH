-- Aplicada em 21/10/2026 (versão 20261021165842).
-- Centro de custo oficial (folha da BRIT) no cadastro de cada colaborador. Usado no rateio mensal do seguro de vida
-- por centro de custo (decisão do Asael: a folha da BRIT é a fonte oficial). Os dados são importados por CPF a partir
-- da planilha da folha (registro em supabase/dados/20261021_importacao_centro_custo.md, sem os dados).
ALTER TABLE public.usuarios ADD COLUMN centro_custo text;
COMMENT ON COLUMN public.usuarios.centro_custo IS 'Descrição do centro de custo na folha da BRIT (fonte oficial do rateio).';
