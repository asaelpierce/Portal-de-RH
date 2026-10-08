-- Aplicada em 08/10/2026 (versão 20261008190155).
-- Verificado: na data do relatório (07/10) devolve a folha exatamente (120/120 direito e saldo); projeção para 01/11
-- conferida à mão; desconto de aprovadas/pendentes/canceladas/anteriores ao relatório testado com rollback.
--
-- Saldo de férias calculado pelo portal, por período aquisitivo, numa data qualquer (padrão: hoje em Brasília).
-- Base = relatório da folha mais recente. Regras (decisões do Asael em 08/10/2026):
--   • Período completo na data do relatório: direito da folha (pode refletir faltas que o portal não conhece).
--   • Período em aquisição: direito da folha + o que acumulou desde o relatório (2,5/mês, fração ≥15 dias conta).
--   • Períodos novos (depois do último do relatório) abrem sozinhos no dia seguinte ao fim do anterior.
--   • Férias APROVADAS pelo RH no portal descontam na aprovação (reservam), no período escolhido —
--     mas só as que começam DEPOIS da data do relatório: as anteriores a folha já descontou (evita desconto duplo
--     quando um relatório novo for importado).
--   • Prazo para iniciar = fim do concessivo − saldo + 1 (regra; não usa a "Sugestão" da folha).
--     Período em aquisição: considera o saldo que ele terá ao completar (30 − descontos).
--   • Quem está desligado no portal não aparece.
CREATE OR REPLACE FUNCTION public.ferias_saldo_atual(p_hoje date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date))
RETURNS TABLE(cadastro text, nome text, cargo text, admissao date, user_id integer,
  periodo_inicio date, periodo_fim date, em_aquisicao boolean,
  direito numeric, debito_folha numeric, debito_portal numeric, saldo numeric,
  fim_concessivo date, prazo_inicio date, origem text, data_base date, importacao_id bigint)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
WITH base AS (SELECT i.id, i.data_relatorio FROM ferias_importacoes i ORDER BY i.id DESC LIMIT 1),
folha AS (
  SELECT s.cadastro, s.nome, s.cargo, s.admissao, s.periodo_inicio, s.periodo_fim,
         s.direito AS direito_base, s.debito AS debito_folha, b.data_relatorio, b.id AS imp, 'folha'::text AS origem
  FROM ferias_saldos s JOIN base b ON s.importacao_id = b.id),
ultimo AS (SELECT DISTINCT ON (f.cadastro) f.* FROM folha f ORDER BY f.cadastro, f.periodo_fim DESC),
novos AS (
  SELECT u.cadastro, u.nome, u.cargo, u.admissao,
         (u.periodo_fim + 1 + make_interval(years => k - 1))::date AS periodo_inicio,
         (u.periodo_fim + make_interval(years => k))::date AS periodo_fim,
         NULL::numeric AS direito_base, 0::numeric AS debito_folha, u.data_relatorio, u.imp, 'calculado'::text AS origem
  FROM ultimo u CROSS JOIN generate_series(1, 5) k
  WHERE (u.periodo_fim + 1 + make_interval(years => k - 1))::date <= p_hoje),
todos AS (SELECT * FROM folha UNION ALL SELECT * FROM novos),
calc AS (
  SELECT t.*, us.id AS uid, us.status AS ustatus,
    CASE
      WHEN t.origem = 'calculado' THEN ferias_direito_proporcional(t.periodo_inicio, least(p_hoje, t.periodo_fim))
      WHEN t.periodo_fim < t.data_relatorio THEN t.direito_base
      ELSE least(30, t.direito_base + greatest(0,
             ferias_direito_proporcional(t.periodo_inicio, least(p_hoje, t.periodo_fim))
           - ferias_direito_proporcional(t.periodo_inicio, t.data_relatorio)))
    END AS direito_calc,
    coalesce((
      SELECT sum((f.fim - f.inicio + 1) + CASE WHEN f.opcao = '5+10' OR (f.opcao IS NULL AND f.abono) THEN 10 ELSE 0 END)
      FROM ferias f
      WHERE f.user_id = us.id AND f.status = 'aprovado'
        AND f.periodo_inicio = t.periodo_inicio AND f.inicio > t.data_relatorio
    ), 0)::numeric AS debito_portal
  FROM todos t LEFT JOIN usuarios us ON us.cadastro = t.cadastro)
SELECT c.cadastro, c.nome, c.cargo, c.admissao, c.uid,
  c.periodo_inicio, c.periodo_fim, c.periodo_fim >= p_hoje,
  c.direito_calc, c.debito_folha, c.debito_portal,
  c.direito_calc - c.debito_folha - c.debito_portal,
  (c.periodo_fim + interval '1 year')::date,
  CASE WHEN (CASE WHEN c.periodo_fim >= p_hoje THEN 30 - c.debito_folha - c.debito_portal
                  ELSE c.direito_calc - c.debito_folha - c.debito_portal END) > 0
       THEN ((c.periodo_fim + interval '1 year')::date
             - ceil(CASE WHEN c.periodo_fim >= p_hoje THEN 30 - c.debito_folha - c.debito_portal
                         ELSE c.direito_calc - c.debito_folha - c.debito_portal END)::int + 1)
  END,
  c.origem, c.data_relatorio, c.imp
FROM calc c
WHERE c.uid IS NULL OR coalesce(c.ustatus, 'ativo') = 'ativo'
ORDER BY c.nome, c.periodo_inicio;
$$;
GRANT EXECUTE ON FUNCTION public.ferias_saldo_atual(date) TO anon, authenticated, service_role;
