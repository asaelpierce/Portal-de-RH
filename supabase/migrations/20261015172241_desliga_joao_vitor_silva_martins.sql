-- Aplicada em 15/10/2026 (versão 20261015172241). Verificado: status 'desligado'; ativos da folha no portal = 82
-- (= os 82 da planilha da folha de 15/10 que já estão no portal; Alejandro, admitido em 20/10, entra na próxima lista).
--
-- Joao Vitor Silva Martins (cadastro 100493): desligado (confirmado pelo Asael em 15/10/2026; estava na folha de 07/10
-- e não está na planilha da folha de 15/10). Nada dependia dele (não lidera ninguém, sem férias abertas nem resposta
-- de evento). Data de desligamento não informada. Reversível: voltar status para 'ativo'.
UPDATE public.usuarios SET status = 'desligado' WHERE id = 30 AND cadastro = '100493' AND status = 'ativo';
