import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CircuitBoard, ArrowRight, Loader2 } from "lucide-react";

const BG_IMAGE =
  "https://static.prod-images.emergentagent.com/jobs/f6482027-360d-49a2-a092-31266bc0a632/images/5c1ffbccf2cdd32380e6b5660740034e6510ce70f9feb5f7ab63b8551cbca0be.png";

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
      setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-white">
      {/* Left: form */}
      <div className="flex flex-col justify-between p-10 lg:p-14">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-md bar-gradient flex items-center justify-center">
            <span className="text-white font-bold tracking-tighter">H</span>
          </div>
          <div>
            <div className="font-semibold text-slate-900" style={{ fontFamily: "Chivo" }}>HERKO</div>
            <div className="tiny-label -mt-0.5">Calibration Manager</div>
          </div>
        </div>

        <div className="max-w-md w-full mx-auto py-10">
          <div className="tiny-label">ECM Data Model</div>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo" }}>
            Welcome back, engineer.
          </h1>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            Sign in to manage calibration datasets, review approvals, and deploy Vehicle_SW_IDs
            with full traceability.
          </p>

          <form className="mt-10 space-y-5" onSubmit={submit}>
            <div>
              <Label className="tiny-label" htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 h-11 rounded-md"
                data-testid="login-email"
                required
              />
            </div>
            <div>
              <Label className="tiny-label" htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 h-11 rounded-md"
                data-testid="login-password"
                required
              />
            </div>
            {err && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2" data-testid="login-error">
                {err}
              </div>
            )}
            <Button
              type="submit"
              disabled={busy}
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 rounded-md text-sm font-medium"
              data-testid="login-submit"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign in <ArrowRight className="w-4 h-4 ml-1.5" /></>}
            </Button>
          </form>

          <div className="mt-6 text-xs text-slate-500">
            Don't have an account?{" "}
            <Link to="/register" className="underline decoration-dotted text-slate-900 font-medium" data-testid="login-to-register">
              Register
            </Link>
          </div>

          <div className="mt-10 panel p-4">
            <div className="tiny-label mb-2">Demo users — password <span className="text-slate-900 font-mono">password123</span></div>
            <div className="grid grid-cols-2 gap-1 text-[11px] font-mono text-slate-600">
              <div>admin@herko.dev</div><div className="text-slate-400">all roles</div>
              <div>cal@herko.dev</div><div className="text-slate-400">Calibration_Engineer</div>
              <div>eng@herko.dev</div><div className="text-slate-400">PI_Engineering_Manager</div>
              <div>cfg@herko.dev</div><div className="text-slate-400">Configuration_Manager</div>
              <div>dma@herko.dev</div><div className="text-slate-400">DM_Administrator</div>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-mono">© {new Date().getFullYear()} HERKO · ECM Configuration Management</div>
      </div>

      {/* Right: visual */}
      <div className="hidden lg:block relative overflow-hidden">
        <div className="absolute inset-0 bg-slate-100 dot-grid" />
        <img src={BG_IMAGE} alt="control room" className="absolute inset-0 w-full h-full object-cover opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-white/30" />
        <div className="absolute bottom-10 left-10 right-10">
          <div className="panel p-6 backdrop-blur bg-white/70">
            <div className="tiny-label">Configuration Governance</div>
            <div className="mt-2 text-lg font-semibold text-slate-900" style={{ fontFamily: "Chivo" }}>
              Lifecycle, reviews, and Vehicle_SW_ID traceability for every calibration dataset.
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs font-mono text-slate-600">
              <CircuitBoard className="w-3.5 h-3.5" /> ECM · Euro 6d · OBD-II
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
