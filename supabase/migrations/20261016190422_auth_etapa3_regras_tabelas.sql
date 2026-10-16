-- Aplicada em 16/10/2026 (versão 20261016190422).
-- Verificado com sessões simuladas (rollback): visibilidade por perfil (RH tudo; gestor/líder a equipe; colaborador o
-- próprio + férias aprovadas) e 26 casos de gravação/leitura: bloqueados lançar férias fora da equipe, colaborador
-- lançar/alterar férias, mensagem/feedback em nome de outro, colaborador publicar comunicado/criar vaga/tarefa,
-- alterar perfil alheio, mudar status direto no cadastro, avaliar fora da equipe; público sem login só vê vagas
-- abertas, eventos e nome/admissão dos ativos (e-mail, telefone, férias, mensagens e gravações bloqueados).
--
-- Login do Supabase (etapa 3, 16/10/2026): regras de acesso por perfil nas tabelas que estavam abertas a qualquer um
-- com a chave pública. As regras espelham o que cada tela já permite. eu()/eu_nivel()/da_minha_equipe() vêm da sessão.
-- Público (sem login) fica só com: vagas abertas (portal de vagas), eventos e nome/admissão dos ativos (formulário
-- do evento). Tabelas sga_* (outro sistema) não foram tocadas.

DO $do$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['usuarios','ferias','vagas','tarefas','chat','feedbacks','comunicados','exames','avaliacoes',
                            'banco_talentos','candidatos','cursos_usuarios','ferias_saldos','ferias_importacoes','ponto_importacoes'] LOOP
    FOR p IN SELECT polname FROM pg_policy WHERE polrelid = ('public.'||t)::regclass LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.polname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF t NOT IN ('vagas','usuarios') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon', t); END IF;
  END LOOP;
END $do$;

-- Cadastro de colaboradores
CREATE POLICY usuarios_logado_le ON public.usuarios FOR SELECT TO authenticated USING (true);
CREATE POLICY usuarios_publico_ativos ON public.usuarios FOR SELECT TO anon USING (coalesce(status,'ativo') = 'ativo' AND cadastro IS NOT NULL);
CREATE POLICY usuarios_altera ON public.usuarios FOR UPDATE TO authenticated
  USING (id = eu() OR eu_nivel() >= 2) WITH CHECK (id = eu() OR eu_nivel() >= 2);
REVOKE SELECT, UPDATE ON public.usuarios FROM anon;
GRANT SELECT (id, name, admissao, status, cadastro) ON public.usuarios TO anon;              -- formulário do evento
REVOKE UPDATE (status, data_desligamento) ON public.usuarios FROM authenticated;            -- desligar é pelo fluxo do RH

-- Férias
CREATE POLICY ferias_le ON public.ferias FOR SELECT TO authenticated
  USING (eu_nivel() >= 4 OR user_id = eu() OR da_minha_equipe(user_id) OR status = 'aprovado');
CREATE POLICY ferias_lanca ON public.ferias FOR INSERT TO authenticated
  WITH CHECK (eu_nivel() >= 4 OR (eu_nivel() >= 2 AND da_minha_equipe(user_id)));
CREATE POLICY ferias_altera ON public.ferias FOR UPDATE TO authenticated
  USING (eu_nivel() >= 4 OR (eu_nivel() >= 2 AND da_minha_equipe(user_id)))
  WITH CHECK (eu_nivel() >= 4 OR (eu_nivel() >= 2 AND da_minha_equipe(user_id)));

-- Vagas
CREATE POLICY vagas_publico_abertas ON public.vagas FOR SELECT TO anon USING (ativa);
CREATE POLICY vagas_logado_le ON public.vagas FOR SELECT TO authenticated USING (true);
CREATE POLICY vagas_rh_cria ON public.vagas FOR INSERT TO authenticated WITH CHECK (eu_nivel() >= 4);
CREATE POLICY vagas_rh_altera ON public.vagas FOR UPDATE TO authenticated USING (eu_nivel() >= 4) WITH CHECK (eu_nivel() >= 4);
REVOKE INSERT, UPDATE, DELETE ON public.vagas FROM anon;

-- Planejamento (tarefas)
CREATE POLICY tarefas_le ON public.tarefas FOR SELECT TO authenticated
  USING (eu_nivel() >= 3 OR responsavel_id = eu() OR criado_por_id = eu());
CREATE POLICY tarefas_cria ON public.tarefas FOR INSERT TO authenticated WITH CHECK (eu_nivel() >= 2);
CREATE POLICY tarefas_altera ON public.tarefas FOR UPDATE TO authenticated
  USING (eu_nivel() >= 2 OR responsavel_id = eu()) WITH CHECK (eu_nivel() >= 2 OR responsavel_id = eu());
CREATE POLICY tarefas_apaga ON public.tarefas FOR DELETE TO authenticated USING (eu_nivel() >= 2);

-- Mensagens
CREATE POLICY chat_le ON public.chat FOR SELECT TO authenticated USING (eu() IN (from_id, to_id));
CREATE POLICY chat_envia ON public.chat FOR INSERT TO authenticated WITH CHECK (from_id = eu());
CREATE POLICY chat_marca_lida ON public.chat FOR UPDATE TO authenticated USING (to_id = eu()) WITH CHECK (to_id = eu());

-- Feedbacks (tela: comuns → autor e destinatário; sigilosos → autor e gestor+; RH vê tudo para os painéis)
CREATE POLICY feedbacks_le ON public.feedbacks FOR SELECT TO authenticated
  USING (eu_nivel() >= 4 OR from_id = eu() OR (NOT coalesce(sigiloso,false) AND to_id = eu()) OR (coalesce(sigiloso,false) AND eu_nivel() >= 3));
CREATE POLICY feedbacks_envia ON public.feedbacks FOR INSERT TO authenticated WITH CHECK (from_id = eu());

-- Comunicados
CREATE POLICY comunicados_le ON public.comunicados FOR SELECT TO authenticated USING (true);
CREATE POLICY comunicados_publica ON public.comunicados FOR INSERT TO authenticated WITH CHECK (eu_nivel() >= 3 AND autor_id = eu());
CREATE POLICY comunicados_apaga ON public.comunicados FOR DELETE TO authenticated USING (autor_id = eu() OR eu_nivel() >= 4);

-- Exames
CREATE POLICY exames_le ON public.exames FOR SELECT TO authenticated USING (eu_nivel() >= 3 OR user_id = eu());
CREATE POLICY exames_agenda ON public.exames FOR INSERT TO authenticated WITH CHECK (eu_nivel() >= 3);
CREATE POLICY exames_altera ON public.exames FOR UPDATE TO authenticated USING (eu_nivel() >= 3) WITH CHECK (eu_nivel() >= 3);

-- Avaliações
CREATE POLICY avaliacoes_le ON public.avaliacoes FOR SELECT TO authenticated
  USING (eu_nivel() >= 4 OR avaliado_id = eu() OR avaliador_id = eu() OR da_minha_equipe(avaliado_id));
CREATE POLICY avaliacoes_avalia ON public.avaliacoes FOR INSERT TO authenticated
  WITH CHECK (eu_nivel() >= 2 AND avaliador_id = eu() AND (eu_nivel() >= 4 OR da_minha_equipe(avaliado_id)));

-- Recrutamento (só RH)
CREATE POLICY banco_talentos_rh ON public.banco_talentos FOR ALL TO authenticated USING (eu_nivel() >= 4) WITH CHECK (eu_nivel() >= 4);
CREATE POLICY candidatos_rh_le ON public.candidatos FOR SELECT TO authenticated USING (eu_nivel() >= 4);
CREATE POLICY candidatos_rh_altera ON public.candidatos FOR UPDATE TO authenticated USING (eu_nivel() >= 4) WITH CHECK (eu_nivel() >= 4);

-- Cursos do perfil
CREATE POLICY cursos_le ON public.cursos_usuarios FOR SELECT TO authenticated USING (user_id = eu() OR eu_nivel() >= 4);
CREATE POLICY cursos_inclui ON public.cursos_usuarios FOR INSERT TO authenticated WITH CHECK (user_id = eu());

-- Saldos e importações
CREATE POLICY ferias_saldos_le ON public.ferias_saldos FOR SELECT TO authenticated USING (cadastro_visivel(cadastro));
CREATE POLICY ferias_importacoes_le ON public.ferias_importacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY ponto_importacoes_le ON public.ponto_importacoes FOR SELECT TO authenticated USING (true);
