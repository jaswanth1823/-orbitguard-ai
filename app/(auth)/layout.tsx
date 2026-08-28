import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OrbitGuard AI — Authentication',
};

/** Clean layout for auth pages — no Sidebar or TopBar */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
