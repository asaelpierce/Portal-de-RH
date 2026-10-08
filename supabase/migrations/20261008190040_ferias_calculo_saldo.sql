-- Aplicada em 08/10/2026 (versão 20261008190040). ferias_meses_servico foi SUBSTITUÍDA logo depois por
-- 20261008190108 (age() errava 1 caso); mantida aqui como histórico.
--
-- Cálculo de saldo de férias no portal (decisão do Asael em 08/10/2026: o controle de férias passa a ser do portal).
-- Ponto de partida = relatório da folha mais recente importado (ferias_saldos). Daqui para frente o portal:
--   • acumula dias nos períodos em aquisição;  • abre períodos novos;  • desconta férias aprovadas no portal;
--   • calcula o prazo para iniciar o gozo.
-- Limite conhecido: o portal NÃO sabe de faltas (CLT art. 130) nem de afastamentos — por isso o relatório da folha
-- continua sendo importado como conferência.

-- Meses de serviço para férias: meses completos + 1 se a fração restante tiver 15 dias ou mais (CLT art. 146).
CREATE OR REPLACE FUNCTION public.ferias_meses_servico(p_inicio date, p_ref date)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_ref < p_inicio THEN 0 ELSE
    (extract(year from age(p_ref, p_inicio))::int * 12 + extract(month from age(p_ref, p_inicio))::int)
    + CASE WHEN extract(day from age(p_ref, p_inicio))::int + 1 >= 15 THEN 1 ELSE 0 END
  END;
$$;
-- Direito proporcional: 2,5 dias por mês de serviço, até 30.
CREATE OR REPLACE FUNCTION public.ferias_direito_proporcional(p_inicio date, p_ref date)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT least(30, 2.5 * public.ferias_meses_servico(p_inicio, p_ref))::numeric;
$$;
