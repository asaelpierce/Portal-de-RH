-- REGISTRO (não é migration; já executado em 13/10/2026 no projeto zybkcpvdptabxkxpieuv → ids 35 a 44 em ferias).
-- Fonte: "KdB 163 - Programação de Férias (1-177).xlsx" (Microsoft Forms, 177 pedidos de 22/07/2025 a 08/10/2026).
-- Critério: só pedidos que terminam em/após 07/10/2026 (data-base do relatório da folha), na versão mais recente
-- de cada pessoa, conferidos contra os saldos da folha. Decisão do Asael (08/10): entram aprovadas, sem e-mail.
--   • Em andamento em 07/10 (Múcio, Luan, Dyego, Felipe): só para aparecerem "de férias"; não descontam
--     (ferias_saldo_atual ignora férias iniciadas antes da data do relatório — a folha já descontou).
--   • Futuras (Sidimar, Ryan, Mike, Wellington, Fábio, Diogo): descontam do período indicado. Sem período na
--     planilha → período mais antigo com saldo (Mike, Wellington — planilha dizia "2024-2025", sem saldo na folha).
-- NÃO importados (dependem do RH): #171 Danilo (folha já tem 10 dias descontados nesse período — pode ser este
--   mesmo pedido), #169 Priscila ("11 dias" mas as datas dão 12), #175 Kaio ("férias compradas" de período que a
--   folha já mostra sem saldo), #91 Mike jan/2027 (30 dias; conflita com o #173), #78/#117 Múcio (substituídos pelo #157).
-- Verificado depois: em andamento sem mudança de saldo; futuras descontaram exatamente os dias lançados.
with p(cad, ini, fim, tipo, opcao, per_ini, per_fim, pedido, grupo) as (values
  ('195',   date '2026-09-28', date '2026-10-27', '30',    '30', date '2024-11-03', date '2025-11-02', 157, 'em andamento em 07/10 (folha já descontou)'),
  ('100440',date '2026-10-05', date '2026-11-04', 'outro', null, date '2025-09-25', date '2026-09-24',  90, 'em andamento em 07/10 (folha já descontou)'),
  ('10096', date '2026-10-05', date '2026-10-24', 'outro', null, date '2025-02-13', date '2026-02-12', 166, 'em andamento em 07/10 (folha já descontou)'),
  ('100404',date '2026-10-01', date '2026-10-14', 'outro', null, date '2025-04-01', date '2026-03-31', 174, 'em andamento em 07/10 (folha já descontou)'),
  ('100452',date '2026-11-03', date '2026-11-17', '15',    '15', date '2025-01-06', date '2026-01-05', 156, 'futura'),
  ('100450',date '2026-11-09', date '2026-11-23', '15',    '15', date '2024-12-16', date '2025-12-15', 172, 'futura'),
  ('100478',date '2026-10-19', date '2026-11-02', '15',    '15', date '2025-08-12', date '2026-08-11', 173, 'futura'),
  ('10100', date '2026-11-09', date '2026-11-23', '15',    '15', date '2025-03-27', date '2026-03-26', 176, 'futura'),
  ('100451',date '2026-10-13', date '2026-10-22', '10',    '10', date '2025-12-16', date '2026-12-15', 177, 'futura'),
  ('17',    date '2027-01-04', date '2027-02-02', '30',    '30', date '2025-12-01', date '2026-11-30', 130, 'futura'))
insert into public.ferias (user_id, user_name, setor, tipo, opcao, inicio, fim, abono, status, lider_aprov, gestor_aprov, rh_aprov,
  obs, periodo_aquisitivo, periodo_inicio, periodo_fim, lancado_por, lancado_por_nome, historico_edicoes)
select u.id, u.name, u.setor, p.tipo, p.opcao, p.ini, p.fim, false, 'aprovado', 'aprovado', 'aprovado', 'aprovado',
  'Importado da programação de férias (planilha KdB 163, pedido #'||p.pedido||') — '||p.grupo,
  to_char(p.per_ini,'DD/MM/YYYY')||' a '||to_char(p.per_fim,'DD/MM/YYYY'), p.per_ini, p.per_fim, 1, 'Importação — planilha KdB 163', '[]'::jsonb
from p join public.usuarios u on u.cadastro = p.cad and u.status = 'ativo';
