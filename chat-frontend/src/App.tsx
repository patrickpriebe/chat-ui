import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { Chat } from './pages/Chat';

function PrivateRoute({ children }: { children: ReactNode }) {
  const { signed } = useAuth();
  return signed ? <>{children}</> : <Navigate to="/" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route 
          path="/chat" 
          element={
            <PrivateRoute>
              <Chat />
            </PrivateRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}