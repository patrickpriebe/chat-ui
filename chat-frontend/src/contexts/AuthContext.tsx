import { createContext, useState, useEffect, useContext } from 'react';
import type { ReactNode } from 'react';
import { jwtDecode } from 'jwt-decode';

interface User {
  email: string;
}

interface AuthContextData {
  user: User | null;
  signed: boolean;
  signIn: (token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const storagedToken = localStorage.getItem('@ChatApp:token');

    if (storagedToken) {
      try {
        const decodedToken = jwtDecode<{ sub: string }>(storagedToken);
        setUser({ email: decodedToken.sub });
      } catch (error) {
        signOut();
      }
    }
  }, []);

  const signIn = (token: string) => {
    localStorage.setItem('@ChatApp:token', token);
    const decodedToken = jwtDecode<{ sub: string }>(token);
    setUser({ email: decodedToken.sub });
  };

  const signOut = () => {
    localStorage.removeItem('@ChatApp:token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, signed: !!user, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);