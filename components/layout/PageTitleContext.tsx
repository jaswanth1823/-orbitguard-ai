'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type { DataSourceMode } from '@/lib/types';

interface PageTitleState {
  title: string;
  subtitle?: string;
  dataSource?: DataSourceMode;
}

interface PageTitleContextValue {
  state: PageTitleState;
  setTitle: (state: PageTitleState) => void;
}

const PageTitleContext = createContext<PageTitleContextValue>({
  state: { title: 'OrbitGuard AI' },
  setTitle: () => {},
});

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PageTitleState>({ title: 'OrbitGuard AI' });

  const setTitle = useCallback((next: PageTitleState) => {
    setState(next);
  }, []);

  return (
    <PageTitleContext.Provider value={{ state, setTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle() {
  return useContext(PageTitleContext);
}
