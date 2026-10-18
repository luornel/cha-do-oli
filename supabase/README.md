# Supabase — Chá do Oli

Migration principal: [`migrations/20261018_cotas_manuais.sql`](migrations/20261018_cotas_manuais.sql).

- `oli_gifts`: catálogo imutável durante o evento, alimentado inicialmente com 22 itens.
- `oli_contributions`: pagamentos relatados por convidados. `pending` não é pagamento confirmado.
- `oli_admins`: somente UUIDs de usuários do Supabase Auth autorizados manualmente.
- `oli_progress()`: agregados públicos por presente, **sem dados pessoais**.
- `oli_request_contribution(...)`: cria um pedido pendente, cálculo monetário no banco.
- `oli_admin_list()` e `oli_admin_review(...)`: acesso somente a usuários da tabela `oli_admins`.

Todas as tabelas possuem RLS habilitada e privilégios diretos revogados para `anon`/`authenticated`.

**Procedimento de ativação:** consultar o README da raiz. A URL e chave *publishable* devem ser configuradas apenas depois de aplicar a migration e cadastrar o administrador.
