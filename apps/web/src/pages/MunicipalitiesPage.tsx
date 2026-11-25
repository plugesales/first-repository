import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Globe2, Plus } from 'lucide-react';
import { apiRequest } from '../lib/api';

export interface MunicipalityItem {
  ibgeCode: string;
  name: string;
  state: string;
  providerCode: 'NATIONAL_SEFIN' | 'NOTA_CONTROL_DF' | 'ABRASF';
  authorizationMode: string;
  layoutVersion: string;
  homologationUrl: string | null;
  productionUrl: string | null;
  active: boolean;
}

const PROVIDER_DEFAULTS: Record<
  'NATIONAL_SEFIN' | 'NOTA_CONTROL_DF' | 'ABRASF',
  { mode: string; homUrl: string; prodUrl: string }
> = {
  NATIONAL_SEFIN: {
    mode: 'REST_NACIONAL',
    homUrl: 'https://sefin.producaorestrita.nfse.gov.br/sefinnacional',
    prodUrl: 'https://sefin.nfse.gov.br/sefinnacional',
  },
  NOTA_CONTROL_DF: {
    mode: 'SOAP_V101',
    homUrl: 'https://nfse.issnetonline.com.br/wsnfsenacional/homologacao/nfse.asmx',
    prodUrl: '',
  },
  ABRASF: {
    mode: 'SOAP_ABRASF',
    homUrl: '',
    prodUrl: '',
  },
};

export function MunicipalitiesPage({
  token,
  tenantId,
}: {
  token: string;
  tenantId: string;
}) {
  const [items, setItems] = useState<MunicipalityItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [ibgeCode, setIbgeCode] = useState('3106200');
  const [name, setName] = useState('Belo Horizonte');
  const [state, setState] = useState('MG');
  const [providerCode, setProviderCode] = useState<
    'NATIONAL_SEFIN' | 'NOTA_CONTROL_DF' | 'ABRASF'
  >('NATIONAL_SEFIN');
  const [authorizationMode, setAuthorizationMode] = useState('REST_NACIONAL');
  const [homologationUrl, setHomologationUrl] = useState(
    PROVIDER_DEFAULTS.NATIONAL_SEFIN.homUrl,
  );
  const [productionUrl, setProductionUrl] = useState(
    PROVIDER_DEFAULTS.NATIONAL_SEFIN.prodUrl,
  );
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiRequest<MunicipalityItem[]>('/municipalities', {
        token,
        tenantId,
      });
      setItems(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao listar municípios.',
      );
    }
  }, [token, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleProviderChange(
    next: 'NATIONAL_SEFIN' | 'NOTA_CONTROL_DF' | 'ABRASF',
  ) {
    setProviderCode(next);
    const defaults = PROVIDER_DEFAULTS[next];
    setAuthorizationMode(defaults.mode);
    setHomologationUrl(defaults.homUrl);
    setProductionUrl(defaults.prodUrl);
  }

  async function handleUpsert(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/municipalities', {
        method: 'POST',
        token,
        tenantId,
        body: {
          ibgeCode,
          name,
          state: state.toUpperCase(),
          providerCode,
          authorizationMode,
          homologationUrl: homologationUrl || undefined,
          productionUrl: productionUrl || undefined,
          active,
        },
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar município.',
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Municípios e Roteamento de Conectores
          </h2>
          <p className="text-xs text-zinc-400">
            Define qual conector (`NATIONAL_SEFIN`, `NOTA_CONTROL_DF` ou
            `ABRASF`) atende cada código IBGE.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#F76415] hover:bg-[#e5590d] px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          <span>Configurar Município</span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleUpsert}
          className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-5 grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <label className="text-xs text-zinc-300">
            Código IBGE (7 dígitos) *
            <input
              required
              pattern="\d{7}"
              value={ibgeCode}
              onChange={(e) => setIbgeCode(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Nome do Município *
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-300">
            UF *
            <input
              required
              maxLength={2}
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Provedor *
            <select
              value={providerCode}
              onChange={(e) =>
                handleProviderChange(
                  e.target.value as
                    | 'NATIONAL_SEFIN'
                    | 'NOTA_CONTROL_DF'
                    | 'ABRASF',
                )
              }
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
            >
              <option value="NATIONAL_SEFIN">SEFIN Nacional (REST)</option>
              <option value="NOTA_CONTROL_DF">
                NotaControl / ISS.net v1.01 (SOAP)
              </option>
              <option value="ABRASF">ABRASF (Pendente)</option>
            </select>
          </label>
          <label className="text-xs text-zinc-300">
            Modalidade *
            <input
              required
              value={authorizationMode}
              onChange={(e) => setAuthorizationMode(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-300">
            URL Homologação
            <input
              type="url"
              value={homologationUrl}
              onChange={(e) => setHomologationUrl(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="md:col-span-2 text-xs text-zinc-300">
            URL Produção (opcional)
            <input
              type="url"
              value={productionUrl}
              onChange={(e) => setProductionUrl(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span>Município ativo para emissão</span>
          </label>
          <div className="md:col-span-3 flex justify-end gap-2">
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
              Salvar Município
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-8 text-center text-sm text-zinc-400">
          Nenhum município configurado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((m) => (
            <div
              key={m.ibgeCode}
              className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-4 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <Globe2 className="h-5 w-5 text-[#F76415] shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">
                    {m.name}/{m.state} ({m.ibgeCode})
                  </p>
                  <p className="text-xs text-zinc-400">
                    {m.providerCode} · Leiaute {m.layoutVersion}
                  </p>
                </div>
              </div>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full border ${
                  m.active
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-zinc-600 text-zinc-400'
                }`}
              >
                {m.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
