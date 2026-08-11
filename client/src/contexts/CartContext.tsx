/**
 * RÉPLICA — estado do carrinho da PDP T.G.
 * Guarda itens por dosagem com quantidade, persistindo em localStorage.
 * Preços já consideram o desconto do dia (ver DISCOUNT_RATE em lib/pricing.ts).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { discounted } from "@/lib/pricing";
import { product } from "@/data/product";
import { trpc } from "@/lib/trpc";

export interface CartItem {
  dosage: string;
  qty: number;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  listTotal: number;
  savings: number;
  /** Adiciona respeitando o estoque; retorna quanto foi realmente adicionado. */
  addItem: (dosage: string, qty: number) => number;
  setQty: (dosage: string, qty: number) => void;
  removeItem: (dosage: string) => void;
  clear: () => void;
  /** Estoque disponível da dosagem no servidor (teto de 99 se não controlada). */
  stockFor: (dosage: string) => number;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "tg-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // Estoque real por dosagem: o carrinho nunca pode passar deste número, mesmo
  // somando cliques repetidos em "adicionar".
  const availability = trpc.store.availability.useQuery(undefined, {
    staleTime: 15_000,
  });

  const stockFor = useCallback(
    (dosage: string) => {
      const row = availability.data?.stock.find(
        (s: { dosage: string }) => s.dosage === dosage,
      );
      // Sem controle de estoque cadastrado: mantém um teto alto de segurança.
      return row ? row.available : 99;
    },
    [availability.data],
  );

  const addItem = useCallback(
    (dosage: string, qty: number) => {
      const limit = stockFor(dosage);
      let added = 0;

      setItems((prev) => {
        const found = prev.find((i) => i.dosage === dosage);
        const current = found?.qty ?? 0;
        const next = Math.min(limit, current + qty);
        added = next - current;

        if (added <= 0) return prev;
        if (found) {
          return prev.map((i) =>
            i.dosage === dosage ? { ...i, qty: next } : i,
          );
        }
        return [...prev, { dosage, qty: next }];
      });

      return added;
    },
    [stockFor],
  );

  const setQty = useCallback(
    (dosage: string, qty: number) => {
      const limit = stockFor(dosage);
      setItems((prev) =>
        qty <= 0
          ? prev.filter((i) => i.dosage !== dosage)
          : prev.map((i) =>
              i.dosage === dosage ? { ...i, qty: Math.min(limit, qty) } : i,
            ),
      );
    },
    [stockFor],
  );

  // Se o estoque cair enquanto o carrinho está montado (outra compra levou as
  // últimas unidades), reduz os itens para um total ainda válido.
  useEffect(() => {
    if (!availability.data) return;
    setItems((prev) => {
      let changed = false;
      const next = prev
        .map((item) => {
          const limit = stockFor(item.dosage);
          if (item.qty <= limit) return item;
          changed = true;
          return { ...item, qty: limit };
        })
        .filter((item) => item.qty > 0);
      return changed ? next : prev;
    });
  }, [availability.data, stockFor]);

  const removeItem = useCallback((dosage: string) => {
    setItems((prev) => prev.filter((i) => i.dosage !== dosage));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const { count, subtotal, listTotal } = useMemo(() => {
    let count = 0;
    let subtotal = 0;
    let listTotal = 0;
    for (const i of items) {
      const list = product.dosagePrices[i.dosage]?.to ?? 0;
      count += i.qty;
      subtotal += discounted(list) * i.qty;
      listTotal += list * i.qty;
    }
    return {
      count,
      subtotal: Math.round(subtotal * 100) / 100,
      listTotal: Math.round(listTotal * 100) / 100,
    };
  }, [items]);

  const value = useMemo(
    () => ({
      items,
      count,
      subtotal,
      listTotal,
      savings: Math.round((listTotal - subtotal) * 100) / 100,
      addItem,
      setQty,
      removeItem,
      clear,
      stockFor,
    }),
    [
      items,
      count,
      subtotal,
      listTotal,
      addItem,
      setQty,
      removeItem,
      clear,
      stockFor,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart deve ser usado dentro de CartProvider");
  return ctx;
}
