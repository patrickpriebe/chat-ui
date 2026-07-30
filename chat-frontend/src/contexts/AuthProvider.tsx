import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  clearToken,
  readUserFromStorage,
  storeToken,
} from '../auth/session';
import type { AuthenticatedUser } from '../auth/session';
import { AuthContext } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(
    readUserFromStorage,
  );

  function signIn(token: string) {
    storeToken(token);
    const authenticatedUser = readUserFromStorage();

    if (!authenticatedUser) {
      throw new Error('Token de autenticação inválido.');
    }

    setUser(authenticatedUser);
  }

  function signOut() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, signed: Boolean(user), signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}