import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import { apiRequest } from '../lib/api';

interface AuditItem {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
}

export function SettingsPage({
  token,
  principal,
}: {
  token: string;
  principal: AuthenticatedPrincipal;
}) {
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiRequest<AuditItem[]>('/audit?limit=30', {
      token,
      tenantId: principal.tenantId,
    })
      .then(setLogs)
      .catch((err: unknown) =>
        setError(
          err instanceof Error
            ? err.message
            : 'Sem permissão ou erro ao carregar auditoria.',
        ),
      );
  }, [token, principal.tenantId]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-5 space-y-2">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Shield className="h-4 w-4 text-[#F76415]" />
          <span>Sessão e Isolamento Multi-tenant</span>
        </div>
        <p className="text-xs text-zinc-400">
          Usuário: <strong className="text-zinc-200">{principal.email}</strong>{' '}
          · Papel RBAC:{' '}
          <strong className="text-zinc-200">{principal.role}</strong> · Tenant:{' '}
          <code>{principal.tenantId}</code> · Provedor:{' '}
          <code>{principal.authProvider}</code>
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white">
          Trilha de Auditoria Recente
        </h3>
        {error && (
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            {error}
          </p>
        )}
        {logs.length === 0 ? (
          <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-6 text-xs text-zinc-400">
            Nenhum evento de auditoria encontrado.
          </div>
        ) : (
          <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] divide-y divide-[#2A2D35]">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-medium text-white">{log.action}</span>{' '}
                  <span className="text-zinc-400">
                    ({log.resource} {log.resourceId ?? ''})
                  </span>
                </div>
                <div className="text-zinc-500">
                  {log.user?.email ?? 'sistema'} ·{' '}
                  {new Date(log.createdAt).toLocaleString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

