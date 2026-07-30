import { jwtDecode } from 'jwt-decode';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
}

interface TokenPayload {
  sub: string;
  userId: string;
  username: string;
  exp: number;
}

export const TOKEN_KEY = '@Nexora:token';

export function readUserFromStorage(): AuthenticatedUser | null {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;

  try {
    const payload = jwtDecode<TokenPayload>(token);

    if (!payload.exp || payload.exp * 1000 <= Date.now()) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }

    if (!payload.userId || !payload.username || !payload.sub) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }

    return {
      id: payload.userId,
      username: payload.username,
      email: payload.sub,
    };
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

export function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}