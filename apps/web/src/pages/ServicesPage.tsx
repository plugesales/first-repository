import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { CompanySummary } from './CompaniesPage';

export interface ServiceCatalogItem {
  id: string;
  companyId: string;
  nationalTaxCode: string;
  municipalTaxCode: string;
  nbsCode: string | null;
  description: string;
  defaultIssRate: string | null;
  issWithheldDefault: boolean;
}

export function ServicesPage({
  token,
  tenantId,
}: {
  token: string;
  tenantId: string;
}) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [nationalTaxCode, setNationalTaxCode] = useState('170601');
  const [municipalTaxCode, setMunicipalTaxCode] = useState('');
  const [description, setDescription] = useState('');
  const [defaultIssRate, setDefaultIssRate] = useState('5.00');
  const [issWithheldDefault, setIssWithheldDefault] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [comps, servs] = await Promise.all([
        apiRequest<CompanySummary[]>('/companies', { token, tenantId }),
        apiRequest<ServiceCatalogItem[]>('/services', { token, tenantId }),
      ]);
      setCompanies(comps);
      setServices(servs);
      if (comps.length > 0 && !companyId) {
        setCompanyId(comps[0].id);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar serviços.',
      );
    }
  }, [token, tenantId, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openNewForm() {
    setEditingId(null);
    setNationalTaxCode('170601');
    setMunicipalTaxCode('');
    setDescription('');
    setDefaultIssRate('5.00');
    setIssWithheldDefault(false);
    setShowForm(true);
  }

  function startEdit(s: ServiceCatalogItem) {
    setEditingId(s.id);
    setCompanyId(s.companyId);
    setNationalTaxCode(s.nationalTaxCode);
    setMunicipalTaxCode(s.municipalTaxCode ?? '');
    setDescription(s.description);
    setDefaultIssRate(s.defaultIssRate ?? '5.00');
    setIssWithheldDefault(s.issWithheldDefault);
    setShowForm(true);
  }

  async function handleDelete(s: ServiceCatalogItem) {
    if (!window.confirm(`Excluir o serviço "${s.nationalTaxCode} - ${s.description}"?`)) return;
    setError(null);
    try {
      await apiRequest(`/services/${s.id}`, {
        method: 'DELETE',
        token,
        tenantId,
      });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao excluir serviço.',
      );
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body = {
        companyId,
        nationalTaxCode,
        municipalTaxCode: municipalTaxCode.trim(),
        description,
        defaultIssRate: defaultIssRate ? Number(defaultIssRate) : undefined,
        issWithheldDefault,
      };
      if (editingId) {
        await apiRequest(`/services/${editingId}`, {
          method: 'PATCH',
          token,
          tenantId,
          body,
        });
      } else {
        await apiRequest('/services', {
          method: 'POST',
          token,
          tenantId,
          body,
        });
      }
      setEditingId(null);
      setDescription('');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar serviço.',
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Catálogo de Serviços Tributários
          </h2>
          <p className="text-xs text-zinc-400">
            Códigos de tributação nacional (`cTribNac`), municipal e alíquotas
            padrão por empresa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (showForm && !editingId ? setShowForm(false) : openNewForm())}
          className="inline-flex items-center gap-2 rounded-lg bg-[#F76415] hover:bg-[#e5590d] px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          <span>Novo Serviço</span>
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
          <div className="md:col-span-2 flex items-center justify-between border-b border-[#2A2D35] pb-2">
            <span className="text-sm font-medium text-white">
              {editingId ? 'Editar Serviço' : 'Novo Serviço'}
            </span>
          </div>
          <label className="text-xs text-zinc-300">
            Empresa *
            <select
              required
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
            >
              <option value="">Selecione...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legalName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-300">
            Código Tributação Nacional (6 dígitos) *
            <input
              required
              value={nationalTaxCode}
              onChange={(e) => setNationalTaxCode(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Código Municipal (opcional — vazio em Brasília/DF)
            <input
              value={municipalTaxCode}
              onChange={(e) => setMunicipalTaxCode(e.target.value)}
              placeholder="Deixe vazio se não aplicável"
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Alíquota ISS Padrão (%)
            <input
              type="number"
              step="0.01"
              min="0"
              max="10"
              value={defaultIssRate}
              onChange={(e) => setDefaultIssRate(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="md:col-span-2 text-xs text-zinc-300">
            Descrição Padrão do Serviço *
            <textarea
              required
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={issWithheldDefault}
              onChange={(e) => setIssWithheldDefault(e.target.checked)}
            />
            <span>ISS retido por padrão</span>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[#2A2D35] px-4 py-2 text-sm text-zinc-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#F76415] hover:bg-[#e5590d] px-4 py-2 text-sm font-medium text-white"
            >
              Salvar Serviço
            </button>
          </div>
        </form>
      )}

      {services.length === 0 ? (
        <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-8 text-center text-sm text-zinc-400">
          Nenhum serviço cadastrado ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-4 flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-3 min-w-0">
                <Wrench className="h-5 w-5 text-[#F76415] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    cTribNac {s.nationalTaxCode}
                    {s.municipalTaxCode ? ` · cTribMun ${s.municipalTaxCode}` : ''}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">{s.description}</p>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    ISS: {s.defaultIssRate ?? '0'}% ·{' '}
                    {s.issWithheldDefault ? 'Retido' : 'Não retido'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(s)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#2A2D35] hover:border-[#F76415]/60 px-2.5 py-1.5 text-xs text-zinc-200"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Editar</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(s)}
                  className="inline-flex items-center rounded-lg border border-[#2A2D35] hover:border-red-500/60 px-2 py-1.5 text-xs text-red-400"
                  title="Excluir serviço"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

