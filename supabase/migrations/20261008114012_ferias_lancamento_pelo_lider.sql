-- Aplicada no projeto zybkcpvdptabxkxpieuv em 08/10/2026 (versão 20261008114012).
--
-- Férias lançadas pelo líder (fluxo decidido pelo Asael em 08/10/2026: líder lança → gestor → RH aprova).
-- Campos espelham o formulário oficial "Solicitação de Férias", para gerar o Word preenchido.
ALTER TABLE public.ferias
  ADD COLUMN opcao            text,         -- '30' | '15' | '5+10' | '10' (as 4 opções do formulário)
  ADD COLUMN adiantamento_13  boolean,      -- 1ª parcela do 13º junto com as férias?
  ADD COLUMN lancado_por      integer REFERENCES public.usuarios(id),
  ADD COLUMN lancado_por_nome text,
  ADD COLUMN periodo_inicio   date,         -- período aquisitivo escolhido (vem do saldo importado da folha)
  ADD COLUMN periodo_fim      date,
  ADD COLUMN email_enviado_em timestamptz;  -- e-mail ao colaborador após aprovação do RH
COMMENT ON COLUMN public.ferias.opcao IS 'Opção do formulário oficial: 30 | 15 | 5+10 (5 descanso + 10 abono) | 10';
