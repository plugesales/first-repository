import { useEffect, useState } from 'react';
import { PieChart } from 'lucide-react';
import { apiRequest } from '../lib/api';

export interface ReportsSummaryResponse {
  companiesCount: number;
  certificates: {
    active: number;
    expiringSoon: number;
    expired: number;
  };
  invoices: {
    total: number;
    byStatus: Record<string, number>;
    authorizedAmount: number;
    authorizedNetAmount: number;
  };
}

export function ReportsPage({
  token,
  tenantId,
}: {
  token: string;
  tenantId: string;
}) {
  const [summary, setSummary] = useState<ReportsSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiRequest<ReportsSummaryResponse>('/reports/summary', {
      token,
      tenantId,
    })
      .then(setSummary)
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : 'Erro ao gerar relatório.',
        ),
      );
  }, [token, tenantId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <PieChart className="h-5 w-5 text-[#F76415]" />
        <h2 className="text-lg font-semibold text-white">
          Relatórios Fiscais Consolidados
        </h2>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-5">
            <p className="text-xs text-zinc-400">Empresas Ativas</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {summary.companiesCount}
            </p>
          </div>
          <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-5">
            <p className="text-xs text-zinc-400">Certificados A1 Ativos</p>
            <p className="mt-2 text-2xl font-bold text-emerald-400">
              {summary.certificates.active}
            </p>
            <p className="text-[11px] text-amber-300 mt-1">
              {summary.certificates.expiringSoon} vencendo em 30 dias
            </p>
          </div>
          <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-5">
            <p className="text-xs text-zinc-400">Notas Emitidas (Total)</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {summary.invoices.total}
            </p>
            <p className="text-[11px] text-zinc-400 mt-1">
              Autorizadas: {summary.invoices.byStatus.AUTHORIZED ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-5">
            <p className="text-xs text-zinc-400">Faturamento Autorizado</p>
            <p className="mt-2 text-2xl font-bold text-[#F76415]">
              R$ {summary.invoices.authorizedAmount.toFixed(2)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

