/**
 * Localização do visitante a partir do CEP.
 *
 * O CEP é pedido na primeira visita (modal bloqueante) porque a disponibilidade
 * do lote promocional é apresentada por região. Fica salvo em localStorage para
 * não incomodar o cliente em visitas seguintes.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface CustomerLocation {
  cep: string;
  city: string;
  state: string;
  district?: string;
  address?: string;
}

interface LocationContextValue {
  location: CustomerLocation | null;
  /** Rótulo curto para exibir na interface, ex.: "São Paulo/SP". */
  label: string;
  /** Verdadeiro quando ainda não temos CEP e o modal deve aparecer. */
  needsCep: boolean;
  setLocation: (next: CustomerLocation) => void;
  clearLocation: () => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);
const STORAGE_KEY = "tg-location";

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocationState] = useState<CustomerLocation | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CustomerLocation) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (location) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [location]);

  const setLocation = useCallback((next: CustomerLocation) => {
    setLocationState(next);
  }, []);

  const clearLocation = useCallback(() => setLocationState(null), []);

  const value = useMemo(
    () => ({
      location,
      label: location ? `${location.city}/${location.state}` : "",
      needsCep: location === null,
      setLocation,
      clearLocation,
    }),
    [location, setLocation, clearLocation],
  );

  return (
    <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
  );
}

export function useCustomerLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error("useCustomerLocation deve ser usado dentro de LocationProvider");
  }
  return ctx;
}

/** Formata o CEP no padrão 00000-000 enquanto o cliente digita. */
export function maskCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}
