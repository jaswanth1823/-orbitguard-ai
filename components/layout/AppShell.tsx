'use client';

import { useEffect } from 'react';
import { usePageTitle } from './PageTitleContext';
import type { DataSourceMode } from '@/lib/types';

interface AppShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  dataSource?: DataSourceMode;
}

/**
 * AppShell no longer renders Sidebar or TopBar — those live in the root layout
 * and persist across navigations. This component only pushes the per-page
 * title/subtitle into context so the shared TopBar can display them.
 */
export function AppShell({ children, title, subtitle, dataSource }: AppShellProps) {
  const { setTitle } = usePageTitle();

  useEffect(() => {
    setTitle({ title, subtitle, dataSource });
  }, [title, subtitle, dataSource, setTitle]);

  return <>{children}</>;
}
