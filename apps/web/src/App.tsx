import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Building2,
  FileCheck2,
  FilePlus2,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  PieChart,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import { AuthPanel } from './components/AuthPanel';
import { ApiError, apiRequest } from './lib/api';
import { supabase } from './lib/supabase';
import { CertificatesPage } from './pages/CertificatesPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { CustomersPage } from './pages/CustomersPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { IssueInvoicePage } from './pages/IssueInvoicePage';
import { MunicipalitiesPage } from './pages/MunicipalitiesPage';
import { ReportsPage, type ReportsSummaryResponse } from './pages/ReportsPage';
import { ServicesPage } from './pages/ServicesPage';
import { SettingsPage } from './pages/SettingsPage';

type NavKey =
  | 'dashboard'
  | 'companies'
  | 'customers'
  | 'issue'
  | 'invoices'
  | 'services'
  | 'certificates'
  | 'municipalities'
  | 'reports'
  | 'settings';

interface NavItem {
  key: NavKey;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description:
      'Indicadores operacionais da contabilidade, status da API/PostgreSQL e alertas de certificados A1.',
    icon: LayoutDashboard,
  },
  {
    key: 'companies',
    label: 'Empresas',
    description:
      'Cadastro multi-tenant de empresas e filiais, CNPJ/IM, código IBGE e ambiente.',
    icon: Building2,
  },
  {
    key: 'certificates',
    label: 'Certificados Digitais',
    description:
      'Cofre A1 (.pfx) criptografado com AES-256-GCM no PostgreSQL e teste mTLS.',
    icon: ShieldCheck,
  },
  {
    key: 'customers',
    label: 'Clientes',
    description: 'Cadastro de tomadores de serviços por escritório.',
    icon: Users,
  },
  {
    key: 'services',
    label: 'Serviços',
    description: 'Catálogo de códigos tributários e alíquotas padrão.',
    icon: Wrench,
  },
  {
    key: 'municipalities',
    label: 'Municípios e Integrações',
    description:
      'Roteamento por código IBGE entre SEFIN Nacional, NotaControl DF v1.01 e ABRASF.',
    icon: Globe2,
  },
  {
    key: 'issue',
    label: 'Emissão NFS-e',
    description:
      'Solicitação assíncrona via Transactional Outbox + XMLDSig + mTLS.',
    icon: FilePlus2,
  },
  {
    key: 'invoices',
    label: 'Notas Fiscais',
    description:
      'Histórico de emissões, download de XML oficial, DANFSe PDF e cancelamentos.',
    icon: FileCheck2,
  },
  {
    key: 'reports',
    label: 'Relatórios',
    description: 'Faturamento autorizado e saúde dos certificados.',
    icon: PieChart,
  },
  {
    key: 'settings',
    label: 'Configurações',
    description: 'Sessão Supabase Auth, RBAC e trilha de auditoria.',
    icon: Settings,
  },
];

interface ApiHealth {
  status: string;
  service: string;
  environment: string;
  authProvider: string;
  database: 'connected' | 'disconnected';
  timestamp: string;
}

export function App() {
  const [active, setActive] = useState<NavKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [principal, setPrincipal] = useState<AuthenticatedPrincipal | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [summary, setSummary] = useState<ReportsSummaryResponse | null>(null);

  const syncSession = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    setAccessToken(token);

    if (!token) {
      setPrincipal(null);
      setNeedsOnboarding(false);
      setSummary(null);
      return;
    }

    try {
      const me = await apiRequest<AuthenticatedPrincipal>('/auth/me', {
        token,
      });
      setPrincipal(me);
      setNeedsOnboarding(false);

      const rep = await apiRequest<ReportsSummaryResponse>('/reports/summary', {
        token,
        tenantId: me.tenantId,
      });
      setSummary(rep);
    } catch (err) {
      setPrincipal(null);
      setSummary(null);
      if (err instanceof ApiError && err.status === 401) {
        setNeedsOnboarding(true);
      }
    }
  }, []);

  useEffect(() => {
    void apiRequest<ApiHealth>('/health')
      .then((data) => {
        setHealth(data);
        setHealthError(null);
      })
      .catch((err: unknown) => {
        setHealth(null);
        setHealthError(err instanceof Error ? err.message : 'API indisponível');
      });

    void syncSession();

    if (!supabase) return;
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void syncSession();
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, [syncSession]);

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setPrincipal(null);
    setAccessToken(null);
    setNeedsOnboarding(false);
    setSummary(null);
  }

  const currentItem =
    NAV_ITEMS.find((item) => item.key === active) ?? NAV_ITEMS[0];

  function renderAuthenticatedContent() {
    if (!principal || !accessToken) {
      return (
        <section className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-6">
          <h2 className="text-lg font-semibold text-white">
            {currentItem.label}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            {currentItem.description}
          </p>
        </section>
      );
    }

    switch (active) {
      case 'companies':
        return (
          <CompaniesPage token={accessToken} tenantId={principal.tenantId} />
        );
      case 'certificates':
        return (
          <CertificatesPage
            token={accessToken}
            tenantId={principal.tenantId}
          />
        );
      case 'customers':
        return (
          <CustomersPage token={accessToken} tenantId={principal.tenantId} />
        );
      case 'services':
        return (
          <ServicesPage token={accessToken} tenantId={principal.tenantId} />
        );
      case 'municipalities':
        return (
          <MunicipalitiesPage
            token={accessToken}
            tenantId={principal.tenantId}
          />
        );
      case 'issue':
        return (
          <IssueInvoicePage
            token={accessToken}
            tenantId={principal.tenantId}
          />
        );
      case 'invoices':
        return (
          <InvoicesPage token={accessToken} tenantId={principal.tenantId} />
        );
      case 'reports':
        return (
          <ReportsPage token={accessToken} tenantId={principal.tenantId} />
        );
      case 'settings':
        return <SettingsPage token={accessToken} principal={principal} />;
      case 'dashboard':
      default:
        return (
          <div className="space-y-6">
            <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-5">
                <p className="text-xs uppercase tracking-wider text-zinc-400">
                  Empresas
                </p>
                <p className="mt-2 text-2xl font-bold text-white">
                  {summary?.companiesCount ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-5">
                <p className="text-xs uppercase tracking-wider text-zinc-400">
                  Certificados A1 Ativos
                </p>
                <p className="mt-2 text-2xl font-bold text-emerald-400">
                  {summary?.certificates.active ?? 0}
                </p>
                <p className="text-[11px] text-amber-300 mt-1">
                  {summary?.certificates.expiringSoon ?? 0} vencendo em 30d
                </p>
              </div>
              <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-5">
                <p className="text-xs uppercase tracking-wider text-zinc-400">
                  Notas Autorizadas
                </p>
                <p className="mt-2 text-2xl font-bold text-white">
                  {summary?.invoices.byStatus.AUTHORIZED ?? 0}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Total de solicitações: {summary?.invoices.total ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-5">
                <p className="text-xs uppercase tracking-wider text-zinc-400">
                  Ambiente / Auth
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {health?.environment ?? 'test-machine'}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {principal.email} ({principal.role})
                </p>
              </div>
            </section>
          </div>
        );
    }
  }

  return (
    <div className="min-h-screen bg-[#141518] text-zinc-100 flex">
      <aside className="hidden lg:flex lg:w-72 lg:flex-col border-r border-[#2A2D35] bg-[#181A1F]">
        <div className="h-16 px-6 flex items-center gap-3 border-b border-[#2A2D35]">
          <div className="h-9 w-9 rounded-lg bg-[#F76415] flex items-center justify-center text-white font-bold">
            N
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">
              NFS-e Hub
            </p>
            <p className="text-[11px] uppercase tracking-wider text-zinc-400">
              Gestão Fiscal Multiempresa
            </p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isSelected = item.key === active;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActive(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isSelected
                    ? 'bg-[#F76415] text-white font-medium'
                    : 'text-zinc-300 hover:bg-[#22252C] hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#2A2D35] text-xs text-zinc-400 space-y-2">
          <div className="flex items-center gap-2 text-zinc-300 font-medium">
            <LockKeyhole className="h-3.5 w-3.5 text-[#F76415]" />
            <span>Cofre A1 & Automação VPS</span>
          </div>
          {principal ? (
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="truncate">
                <p className="text-zinc-200 truncate">{principal.name}</p>
                <p className="text-[11px] text-zinc-500">{principal.role}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                title="Sair"
                className="p-1.5 rounded-md hover:bg-[#22252C] text-zinc-400 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p>SEFIN Nacional · NotaControl DF v1.01</p>
          )}
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-full bg-[#181A1F] border-r border-[#2A2D35] flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-[#2A2D35]">
              <span className="font-semibold text-white">NFS-e Hub</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isSelected = item.key === active;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setActive(item.key);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      isSelected
                        ? 'bg-[#F76415] text-white font-medium'
                        : 'text-zinc-300 hover:bg-[#22252C] hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 px-4 sm:px-8 border-b border-[#2A2D35] bg-[#181A1F]/80 backdrop-blur flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-zinc-300 hover:bg-[#22252C]"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold text-white">
              {currentItem.label}
            </h1>
          </div>

          <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-[#2A2D35] bg-[#1D1F24]">
            <Activity
              className={`h-3.5 w-3.5 ${
                health
                  ? health.database === 'connected'
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                  : 'text-zinc-500'
              }`}
            />
            <span className="text-zinc-300">
              {health
                ? `API ${health.status.toUpperCase()} · DB ${health.database}`
                : `API offline (${healthError ?? 'verificando...'})`}
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto space-y-6">
          <AuthPanel
            accessToken={accessToken}
            principal={principal}
            needsOnboarding={needsOnboarding}
            onAuthComplete={syncSession}
          />

          {renderAuthenticatedContent()}
        </main>
      </div>
    </div>
  );
}
