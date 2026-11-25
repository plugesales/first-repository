import { useState, type FormEvent } from 'react';
import { Building2, KeyRound, LogIn } from 'lucide-react';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import { apiRequest } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface AuthPanelProps {
  accessToken: string | null;
  principal: AuthenticatedPrincipal | null;
  needsOnboarding: boolean;
  onAuthComplete: () => Promise<void>;
}

export function AuthPanel({
  accessToken,
  principal,
  needsOnboarding,
  onAuthComplete,
}: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantDocument, setTenantDocument] = useState('');
  const [userName, setUserName] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (principal) {
    return null;
  }

  async function handleSupabaseAuth(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError(null);
    setFeedback(null);

    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        await onAuthComplete();
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        setFeedback(
          'Conta criada no Supabase Auth. Se a confirmação por e-mail estiver ativa, confirme e faça login.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação.');
    } finally {
      setLoading(false);
    }
  }

  async function handleOnboarding(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setLoading(true);
    setError(null);

    try {
      await apiRequest('/auth/onboarding', {
        method: 'POST',
        token: accessToken,
        body: {
          tenantName,
          tenantDocument: tenantDocument || undefined,
          userName,
        },
      });
      await onAuthComplete();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao criar escritório.',
      );
    } finally {
      setLoading(false);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-200">
        <div className="flex items-center gap-2 font-semibold text-amber-300">
          <KeyRound className="h-4 w-4" />
          <span>Configure o Supabase Auth para habilitar o login</span>
        </div>
        <p className="mt-2 text-xs text-amber-200/80 leading-relaxed">
          Preencha <code>VITE_SUPABASE_URL</code>,{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>, <code>SUPABASE_URL</code> e{' '}
          <code>SUPABASE_JWT_SECRET</code> no arquivo <code>.env</code> na raiz
          e reinicie o servidor Vite/API.
        </p>
      </div>
    );
  }

  if (accessToken && needsOnboarding) {
    return (
      <form
        onSubmit={handleOnboarding}
        className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-6 max-w-lg space-y-4"
      >
        <div className="flex items-center gap-2 text-white font-semibold">
          <Building2 className="h-5 w-5 text-[#F76415]" />
          <span>Onboarding do Escritório Contábil</span>
        </div>
        <p className="text-xs text-zinc-400">
          Sua conta já autenticou no Supabase. Crie o tenant da contabilidade
          para isolar empresas e certificados A1.
        </p>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <label className="block text-xs text-zinc-300">
            Nome da Contabilidade / Escritório *
            <input
              required
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              placeholder="Ex.: Contabilidade Modelo Ltda"
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <label className="block text-xs text-zinc-300">
            CNPJ do Escritório (opcional)
            <input
              value={tenantDocument}
              onChange={(e) => setTenantDocument(e.target.value)}
              placeholder="00.000.000/0001-00"
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
          <label className="block text-xs text-zinc-300">
            Seu Nome *
            <input
              required
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Responsável pela conta"
              className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-[#F76415] hover:bg-[#e5590d] disabled:opacity-60 text-white text-sm font-medium py-2.5 transition-colors"
        >
          {loading ? 'Provisionando...' : 'Criar Escritório e Entrar'}
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSupabaseAuth}
      className="rounded-xl border border-[#2A2D35] bg-[#1D1F24] p-6 max-w-md space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white font-semibold">
          <LogIn className="h-5 w-5 text-[#F76415]" />
          <span>{mode === 'login' ? 'Entrar (Supabase Auth)' : 'Criar Conta'}</span>
        </div>
        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          className="text-xs text-[#F76415] hover:underline"
        >
          {mode === 'login' ? 'Criar conta' : 'Já tenho conta'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
          {error}
        </p>
      )}
      {feedback && (
        <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5">
          {feedback}
        </p>
      )}

      <div className="space-y-3">
        <label className="block text-xs text-zinc-300">
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
          />
        </label>
        <label className="block text-xs text-zinc-300">
          Senha
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg bg-[#141518] border border-[#2A2D35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F76415]"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[#F76415] hover:bg-[#e5590d] disabled:opacity-60 text-white text-sm font-medium py-2.5 transition-colors"
      >
        {loading
          ? 'Autenticando...'
          : mode === 'login'
            ? 'Entrar'
            : 'Cadastrar'}
      </button>
    </form>
  );
}

