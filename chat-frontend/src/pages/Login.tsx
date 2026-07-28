import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { NexusLogo } from '../components/NexusLogo';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const { signIn } = useAuth();
  const navigate = useNavigate();

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');

    try {
      const response = await api.post('/auth/login', { email, password });
      signIn(response.data.token);
      navigate('/chat');
    } catch (err) {
      setError('Acesso Negado. Verifique suas credenciais de uplink.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative font-body-md overflow-hidden">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      {/* Glow Effect Central */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-fixed-dim/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md px-margin-mobile md:px-0">
        <div className="glass-panel rounded-xl p-8 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="flex justify-center mb-6">
              <div className="h-20 w-20 rounded-xl border border-primary-fixed-dim/40 bg-primary-container/5 flex items-center justify-center shadow-[0_0_20px_rgba(0,219,233,0.15)]">
                <NexusLogo className="h-11 w-11 text-primary-fixed-dim" />
              </div>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-primary-fixed-dim tracking-tighter mb-2">
              Access Protocol
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Identify to establish connection
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Uplink ID */}
            <div>
              <label
                className="block font-label-caps text-label-caps text-on-surface-variant mb-2 uppercase"
                htmlFor="uplink-id"
              >
                Uplink ID
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-opacity-50 !text-[20px]">
                  badge
                </span>
                <input
                  className="input-cyber w-full rounded pl-10 pr-4 py-3 text-on-surface font-code-md text-code-md placeholder:text-on-surface-variant/30 focus:ring-0"
                  id="uplink-id"
                  placeholder="operator@node.com"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Neural Key */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label
                  className="block font-label-caps text-label-caps text-on-surface-variant uppercase"
                  htmlFor="neural-key"
                >
                  Neural Key
                </label>
                <a
                  className="font-label-caps text-label-caps text-primary-fixed-dim hover:text-primary-fixed transition-colors"
                  href="#"
                  onClick={(e) => e.preventDefault()}
                >
                  Recover
                </a>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-opacity-50 !text-[20px]">
                  key
                </span>
                <input
                  className="input-cyber w-full rounded pl-10 pr-4 py-3 text-on-surface font-code-md text-code-md placeholder:text-on-surface-variant/30 focus:ring-0"
                  id="neural-key"
                  placeholder="••••••••"
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <p className="text-error font-code-md text-code-md border border-error/30 bg-error-container/10 p-3 rounded">
                [ERRO]: {error}
              </p>
            )}

            {/* Action */}
            <button
              className="btn-primary-cyber w-full rounded py-4 font-label-caps text-label-caps font-bold uppercase tracking-widest flex items-center justify-center gap-2 mt-8"
              type="submit"
            >
              <span>Initialize Connection</span>
              <span className="material-symbols-outlined !text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                login
              </span>
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="font-body-sm text-body-sm text-on-surface-variant">System Status: </span>
            <span className="font-code-md text-code-md text-primary-fixed-dim">Online</span>
          </div>
        </div>
      </div>
    </div>
  );
}