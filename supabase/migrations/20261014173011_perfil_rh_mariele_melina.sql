-- Aplicada em 14/10/2026 (versão 20261014173011). Verificado: ambas com role 'rh'; Mariele segue liderando 2;
-- as duas passam na checagem de RH de respostas_evento.
--
-- Mariele (id 133, Analista de RH) e Melina (id 134, Assistente Administrativo, setor RH) passam ao perfil RH
-- (pedido do Asael em 13/10/2026), para acessarem as telas de RH (ex.: Eventos/confraternização).
-- A liderança da Mariele continua: vem de usuarios.lider_id da equipe, não do perfil.
UPDATE public.usuarios SET role = 'rh' WHERE id = 133 AND cadastro = '100437' AND role = 'lider';
UPDATE public.usuarios SET role = 'rh' WHERE id = 134 AND cadastro = '100486' AND role = 'colaborador';
