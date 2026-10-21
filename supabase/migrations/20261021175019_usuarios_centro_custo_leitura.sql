-- Aplicada em 21/10/2026 (versão 20261021175019). Antes: nenhum papel lia a coluna nova (permissões por coluna);
-- colocar centro_custo na consulta do portal sem isto faria o cadastro inteiro deixar de carregar.
--
-- Centro de custo visível para quem está logado (lista de centros de custo no vínculo de titulares do odonto e telas
-- futuras). Só leitura; alterar continua só pelo banco/RH; público (anon) continua sem acesso.
GRANT SELECT (centro_custo) ON public.usuarios TO authenticated;
