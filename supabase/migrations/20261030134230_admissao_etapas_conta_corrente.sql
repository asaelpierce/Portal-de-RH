-- Aplicada em 30/10/2026 (versão 20261030134230). Verificado (rollback): criada sem e-mail e com CC/setor; sem PIS →
-- recusado; IRRF sim sem CPF → recusado; completa sem mãe → aceita; 2ª etapa "sem corrente" salva; corrente sem
-- agência/conta → recusado; corrente completa salva ("Corrente"); ficha devolve conta e link.
--
-- Ficha de admissão em 2 etapas (pedido do Asael e da Mariele):
-- • 1ª etapa (dados cadastrais) vai ao RH sozinha; 2ª etapa (conta bancária e documentos) é salva à parte, quando der.
-- • Conta: SOMENTE conta corrente (poupança ou conta salário de outra empresa não). Sem conta corrente → link (vídeo)
--   para abrir conta salário pela empresa, configurável pelo RH.
-- • Obrigatórios: e-mail, PIS, título de eleitor, zona e seção; mãe/pai deixam de ser obrigatórios. IRRF "sim/não" por
--   dependente; se sim, CPF do dependente obrigatório.
-- • Admissão pode ser criada sem e-mail; já com centro de custo e setor (dados_empresa → ficha da BRIT).
ALTER TABLE public.admissoes ADD COLUMN dados_banco jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN banco_em timestamptz;

DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.admissao_enviar(text,jsonb,boolean)'::regprocedure);
  novo := replace(def, $$  FOREACH k IN ARRAY ARRAY['nome','sexo','raca','mae','nascimento','escolaridade','estado_civil','naturalidade','telefone',
                           'logradouro','numero','bairro','cep','cidade','rg','cpf'] LOOP$$,
                       $$  FOREACH k IN ARRAY ARRAY['nome','sexo','raca','nascimento','escolaridade','estado_civil','naturalidade','telefone','email',
                           'logradouro','numero','bairro','cep','cidade','rg','cpf','pis','titulo','titulo_zona','titulo_secao'] LOOP$$);
  novo := replace(novo, $$    IF length(btrim(coalesce(dep->>'nome',''))) < 3 OR length(btrim(coalesce(dep->>'vinculo',''))) = 0 THEN
      RAISE EXCEPTION 'Informe nome e vínculo de cada dependente.'; END IF;$$,
                        $$    IF length(btrim(coalesce(dep->>'nome',''))) < 3 OR length(btrim(coalesce(dep->>'vinculo',''))) = 0 THEN
      RAISE EXCEPTION 'Informe nome e vínculo de cada dependente.'; END IF;
    IF coalesce(dep->>'irrf','') NOT IN ('sim','nao') THEN RAISE EXCEPTION 'Dependente %: informe se é dependente no Imposto de Renda (sim ou não).', dep->>'nome'; END IF;
    IF dep->>'irrf' = 'sim' AND NOT cpf_valido(dep->>'cpf') THEN RAISE EXCEPTION 'Dependente %: informe um CPF válido (obrigatório para o Imposto de Renda).', dep->>'nome'; END IF;$$);
  IF novo = def OR position('''titulo_secao''' in novo) = 0 OR position('Imposto de Renda (sim ou não)' in novo) = 0 THEN RAISE EXCEPTION 'Trechos de admissao_enviar não encontrados.'; END IF;
  EXECUTE novo;
END $do$;

CREATE OR REPLACE FUNCTION public.admissao_banco_salvar(p_token text, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d jsonb := coalesce(p_dados,'{}'::jsonb); v jsonb;
BEGIN
  IF NOT admissao_token_ok(p_token) THEN RAISE EXCEPTION 'Este link não aceita mais alterações. Fale com o RH.'; END IF;
  IF coalesce(d->>'tem_corrente','') NOT IN ('sim','nao') THEN RAISE EXCEPTION 'Informe se você tem conta corrente.'; END IF;
  IF d->>'tem_corrente' = 'sim' THEN
    IF length(btrim(coalesce(d->>'banco',''))) < 2 OR length(regexp_replace(coalesce(d->>'agencia',''),'\D','','g')) < 3
       OR length(regexp_replace(coalesce(d->>'conta',''),'\D','','g')) < 3 THEN RAISE EXCEPTION 'Informe banco, agência e número da conta corrente.'; END IF;
    v := jsonb_build_object('tem_corrente','sim','banco',left(btrim(d->>'banco'),60),'agencia',left(btrim(d->>'agencia'),20),
                            'conta',left(btrim(d->>'conta'),30),'tipo_conta','Corrente');
  ELSE
    v := jsonb_build_object('tem_corrente','nao');
  END IF;
  UPDATE admissoes SET dados_banco = v, banco_em = now(), atualizado_em = now() WHERE token = p_token;
  RETURN v;
END; $$;
GRANT EXECUTE ON FUNCTION public.admissao_banco_salvar(text,jsonb) TO anon, authenticated;

DROP FUNCTION public.admissao_ficha(text);
CREATE FUNCTION public.admissao_ficha(p_token text)
RETURNS TABLE(nome text, email text, telefone text, cargo text, status text, token_expira_em timestamptz, dados_candidato jsonb,
              documentos jsonb, prazo_documentos date, dados_banco jsonb, link_conta text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RAISE EXCEPTION 'Link inválido.'; END IF;
  RETURN QUERY SELECT a.nome, a.email, a.telefone, a.cargo, a.status, a.token_expira_em, a.dados_candidato, a.documentos, a.prazo_documentos,
    a.dados_banco, (SELECT valor FROM app_config WHERE chave = 'admissao_link_conta')
  FROM admissoes a WHERE a.token = p_token;
END; $$;
GRANT EXECUTE ON FUNCTION public.admissao_ficha(text) TO anon, authenticated;

DROP FUNCTION public.admissao_criar(integer,integer,text,text,text,text);
CREATE FUNCTION public.admissao_criar(p_pedido_por integer, p_candidato_id integer, p_nome text, p_email text, p_telefone text, p_cargo text,
                                      p_dados_empresa jsonb DEFAULT NULL)
RETURNS TABLE(id bigint, token text, token_expira_em timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_nome text := btrim(coalesce(p_nome,''));
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Acesso permitido apenas para RH.'; END IF;
  IF length(v_nome) < 3 THEN RAISE EXCEPTION 'Informe o nome do candidato.'; END IF;
  IF p_candidato_id IS NOT NULL AND EXISTS (SELECT 1 FROM admissoes a WHERE a.candidato_id = p_candidato_id AND a.status <> 'cancelada') THEN
    RAISE EXCEPTION 'Este candidato já tem uma admissão em andamento.'; END IF;
  IF p_dados_empresa IS NOT NULL AND nullif(p_dados_empresa->>'centro_custo','') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM usuarios WHERE centro_custo = p_dados_empresa->>'centro_custo') THEN
    RAISE EXCEPTION 'Centro de custo inválido (use um da folha).'; END IF;
  RETURN QUERY INSERT INTO admissoes AS a (candidato_id, nome, email, telefone, cargo, token, token_expira_em, criado_por, dados_empresa)
    VALUES (p_candidato_id, v_nome, nullif(btrim(coalesce(p_email,'')),''), nullif(btrim(coalesce(p_telefone,'')),''), nullif(btrim(coalesce(p_cargo,'')),''),
            replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), now() + interval '15 days', p_pedido_por,
            coalesce(jsonb_strip_nulls(jsonb_build_object('centro_custo', nullif(p_dados_empresa->>'centro_custo',''),
                                                          'departamento', nullif(p_dados_empresa->>'departamento',''))), '{}'::jsonb))
    RETURNING a.id, a.token, a.token_expira_em;
END; $$;
REVOKE ALL ON FUNCTION public.admissao_criar(integer,integer,text,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admissao_criar(integer,integer,text,text,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admissao_link_conta_salvar(p_pedido_por integer, p_url text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v text := nullif(btrim(coalesce(p_url,'')),'');
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Acesso permitido apenas para RH.'; END IF;
  IF v IS NOT NULL AND v !~ '^https://' THEN RAISE EXCEPTION 'Cole um link completo (começando com https://).'; END IF;
  INSERT INTO app_config (chave, valor, atualizado_por, atualizado_em) VALUES ('admissao_link_conta', v, p_pedido_por, now())
  ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now();
  RETURN v;
END; $$;
CREATE OR REPLACE FUNCTION public.admissao_link_conta_ler(p_pedido_por integer)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Acesso permitido apenas para RH.'; END IF;
  RETURN (SELECT valor FROM app_config WHERE chave = 'admissao_link_conta');
END; $$;
REVOKE ALL ON FUNCTION public.admissao_link_conta_salvar(integer,text), public.admissao_link_conta_ler(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admissao_link_conta_salvar(integer,text), public.admissao_link_conta_ler(integer) TO authenticated;
