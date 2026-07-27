-- 1) Extensão de criptografia (bcrypt) do Postgres
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Nova coluna para o hash. A coluna "password" (texto puro) vira legado —
--    ainda existe por segurança/rollback, mas não é mais usada pelo login.
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.usuarios ALTER COLUMN password DROP NOT NULL;

-- 3) Popula o hash a partir da senha atual em texto puro (idempotente)
UPDATE public.usuarios
SET password_hash = crypt(password, gen_salt('bf'))
WHERE password_hash IS NULL AND password IS NOT NULL;

-- 4) Função de verificação de login: compara com o hash no banco;
--    a senha e o hash NUNCA voltam para o cliente.
CREATE OR REPLACE FUNCTION public.verify_login(p_email text, p_password text)
RETURNS TABLE (
  id int, name text, email text, role text, setor text, area text, cargo text,
  admissao date, gestor_id int, lider_id int, skills text[], senioridade int,
  telefone text, foto_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.name, u.email, u.role, u.setor, u.area, u.cargo,
         u.admissao, u.gestor_id, u.lider_id, u.skills, u.senioridade,
         u.telefone, u.foto_url
  FROM public.usuarios u
  WHERE u.email = trim(p_email)
    AND u.password_hash IS NOT NULL
    AND u.password_hash = crypt(p_password, u.password_hash);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_login(text, text) TO anon, authenticated;
