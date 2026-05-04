import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { formatApiErrorDetail } from "../lib/api";
import { ROLES_LIST } from "../lib/constants";
import { Loader2 } from "lucide-react";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [roles, setRoles] = useState(["Calibration_Engineer"]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = "Register · HERKO"; }, []);

  const toggleRole = (r) => {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (roles.length === 0) { setErr("Select at least one role"); return; }
    setBusy(true);
    try {
      await register(form.email, form.password, form.name, roles);
      navigate("/");
    } catch (e) {
      setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  const lbl = { display: "block", fontSize: 11, fontWeight: 600, color: "#605E5C", marginBottom: 4 };

  return (
    <div style={{ minHeight: "100vh", background: "#F3F3F3", display: "flex", flexDirection: "column" }}>

      {/* Title bar */}
      <div style={{
        background: "#646E5A", color: "#fff",
        padding: "6px 16px", fontSize: 13, fontWeight: 600,
        display: "flex", alignItems: "center", gap: 10,
        flexShrink: 0,
      }}>
        <img src="/favicons/favicon-32x32.png" alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
        HERKO Calibration Manager
      </div>

      {/* Area centrada */}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 24px 24px" }}>
        <div style={{
          background: "#fff", border: "1px solid #C8C8C8",
          width: "100%", maxWidth: 400, padding: "32px 36px",
        }}>

          {/* Cabecera */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#605E5C", marginBottom: 6 }}>
              ECM Configuration Management
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#212121" }}>Create account</div>
          </div>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            <div>
              <label style={lbl}>Full name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="ms-input" style={{ height: 28 }} required data-testid="register-name" />
            </div>

            <div>
              <label style={lbl}>Email address</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="ms-input" style={{ height: 28 }} required data-testid="register-email" />
            </div>

            <div>
              <label style={lbl}>Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="ms-input" style={{ height: 28 }} required data-testid="register-password" />
            </div>

            <div>
              <div style={lbl}>Roles</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, marginTop: 4 }}>
                {ROLES_LIST.map((r) => (
                  <label key={r} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontSize: 10, fontFamily: "monospace", color: "#212121",
                    padding: "3px 6px", border: "1px solid",
                    borderColor: roles.includes(r) ? "#646E5A" : "#C8C8C8",
                    background: roles.includes(r) ? "#E4E7DF" : "#fff",
                    cursor: "pointer", lineHeight: 1.3, minWidth: 0,
                  }}>
                    <input type="checkbox" checked={roles.includes(r)} onChange={() => toggleRole(r)}
                      style={{ accentColor: "#646E5A", flexShrink: 0 }}
                      data-testid={`register-role-${r}`} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r}</span>
                  </label>
                ))}
              </div>
            </div>

            {err && (
              <div style={{ fontSize: 11, color: "#8B0000", background: "#FDE7E9", border: "1px solid #F4ACAC", padding: "6px 10px" }}
                data-testid="register-error">{err}</div>
            )}

            <button type="submit" disabled={busy} className="ms-btn primary"
              style={{ justifyContent: "center", height: 30, marginTop: 4 }}
              data-testid="register-submit">
              {busy ? <Loader2 size={13} className="animate-spin" /> : "Create account"}
            </button>
          </form>

          <div style={{ marginTop: 14, fontSize: 11, color: "#605E5C" }}>
            Already have an account?{" "}
            <Link to="/login" style={{ color: "#646E5A", textDecoration: "underline" }} data-testid="register-to-login">
              Sign in
            </Link>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "8px", fontSize: 10, color: "#8A8886", fontFamily: "monospace" }}>
        {`© ${new Date().getFullYear()} HERKO · ECM Configuration Management`}
      </div>
    </div>
  );
}
