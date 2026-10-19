# Chá do Oli — PWA de administração

A área administrativa do Chá do Oli pode ser instalada como um aplicativo no Android, sem APK nem Play Store.

## Instalação (Android / Chrome)

1. Abra `https://luornel.github.io/cha-do-oli/admin.html` no **Google Chrome**.
2. Toque no menu de três pontos `⋮` e selecione **Instalar aplicativo** ou **Adicionar à tela inicial**. O Chrome também pode oferecer um botão de instalação diretamente na página.
3. Abra **Chá do Oli** pelo ícone do ursinho na tela inicial.
4. Entre usando sua conta administrativa do Supabase.

O PWA abre o painel de administração em uma janela própria, sem a barra de endereço. O site público continua disponível normalmente.

## Notificações nesta versão

Com o painel aberto e autenticado, toque em **Ativar notificações**, autorize o pedido do Android e use **Testar aviso**. O PWA verifica novas solicitações periodicamente, e avisa quando encontra uma nova pendência. Para proteger a privacidade do convidado, não mostra nomes nem contatos nos avisos.

**Limitação:** estas são notificações enquanto o aplicativo estiver em execução. O Android pode suspender o PWA quando estiver fechado ou inativo; portanto, isso **não** é push garantido em segundo plano. Para receber avisos mesmo com o app totalmente fechado, será necessário configurar uma infraestrutura de Web Push/FCM com assinatura de dispositivos e um serviço de envio no Supabase.

## Técnica e privacidade

- Hospedagem: GitHub Pages, sob `/cha-do-oli/`.
- Manifesto: `manifest.webmanifest`, com ícones do ursinho em PNG 192/512 e versão maskable.
- Service worker: `sw.js`. Armazena somente os ícones públicos do aplicativo. Não guarda informações de pagamentos, contatos ou sessões do Supabase.
- Contribuições e autenticação continuam no Supabase, com as mesmas regras e permissões.
- Instalar o PWA não concede direitos administrativos; é preciso login autorizado.

As cores e a ilustração foram adaptadas da identidade visual atual do Chá do Oli.
## Ícone pequeno das notificações (Android)

Na barra de status e nas notificações recolhidas, o Android utiliza a propriedade `badge` da API de notificações, que precisa ser uma silhueta monocromática com transparência. Foi incluído `icons/oli-badge-96.png` (96 × 96, PNG com fundo transparente) para essa posição. O ícone colorido `oli-192.png` permanece como ícone principal da notificação e do aplicativo. Para testar a mudança, descarte a notificação antiga, recarregue o painel e use **Testar aviso** novamente. Não é necessário reinstalar o PWA.
