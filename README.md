# Portal RH — Kalenborn International

Portal de gestão de pessoas (K.RH): férias, planner/kanban, avaliações, feedbacks,
recrutamento, benefícios, clima organizacional, movimentações e mais.

## Stack
- React 18 + Vite
- Supabase (Postgres + Auth de tabela própria + Edge Functions)
- Recharts (gráficos)

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha VITE_SUPABASE_ANON_KEY
npm run dev
```

## Deploy (Vercel)
- Build command: `npm run build`
- Output directory: `dist`
- Configure as variáveis de ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no painel da Vercel
  (Project Settings → Environment Variables).

## Backend (Supabase)

As migrations em `supabase/migrations/` documentam o que já foi aplicado ao projeto
`zybkcpvdptabxkxpieuv` (RH-Kalenborn):

1. `20260727120000_enable_rls_sensitive_tables.sql` — RLS nas tabelas de clima/benefícios/movimentações
2. `20260727121000_hash_passwords_and_verify_login.sql` — login seguro (bcrypt) via função `verify_login`
3. `20260727122000_add_dev_role.sql` — papel `dev` (acesso total, equipe técnica)

A Edge Function `supabase/functions/secure-proxy` centraliza chamadas que precisam de chave
secreta (OpenAI, Anthropic, Power Automate) e acesso a tabelas restritas — nenhuma dessas
chaves fica no frontend. Os secrets são configurados direto no projeto Supabase:

```bash
supabase secrets set OPENAI_API_KEY=... --project-ref zybkcpvdptabxkxpieuv
supabase secrets set ANTHROPIC_API_KEY=... --project-ref zybkcpvdptabxkxpieuv
supabase secrets set POWER_AUTOMATE_WEBHOOK=... --project-ref zybkcpvdptabxkxpieuv
supabase secrets set PDF_EXTRACTOR_URL=... --project-ref zybkcpvdptabxkxpieuv
```

## Papéis de usuário
`colaborador` < `lider` < `gestor` < `rh` = `dev` (dev tem o mesmo nível de acesso do RH)
