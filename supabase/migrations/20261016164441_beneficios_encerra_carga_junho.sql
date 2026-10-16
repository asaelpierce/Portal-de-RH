-- Aplicada em 16/10/2026 (versão 20261016164441). Verificado: 644 vínculos 'cancelado', data_fim 16/10/2026, todos
-- com a observação; nenhum outro registro atingido (eram os únicos 644 da tabela).
--
-- Encerramento dos 644 vínculos de benefícios da carga de junho/2026 (decisão do Asael, 16/10/2026).
-- Evidência de carga automática: criados em 2 lotes (13/06 20:13 e 15/06 16:57), nenhum com aprovador, as 92 pessoas com
-- os mesmos 7 benefícios, 308 com início "01/01/2024", incluindo 16 desligados e 2 contas de teste.
-- Não apaga nada: status 'cancelado' + data_fim + observação. Reversível; e a aprovação de um novo pedido reativa o vínculo.
UPDATE public.beneficios_usuarios
SET status = 'cancelado',
    data_fim = (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    obs = trim(coalesce(obs || ' | ', '') || 'Encerrado em 16/10/2026: carga automática de junho/2026 sem aprovação (decisão do RH).')
WHERE status = 'ativo' AND aprovado_por IS NULL
  AND date_trunc('minute', created_at) IN ('2026-06-13 20:13:00+00', '2026-06-15 16:57:00+00');
