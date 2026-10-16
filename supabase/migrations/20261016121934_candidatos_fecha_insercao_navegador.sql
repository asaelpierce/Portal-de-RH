-- Aplicada em 16/10/2026 (versão 20261016121934). Verificado como anon (com rollback): inserir e apagar recusados;
-- ler e alterar permitidos; service_role (função "curriculos") mantém INSERT.
--
-- Candidatos só entram pela função "curriculos" (portal público, upload do RH e e-mail do RH), que valida,
-- pede consentimento LGPD e limita envios. O navegador (chave pública) não insere nem apaga mais direto:
-- antes qualquer pessoa com a chave pública do site podia inserir ou apagar candidatos.
-- Mantido: SELECT e UPDATE (o RH lê e muda status/banco de talentos pelo portal).
-- Aplicada depois de o portal novo estar no ar (commit 76c3db6 publicado em 16/10/2026 12:15 UTC).
REVOKE INSERT, DELETE, TRUNCATE ON public.candidatos FROM anon, authenticated;
