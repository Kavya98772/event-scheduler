import { createContext, useContext, useState } from 'react';
import { api, token } from '../services/api.js';

const Ctx = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const save = ({ token: t, user: u }) => { token.set(t); localStorage.setItem('user', JSON.stringify(u)); setUser(u); };
  const value = {
    user,
    isStaff: ['ADMIN', 'ORGANIZER'].includes(user?.role),
    isAdmin: user?.role === 'ADMIN',
    login: async (email, password) => save(await api.post('/auth/login', { email, password })),
    register: async (body) => save(await api.post('/auth/register', body)),
    logout: () => { token.clear(); localStorage.removeItem('user'); setUser(null); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
