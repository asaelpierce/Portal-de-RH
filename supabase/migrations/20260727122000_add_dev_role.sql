-- Adiciona o papel "dev" (acesso total, usado pela equipe técnica/automação)
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_role_check
  CHECK (role = ANY (ARRAY['colaborador'::text,'lider'::text,'gestor'::text,'rh'::text,'dev'::text]));

-- OBS: a criação do usuário "automacao@kalenborn.com.br" com papel dev foi feita
-- manualmente (INSERT único, senha já em hash bcrypt) e não está neste arquivo de
-- propósito — migrations versionadas no git não devem carregar hashes de contas reais.
