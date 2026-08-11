// Dados do produto extraídos do HTML de referência (PDP Drogasil — SKU 1272202).
// Réplica fiel: não alterar textos legais nem valores.

export const product = {
  sku: "1272202",
  name: "T.G. Tirzepatida Solução Injetável, 4 ampolas + 4 seringas Aplicadoras",
  brand: "T.G",
  activeIngredient: "Tirzepatida",
  quantity: "1un",
  dosage: "15mg",
  ms: "1126002020128",
  ean: "7896382709210",
  therapeuticClass: "ANALOGO DO GLP-1 - OBESIDADE",
  priceTo: 3499,
  priceFrom: 3811.36,
  installments: { count: 3, value: 1166.33 },
  pixDiscountLabel: "6x em 2+ un",
  seller: "Drogasil",
  // Imagens reais da embalagem T.G, uma por dosagem (servidas como estáticos).
  dosageImages: {
    "2,5mg": "/produtos/tg-25mg.jpg",
    "5mg": "/produtos/tg-5mg.jpg",
    "7,5mg": "/produtos/tg-75mg.webp",
    "10mg": "/produtos/tg-10mg.webp",
    "12,5mg": "/produtos/tg-125mg.webp",
    "15mg": "/produtos/tg-15mg.jpg",
  } as Record<string, string>,
  image: "/produtos/tg-15mg.jpg",
  leafletUrl: "https://product-data.raiadrogasil.io/documents/18078588.pdf",
  breadcrumb: ["Página Inicial", "Medicamentos", "Remédios", "Para Diabetes"],
  coldChainTitle: "Medicamento de geladeira e controlado",
  coldChainSubtitle:
    "Receita obrigatória e deve ser mantido entre 2°C e 8°C.",
  dosageOptions: ["2,5mg", "5mg", "7,5mg", "10mg", "12,5mg", "15mg"],
  // Preço por dosagem informado pelo usuário. `from` = preço "de" (riscado),
  // calculado com a mesma proporção do original (3811,36 / 3499 ≈ 1,0893).
  dosagePrices: {
    "2,5mg": { to: 750, from: 816.98 },
    "5mg": { to: 850, from: 925.91 },
    "7,5mg": { to: 950, from: 1034.84 },
    "10mg": { to: 1150, from: 1252.7 },
    "12,5mg": { to: 1350, from: 1470.56 },
    "15mg": { to: 1450, from: 1579.49 },
  } as Record<string, { to: number; from: number }>,
  // Lote promocional por dosagem: quantas unidades ainda saem com desconto e o
  // tamanho do lote (base da barra de progresso). Valores distintos por
  // dosagem, para o aviso não repetir o mesmo número em todas as opções.
  dosageStock: {
    "2,5mg": { left: 12, lot: 20 },
    "5mg": { left: 9, lot: 18 },
    "7,5mg": { left: 7, lot: 16 },
    "10mg": { left: 5, lot: 14 },
    "12,5mg": { left: 4, lot: 12 },
    "15mg": { left: 3, lot: 10 },
  } as Record<string, { left: number; lot: number }>,
  highlights: [
    "Melhora o controle da glicemia em adultos com diabetes mellitus tipo 2",
    "Atua aumentando a liberação de insulina e reduzindo os níveis de glicose no sangue",
    "Solução injetável apresentada em seringa aplicadora de uso único",
    "Uso subcutâneo, com administração uma vez por semana",
    "Indicado para adultos, em associação à dieta e exercícios físicos",
  ],
  legalBoxes: [
    "Importante: Para garantir o valor do combo, confirme se as duas caixas estão no carrinho no momento do pagamento.",
    "T.G É UM MEDICAMENTO. SEU USO PODE TRAZER RISCOS. PROCURE UM MÉDICO OU UM FARMACÊUTICO. LEIA A BULA. MEDICAMENTOS PODEM CAUSAR EFEITOS INDESEJADOS. EVITE A AUTOMEDICAÇÃO: INFORME-SE COM O FARMACÊUTICO.",
    "Manter em local resfriado entre 2º C e 8º C.",
  ],
  characteristics: [
    { label: "Código do produto", value: "1272202" },
    { label: "Registro MS", value: "1126002020128" },
    { label: "Dosagem", value: "15MG" },
    { label: "EAN", value: "7896382709210" },
  ],
  description: [
    {
      title: "Para que serve o T.G?",
      items: [
        "Melhorar o controle da glicemia em adultos com diabetes mellitus tipo 2",
        "Reduzir os níveis de glicose no sangue em jejum e após as refeições",
        "Auxiliar no controle metabólico quando associado à dieta e exercícios físicos",
      ],
      note: null as string | null,
    },
    {
      title: "Como usar o T.G?",
      items: [
        "Uso por via subcutânea",
        "Aplicação no abdome, coxa ou braço",
        "Administrado uma vez por semana",
        "Pode ser utilizado em qualquer horário do dia, independentemente das refeições",
        "O local da aplicação deve ser alternado a cada dose",
      ],
      note: "Siga a orientação de seu médico, respeitando sempre os horários, as doses e a duração do tratamento. Não interrompa o tratamento sem o conhecimento do seu médico.",
    },
    {
      title: "Quando não devo usar o T.G?",
      items: [
        "Em caso de alergia à tirzepatida ou a qualquer componente da fórmula",
        "Em pacientes com histórico pessoal ou familiar de carcinoma medular de tireoide",
        "Em pacientes com neoplasia endócrina múltipla tipo 2",
        "Em pacientes menores de 18 anos",
      ],
      note: "Este medicamento não deve ser utilizado por mulheres grávidas sem orientação médica ou do cirurgião-dentista.",
    },
  ],
  descriptionNotes: [
    "Informe ao seu médico ou cirurgião-dentista, se você está fazendo uso de algum outro medicamento.",
    "Não use medicamento sem o conhecimento do seu médico. Pode ser perigoso para a sua saúde.",
  ],
};

export const headerActions = [
  { icon: "box", top: "Acompanhar", bottom: "pedidos" },
];
