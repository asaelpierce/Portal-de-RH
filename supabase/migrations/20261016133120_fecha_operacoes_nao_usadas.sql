-- Aplicada em 16/10/2026 (versão 20261016133120).
-- Verificado como anon (com rollback): operações que o portal usa continuam (férias ler/alterar, vagas encerrar,
-- tarefas/comunicados/banco de talentos apagar, exames alterar, chat enviar/marcar lida); as retiradas ficaram
-- bloqueadas (apagar férias, vagas, exames, chat; alterar comunicados e feedbacks; ler denúncias).
--
-- Revisão de segurança (16/10/2026): o portal ainda não usa Supabase Auth, então todo acesso do navegador é "anon".
-- Aqui só se retira da chave pública o que o portal NUNCA usa (levantado no código: from("tabela").operação).
-- Nada que as telas usam muda. Tabelas sga_* (outro sistema no mesmo banco) não foram tocadas.
-- Principal ganho: ninguém mais consegue APAGAR férias, vagas, exames, mensagens, avaliações, feedbacks etc. pela chave pública.
REVOKE UPDATE, DELETE ON public.avaliacoes              FROM anon, authenticated;  -- portal: insert, select
REVOKE UPDATE         ON public.banco_talentos          FROM anon, authenticated;  -- portal: insert, select, delete
REVOKE DELETE         ON public.beneficios_catalogo     FROM anon, authenticated;  -- portal: insert, select, update
REVOKE DELETE         ON public.beneficios_solicitacoes FROM anon, authenticated;  -- portal: insert, select, update
REVOKE DELETE         ON public.beneficios_usuarios     FROM anon, authenticated;  -- portal: insert, select, update
REVOKE DELETE         ON public.chat                    FROM anon, authenticated;  -- portal: insert, select, update
REVOKE SELECT, UPDATE, DELETE ON public.clima_denuncias FROM anon, authenticated;  -- portal: insert (denúncia anônima)
REVOKE UPDATE, DELETE ON public.clima_nps               FROM anon, authenticated;  -- portal: insert, select
REVOKE UPDATE, DELETE ON public.clima_pulses            FROM anon, authenticated;  -- portal: insert, select
REVOKE UPDATE         ON public.comunicados             FROM anon, authenticated;  -- portal: insert, select, delete
REVOKE DELETE         ON public.exames                  FROM anon, authenticated;  -- portal: insert, select, update
REVOKE UPDATE, DELETE ON public.feedbacks               FROM anon, authenticated;  -- portal: insert, select (arquivar é feito no banco)
REVOKE DELETE         ON public.ferias                  FROM anon, authenticated;  -- portal: insert, select, update (cancelar = update)
REVOKE DELETE         ON public.movimentacoes           FROM anon, authenticated;  -- portal: insert, select, update
REVOKE DELETE         ON public.vagas                   FROM anon, authenticated;  -- portal: insert, select, update (encerrar = update)
-- TRUNCATE/TRIGGER/REFERENCES nunca são usados pelo portal (e TRUNCATE não passa pela API, mas não deve existir).
REVOKE TRUNCATE, TRIGGER, REFERENCES ON
  public.avaliacoes, public.banco_talentos, public.beneficios_catalogo, public.beneficios_solicitacoes, public.beneficios_usuarios,
  public.chat, public.clima_denuncias, public.clima_nps, public.clima_pulses, public.comunicados, public.exames, public.feedbacks,
  public.ferias, public.movimentacoes, public.tarefas, public.vagas, public.cursos_usuarios, public.eventos, public.ferias_importacoes,
  public.ferias_saldos, public.ponto_importacoes, public.usuarios
FROM anon, authenticated;
