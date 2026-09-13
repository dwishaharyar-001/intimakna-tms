import type { ReactNode } from 'react';
import { AuthShell } from '@/components/shell';

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
