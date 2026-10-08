-- Aplicada em 08/10/2026 (versão 20261008190108).
-- Verificado: reproduz o direito dos 83 períodos em aquisição do relatório da BRIT de 07/10/2026 (83/83).
--
-- Correção: age() do Postgres calcula a sobra de dias usando o tamanho de um mês diferente do esperado
-- e errava 1 caso do relatório de 07/10 (Dener: início 23/02/2026 → folha 20 dias, age() dava 17,5).
-- Agora: meses de calendário entre as datas; âncora = início + meses; fração = dias da âncora até a referência (inclusive).
CREATE OR REPLACE FUNCTION public.ferias_meses_servico(p_inicio date, p_ref date)
RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_meses int; v_ancora date;
BEGIN
  IF p_ref < p_inicio THEN RETURN 0; END IF;
  v_meses := (extract(year from p_ref)::int - extract(year from p_inicio)::int) * 12
           + (extract(month from p_ref)::int - extract(month from p_inicio)::int);
  IF extract(day from p_ref) < extract(day from p_inicio) THEN v_meses := v_meses - 1; END IF;
  v_ancora := (p_inicio + make_interval(months => v_meses))::date;
  RETURN v_meses + CASE WHEN (p_ref - v_ancora) + 1 >= 15 THEN 1 ELSE 0 END;
END;
$$;
