import type { ReactNode } from 'react';

export function StudioPage({ title, subtitle, status, children }: { title: string; subtitle: string; status?: string; children: ReactNode }) {
  return <div className="studio-page"><header className="studio-page-header"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="studio-status" role="status">{status}</div></header>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="studio-empty"><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
