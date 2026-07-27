-- Habilita RLS nas 7 tabelas que estavam totalmente expostas ao anon key.
ALTER TABLE public.clima_pulses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clima_nps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clima_denuncias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficios_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficios_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficios_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes ENABLE ROW LEVEL SECURITY;

-- Tabelas SENSÍVEIS: nenhuma policy para anon -> acesso negado por padrão.
-- (clima_denuncias, movimentacoes, beneficios_usuarios, beneficios_solicitacoes)
-- O app acessa essas tabelas só através da Edge Function "secure-proxy" (service_role).

-- beneficios_catalogo: leitura pública (é o catálogo, sem dado pessoal)
CREATE POLICY "catalogo_leitura_publica" ON public.beneficios_catalogo
  FOR SELECT TO anon USING (true);

-- clima_pulses / clima_nps: inserção pública (responder pesquisa), sem leitura pelo anon
CREATE POLICY "pulses_insercao_publica" ON public.clima_pulses
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "nps_insercao_publica" ON public.clima_nps
  FOR INSERT TO anon WITH CHECK (true);
