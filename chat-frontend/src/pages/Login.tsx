import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { NexoraLogo } from '../components/NexoraLogo';

type AuthMode = 'login' | 'register';

type ProblemDetail = {
  detail?: string;
  title?: string;
};

export function Login() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signIn } = useAuth();
  const navigate = useNavigate();

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError('');
    setPassword('');
    setPasswordConfirmation('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (mode === 'register' && password !== passwordConfirmation) {
      setError('As senhas informadas não coincidem.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'register') {
        await api.post('/users', {
          username: username.trim(),
          email: email.trim(),
          password,
        });
      }

      const response = await api.post('/auth/login', {
        email: email.trim(),
        password,
      });

      signIn(response.data.token);
      navigate('/chat');
    } catch (requestError) {
      const axiosError = requestError as AxiosError<ProblemDetail>;
      setError(
        axiosError.response?.data?.detail ??
          (mode === 'register'
            ? 'Não foi possível criar a conta.'
            : 'Acesso negado. Verifique seu e-mail e sua senha.'),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative font-body-md overflow-hidden">
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-fixed-dim/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md px-margin-mobile md:px-0">
        <div className="glass-panel rounded-xl p-8 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-5">
              <NexoraLogo className="h-20 w-80 max-w-full" />
            </div>
            <h1 className="font-headline-lg text-headline-lg text-primary-fixed-dim tracking-tighter mb-2">
              {mode === 'login' ? 'Acessar a NEXORA' : 'Criar conta'}
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {mode === 'login'
                ? 'Entre para continuar suas conversas.'
                : 'Crie sua identidade na rede NEXORA.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'register' && (
              <div>
                <label
                  className="block font-label-caps text-label-caps text-on-surface-variant mb-2 uppercase"
                  htmlFor="username"
                >
                  Nome de usuário
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 !text-[20px]">
                    person
                  </span>
                  <input
                    className="input-cyber w-full rounded pl-10 pr-4 py-3 text-on-surface font-code-md text-code-md placeholder:text-on-surface-variant/30 focus:ring-0"
                    id="username"
                    placeholder="patrick"
                    required
                    minLength={3}
                    maxLength={50}
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <label
                className="block font-label-caps text-label-caps text-on-surface-variant mb-2 uppercase"
                htmlFor="email"
              >
                E-mail
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 !text-[20px]">
                  alternate_email
                </span>
                <input
                  className="input-cyber w-full rounded pl-10 pr-4 py-3 text-on-surface font-code-md text-code-md placeholder:text-on-surface-variant/30 focus:ring-0"
                  id="email"
                  placeholder="usuario@exemplo.com"
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>

            <div>
              <label
                className="block font-label-caps text-label-caps text-on-surface-variant mb-2 uppercase"
                htmlFor="password"
              >
                Senha
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 !text-[20px]">
                  key
                </span>
                <input
                  className="input-cyber w-full rounded pl-10 pr-4 py-3 text-on-surface font-code-md text-code-md placeholder:text-on-surface-variant/30 focus:ring-0"
                  id="password"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label
                  className="block font-label-caps text-label-caps text-on-surface-variant mb-2 uppercase"
                  htmlFor="password-confirmation"
                >
                  Confirmar senha
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 !text-[20px]">
                    password
                  </span>
                  <input
                    className="input-cyber w-full rounded pl-10 pr-4 py-3 text-on-surface font-code-md text-code-md placeholder:text-on-surface-variant/30 focus:ring-0"
                    id="password-confirmation"
                    placeholder="••••••••"
                    required
                    minLength={6}
                    type="password"
                    autoComplete="new-password"
                    value={passwordConfirmation}
                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                  />
                </div>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="text-error font-code-md text-code-md border border-error/30 bg-error-container/10 p-3 rounded"
              >
                {error}
              </p>
            )}

            <button
              className="btn-primary-cyber w-full rounded py-4 font-label-caps text-label-caps font-bold uppercase tracking-widest flex items-center justify-center gap-2 mt-7 disabled:opacity-50 disabled:cursor-not-allowed"
              type="submit"
              disabled={loading}
            >
              <span>
                {loading
                  ? 'Processando...'
                  : mode === 'login'
                    ? 'Entrar'
                    : 'Criar conta e entrar'}
              </span>
              <span className="material-symbols-outlined !text-[20px]">
                {mode === 'login' ? 'login' : 'person_add'}
              </span>
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-outline-variant/20 text-center">
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {mode === 'login' ? 'Ainda não possui uma conta?' : 'Já possui uma conta?'}
            </span>
            <button
              type="button"
              onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}
              className="ml-2 font-body-sm text-body-sm text-primary-fixed-dim hover:text-primary-fixed transition-colors"
            >
              {mode === 'login' ? 'Criar conta' : 'Entrar'}
            </button>
          </div>

          <div className="mt-5 text-center">
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Status do sistema:{' '}
            </span>
            <span className="font-code-md text-code-md text-primary-fixed-dim">Online</span>
          </div>
        </div>
      </div>
    </div>
  );
}