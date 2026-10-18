# Chá do Oli 🧸

Chá de nenê digital e interativo do Oli.

## Abrir convite
**https://luornel.github.io/cha-do-oli/**

## Funcionalidades

- Chá de bebê responsivo para celular e computador.
- Integração com Google Maps.
- Eventos de agenda para Google, Outlook e assinatura `webcal://` para Apple, com `.ics` como alternativa.
- 22 sugestões de presentes com cotas e contribuição integral.
- QR Code Pix com o valor selecionado e opção Pix Copia e Cola.

## Estrutura

```text
├── index.html                   # Página do convite
├── assets/
│   ├── styles.css              # Estilo responsivo
│   ├── qrcode.js               # QR Code gerado no navegador
│   └── site.js                 # Interações, cotas, Pix e agenda
├── Cha_do_Oli_14_novembro.ics   # Evento para Apple Calendar
├── .nojekyll                    # Publicação estática sem Jekyll
└── README.md
```

## Atualização

O GitHub Pages publica o conteúdo da branch `main`, pasta `/ (root)`. Não exige servidor, banco de dados ou instalação de pacotes.

**Observações:** o site não reserva cotas nem confirma pagamentos. Confirme nome e valor do recebedor no aplicativo bancário antes de pagar. No iPhone, o botão Apple usa `webcal://` para oferecer uma assinatura de calendário com um único evento. Assinaturas são calendários separados e somente leitura, não eventos individuais editáveis. Se o iOS não abrir o link, o convite fornece o endereço HTTPS para assinar manualmente; um arquivo `.ics` também está disponível para importação pelo Mail. A chave Pix é exibida publicamente aos convidados.
