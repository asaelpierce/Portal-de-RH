-- Aplicada no projeto zybkcpvdptabxkxpieuv em 07/10/2026 (versão 20261007164306).
--
-- Por quê: com SELECT na tabela inteira, qualquer pessoa com a anon key (pública) baixava
-- "password" (texto puro, legado) e "password_hash" (bcrypt — senhas fracas como 123456 quebram
-- em segundos offline) de todos os usuários.
-- O login não precisa disso: verify_login é SECURITY DEFINER e compara o hash dentro do Postgres.
-- O front do RH só lê colunas explícitas (ajustado no commit 5ef0b39).
--
-- Consequência intencional: "select=*" em usuarios pelo anon passa a dar permission denied.
-- Se surgir coluna nova em usuarios que o front precise ler, ela tem de entrar no GRANT abaixo.
--
-- Verificado após aplicar, como role anon: verify_login executa; o select do front funciona;
-- "select password from usuarios" falha com 42501.

REVOKE SELECT ON public.usuarios FROM anon, authenticated;

GRANT SELECT (id, name, email, role, setor, cargo, admissao, gestor_id, lider_id, skills, certs,
              senioridade, created_at, setor_real, status, data_desligamento, area, telefone, foto_url)
  ON public.usuarios TO anon, authenticated;
