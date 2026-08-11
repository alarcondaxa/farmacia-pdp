// Dados extraídos do HTML de referência enviado pelo usuário (PDP Drogasil / T.G).
// Estilo: réplica fiel — vermelho #EB3C4D / #B6202F, fundo #F2F2F2, raios 16/24px.
// NÃO reinterpretar visualmente; ver ideas.md.

export interface Category {
  name: string;
  children: { name: string; children: string[] }[];
}

export interface CarouselProduct {
  name: string;
  image: string;
  qty: string;
}

export const categories: Category[] = [
  {
    "name": "Saúde",
    "children": [
      {
        "name": "Bem Estar",
        "children": [
          "Fitness"
        ]
      },
      {
        "name": "Diabetes",
        "children": [
          "Alimentos Dietéticos",
          "Adoçantes"
        ]
      },
      {
        "name": "Saúde Sexual",
        "children": [
          "Preservativos",
          "Hígiene Intima",
          "Lubrificantes",
          "Acessórios para Saúde Sexual"
        ]
      },
      {
        "name": "Pele, Cabelos e Unhas",
        "children": [
          "Assadura",
          "Acne",
          "Cicatrizes e Imperfeições",
          "Micoses de Pele e Unha",
          "Tratamento Contra Piolhos"
        ]
      },
      {
        "name": "Cuidado Adulto",
        "children": [
          "Absorvente Adulto",
          "Fralda Adulta",
          "Lenços e Pomadas"
        ]
      }
    ]
  },
  {
    "name": "Medicamentos",
    "children": [
      {
        "name": "Remédios",
        "children": [
          "Controle de Peso",
          "Para Diabetes",
          "Para Dor e Febre",
          "Para Gripe e Resfriado",
          "Congestão Nasal",
          "Para Tosse",
          "Para Dor de Garganta",
          "Para rinite e sinusite",
          "Para Alergias",
          "Antidepressivos",
          "Calmantes",
          "Para Insônia",
          "Para Pressão Alta",
          "Para Enxaqueca",
          "Para a Visão",
          "Pílulas Anticoncepcionais e DIU",
          "Anti-Inflamatórios",
          "Para Parar de Fumar",
          "Para Asma",
          "Para Gastrite",
          "Para Azia e Má Digestão",
          "Para Colesterol",
          "Para Infecções",
          "Para Tireoide"
        ]
      },
      {
        "name": "Saúde do Sistema Nervoso",
        "children": []
      },
      {
        "name": "Medicamentos Especiais",
        "children": [
          "Endocrinologia",
          "Ginecologia",
          "Infertilidade",
          "Oncologia",
          "Reumatologia",
          "Clínica Geral",
          "Outras especialidades"
        ]
      },
      {
        "name": "Medicina Natural",
        "children": [
          "Ayurveda",
          "Florais",
          "Calmantes",
          "Fitoterápicos",
          "Homeopatia",
          "Remédios Naturais",
          "Aromaterapia",
          "Canabidiol"
        ]
      },
      {
        "name": "Tratamento em Casa",
        "children": [
          "Inaladores",
          "Seringas Descartáveis",
          "Equipamentos de Proteção",
          "Equipamentos e Instrumentos Hospitalares",
          "Camas, Colchões e Almofadas",
          "Nebulizadores",
          "Dilatador Nasal"
        ]
      },
      {
        "name": "Primeiros-Socorros",
        "children": [
          "Curativos",
          "Algodão",
          "Soros",
          "Higienizadores",
          "Acessórios para Primeiros-Socorros",
          "Contusões e Machucados"
        ]
      },
      {
        "name": "Monitores e Testes",
        "children": [
          "Monitores de Pressão",
          "Medidores de Glicose",
          "Canetas de Insulina",
          "Termômetros",
          "Oxímetros",
          "Pilhas e Baterias",
          "Testes"
        ]
      },
      {
        "name": "Ortopédicos",
        "children": [
          "Joelheiras e Tornozeleiras",
          "Munhequeiras e Cotoveleiras",
          "Tipoias e Colar Cervical",
          "Muletas e Bengalas",
          "Botas Ortopédicas",
          "Meias de Compressão e Cintas",
          "Para Lesões, Luxações e Torções",
          "Massageadores"
        ]
      }
    ]
  },
  {
    "name": "Vitaminas e Suplementos",
    "children": [
      {
        "name": "Vitaminas",
        "children": [
          "Multivitamínicos",
          "Vitamina A",
          "Vitamina B",
          "Vitamina C",
          "Vitamina D",
          "Vitamina E",
          "Cálcio",
          "Minerais",
          "Ômega",
          "Óleos",
          "Colágeno"
        ]
      },
      {
        "name": "Suplementos e Alimentos",
        "children": [
          "Cereais",
          "Bebidas",
          "Energéticos",
          "Proteínas",
          "Termogênicos",
          "Complementos Alimentares",
          "Shakes",
          "Orgânicos e Integrais"
        ]
      }
    ]
  },
  {
    "name": "Mamãe & Bebê",
    "children": [
      {
        "name": "Alimentação",
        "children": [
          "Fase 1",
          "Fase 2",
          "Fase 3",
          "Compostos Lácteos",
          "Fórmulas Infantis",
          "Complementos e Suplementos",
          "Papinhas",
          "Sem Lactose",
          "Soja",
          "Cereais Infantis",
          "Anti Refluxo",
          "Acessórios"
        ]
      },
      {
        "name": "Higiene Bucal",
        "children": [
          "Escovas",
          "Antissépticos",
          "Gel Dental",
          "Escova Elétrica"
        ]
      },
      {
        "name": "Amamentação",
        "children": [
          "Bicos",
          "Chupetas",
          "Copos",
          "Mamadeiras",
          "Higienização",
          "Mordedores",
          "Tira Leite"
        ]
      },
      {
        "name": "Fraldas e Troca",
        "children": [
          "Assaduras",
          "Fraldas",
          "Lenços Umedecidos",
          "Algodão",
          "Talcos"
        ]
      },
      {
        "name": "Cuidados para a Mamãe",
        "children": [
          "Meias de Compressão",
          "Protetores de Seios",
          "Antiestrias",
          "Hidratantes",
          "Absorventes"
        ]
      },
      {
        "name": "Cuidados com a Pele do Bebê",
        "children": [
          "Hidratantes",
          "Protetores Solares",
          "Colônias",
          "Acessórios"
        ]
      },
      {
        "name": "Hora do Banho",
        "children": [
          "Sabonetes",
          "Shampoos",
          "Condicionadores",
          "Acessórios",
          "Hastes Flexíveis",
          "Cremes e Gel para Cabelo"
        ]
      },
      {
        "name": "Passeio",
        "children": [
          "Carrinho de bebê",
          "Bebê Conforto",
          "Cadeirinha para auto",
          "Carrinho com bebê conforto",
          "Acessórios para passeio"
        ]
      }
    ]
  },
  {
    "name": "Beleza",
    "children": [
      {
        "name": "Cuidados com a Pele",
        "children": [
          "Protetor Solar",
          "Bronzeadores",
          "Anti-idade",
          "Hidratante",
          "Limpeza da Pele",
          "Pós-Sol",
          "Antiacne",
          "Antirrugas",
          "Esfoliante",
          "Óleo Corporal"
        ]
      },
      {
        "name": "Colorações",
        "children": [
          "Descolorantes",
          "Femininas",
          "Barba",
          "Masculinas"
        ]
      },
      {
        "name": "Maquiagem",
        "children": [
          "Base, Corretivo e Pó",
          "Batom",
          "Lápis e Delineadores",
          "Máscara para Cílios",
          "Demaquilante",
          "Gloss",
          "Sombras",
          "Blush",
          "Acessórios",
          "Pinças"
        ]
      },
      {
        "name": "Tratamento Capilar",
        "children": [
          "Anticaspa",
          "Antiqueda",
          "Cacheados",
          "Frizz",
          "Hidratação",
          "Lisos",
          "Oleosos",
          "Secos e Danificados",
          "Pontas Duplas",
          "Tratamentos"
        ]
      },
      {
        "name": "Finalizadores para Cabelo",
        "children": [
          "Creme para Pentear",
          "Gel",
          "Cera",
          "Spray"
        ]
      },
      {
        "name": "Acessórios para Cabelos",
        "children": [
          "Chapinhas e Pranchas",
          "Escovas",
          "Secadores",
          "Pentes",
          "Prendedores de Cabelo"
        ]
      },
      {
        "name": "Unha",
        "children": [
          "Algodão",
          "Base e Fortificantes",
          "Esmaltes",
          "Removedores",
          "Acessórios",
          "Lixas e Alicate",
          "Tratamento"
        ]
      },
      {
        "name": "Perfumes",
        "children": [
          "Feminino",
          "Masculino",
          "Unissex",
          "Infantil"
        ]
      },
      {
        "name": "Produtos Asiáticos",
        "children": [
          "K-Beauty",
          "J-Beauty"
        ]
      }
    ]
  },
  {
    "name": "Beleza Premium",
    "children": [
      {
        "name": "Perfumes Importados",
        "children": []
      },
      {
        "name": "Skincare Premium",
        "children": []
      },
      {
        "name": "Cabelos Profissionais",
        "children": []
      },
      {
        "name": "Maquiagem",
        "children": []
      }
    ]
  },
  {
    "name": "Cuidados Diários",
    "children": [
      {
        "name": "Higiene Pessoal",
        "children": [
          "Shampoo",
          "Desodorantes",
          "Condicionador",
          "Sabonetes",
          "Absorventes",
          "Algodão e Hastes Flexíveis",
          "Lenços de Papel",
          "Talcos",
          "Antissépticos",
          "Banho",
          "Protetores Descartáveis"
        ]
      },
      {
        "name": "Higiene Bucal",
        "children": [
          "Escovas Dentais",
          "Escovas Interdentais",
          "Cremes Dentais",
          "Acessórios",
          "Anti-Sépticos Bucais",
          "Fios Dentais e Passadores",
          "Fixadores de dentadura",
          "Escova Elétrica"
        ]
      },
      {
        "name": "Depilação",
        "children": [
          "Ceras Depilatórias",
          "Lâminas Depilatórias",
          "Folhas Depilatórias",
          "Cremes Depilatórios"
        ]
      },
      {
        "name": "Cuidados Masculinos",
        "children": [
          "Aparelhos de Barbear",
          "Barba",
          "Cabelo"
        ]
      },
      {
        "name": "Conveniência",
        "children": [
          "Revistas",
          "Balas",
          "Chicletes",
          "Pastilhas",
          "Papel Higiênico",
          "Pilhas e Baterias",
          "Sacolas"
        ]
      },
      {
        "name": "Repelentes",
        "children": [
          "Aerosol",
          "Loção",
          "Spray",
          "Gel",
          "Elétrico"
        ]
      },
      {
        "name": "Cuidados com os Pés",
        "children": [
          "Desodorante",
          "Hidratantes",
          "Esfoliantes",
          "Lixas",
          "Palmilhas",
          "Calcanheiras",
          "Acessórios Diversos"
        ]
      }
    ]
  },
  {
    "name": "Pet",
    "children": [
      {
        "name": "Medicamentos Pet",
        "children": [
          "Antipulgas e Carrapatos",
          "Anti-Inflamatórios Pet",
          "Antiparasitário Pet",
          "Antibiótico Pet",
          "Antialérgico Pet",
          "Antiestresse Pet",
          "Remédio para Dermatite Pet",
          "Regenerador Articular Pet"
        ]
      },
      {
        "name": "Vida Saudável Pet",
        "children": [
          "Probióticos Pet",
          "Vitaminas e Suplementos Pet",
          "Outros Produtos de Saúde Pet"
        ]
      },
      {
        "name": "Higiene e Limpeza Pet",
        "children": [
          "Shampoo Pet",
          "Tapetes Higiênicos Pet"
        ]
      }
    ]
  },
  {
    "name": "Marcas Exclusivas",
    "children": [
      {
        "name": "Needs",
        "children": []
      },
      {
        "name": "Bwell",
        "children": []
      },
      {
        "name": "Nutrigood",
        "children": []
      },
      {
        "name": "Natz",
        "children": []
      },
      {
        "name": "Caretech",
        "children": []
      }
    ]
  }
];

export const footerGroups: { group: string; icons: boolean; items: { name: string; icon: string }[] }[] =
  [
  {
    "group": "Institucional",
    "icons": false,
    "items": [
      {
        "name": "Nossa História",
        "icon": ""
      },
      {
        "name": "Nossas farmácias",
        "icon": ""
      },
      {
        "name": "Sustentabilidade",
        "icon": ""
      },
      {
        "name": "Ética e Compliance",
        "icon": ""
      },
      {
        "name": "Trabalhe Conosco",
        "icon": ""
      },
      {
        "name": "Imprensa",
        "icon": ""
      },
      {
        "name": "Investidores",
        "icon": ""
      },
      {
        "name": "Blog",
        "icon": ""
      },
      {
        "name": "Vitat",
        "icon": ""
      },
      {
        "name": "Mais Buscados",
        "icon": ""
      },
      {
        "name": "Bulas de A a Z",
        "icon": ""
      },
      {
        "name": "Todas as Categorias",
        "icon": ""
      },
      {
        "name": "Todas as Classes Terapêuticas",
        "icon": ""
      },
      {
        "name": "Todos os Princípios Ativos",
        "icon": ""
      },
      {
        "name": "Todas as Lojas Parceiras",
        "icon": ""
      },
      {
        "name": "Todas as Marcas",
        "icon": ""
      },
      {
        "name": "Todas as Campanhas",
        "icon": ""
      }
    ]
  },
  {
    "group": "Serviços",
    "icons": false,
    "items": [
      {
        "name": "Programa Mais Saúde",
        "icon": ""
      },
      {
        "name": "Farmacêutico Drogasil",
        "icon": ""
      },
      {
        "name": "Serviços de Saúde",
        "icon": ""
      },
      {
        "name": "Vacinação Corporativa",
        "icon": ""
      },
      {
        "name": "Manipulação",
        "icon": ""
      },
      {
        "name": "Univers",
        "icon": ""
      },
      {
        "name": "Compre e Retire",
        "icon": ""
      },
      {
        "name": "Compra Programada",
        "icon": ""
      },
      {
        "name": "Seus Pontos stix",
        "icon": ""
      },
      {
        "name": "Programa de Laboratório",
        "icon": ""
      }
    ]
  },
  {
    "group": "Perfil",
    "icons": false,
    "items": [
      {
        "name": "Criar novo cadastro",
        "icon": ""
      },
      {
        "name": "Alterar dados pessoais",
        "icon": ""
      },
      {
        "name": "Editar endereços",
        "icon": ""
      },
      {
        "name": "Acompanhar um pedido",
        "icon": ""
      }
    ]
  },
  {
    "group": "Atendimento",
    "icons": false,
    "items": [
      {
        "name": "Central de Atendimento",
        "icon": ""
      },
      {
        "name": "Tire suas dúvidas por Whatsapp",
        "icon": ""
      },
      {
        "name": "Como comprar no site",
        "icon": ""
      },
      {
        "name": "Formas de pagamento",
        "icon": ""
      },
      {
        "name": "Prazo de entrega",
        "icon": ""
      },
      {
        "name": "Reembolso",
        "icon": ""
      },
      {
        "name": "Troca",
        "icon": ""
      },
      {
        "name": "Devolução",
        "icon": ""
      }
    ]
  },
  {
    "group": "Segurança e privacidade",
    "icons": false,
    "items": [
      {
        "name": "Como protegemos seus dados",
        "icon": ""
      },
      {
        "name": "Política de Privacidade",
        "icon": ""
      },
      {
        "name": "Portal do Titular dos Dados",
        "icon": ""
      },
      {
        "name": "Segurança digital",
        "icon": ""
      }
    ]
  },
  {
    "group": "Nossas redes",
    "icons": true,
    "items": [
      {
        "name": "Facebook",
        "icon": "rdicon-facebook"
      },
      {
        "name": "Instagram",
        "icon": "rdicon-instagram"
      },
      {
        "name": "Twitter",
        "icon": "rdicon-twitter"
      },
      {
        "name": "LinkedIn",
        "icon": "rdicon-linkedin"
      }
    ]
  }
];

export const paymentMethods: { alt: string; image: string }[] = [
  {
    "alt": "Visa",
    "image": "https://img-raiadrogasil.s3.amazonaws.com/home/Footer/Pagamento/Visa.svg"
  },
  {
    "alt": "MasterCard",
    "image": "https://img-raiadrogasil.s3.amazonaws.com/home/Footer/Pagamento/Master.svg"
  },
  {
    "alt": "Amex",
    "image": "https://img-raiadrogasil.s3.amazonaws.com/home/Footer/Pagamento/Amex.svg"
  },
  {
    "alt": "Diners",
    "image": "https://img-raiadrogasil.s3.amazonaws.com/home/Footer/Pagamento/Diners.svg"
  },
  {
    "alt": "Elo",
    "image": "https://img-raiadrogasil.s3.amazonaws.com/home/Footer/Pagamento/Elo.svg"
  },
  {
    "alt": "JCB",
    "image": "https://img-raiadrogasil.s3.amazonaws.com/home/Footer/Pagamento/JCB.svg"
  },
  {
    "alt": "Nupay",
    "image": "https://img-raiadrogasil.s3.us-east-1.amazonaws.com/home/Footer/Nupay.svg"
  },
  {
    "alt": "Pix",
    "image": "https://img-raiadrogasil.s3.amazonaws.com/home/Footer/Pagamento/Pix.svg"
  }
];

export const alsoBought: CarouselProduct[] = [
  {
    "name": "Esmalte Cremoso Risqué Nosso Metaverso 8ml - Start no Seu Poder",
    "image": "https://product-data.raiadrogasil.io/images/3517262.webp",
    "qty": "8ml"
  },
  {
    "name": "Regulador Intestinal FiberMais Sabor Laranja 170g",
    "image": "https://product-data.raiadrogasil.io/images/20137234.webp",
    "qty": "170g"
  },
  {
    "name": "Enxaguante Bucal Colgate Total 12 Clean Mint 250ml",
    "image": "https://product-data.raiadrogasil.io/images/19166661.webp",
    "qty": "250ml"
  },
  {
    "name": "Hidratante Corporal Needs Restaurador Rosa Mosqueta e Niacinamida 400ml",
    "image": "https://product-data.raiadrogasil.io/images/10903374.webp",
    "qty": "400ml"
  },
  {
    "name": "Shampoo Masculino Reyou Multi Cabelo, Barba e Corpo 300ml",
    "image": "https://product-data.raiadrogasil.io/images/19424493.webp",
    "qty": "300ml"
  },
  {
    "name": "Batom Líquido Longa Duração Maybelline SuperStay Matte Ink 5ml - 80 Ruler",
    "image": "https://product-data.raiadrogasil.io/images/3544182.webp",
    "qty": "5ml"
  },
  {
    "name": "Curativo 3M Nexcare À Prova D&#x27;Água Sortidos com 12 unidades",
    "image": "https://product-data.raiadrogasil.io/images/16411083.webp",
    "qty": "12un"
  },
  {
    "name": "Esmalte Cremoso Dailus Atrás do Arco-Íris 8ml - Chifre Mágico",
    "image": "https://product-data.raiadrogasil.io/images/3688639.webp",
    "qty": "8un"
  },
  {
    "name": "Protetor Ocular Infantil Needs Ilustrado 20 Unidades",
    "image": "https://product-data.raiadrogasil.io/images/3456990.webp",
    "qty": "20un"
  },
  {
    "name": "Polivitamínico Vitasay 50+ Mulher A-Z 60 comprimidos",
    "image": "https://product-data.raiadrogasil.io/images/3463292.webp",
    "qty": "60s"
  },
  {
    "name": "Escova de Cabelo Marco Boni Disney Pequena Sereia Bege Pequeno - 1 unidade",
    "image": "https://product-data.raiadrogasil.io/images/6923196.webp",
    "qty": "1un"
  },
  {
    "name": "Gloss Labial Lip Oil Plump Ice Dailus feat. Mentos 4ml - Grape",
    "image": "https://product-data.raiadrogasil.io/images/3834292.webp",
    "qty": "4ml"
  }
];

export const similarProducts: CarouselProduct[] = [
  {
    "name": "Caneta Aplicadora de Insulina Novopen 4 com 1 unidade",
    "image": "https://product-data.raiadrogasil.io/images/3711677.webp",
    "qty": "1un"
  },
  {
    "name": "Caneta Aplicadora de Insulina HumaPen Ergo II com 1 unidade",
    "image": "https://product-data.raiadrogasil.io/images/3450149.webp",
    "qty": "1un"
  },
  {
    "name": "Agulha para Caneta Aplicadora de Insulina Novofine 32G 4mm 100 unidades",
    "image": "https://product-data.raiadrogasil.io/images/3712190.webp",
    "qty": "100un"
  },
  {
    "name": "Agulha para Caneta Aplicadora de Insulina Novofine 32G 6mm 100 unidades",
    "image": "https://product-data.raiadrogasil.io/images/3712192.webp",
    "qty": "100un"
  },
  {
    "name": "Agulha Accu Fine 4mm para Caneta Aplicadora de Insulina com 100 unidades",
    "image": "https://product-data.raiadrogasil.io/images/3492472.webp",
    "qty": "100un"
  },
  {
    "name": "Agulha para Caneta Aplicadora de Insulina BD Ultra-Fine 5mm 100 unidades",
    "image": "https://product-data.raiadrogasil.io/images/19906440.webp",
    "qty": "100un"
  },
  {
    "name": "Agulha para Caneta Aplicadora de Insulina BD Ultra-Fine 4mm 10 unidades",
    "image": "https://product-data.raiadrogasil.io/images/19906606.webp",
    "qty": "10un"
  },
  {
    "name": "Agulha para Caneta Aplicadora de Insulina BD Ultra-Fine 8mm 100 unidades",
    "image": "https://product-data.raiadrogasil.io/images/19898997.webp",
    "qty": "100un"
  },
  {
    "name": "Agulha para Caneta Aplicadora de Insulina BD Ultra-Fine Nano 4mm - 100 unidades",
    "image": "https://product-data.raiadrogasil.io/images/19906498.webp",
    "qty": "100un"
  },
  {
    "name": "Vitamina B12 Cloridrato de Hidroxocobalamina 2000 Mcg/Ml Solução Injetável 2 Ampolas 2,5 ml cada Biolab",
    "image": "https://product-data.raiadrogasil.io/images/16452990.webp",
    "qty": "2am"
  },
  {
    "name": "Zinco BioZinc Kids 2mg/0,5ml Infantil 75ml",
    "image": "https://product-data.raiadrogasil.io/images/16723356.webp",
    "qty": "75ml"
  },
  {
    "name": "Aplicador de Coletor Menstrual Fleurity",
    "image": "https://product-data.raiadrogasil.io/images/3487100.webp",
    "qty": "1un"
  }
];

export const footerInfoHtml = "<p>Raia Drogasil SA | DROGASIL | 61.585.865/0240-93 | I.E. 116.756.280.113 | Av. Nsa. Sra. Assunção, 638 | Butantã | São Paulo (SP) | CEP 05359-001 | Para dúvidas, elogios e reclamações acesse nossa <strong><a href=\"https://wa.me/551130048007\" target=\"_blank\" rel=\"noopener\"><span style=\"text-decoration: underline;\">Central de Atendimento no Whatsapp</span></a></strong> | Farmacêutico responsável: Gisele da Penha Barbosa | CRF 89453 | Polo Butantã (1714 e 1715 Raia e Drogasil) | AFE: 7.17094.5 | CMVS - 355030801-477-002443-1-7. As informações contidas neste site não devem ser usadas para automedicação e não substituem, em hipótese alguma, as orientações dadas pelo profissional da área médica. Somente o médico está apto a diagnosticar qualquer problema de saúde e prescrever o tratamento adequado. Ao persistirem os sintomas, um médico deverá ser consultado. Os preços e promoções divulgados no site são válidos apenas para compras feitas pela internet. Maiores esclarecimentos, consultar o site: www.anvisa.gov.br. A Raia Drogasil SA trabalha com as tecnologias mais avançadas de proteção de dados, para que você possa realizar suas compras com tranquilidade. A privacidade e a segurança dos clientes são compromissos da Raia Drogasil SA. Todos os pedidos efetuados estão sujeitos à confirmação da disponibilidade de produto em nosso estoque.</p>";
