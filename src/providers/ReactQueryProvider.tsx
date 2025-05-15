'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode, createContext, useContext } from 'react';

// Create a context for global state
type GlobalState = {
  selectedAdId: string | null;
  setSelectedAdId: (id: string | null) => void;
};

const GlobalStateContext = createContext<GlobalState | undefined>(undefined);

// Hook to use the global state
export function useGlobalState() {
  const context = useContext(GlobalStateContext);
  if (context === undefined) {
    throw new Error('useGlobalState must be used within a ReactQueryProvider');
  }
  return context;
}

export function ReactQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1분
        refetchOnWindowFocus: false,
      },
    },
  }));

  // Add global state
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalStateContext.Provider value={{ selectedAdId, setSelectedAdId }}>
        {children}
      </GlobalStateContext.Provider>
    </QueryClientProvider>
  );
}