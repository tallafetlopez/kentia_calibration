import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = anon, obj = authed
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem("herko_token");
    if (!token) {
      setUser(false);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      localStorage.removeItem("herko_token");
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("herko_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (email, password, name, roles) => {
    const { data } = await api.post("/auth/register", { email, password, name, roles });
    localStorage.setItem("herko_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("herko_token");
    setUser(false);
  };

  const switchRole = async (role) => {
    const { data } = await api.post("/auth/switch-role", { role });
    setUser(data);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, switchRole, refresh: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
