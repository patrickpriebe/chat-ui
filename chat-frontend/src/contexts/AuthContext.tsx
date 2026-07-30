import { createContext, useContext } from 'react';
import type { AuthenticatedUser } from '../auth/session';

export interface AuthContextData {
  user: AuthenticatedUser | null;
  signed: boolean;
  signIn: (token: string) => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextData>(
  {} as AuthContextData,
);

export const useAuth = () => useContext(AuthContext);