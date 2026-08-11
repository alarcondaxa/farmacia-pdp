# Spec de Replicação — PDP Drogasil (Mounjaro 15mg)

> **Tarefa de replicação.** O usuário enviou o HTML renderizado da página de produto
> `drogasil.com.br/mounjaro-15mg-...-1272202.html`. A referência é a **verdade absoluta**:
> fidelidade ao original prevalece sobre qualquer preferência estética.

## Abordagem escolhida
Replicar fielmente o design system da Drogasil (Pulso), reconstruído em React + Tailwind.

## Tokens extraídos do CSS original
| Token | Valor |
| --- | --- |
| Vermelho logo | `#EB3C4D` |
| Vermelho ação / ícones | `#B6202F` |
| Vermelho hover / preço | `#941925` |
| Rosa claro (hover bg) | `#FDE7EA` |
| Fundo da página | `#F2F2F2` |
| Superfície / cards | `#FFFFFF` |
| Texto forte | `#303030` |
| Texto médio | `#575757` |
| Texto suave | `#6B6B6B` |
| Borda clara | `#E6E6E6` |
| Borda média | `#D1D1D1` |
| Verde sucesso (frete) | `#0E7A3C` |

- Raios: cards `16px`, blocos externos `24px`, botões/chips pill `999px`.
- Tipografia: `rdModern` no original → substituída por **Manrope** (geometria/altura-x próximas) com fallback system-ui.
- Escala: 12px (auxiliar), 14px (corpo), 16px (título de item), 20–24px (preço/H2).

## Estrutura da página (ordem fiel ao original)
1. Header branco: logo SVG (4 pétalas + wordmark), busca "Buscar na Drogasil",
   ações "Compra rápida com receita", "Boas-vindas! / Entrar ou cadastrar",
   "Acompanhar pedidos", carrinho.
2. Barra secundária: botão de CEP + "Todas as categorias" com mega-menu de 9 categorias.
3. Breadcrumb: Página Inicial › Medicamentos › Remédios › Para Diabetes › produto.
4. Bloco PDP em card branco: galeria (badge "6x em 2+ un"), título, tarja de
   "Medicamento de geladeira e controlado", atributos, seletor de dosagem (+6),
   bullets curtos, caixas legais em maiúsculas, coluna de preço R$ 3.499,00
   (de R$ 3.811,36), botão comprar, cálculo de frete por CEP.
5. Descrição do produto (Para que serve / Como usar / Quando não devo usar) +
   painel lateral de Marca/Quantidade/Princípio ativo e tabela de Características.
6. Carrosséis "Quem comprou, também se interessou" e "Similares que você pode se interessar".
7. Bloco Bula com aviso de automedicação.
8. Footer: cards Central de atendimento / Baixe o app, 6 colunas de links,
   formas de pagamento, selos e texto legal Raia Drogasil.

## Style Decisions
- Nenhuma reinterpretação criativa: cores, raios, pesos e espaçamentos seguem o CSS extraído.
- Elementos sem backend (busca, carrinho, comprar) exibem toast "Funcionalidade de demonstração".
- Imagens reais dos produtos são carregadas do CDN público citado no HTML original.
