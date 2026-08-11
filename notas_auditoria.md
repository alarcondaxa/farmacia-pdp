# Auditoria do código — achados

## BUG 1 (crítico) — cartão envia preço com desconto
`client/src/pages/Checkout.tsx` (submitOrder, ~linha 261-269): os itens sempre
usam `unitPrice: discounted(...)`, inclusive quando `paymentMethod === "card"`.
A UI diz que no cartão o valor volta ao cheio (R$ 6.900,00), mas o backend
calcula o total com desconto (R$ 3.933,00). Confirmado no banco: pedido
TG-210002 no cartão foi salvo com total 3933.00.
Correção: enviar `unitPrice` cheio quando cartão, ou (melhor) enviar
`paymentMethod` e deixar o servidor aplicar o desconto só no Pix.

## BUG 2 — getNextOrderSequence usa max(id)+1
`server/db.ts` linha ~170: sequência derivada do maior `id`. Com id
auto-increment alto (ex. 240001) gera referência TG-240001 e há risco de
colisão em pedidos simultâneos. Melhor: contar pedidos ou usar o próprio id
do pedido criado / tentar novamente em caso de duplicidade de `reference`.

## BUG 3 — switchToPix não valida estoque nem status card_declined
`server/routers/store.ts` (~414): permite gerar Pix para pedido cancelado
(`status === "canceled"`), pois só bloqueia `paid`/`shipped`. Pedido cancelado
já devolveu o estoque, então o Pix seria gerado sem reserva.

## BUG 4 — claimPayment só funciona com status `pending`
Se o pedido veio de cartão recusado e o cliente clica "Já paguei" antes de
`switchToPix`, status é `card_declined` e a rota retorna o status atual sem
registrar aviso — mas o front mostra sucesso. Verificar UX.

## BUG 5 — restoreStock pode estourar o lote
`server/db.ts` (~307): soma sem teto. Cancelar/apagar vários pedidos pode
deixar `available > lot`, quebrando a barra de progresso da PDP (percentual > 100%).

## BUG 6 — updateStatus/deleteOrder carregam TODOS os pedidos
`listOrders()` inteiro só para achar um id. Ineficiente; usar consulta por id.

## BUG 7 — CartContext usa `99` como teto quando não há estoque
`stockFor` retorna 99 (não Infinity) apesar do comentário dizer Infinity.
Inconsistente com a doc do tipo (`Infinity quando sem controle`).

## Observações menores
- `Checkout.tsx`: `total` = subtotal (Pix). No cartão o CTA mostra valor cheio
  mas o resumo lateral usa o total com desconto — reforça o BUG 1.
- `orders.installments` é gravado como 1 no Pix, ok.
- Nenhum rastreamento de analytics/pixel existe hoje (main.tsx sem nada).
- `client/src/pages/ComponentShowcase.tsx` (1437 linhas) é template não usado;
  candidato a remoção para reduzir bundle.

## BUG 8 — CepGate bloqueia o painel /admin
`CepGate` é renderizado em App.tsx sem checar a rota, então o overlay aparece
também em `/admin` e `/pedido-confirmado`. O admin não deveria ser obrigado a
informar CEP para gerenciar pedidos.

## BUG 9 — CepGate: erro de CEP não permite tentar de novo com clareza
`submitted` volta a false ao digitar, mas se o cliente enviar o mesmo CEP
inválido, a query fica em cache (`staleTime` 1h) e o erro pode não reaparecer.

## Erros de console analisados (logs de dev)
- "DISCOUNT_RATE is not defined" (07:35) e "useCart deve ser usado dentro de
  CartProvider": ambos ocorreram DURANTE as edições (HMR intermediário), já
  resolvidos — o grep atual mostra DISCOUNT_RATE exportado em lib/pricing.ts e
  CartProvider envolvendo o Router em App.tsx.
- "[API Query Error] Pedido não encontrado": esperado ao abrir
  /pedido-confirmado sem `ref` válido; a UI já trata com tela dedicada. Mas o
  redirect global de erro em main.tsx loga tudo como erro — aceitável.
- Requisições 404: apenas 2, do pedido de teste apagado.

## Auditoria do schema (drizzle/schema.ts) — sem bugs bloqueantes
- `orders.reference` é `unique` → base para o retry de colisão implementado.
- `orders.total` é `decimal(10,2)`: chega no JS como string; o router já faz
  `Number(order.total)` em getOrder/switchToPix. OK.
- `orders.items` é `text` com JSON: `JSON.parse` sem try/catch em getOrder,
  admin.orders, updateStatus e deleteOrder. Só quebraria com dado corrompido
  manualmente no banco; risco baixo, mas vale proteger.
- `stock.dosage` é `unique` → `onDuplicateKeyUpdate` do upsert funciona.
- `settings.settingKey` é `unique` → mesmo caso.
- `clientIp` varchar(64) aceita IPv6. OK.
- Faltam índices em `orders.clientIp` e `orders.createdAt`, usados pelo
  `countOrdersByIp` e pela listagem — melhoria de performance, não bug.

## Auditoria dos testes
- 5 arquivos, 44 testes: pix (BR Code/CRC16), card (Luhn/bandeira/validade),
  pricing (43%), store (25 casos: CEP, estoque, IP, cartão recusado,
  claimPayment, settings) e auth.logout.
- Lacunas: não havia teste do total do cartão (bug 1) nem do teto do
  restoreStock (bug 5) — adicionados nesta rodada.

## Bugs corrigidos nesta rodada
1, 2, 3, 4, 5, 6, 7, 8 e 9 — todos tratados. Resta apenas o endurecimento
opcional do `JSON.parse` dos itens e os índices de performance.
