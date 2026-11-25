import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { CompanySummary } from './CompaniesPage';
import type { CustomerSummary } from './CustomersPage';
import type { ServiceCatalogItem } from './ServicesPage';

function localTodayDateString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function IssueInvoicePage({
  token,
  tenantId,
}: {
  token: string;
  tenantId: string;
}) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);

  const [companyId, setCompanyId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerDoc, setCustomerDoc] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [addrZipCode, setAddrZipCode] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrNumber, setAddrNumber] = useState('');
  const [addrDistrict, setAddrDistrict] = useState('');
  const [addrCityCode, setAddrCityCode] = useState('');
  const [serviceCode, setServiceCode] = useState('170601');
  const [municipalTaxCode, setMunicipalTaxCode] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('1000.00');
  const [issRate, setIssRate] = useState('2.00');
  const [issWithheld, setIssWithheld] = useState(false);
  const [competenceDate, setCompetenceDate] = useState(localTodayDateString);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const loadRefs = useCallback(async () => {
    try {
      const [comps, custs, servs] = await Promise.all([
        apiRequest<CompanySummary[]>('/companies', { token, tenantId }),
        apiRequest<CustomerSummary[]>('/customers', { token, tenantId }),
        apiRequest<ServiceCatalogItem[]>('/services', { token, tenantId }),
      ]);
      setCompanies(comps);
      setCustomers(custs);
      setServices(servs);
      if (comps.length > 0 && !companyId) {
        setCompanyId(comps[0].id);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar referências.',
      );
    }
  }, [token, tenantId, companyId]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  function handleCustomerPick(id: string) {
    setSelectedCustomerId(id);
    const found = customers.find((c) => c.id === id);
    if (found) {
      setCustomerDoc(found.document);
      setCustomerName(found.name);
      setCustomerEmail(found.email ?? '');
      setAddrZipCode(found.zipCode ?? '');
      setAddrStreet(found.street ?? '');
      setAddrNumber(found.number ?? '');
      setAddrDistrict(found.district ?? '');
      setAddrCityCode(found.cityCode ?? '');
    }
  }

  function handleServicePick(id: string) {
    const found = services.find((s) => s.id === id);
    if (found) {
      setServiceCode(found.nationalTaxCode);
      setMunicipalTaxCode(found.municipalTaxCode ?? '');
      setDescription(found.description);
      if (found.defaultIssRate) setIssRate(found.defaultIssRate);
      setIssWithheld(found.issWithheldDefault);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const company = companies.find((c) => c.id === companyId);
    if (!company) return;

    setSubmitting(true);
    setError(null);
    setCreatedId(null);

    try {
      const invoice = await apiRequest<{ id: string; status: string }>(
        '/invoices',
        {
          method: 'POST',
          token,
          tenantId,
          body: {
            companyId: company.id,
            customerId: selectedCustomerId || undefined,
            municipalityCode: company.municipalityCode,
            serviceCode,
            municipalTaxCode: municipalTaxCode.trim() || undefined,
            competenceDate,
            customer: {
              document: customerDoc,
              name: customerName,
              email: customerEmail || undefined,
              ...(addrZipCode || addrStreet || addrCityCode
                ? {
                    address: {
                      zipCode: addrZipCode || undefined,
                      street: addrStreet || undefined,
                      number: addrNumber || undefined,
                      district: addrDistrict || undefined,
                      cityCode: addrCityCode || company.municipalityCode,
                    },
                  }
                : {}),
            },
            service: {
              description,
              amount: Number(amount),
              issRate: Number(issRate),
              issWithheld,
            },
            idempotencyKey: crypto.randomUUID(),
          },
        },
      );
      setCreatedId(invoice.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao enfileirar emissão.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Emissão de NFS-e</h2>
        <p className="text-xs text-zinc-400">
          Enfileira a DPS via Transactional Outbox para assinatura XMLDSig e
          transmissão mTLS pelo Worker na VPS.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}
      {createdId && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          Solicitação registrada e enfileirada com sucesso (ID:{' '}
          <code>{createdId}</code>). Acompanhe o processamento em Notas Fiscais.
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <label className="text-xs text-zinc-300">
          Empresa Prestadora *
          <select
            required
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
          >
            <option value="">Selecione...</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legalName} ({c.document}) — IBGE {c.municipalityCode}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-300">
          Data de Competência *
          <input
            type="date"
            required
            value={competenceDate}
            onChange={(e) => setCompetenceDate(e.target.value)}
            className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-300">
          Preencher por Tomador Cadastrado (opcional)
          <select
            value={selectedCustomerId}
            onChange={(e) => handleCustomerPick(e.target.value)}
            className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
          >
            <option value="">Tomador avulso...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.document})
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-300">
          Preencher por Serviço do Catálogo (opcional)
          <select
            onChange={(e) => handleServicePick(e.target.value)}
            className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
          >
            <option value="">Informar manualmente...</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nationalTaxCode} — {s.description.slice(0, 45)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-300">
          CPF/CNPJ do Tomador *
          <input
            required
            value={customerDoc}
            onChange={(e) => setCustomerDoc(e.target.value)}
            className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-300">
          Nome / Razão Social do Tomador *
          <input
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-300">
          Código Tributação Nacional (6 dígitos) *
          <input
            required
            pattern="\d{6}"
            value={serviceCode}
            onChange={(e) => setServiceCode(e.target.value)}
            placeholder="010101"
            className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
          />
          <span className="text-[10px] text-zinc-400">Ex: 010101 (sempre 6 dígitos)</span>
        </label>

        <label className="text-xs text-zinc-300">
          Código Tributação Municipal (3 dígitos - CTISS BH)
          <input
            maxLength={3}
            value={municipalTaxCode}
            onChange={(e) => setMunicipalTaxCode(e.target.value)}
            placeholder="001"
            className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
          />
          <span className="text-[10px] text-zinc-400">Ex: 001 (sempre até 3 dígitos)</span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-300">
            Valor (R$) *
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Alíquota ISS (%)
            <input
              type="number"
              step="0.01"
              min="0"
              max="10"
              value={issRate}
              onChange={(e) => setIssRate(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="md:col-span-2 text-xs text-zinc-300">
          Discriminação dos Serviços *
          <textarea
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={issWithheld}
            onChange={(e) => setIssWithheld(e.target.checked)}
          />
          <span>ISS Retido pelo Tomador</span>
        </label>

        {issWithheld && (
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-5 gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="md:col-span-5 text-[11px] text-amber-300">
              Regra SEFIN E0237: quando o ISSQN é retido pelo tomador, informe o endereço nacional completo do tomador.
            </div>
            <label className="text-xs text-zinc-300">
              CEP *
              <input
                required={issWithheld}
                value={addrZipCode}
                onChange={(e) => setAddrZipCode(e.target.value)}
                placeholder="30130000"
                className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-1.5 text-sm text-white"
              />
            </label>
            <label className="md:col-span-2 text-xs text-zinc-300">
              Logradouro *
              <input
                required={issWithheld}
                value={addrStreet}
                onChange={(e) => setAddrStreet(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-300">
              Número *
              <input
                required={issWithheld}
                value={addrNumber}
                onChange={(e) => setAddrNumber(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-300">
              Bairro *
              <input
                required={issWithheld}
                value={addrDistrict}
                onChange={(e) => setAddrDistrict(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-300">
              IBGE Município *
              <input
                required={issWithheld}
                pattern="\d{7}"
                value={addrCityCode || companies.find((c) => c.id === companyId)?.municipalityCode || ''}
                onChange={(e) => setAddrCityCode(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-1.5 text-sm text-white"
              />
            </label>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !companyId}
            className="inline-flex items-center gap-2 rounded-lg bg-[#F76415] hover:bg-[#e5590d] disabled:opacity-50 px-5 py-2.5 text-sm font-medium text-white"
          >
            <Send className="h-4 w-4" />
            <span>{submitting ? 'Enfileirando...' : 'Solicitar Emissão'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

