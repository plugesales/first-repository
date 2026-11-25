import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import type { CertificateMetadata } from '@nfse-hub/nfse-types';
import { apiRequest } from '../lib/api';
import type { CompanySummary } from './CompaniesPage';

interface CertificatesPageProps {
  token: string;
  tenantId: string;
}

export function CertificatesPage({ token, tenantId }: CertificatesPageProps) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [certificates, setCertificates] = useState<CertificateMetadata[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [compList, certList] = await Promise.all([
        apiRequest<CompanySummary[]>('/companies', { token, tenantId }),
        apiRequest<CertificateMetadata[]>('/certificates', { token, tenantId }),
      ]);
      setCompanies(compList);
      setCertificates(certList);
      if (compList.length > 0 && !selectedCompanyId) {
        setSelectedCompanyId(compList[0].id);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar certificados.',
      );
    } finally {
      setLoading(false);
    }
  }, [token, tenantId, selectedCompanyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!selectedCompanyId || !file) return;

    setUploading(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('password', password);

      const saved = await apiRequest<CertificateMetadata>(
        `/companies/${selectedCompanyId}/certificate`,
        {
          method: 'POST',
          token,
          tenantId,
          formData,
        },
      );

      setPassword('');
      setFile(null);
      setMessage(
        `Certificado A1 (${saved.subjectDocument}) criptografado com AES-256-GCM e salvo no PostgreSQL.`,
      );
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Falha ao enviar certificado A1.',
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleVerify(certId: string) {
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest<{
        verified: boolean;
        mTlsReady: boolean;
        metadata: CertificateMetadata;
      }>(`/certificates/${certId}/verify`, {
        method: 'POST',
        token,
        tenantId,
      });
      setMessage(
        `Autenticação A1 validada em memória (${res.metadata.subjectDocument}). mTLS pronto: ${res.mTlsReady ? 'Sim' : 'Não'}.`,
      );
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha na validação do A1.',
      );
    }
  }

  async function handleRevoke(certId: string) {
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/certificates/${certId}`, {
        method: 'DELETE',
        token,
        tenantId,
      });
      setMessage('Certificado revogado.');
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao revogar certificado.',
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">
          Cofre de Certificados Digitais A1
        </h2>
        <p className="text-xs text-zinc-400">
          O arquivo <code>.pfx</code> e a senha são criptografados em repouso no
          PostgreSQL e carregados apenas em memória na VPS para mTLS e
          XMLDSig.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          {message}
        </div>
      )}

      <form
        onSubmit={handleUpload}
        className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-end"
      >
        <label className="text-xs text-zinc-300">
          Empresa Prestadora *
          <select
            required
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
          >
            <option value="">Selecione uma empresa...</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legalName} ({c.document})
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-300">
          Arquivo Certificado A1 (.pfx / .p12) *
          <input
            type="file"
            accept=".pfx,.p12"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-xs text-zinc-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-[#2A2D35] file:text-white hover:file:bg-[#353944]"
          />
        </label>

        <label className="text-xs text-zinc-300">
          Senha do Certificado *
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
          />
        </label>

        <div className="md:col-span-3 flex justify-end">
          <button
            type="submit"
            disabled={uploading || !selectedCompanyId || !file}
            className="inline-flex items-center gap-2 rounded-lg bg-[#F76415] hover:bg-[#e5590d] disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
          >
            <UploadCloud className="h-4 w-4" />
            <span>
              {uploading ? 'Criptografando...' : 'Enviar e Validar A1'}
            </span>
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-400">Carregando certificados...</p>
      ) : certificates.length === 0 ? (
        <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-8 text-center text-sm text-zinc-400">
          Nenhum certificado cadastrado.
        </div>
      ) : (
        <div className="space-y-3">
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-4 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#F76415]" />
                  <span className="font-medium text-sm text-white">
                    {cert.subjectName}
                  </span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      cert.status === 'ACTIVE'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : cert.status === 'EXPIRING_SOON'
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                          : 'border-red-500/40 bg-red-500/10 text-red-300'
                    }`}
                  >
                    {cert.status}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Doc: {cert.subjectDocument} · AC: {cert.issuerName} · Validade:{' '}
                  {new Date(cert.expiresAt).toLocaleDateString('pt-BR')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleVerify(cert.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A2D35] px-3 py-1.5 text-xs text-zinc-200 hover:bg-[#22252C]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Testar mTLS/A1</span>
                </button>
                {cert.isActive && (
                  <button
                    type="button"
                    onClick={() => void handleRevoke(cert.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Revogar</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-[#2A2D35] bg-[#181A1F] p-4 text-xs text-zinc-400 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-[#F76415] shrink-0" />
        <span>
          As chaves privadas nunca deixam o servidor nem são exibidas no
          navegador.
        </span>
      </div>
    </div>
  );
}

