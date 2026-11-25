import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, Users } from 'lucide-react';
import { apiRequest } from '../lib/api';

export interface CustomerSummary {
  id: string;
  document: string;
  name: string;
  email: string | null;
  phone: string | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  district: string | null;
  cityCode: string | null;
}

export function CustomersPage({
  token,
  tenantId,
}: {
  token: string;
  tenantId: string;
}) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [document, setDocument] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [district, setDistrict] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<CustomerSummary[]>('/customers', {
        token,
        tenantId,
      });
      setCustomers(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao listar clientes.',
      );
    } finally {
      setLoading(false);
    }
  }, [token, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/customers', {
        method: 'POST',
        token,
        tenantId,
        body: {
          document,
          name,
          email: email || undefined,
          cityCode: cityCode || undefined,
          zipCode: zipCode || undefined,
          street: street || undefined,
          number: number || undefined,
          district: district || undefined,
        },
      });
      setDocument('');
      setName('');
      setEmail('');
      setCityCode('');
      setZipCode('');
      setStreet('');
      setNumber('');
      setDistrict('');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao cadastrar cliente.',
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Tomadores de Serviço (Clientes)
          </h2>
          <p className="text-xs text-zinc-400">
            Cadastro centralizado por escritório para reutilização rápida na
            emissão.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#F76415] hover:bg-[#e5590d] px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          <span>Novo Tomador</span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-5 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <label className="text-xs text-zinc-300">
            Nome / Razão Social *
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <label className="text-xs text-zinc-300">
            CPF ou CNPJ *
            <input
              required
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <label className="text-xs text-zinc-300">
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Código IBGE Município (7 dígitos)
            <input
              pattern="\d{7}"
              value={cityCode}
              onChange={(e) => setCityCode(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <label className="text-xs text-zinc-300">
            CEP (8 dígitos)
            <input
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              placeholder="30130000"
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Logradouro
            <input
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Número
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Bairro
            <input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <div className="md:col-span-2 flex justify-end gap-2">
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
              Salvar Tomador
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-zinc-400">Carregando clientes...</p>
      ) : customers.length === 0 ? (
        <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-8 text-center text-sm text-zinc-400">
          Nenhum tomador cadastrado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {customers.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-4 flex items-center gap-3"
            >
              <Users className="h-5 w-5 text-[#F76415] shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-sm text-white truncate">
                  {c.name}
                </p>
                <p className="text-xs text-zinc-400">
                  Doc: {c.document} {c.email ? `· ${c.email}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

