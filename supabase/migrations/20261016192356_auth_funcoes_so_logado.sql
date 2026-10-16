-- Aplicada em 16/10/2026 (versão 20261016192356). Verificado: funções públicas restantes = admissao_enviar,
-- admissao_ficha, registrar_falha_login, responder_evento, status_resposta_evento; logados continuam chamando as demais.
--
-- Funções usadas só por quem está logado deixam de ser chamáveis sem login (16/10/2026). Elas já recusavam sem sessão
-- (quem_pede), mas o certo é nem expor. Continuam públicas só as das páginas abertas: ficha de admissão pelo link
-- (admissao_ficha, admissao_enviar), formulário do evento (responder_evento, status_resposta_evento) e o registro de
-- falha de login (registrar_falha_login).
DO $do$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS assinatura
           FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
             AND has_function_privilege('anon', p.oid, 'EXECUTE')
             AND p.proname NOT IN ('admissao_ficha','admissao_enviar','responder_evento','status_resposta_evento','registrar_falha_login')
             AND p.proname NOT LIKE 'sga\_%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.assinatura);
  END LOOP;
END $do$;
