import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

// ====== DEV BYPASS MODE ======
// Activar con: localStorage.setItem("dev_bypass", "true")
// O añadir ?dev=true a la URL
// REMOVE DEV_BYPASS before production ⚠️
const isDevelopmentBypass = () => {
  if (typeof window === "undefined") return false;
  const bypassEnabled =
    localStorage.getItem("dev_bypass") === "true" ||
    window.location.search.includes("?dev=true");
  return bypassEnabled;
};

const MOCK_ADMIN_USER = {
  id: "dev-bypass-id",
  email: "admin@herko.dev",
  name: "Admin (DEV BYPASS)",
  roles: [
    "PD_Project_Manager",
    "Calibration_Engineer",
    "PI_Engineering_Manager",
    "PI_Regulatory_Compliance_Specialist",
    "PD_Verification_Validation_Engineer",
    "Configuration_Manager",
    "DM_Administrator",
    "Post_Sales_Engineer",
  ],
  active_role: "PD_Project_Manager",
  created_at: new Date().toISOString(),
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = anon, obj = authed
  const [loading, setLoading] = useState(true);
  const [devBypass, setDevBypass] = useState(isDevelopmentBypass());
  const [authError, setAuthError] = useState(null);

  const fetchMe = useCallback(async () => {
    // Check for dev bypass
    if (isDevelopmentBypass()) {
      console.warn("🔴 DEV BYPASS ACTIVE - Skipping auth checks");
      setUser(MOCK_ADMIN_USER);
      setLoading(false);
      setDevBypass(true);
      setAuthError(null);
      return;
    }

    const token = localStorage.getItem("herko_token");
    if (!token) {
      setUser(false);
      setLoading(false);
      setAuthError(null);
      return;
    }

    // Create timeout promise (5 seconds)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "Authentication check timed out after 5 seconds. Backend may be down."
            )
          ),
        5000
      )
    );

    try {
      // Race between actual request and timeout
      const { data } = await Promise.race([api.get("/auth/me"), timeoutPromise]);
      setUser(data);
      setAuthError(null);
    } catch (err) {
      console.error("❌ Auth check failed:", err.message);
      localStorage.removeItem("herko_token");
      setUser(false);
      setAuthError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Login real (restaurar para producción)
  const login = async (email, password) => {
    try {
      // Create timeout promise (10 seconds)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Login request timed out after 10 seconds. Backend may be down.")),
          10000
        )
      );

      // Race between actual request and timeout
      const { data } = await Promise.race([
        api.post("/auth/login", { email, password }),
        timeoutPromise,
      ]);

      localStorage.setItem("herko_token", data.token);
      setUser(data.user);
      return data.user;
    } catch (err) {
      console.error("❌ Login failed:", err.message);
      throw err;
    }
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

  // DEV BYPASS - Disable function
  const disableDevBypass = () => {
    localStorage.removeItem("dev_bypass");
    setDevBypass(false);
    window.location.reload();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        switchRole,
        refresh: fetchMe,
        devBypass,
        disableDevBypass,
        authError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
