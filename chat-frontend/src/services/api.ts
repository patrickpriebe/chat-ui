import axios from 'axios';
import { TOKEN_KEY } from '../auth/session';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
export const WS_URL =
  import.meta.env.VITE_WS_URL || `${API_URL.replace(/\/api\/?$/, '')}/ws`;

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
});