# Chá do Oli 🧸

Convite digital interativo para o chá de bebê do Oli.

**Evento:** 14 de novembro de 2026, das 15h às 20h, na Rua Fontoura Xavier, 550, Porto Alegre/RS.

## Abrir convite

Quando o GitHub Pages estiver ativado, o endereço será:

**https://luornel.github.io/cha-do-oli/**

## Funcionalidades

- Convite responsivo para celular e computador.
- Integração com Google Maps.
- Eventos de agenda para Google, Outlook e arquivo `.ics` para Apple.
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

**Observações:** o site não reserva cotas nem confirma pagamentos. Confirme nome e valor do recebedor no aplicativo bancário antes de pagar. O Calendário Apple pode exigir importação manual do arquivo `.ics`. A chave Pix é exibida publicamente aos convidados.

## Créditos

Layout e organização do protótipo realizados com apoio do ChatGPT. QR Code produzido localmente por biblioteca JavaScript incluída no projeto (Kazuhiko Arase, licença MIT).