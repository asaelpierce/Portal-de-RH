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

-- ── Complemento (13/10/2026, decisões do Asael) ─────────────────────────────────────────────────────────────
-- a) Cancelados os 10 registros de teste de junho/2026 (ids 2, 4, 21–28): não correspondiam a nenhum pedido real
--    da planilha (ex.: Brunna "06/10–04/11" no portal; real 08/09–22/09). Ficam no histórico como 'cancelado'.
--    Outros 3 da mesma época (ids 1, 3, 5 — Ademar e Breno Marques, desligados) não foram tocados.
update public.ferias set status='cancelado', cancelado_por=1, cancelado_em=now(),
  cancelado_motivo='Registro de teste criado em junho/2026 — não corresponde a nenhum pedido real da programação de férias (planilha KdB 163). Cancelado a pedido do RH em 13/10/2026.'
where id in (2,4,21,22,23,24,25,26,27,28) and created_at < '2026-07-01' and status in ('aprovado','pendente_lider','pendente_gestor','pendente_rh');
-- b) #171 Danilo (RH: a folha ainda não descontou) e #169 Priscila (12 dias pelas datas) → ids 45 e 46.
with p(cad, ini, fim, tipo, opcao, per_ini, per_fim, pedido, nota) as (values
  ('223',    date '2026-10-12', date '2026-10-21', '10',    '10', date '2025-03-02', date '2026-03-01', 171, 'RH confirmou que a folha ainda não descontou estes 10 dias'),
  ('100312', date '2026-11-16', date '2026-11-27', 'outro', null, date '2025-07-25', date '2026-07-24', 169, '12 dias pelas datas (planilha dizia 11; RH confirmou 12)'))
insert into public.ferias (user_id, user_name, setor, tipo, opcao, inicio, fim, abono, status, lider_aprov, gestor_aprov, rh_aprov,
  obs, periodo_aquisitivo, periodo_inicio, periodo_fim, lancado_por, lancado_por_nome, historico_edicoes)
select u.id, u.name, u.setor, p.tipo, p.opcao, p.ini, p.fim, false, 'aprovado', 'aprovado', 'aprovado', 'aprovado',
  'Importado da programação de férias (planilha KdB 163, pedido #'||p.pedido||') — futura; '||p.nota,
  to_char(p.per_ini,'DD/MM/YYYY')||' a '||to_char(p.per_fim,'DD/MM/YYYY'), p.per_ini, p.per_fim, 1, 'Importação — planilha KdB 163', '[]'::jsonb
from p join public.usuarios u on u.cadastro = p.cad and u.status = 'ativo';
-- Resultado verificado: Danilo 2025/26 20→10; Priscila 2025/26 30→18 (prazo do restante 07/07/2027);
-- pendências de aprovação de ativos: 0; de férias hoje: Felipe, Danilo, Fábio, Dyego, Múcio, Luan.
