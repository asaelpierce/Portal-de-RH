-- Aplicada em 14/10/2026 (versão 20261014173359). Verificado: e-mail novo gravado; nenhum login restante com o antigo.
--
-- Login da Melina (id 134) passa de melina.barbosa@ para melina.nunes@kalenborn.com.br (pedido do Asael em 14/10/2026).
-- Mesma senha; o e-mail novo também passa a receber as notificações (email_notificacao segue vazio = usa o login).
UPDATE public.usuarios SET email = 'melina.nunes@kalenborn.com.br'
WHERE id = 134 AND cadastro = '100486' AND email = 'melina.barbosa@kalenborn.com.br';
