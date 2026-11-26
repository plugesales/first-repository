import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Building2, Pencil, Plus, ShieldAlert, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';

export interface CompanySummary {
  id: string;
  legalName: string;
  tradeName: string | null;
  document: string;
  municipalReg: string | null;
  municipalityCode: string;
  simplesNacionalOpt: number | null;
  defaultDpsSeries?: string;
  environment: 'HOMOLOGATION' | 'PRODUCTION';
  activeCertificate: {
    id: string;
    type: string;
    subjectDocument: string;
    expiresAt: string;
    status: string;
  } | null;
}

const SIMPLES_LABELS: Record<number, string> = {
  1: '1 - Não optante pelo Simples Nacional',
  2: '2 - Optante Simples Nacional (MEI)',
  3: '3 - Optante Simples Nacional (ME/EPP)',
};

interface CompaniesPageProps {
  token: string;
  tenantId: string;
}

export function CompaniesPage({ token, tenantId }: CompaniesPageProps) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [legalName, setLegalName] = useState('');
  const [document, setDocument] = useState('');
  const [municipalReg, setMunicipalReg] = useState('');
  const [municipalityCode, setMunicipalityCode] = useState('5300108');
  const [simplesNacionalOpt, setSimplesNacionalOpt] = useState<string>('1');
  const [defaultDpsSeries, setDefaultDpsSeries] = useState<string>('3');
  const [environment, setEnvironment] = useState<'HOMOLOGATION' | 'PRODUCTION'>(
    'HOMOLOGATION',
  );

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<CompanySummary[]>('/companies', {
        token,
        tenantId,
      });
      setCompanies(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao listar empresas.',
      );
    } finally {
      setLoading(false);
    }
  }, [token, tenantId]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  function openNewForm() {
    setEditingId(null);
    setLegalName('');
    setDocument('');
    setMunicipalReg('');
    setMunicipalityCode('5300108');
    setSimplesNacionalOpt('1');
    setDefaultDpsSeries('3');
    setEnvironment('HOMOLOGATION');
    setShowForm(true);
  }

  function startEdit(company: CompanySummary) {
    setEditingId(company.id);
    setLegalName(company.legalName);
    setDocument(company.document);
    setMunicipalReg(company.municipalReg ?? '');
    setMunicipalityCode(company.municipalityCode);
    setSimplesNacionalOpt(String(company.simplesNacionalOpt ?? 1));
    setDefaultDpsSeries(company.defaultDpsSeries ?? '3');
    setEnvironment(company.environment);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await apiRequest(`/companies/${editingId}`, {
          method: 'PATCH',
          token,
          tenantId,
          body: {
            legalName,
            municipalReg: municipalReg.trim(),
            municipalityCode,
            simplesNacionalOpt: Number(simplesNacionalOpt),
            defaultDpsSeries: defaultDpsSeries.trim() || '3',
            environment,
          },
        });
      } else {
        await apiRequest('/companies', {
          method: 'POST',
          token,
          tenantId,
          body: {
            legalName,
            document,
            municipalReg: municipalReg.trim() || undefined,
            municipalityCode,
            simplesNacionalOpt: Number(simplesNacionalOpt),
            defaultDpsSeries: defaultDpsSeries.trim() || '3',
            environment,
          },
        });
      }
      setEditingId(null);
      setLegalName('');
      setDocument('');
      setMunicipalReg('');
      setShowForm(false);
      await loadCompanies();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar empresa.',
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Empresas do Escritório
          </h2>
          <p className="text-xs text-zinc-400">
            Cada prestador possui isolamento lógico e certificado digital A1
            próprio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (showForm ? setShowForm(false) : openNewForm())}
          className="inline-flex items-center gap-2 rounded-lg bg-[#F76415] hover:bg-[#e5590d] px-4 py-2 text-sm font-medium text-white transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Nova Empresa</span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-5 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div className="md:col-span-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {editingId ? 'Editar Empresa Prestadora' : 'Nova Empresa Prestadora'}
          </div>
          <label className="text-xs text-zinc-300">
            Razão Social *
            <input
              required
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <label className="text-xs text-zinc-300">
            CNPJ ou CPF *
            <input
              required
              disabled={Boolean(editingId)}
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              placeholder="Somente números ou formatado"
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white disabled:opacity-50 focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Inscrição Municipal (deixe em branco se o município CNC não exigir)
            <input
              value={municipalReg}
              onChange={(e) => setMunicipalReg(e.target.value)}
              placeholder="Opcional"
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Código IBGE Município (7 dígitos) *
            <input
              required
              pattern="\d{7}"
              value={municipalityCode}
              onChange={(e) => setMunicipalityCode(e.target.value)}
            className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Série DPS Padrão
            <input
              value={defaultDpsSeries}
              onChange={(e) => setDefaultDpsSeries(e.target.value)}
              placeholder="Ex.: 3"
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Opção Simples Nacional (opSimpNac)
            <select
              value={simplesNacionalOpt}
              onChange={(e) => setSimplesNacionalOpt(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            >
              <option value="1">{SIMPLES_LABELS[1]}</option>
              <option value="2">{SIMPLES_LABELS[2]}</option>
              <option value="3">{SIMPLES_LABELS[3]}</option>
            </select>
          </label>
          <label className="text-xs text-zinc-300">
            Ambiente Fiscal
            <select
              value={environment}
              onChange={(e) =>
                setEnvironment(
                  e.target.value as 'HOMOLOGATION' | 'PRODUCTION',
                )
              }
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            >
              <option value="HOMOLOGATION">Homologação</option>
              <option value="PRODUCTION">Produção</option>
            </select>
          </label>

          <div className="md:col-span-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[#2A2D35] px-4 py-2 text-sm text-zinc-300 hover:bg-[#22252C]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#F76415] hover:bg-[#e5590d] px-4 py-2 text-sm font-medium text-white"
            >
              Salvar Empresa
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-zinc-400">Carregando empresas...</p>
      ) : companies.length === 0 ? (
        <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-8 text-center text-sm text-zinc-400">
          Nenhuma empresa cadastrada neste escritório ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {companies.map((company) => (
            <div
              key={company.id}
              className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-5 w-5 text-[#F76415] shrink-0" />
                  <div>
                    <p className="font-medium text-white">{company.legalName}</p>
                    <p className="text-xs text-zinc-400">
                      Doc: {company.document} · IBGE {company.municipalityCode}
                      {company.municipalReg ? ` · IM: ${company.municipalReg}` : ' · Sem IM'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-[#2A2D35] text-zinc-300">
                    {company.environment}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(company)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#2A2D35] px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-[#22252C]"
                  >
                    <Pencil className="h-3 w-3" />
                    <span>Editar</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-[#2A2D35] flex items-center justify-between text-xs">
                {company.activeCertificate ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-400">
                    <ShieldCheck className="h-4 w-4" />
                    A1 ativo (vence{' '}
                    {new Date(
                      company.activeCertificate.expiresAt,
                    ).toLocaleDateString('pt-BR')}
                    )
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-amber-400">
                    <ShieldAlert className="h-4 w-4" />
                    Sem certificado A1 ativo
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

