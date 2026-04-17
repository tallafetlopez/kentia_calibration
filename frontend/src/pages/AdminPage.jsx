import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Database, RefreshCw, Users } from "lucide-react";
import { ROLES_LIST, fmtDate } from "../lib/constants";
import { useAuth } from "../lib/auth";

export default function AdminPage() {
  const { user, switchRole } = useAuth();
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const u = await api.get("/auth/users");
    setUsers(u.data);
    const a = await api.get("/audit-log", { params: { limit: 20 } });
    setAudit(a.data);
  };
  useEffect(() => { load(); }, []);

  const reseed = async () => {
    if (!window.confirm("This will wipe the database and reload demo data. Continue?")) return;
    setBusy(true);
    try {
      await api.post("/seed");
      toast.success("Demo data reseeded");
      setTimeout(() => window.location.reload(), 500);
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6" data-testid="page-admin">
      <div>
        <div className="tiny-label">Workflow 9</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo" }}>Admin · Role simulation & seed</h1>
        <p className="mt-1 text-sm text-slate-600">Inspect users, switch role, reseed the demo dataset.</p>
      </div>

      <div className="panel p-5">
        <div className="tiny-label mb-3">Demo seed</div>
        <p className="text-sm text-slate-600">Reset the database to seeded demo state with 9 users, 3 software releases, 10 datasets and 200 labels.</p>
        <Button onClick={reseed} disabled={busy} className="mt-3 bg-slate-900 hover:bg-slate-800" data-testid="admin-reseed">
          <RefreshCw className={`w-4 h-4 mr-1.5 ${busy ? "animate-spin" : ""}`} /> Reseed demo data
        </Button>
      </div>

      <div className="panel overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-700" />
          <div className="tiny-label">Users & roles</div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="tiny-label py-3 px-4">Name</th>
              <th className="tiny-label py-3 px-4">Email</th>
              <th className="tiny-label py-3 px-4">Roles</th>
              <th className="tiny-label py-3 px-4">Active role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100" data-testid={`user-row-${u.email}`}>
                <td className="py-3 px-4 text-slate-900 font-medium">{u.name}</td>
                <td className="py-3 px-4 text-xs font-mono text-slate-600">{u.email}</td>
                <td className="py-3 px-4">
                  <div className="flex gap-1 flex-wrap">
                    {u.roles.map((r) => (
                      <span key={r} className="text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200 rounded-sm px-1.5 py-0.5">{r}</span>
                    ))}
                  </div>
                </td>
                <td className="py-3 px-4 text-[11px] font-mono text-slate-700">{u.active_role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel p-5">
        <div className="tiny-label mb-3">Your roles — switch active</div>
        <div className="flex flex-wrap gap-2">
          {user?.roles?.map((r) => (
            <button
              key={r}
              onClick={() => switchRole(r)}
              className={`text-[11px] font-mono px-3 py-1.5 rounded-md border transition ${user?.active_role === r ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}
              data-testid={`admin-switch-${r}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 tiny-label">Recent audit</div>
        <ul>
          {audit.map((a) => (
            <li key={a.id} className="px-5 py-2 border-b border-slate-100 text-xs">
              <span className="font-mono text-slate-900">{a.action}</span>
              <span className="text-slate-500"> · {a.entity_type} · {a.author} · {fmtDate(a.date)}</span>
              {a.justification && <div className="text-slate-600">{a.justification}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
