-- Aplicada em 16/10/2026 (versão 20261016184523). Verificado (sessões simuladas, rollback): colaborador logado que
-- "se diz RH" é recusado (admissões, denúncias, importação de saldos); pedido de benefício em nome de outro fica no
-- nome de quem está logado; RH logado funciona mesmo com outro número vindo do navegador; sem sessão (reserva antiga)
-- continua como antes; sessão de desligado recusada; eh_rh inacessível de fora; saldo de férias da tela continua.
-- 25/25 funções receberam a conferência. O portal não precisou mudar.
--
-- Login do Supabase (etapa 2, 16/10/2026): as funções descobrem QUEM ESTÁ PEDINDO pela sessão segura.
-- Antes, o navegador mandava "p_pedido_por" (um número) e a função confiava nele — dava para se passar por RH.
-- Agora: com sessão do Supabase, vale a pessoa da sessão (o número enviado é ignorado);
--        sem sessão (login antigo, reserva da transição), usa o número enviado — essa reserva sai na etapa 4.

CREATE OR REPLACE FUNCTION public.quem_pede(p_informado integer) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN p_informado; END IF;          -- transição (login antigo): sai na etapa 4
  SELECT id INTO v FROM usuarios WHERE auth_id = auth.uid() AND coalesce(status,'ativo') = 'ativo';
  IF v IS NULL THEN RAISE EXCEPTION 'Sua sessão não corresponde a um cadastro ativo. Saia e entre de novo.'; END IF;
  RETURN v;                                                       -- a sessão manda; o número do navegador é ignorado
END; $$;
REVOKE ALL ON FUNCTION public.quem_pede(integer) FROM PUBLIC, anon, authenticated;

-- Primeira linha de cada função que recebia quem pede do navegador: troca pelo da sessão.
-- (Reescrita automática: insere "p_pedido_por := public.quem_pede(p_pedido_por);" logo após o BEGIN principal;
--  o resto de cada função não muda. Nas importações o parâmetro é p_importado_por.)
DO $do$
DECLARE f record; def text; novo text; param text;
BEGIN
  FOR f IN SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
           FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
           WHERE p.pronamespace = 'public'::regnamespace AND l.lanname = 'plpgsql'
             AND pg_get_function_identity_arguments(p.oid) ~ 'p_(pedido_por|importado_por) integer'
  LOOP
    param := CASE WHEN f.args ~ 'p_importado_por integer' THEN 'p_importado_por' ELSE 'p_pedido_por' END;
    def := pg_get_functiondef(f.oid);
    IF position('quem_pede(' IN def) > 0 THEN CONTINUE; END IF;
    novo := regexp_replace(def, '(\$function\$[\s\S]*?\mBEGIN\M)',
                           '\1' || E'\n  ' || param || ' := public.quem_pede(' || param || ');  -- etapa 2: quem pede vem da sessão');
    IF novo = def THEN RAISE EXCEPTION 'Não achei o BEGIN de %', f.proname; END IF;
    EXECUTE novo;
  END LOOP;
END $do$;

-- Caminho de busca fixo (alerta "search_path mutable") nas funções do portal.
ALTER FUNCTION public.tempo_de_empresa(date, date) SET search_path = public;
ALTER FUNCTION public.ferias_direito_proporcional SET search_path = public;
ALTER FUNCTION public.ferias_meses_servico SET search_path = public;
ALTER FUNCTION public.cpf_valido(text) SET search_path = public;
ALTER FUNCTION public.nivel_perfil(text) SET search_path = public;
ALTER FUNCTION public.nome_setor(text) SET search_path = public;
ALTER FUNCTION public.clima_periodo(text) SET search_path = public;

-- Funções auxiliares usadas só por dentro das funções protegidas: invisíveis para fora do banco.
REVOKE EXECUTE ON FUNCTION public.eh_rh(integer), public.sincroniza_login(), public.nivel_perfil(text), public.nome_setor(text),
  public.clima_periodo(text), public.cpf_valido(text), public.tempo_de_empresa(date, date) FROM PUBLIC, anon, authenticated;
