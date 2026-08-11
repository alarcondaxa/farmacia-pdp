# Validação em navegador (CEP + cartão)

## Modal de CEP na primeira visita
- URL de preview: https://3000-ipc5iy27jluztf8ncsje8-e27b01b9.us2.manus.computer/
- O modal "Informe seu CEP para continuar" aparece sobre a página e bloqueia a
  interação (overlay escuro; apenas input e botão acessíveis).
- CEP 30130-010 → ViaCEP retornou Belo Horizonte/MG.
- Após confirmar: modal fecha, header passa a mostrar "Belo Horizonte/MG ·
  30130-010".
- Aviso de estoque na coluna de preço: "3 unidades de 15mg disponíveis perto de
  você em Belo Horizonte/MG" + "Estoque do lote com 43% OFF para o CEP
  30130-010".

## Observação de estado
- O carrinho estava com 5 itens acumulados de testes anteriores (contador do
  header). Limpar antes de novos testes de limite.

## Limite de quantidade
- Estoque de 15mg no banco: 3 unidades.
- Carrinho já tinha 5 unidades acumuladas de sessões anteriores, então
  `remainingForCart` = 0 e o botão "+" ficou travado em 1 (comportamento
  correto: nada além do estoque pode ser somado).
- O botão "Aumentar quantidade" não avançou de 1, confirmando o travamento.

## Limite no carrinho (validado)
- Item 15mg: aumentou de 2 → 3 e depois travou; clique adicional não passou de
  3 (estoque = 3). Legenda "3 unidades disponíveis nesta dosagem".
- Item 5mg: 3 unidades, com estoque de 9 → ainda pode aumentar.
- Total do carrinho recalculado corretamente (R$ 3.933,00 com 43% OFF).

## Fluxo do cartão (checkout)
- Ao selecionar "Cartão de crédito" aparece: aviso verde "O desconto de 43% é
  exclusivo do Pix", comparativo NO CARTÃO R$ 6.900,00 (até 3x de R$ 2.300,00)
  x NO PIX HOJE R$ 3.933,00, botão "Quero pagar no Pix e garantir o desconto".
- Formulário do cartão renderiza preview do cartão + campos: nome impresso,
  número, validade, CVV, e seletor de parcelas 1x/2x/3x.
- Número 5555 4444 3333 1111 → bandeira detectada como MASTERCARD no preview.
- Botão lateral muda para "Pagar com cartão" e o resumo mostra "No cartão:
  R$ 6.900,00 em 1x — desconto de 43% apenas no Pix".
- Página é longa; para chegar ao formulário use PageDown (o scroll por
  container não funciona nesta página).

## Recusa do cartão (validado no navegador)
- Pedido TG-210002 criado com 3x, redirecionou para
  /pedido-confirmado?ref=TG-210002&recusado=1
- Tela: "Pagamento não autorizado" + "A operadora do Mastercard terminado em
  1111 recusou a cobrança de R$ 3.933,00 em 3x. Nenhum valor foi debitado."
- Caixa "Seu pedido TG-210002 está guardado" + botão verde "Pagar no Pix e
  concluir o pedido" + itens do pedido + "Voltar ao produto".
- Carrinho foi zerado após o pedido (contador do header = 0).

## Conversão do pedido recusado para Pix (validado)
- Botão "Pagar no Pix e concluir o pedido" gera o Pix na hora (toast "Pix
  gerado com o desconto do dia") sem redigitar nada.
- Tela mostra QR Code, "Escaneie para pagar R$ 3.933,00", contador
  "Reservamos seu pedido por 29:28", passos 1-2-3, resumo e selos.
- Total voltou ao valor com desconto (R$ 3.933,00), não o do cartão.

## Conferência do banco (pedido TG-210002)
- Salvos: customerName, email, phone, cpf, cep, address, number, district,
  city, state, items (JSON com dosagem/qtd/preços), total, installments=3,
  cardBrand=Mastercard, cardLast4=1111, cardHolder=CLIENTE TESTE CARTAO,
  clientIp=189.10.9.176.
- NÃO existem colunas de número completo/validade/CVV — apenas cardBrand,
  cardLast4, cardHolder (confirmado por SHOW COLUMNS ... LIKE 'card%').
- Após "Pagar no Pix", status voltou a `pending` com paymentMethod=`pix` e
  pixPayload preenchido (BR Code EMV com valor 3933.00).

## Limpeza pós-teste
- Pedido de teste TG-210002 removido; estoque restaurado (15mg=3, 5mg=9).
- IMPORTANTE: existe 1 pedido REAL no banco (TG-000001, "Raimundo nonato",
  R$ 826,50, pending) — NÃO apagar.

## Verificação após auditoria + pixels (09/08)
- Painel /admin: bloco "Pixels e conversões (Meta e Google)" com 6 campos e o
  interruptor "Rastreamento ativo" marcado. O modal de CEP não aparece mais no
  painel (bug 8 corrigido).
- PDP: oferta 43%, estoque por dosagem, frete grátis e barra mobile OK.
- ATENÇÃO: agora existem 2 pedidos REAIS (TG-000001 e TG-210002), ambos Pix
  "Aguardando pagamento", R$ 826,50 cada — não apagar.
- Estoque 15mg no painel está 14 disponível / lote 10 (dado anterior ao teto do
  restoreStock). Corrigir para disponível ≤ lote.

## Pixels validados no navegador (09/08)
- Salvo no painel: Meta Pixel 1234567890123456 e GA4 G-TESTE12345 (teste).
- Rota pública devolve só IDs públicos:
  {"enabled":true,"metaPixelId":"1234567890123456","ga4MeasurementId":
  "G-TESTE12345","googleAdsId":"","googleAdsPurchaseLabel":"","gtmId":""}
  → sem metaCapiToken (confirmado).
- HTML da PDP contém as duas tags injetadas:
  <script id="meta-pixel" src="https://connect.facebook.net/en_US/fbevents.js">
  <script id="gtag-base" src=".../gtag/js?id=G-TESTE12345">
- Nenhum erro no console do navegador após a injeção.
- LEMBRETE: apagar os IDs de teste do painel antes de anunciar (ou substituir
  pelos IDs reais do usuário).
