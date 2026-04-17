import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, formatApiErrorDetail } from "../lib/api";
import { ROLES_LIST } from "../lib/constants";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Checkbox } from "../components/ui/checkbox";
import { Loader2, ArrowLeft } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-xl w-full panel p-8">
        <Link to="/login" className="text-xs text-slate-500 flex items-center gap-1 hover:text-slate-900" data-testid="register-back">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
        </Link>
        <div className="tiny-label mt-6">Create account</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo" }}>
          Join HERKO Calibration Manager
        </h1>

        <form className="mt-8 space-y-5" onSubmit={submit}>
          <div>
            <Label className="tiny-label">Full name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 h-11" required data-testid="register-name" />
          </div>
          <div>
            <Label className="tiny-label">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5 h-11" required data-testid="register-email" />
          </div>
          <div>
            <Label className="tiny-label">Password</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1.5 h-11" required data-testid="register-password" />
          </div>
          <div>
            <Label className="tiny-label">Roles</Label>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ROLES_LIST.map((r) => (
                <label key={r} className="flex items-center gap-2 text-[11px] font-mono text-slate-700 px-3 py-2 rounded-md border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggleRole(r)} data-testid={`register-role-${r}`} />
                  {r}
                </label>
              ))}
            </div>
          </div>
          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2" data-testid="register-error">{err}</div>}
          <Button type="submit" disabled={busy} className="w-full h-11 bg-slate-900 hover:bg-slate-800" data-testid="register-submit">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
