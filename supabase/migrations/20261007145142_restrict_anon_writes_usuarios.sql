-- Aplicada no projeto zybkcpvdptabxkxpieuv em 07/10/2026 (versão 20261007145142).
--
-- Por quê: o login do portal é próprio (verify_login), então TODO acesso do navegador chega como "anon".
-- Com UPDATE/INSERT liberados na tabela inteira, qualquer pessoa com a anon key (que é pública)
-- podia se promover a RH (UPDATE role), trocar o password_hash de outra conta e entrar como ela,
-- ou criar uma conta RH nova. Isto fecha essas escaladas SEM quebrar o portal:
-- o UPDATE volta só nas colunas que o front realmente grava (levantado em src/App.jsx e no
-- pg_stat_statements em 07/10/2026 — nenhum cliente da API escrevia role/senha nem inseria/apagava usuários).
--
-- Se o front passar a gravar outra coluna de usuarios, ela precisa entrar no GRANT abaixo,
-- senão o update falha com "permission denied for column ...".
--
-- A leitura (SELECT) NÃO foi mexida aqui: existe um cliente que ainda faz login com
-- usuarios?email=eq…&password=eq… e SELECT *; revogar leitura quebraria esse cliente. Pendente de decisão.
-- Solução definitiva: migrar para Supabase Auth, para que as policies saibam quem está logado.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.usuarios FROM anon, authenticated;

GRANT UPDATE (name, telefone, foto_url, setor, area, skills, status, data_desligamento)
  ON public.usuarios TO anon, authenticated;
