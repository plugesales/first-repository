import { useCallback, useEffect, useState } from 'react';
import { Ban, FileCode2, FileDown, RefreshCw } from 'lucide-react';
import { API_BASE, apiRequest } from '../lib/api';

interface InvoiceListItem {
  id: string;
  providerCode: string;
  environment: string;
  status: string;
  invoiceNumber: string | null;
  accessKey: string | null;
  amount: string;
  competenceDate: string;
  lastErrorMsg: string | null;
  createdAt: string;
}

export function InvoicesPage({
  token,
  tenantId,
}: {
  token: string;
  tenantId: string;
}) {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<InvoiceListItem[]>('/invoices', {
        token,
        tenantId,
      });
      setInvoices(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao listar notas fiscais.',
      );
    } finally {
      setLoading(false);
    }
  }, [token, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadProtectedFile(
    path: string,
    filename: string,
  ): Promise<void> {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': tenantId,
        },
      });
      if (!res.ok) {
        throw new Error(`Erro HTTP ${res.status} ao baixar ${filename}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no download.');
    }
  }

  async function submitCancel(invoiceId: string) {
    setError(null);
    try {
      await apiRequest(`/invoices/${invoiceId}/cancel`, {
        method: 'POST',
        token,
        tenantId,
        body: {
          reasonCode: '1',
          reason: cancelReason,
        },
      });
      setCancellingId(null);
      setCancelReason('');
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao solicitar cancelamento.',
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Notas Fiscais</h2>
          <p className="text-xs text-zinc-400">
            Status em fila/autorização, download do XML oficial e DANFSe PDF.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-[#2A2D35] px-3 py-2 text-xs text-zinc-200 hover:bg-[#22252C]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Atualizar</span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-400">Carregando notas...</p>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-8 text-center text-sm text-zinc-400">
          Nenhuma emissão registrada até o momento.
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {inv.invoiceNumber
                        ? `NFS-e #${inv.invoiceNumber}`
                        : `Operação ${inv.id.slice(0, 8)}`}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-[#2A2D35] text-zinc-300">
                      {inv.status}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {inv.providerCode} · {inv.environment}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Valor: R$ {Number(inv.amount).toFixed(2)} · Competência:{' '}
                    {inv.competenceDate.slice(0, 10).split('-').reverse().join('/')}
                    {inv.accessKey ? ` · Chave: ${inv.accessKey}` : ''}
                  </p>
                  {inv.lastErrorMsg && (
                    <p className="text-xs text-amber-300 mt-1">
                      {inv.lastErrorMsg}
                    </p>
                  )}
                </div>

                {inv.status === 'AUTHORIZED' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void downloadProtectedFile(
                          `/invoices/${inv.id}/xml`,
                          `nfse-${inv.invoiceNumber ?? inv.id}.xml`,
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-[#2A2D35] px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-[#22252C]"
                    >
                      <FileCode2 className="h-3.5 w-3.5 text-[#F76415]" />
                      <span>XML</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void downloadProtectedFile(
                          `/invoices/${inv.id}/pdf`,
                          `danfse-${inv.invoiceNumber ?? inv.id}.pdf`,
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-[#2A2D35] px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-[#22252C]"
                    >
                      <FileDown className="h-3.5 w-3.5 text-emerald-400" />
                      <span>DANFSe PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancellingId(inv.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      <span>Cancelar</span>
                    </button>
                  </div>
                )}
              </div>

              {cancellingId === inv.id && (
                <div className="pt-3 border-t border-[#2A2D35] flex flex-wrap gap-2 items-center">
                  <input
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Justificativa do cancelamento (mínimo 15 caracteres)"
                    className="flex-1 min-w-[220px] rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-1.5 text-xs text-white"
                  />
                  <button
                    type="button"
                    disabled={cancelReason.trim().length < 15}
                    onClick={() => void submitCancel(inv.id)}
                    className="rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 px-3 py-1.5 text-xs text-white"
                  >
                    Confirmar Cancelamento
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancellingId(null)}
                    className="rounded-lg border border-[#2A2D35] px-3 py-1.5 text-xs text-zinc-300"
                  >
                    Fechar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

