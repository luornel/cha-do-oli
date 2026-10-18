# Chá do Oli 🧸

Convite web responsivo para o chá de bebê do Oli — **14 de novembro de 2026, 15h — 20h**, na Rua Fontoura Xavier, 550, Porto Alegre/RS.

**Site:** https://luornel.github.io/cha-do-oli/  
**Administração (após ativar Supabase):** https://luornel.github.io/cha-do-oli/admin.html

## Funcionalidades

- Convite, endereço e agendas Google, Apple (assinatura) e Outlook.
- Catálogo de 22 presentes de R$ 20 a R$ 5.000, com opção integral e cotas acima de R$ 100.
- QR Code Pix e Copia e Cola gerados no navegador usando a chave informada no convite.
- **Controle opcional via Supabase:** progresso das cotas confirmadas, registro de contribuição após Pix e aprovação/rejeição manual em painel administrativo protegido por autenticação.

## Organização

```text
index.html                          Convite público
admin.html                          Painel privado (login obrigatório)
assets/
  styles.css                        Estilos do convite
  site.js                           Interações, Pix e cotas
  qrcode.js                         Biblioteca de QR Code (MIT)
  contributions.js                  Registro público de contribuições
  admin.css / admin.js              Painel administrativo
  supabase-service.js               Cliente/RPC do Supabase
  supabase-config.js                URL + chave *publishable* (desativado por padrão)
supabase/migrations/
  20261018_cotas_manuais.sql         Banco, permissões e 22 presentes iniciais
Cha_do_Oli_14_novembro.ics          Calendário
.nojekyll                            Configuração do GitHub Pages
```

## Ativar o controle de cotas

1. Crie um projeto em https://supabase.com/dashboard e anote **Project URL** e **Publishable key** (`sb_publishable_...`). A chave publishable é apropriada para código do navegador. **Nunca use `sb_secret_...`, `service_role` ou senhas no GitHub.**
2. No Supabase, abra **SQL Editor** e execute `supabase/migrations/20261018_cotas_manuais.sql`. O SQL habilita RLS, proíbe leitura direta das tabelas e publica apenas RPC com permissões restritas.
3. Em **Authentication → Users**, crie um usuário administrador com e-mail e senha. Copie o **User UID** dessa conta.
4. No **SQL Editor**, execute, substituindo pelo UID real (não é o e-mail):
   ```sql
   insert into public.oli_admins (user_id)
   values ('SEU-UID-AUTH-DO-ADMIN');
   ```
5. Configure **Authentication → URL Configuration → Site URL** como `https://luornel.github.io/cha-do-oli/`. Não habilite cadastro público para administradores; crie usuários administradores apenas pelo painel do Supabase e autorize cada UID na tabela `oli_admins`.
6. Edite `assets/supabase-config.js` no repositório GitHub, substituindo URL, `publishableKey` e `enabled: true`. O GitHub Pages publicará a atualização. As configurações são iguais para o site e para `admin.html`.
7. Acesse `admin.html` com o usuário autorizado. Faça um **Pix real de teste de pequeno valor**, registre o pagamento no convite, confira no Nubank e confirme no painel. Se desejar desfazer o teste, rejeite um pedido pendente; pagamentos já confirmados não são alteráveis pelo painel para preservar a auditoria.

**Importante:** o painel não lê o extrato do Nubank. A solicitação do convidado **não significa pagamento recebido**. Somente confirme no painel depois de conferir o depósito no aplicativo do banco. Solicitações pendentes **não reservam cotas**; se duas pessoas pagarem as últimas cotas antes da conferência, uma solicitação poderá não ser confirmada. Combine um ajuste ou reembolso manualmente nesse caso.

### Segurança e privacidade

- O navegador recebe **somente URL e chave publishable**. Não há chave privilegiada no repositório.
- O convidado não consegue listar nome, contato, ID nem pagamentos dos demais convidados. A RPC pública retorna só quantidades agregadas.
- O registro público insere apenas solicitações **pendentes**, e o valor é calculado no SQL; só o UID em `oli_admins` pode listar e confirmar pagamentos.
- O painel não faz confirmação automática. Confirme antes no Nubank. Contatos são opcionais e visíveis só à administração.
- O formulário público pode receber spam. Para um evento com grande tráfego, adicione CAPTCHA/rate limiting via Supabase Edge Function. Recomenda-se remover os dados pessoais após o evento.
- A versão padrão do site usa `enabled: false` até o banco estar configurado; os presentes e Pix seguem funcionando normalmente.

## Publicação

O GitHub Pages usa `main` e `/(root)`. Arquivos estáticos, sem servidor Node ou credenciais privadas.

QR Code incluído localmente: **QRCode for JavaScript**, Kazuhiko Arase (MIT). Desenvolvimento e prototipação com apoio do ChatGPT.
