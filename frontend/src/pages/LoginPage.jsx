import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { formatApiErrorDetail } from "../lib/api";
import { Loader2, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@herko.dev");
  const [password, setPassword] = useState("password123");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (e) {
      console.error("❌ Login error:", e);
      const detail = e?.response?.data?.detail;
      const errorMsg =
        detail != null
          ? formatApiErrorDetail(detail)
          : e?.code === "ERR_NETWORK"
            ? "Cannot connect to backend. Verify API is running on http://localhost:8001."
            : e?.message || "Login failed. Please check your credentials and try again.";
      setErr(errorMsg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#F3F3F3",
      display: "flex", flexDirection: "column",
    }}>
      {/* Office-style title bar */}
      <div style={{
        background: "#646E5A", color: "#fff",
        padding: "6px 16px", fontSize: 13, fontWeight: 600,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <img src="/favicons/favicon-32x32.png" alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
        HERKO Calibration Manager
      </div>

      {/* Center card */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}>
        <div style={{
          background: "#fff", border: "1px solid #C8C8C8",
          width: "100%", maxWidth: 400, padding: "32px 36px",
        }}>
          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
              textTransform: "uppercase", color: "#605E5C", marginBottom: 6,
            }}>ECM Configuration Management</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#212121" }}>
              Sign In
            </div>
          </div>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#605E5C", marginBottom: 4 }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="ms-input"
                style={{ height: 28 }}
                data-testid="login-email"
                required
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#605E5C", marginBottom: 4 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ms-input"
                style={{ height: 28 }}
                data-testid="login-password"
                required
              />
            </div>

            {err && (
              <div style={{
                fontSize: 11, color: "#8B0000", background: "#FDE7E9",
                border: "1px solid #F4ACAC", padding: "6px 10px",
              }} data-testid="login-error">
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="ms-btn primary"
              style={{ justifyContent: "center", height: 30, marginTop: 4 }}
              data-testid="login-submit"
            >
              {busy
                ? <Loader2 size={13} className="animate-spin" />
                : <><span>Sign in</span><ArrowRight size={13} /></>
              }
            </button>
          </form>

          <div style={{ marginTop: 16, fontSize: 11, color: "#605E5C" }}>
            No account?{" "}
            <Link to="/register" style={{ color: "#646E5A", textDecoration: "underline" }} data-testid="login-to-register">
              Register
            </Link>
          </div>

          {/* Demo credentials */}
          <div style={{
            marginTop: 24, background: "#F3F3F3", border: "1px solid #C8C8C8",
            padding: "10px 12px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#605E5C", marginBottom: 8 }}>
              Demo accounts — password: <span style={{ fontFamily: "monospace", color: "#212121" }}>password123</span>
            </div>
            <table style={{ width: "100%", fontSize: 11, fontFamily: "monospace", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["admin@herko.dev", "All roles"],
                  ["cal@herko.dev", "Calibration_Engineer"],
                  ["eng@herko.dev", "PI_Engineering_Manager"],
                  ["cfg@herko.dev", "Configuration_Manager"],
                  ["dma@herko.dev", "DM_Administrator"],
                ].map(([e, r]) => (
                  <tr key={e}>
                    <td style={{ padding: "1px 0", color: "#646E5A", cursor: "pointer", fontWeight: 600 }}
                      onClick={() => setEmail(e)}>{e}</td>
                    <td style={{ padding: "1px 0 1px 12px", color: "#605E5C" }}>{r}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "8px", fontSize: 10, color: "#8A8886", fontFamily: "monospace" }}>
        © {new Date().getFullYear()} HERKO · ECM Configuration Management
      </div>
    </div>
  );
}
