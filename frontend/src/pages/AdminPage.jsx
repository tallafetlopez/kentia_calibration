import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { RefreshCw, Users } from "lucide-react";
import { ROLES_LIST, fmtDate } from "../lib/constants";
import { useAuth } from "../lib/auth";

export default function AdminPage() {
  const { user, switchRole } = useAuth();
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [busy, setBusy] = useState(false);
  const [editingRoles, setEditingRoles] = useState({}); // { userId: Set<role> }
  const [savingRoles, setSavingRoles] = useState({});   // { userId: bool }

  const isAdmin = (user?.roles || []).includes("DM_Administrator");

  const load = async () => {
    const u = await api.get("/auth/users");
    setUsers(u.data);
    const a = await api.get("/audit-log", { params: { limit: 20 } });
    setAudit(a.data);
  };
  useEffect(() => { load(); }, []);

  const startEditRoles = (u) => {
    setEditingRoles(prev => ({ ...prev, [u.id]: new Set(u.roles) }));
  };

  const cancelEditRoles = (userId) => {
    setEditingRoles(prev => { const n = {...prev}; delete n[userId]; return n; });
  };

  const toggleRole = (userId, role) => {
    setEditingRoles(prev => {
      const s = new Set(prev[userId]);
      s.has(role) ? s.delete(role) : s.add(role);
      return { ...prev, [userId]: s };
    });
  };

  const saveRoles = async (userId) => {
    const roles = Array.from(editingRoles[userId] || []);
    if (!roles.length) { toast.error("User must have at least one role"); return; }
    setSavingRoles(prev => ({ ...prev, [userId]: true }));
    try {
      await api.patch(`/auth/users/${userId}/roles`, { roles });
      toast.success("Roles updated");
      cancelEditRoles(userId);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to update roles");
    } finally {
      setSavingRoles(prev => ({ ...prev, [userId]: false }));
    }
  };

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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="page-admin">
      <div style={{ borderBottom: "1px solid #C8C8C8", paddingBottom: 10 }}>
        <div className="tiny-label">Workflow 9</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: "4px 0 2px", color: "#212121" }}>Admin · Role simulation & seed</h1>
        <p style={{ fontSize: 12, color: "#605E5C", margin: 0 }}>Inspect users, switch role, reseed the demo dataset.</p>
      </div>

      <div className="panel" style={{ padding: "12px 14px" }}>
        <div className="tiny-label" style={{ marginBottom: 8 }}>Demo seed</div>
        <p style={{ fontSize: 12, color: "#605E5C", margin: "0 0 10px" }}>Reset the database to seeded demo state with 9 users, 3 software releases, 10 datasets and 200 labels.</p>
        <button onClick={reseed} disabled={busy} className="ms-btn primary" data-testid="admin-reseed">
          <RefreshCw size={12} style={{ animation: busy ? "spin 1s linear infinite" : "none" }} /> Reseed demo data
        </button>
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #C8C8C8", background: "#F0F0F0", display: "flex", alignItems: "center", gap: 8 }}>
          <Users style={{ width: 13, height: 13, color: "#212121" }} />
          <span className="tiny-label">Users & roles</span>
        </div>
        <table className="xl-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Active role</th>
              {isAdmin && <th>Edit roles</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const editing = !!editingRoles[u.id];
              return (
                <tr key={u.id} data-testid={`user-row-${u.email}`}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>{u.email}</td>
                  <td>
                    {editing ? (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {ROLES_LIST.map(r => (
                          <label key={r} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontFamily: "monospace", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={editingRoles[u.id]?.has(r) || false}
                              onChange={() => toggleRole(u.id, r)}
                            />
                            {r}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {u.roles.map((r) => (
                          <span key={r} style={{ fontSize: 9, fontFamily: "monospace", background: "#F3F3F3", color: "#605E5C", border: "1px solid #C8C8C8", padding: "1px 5px" }}>{r}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>{u.active_role}</td>
                  {isAdmin && (
                    <td>
                      {editing ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            className="ms-btn primary"
                            style={{ fontSize: 10, padding: "2px 8px" }}
                            disabled={savingRoles[u.id]}
                            onClick={() => saveRoles(u.id)}
                          >
                            {savingRoles[u.id] ? "…" : "Save"}
                          </button>
                          <button
                            className="ms-btn"
                            style={{ fontSize: 10, padding: "2px 8px" }}
                            onClick={() => cancelEditRoles(u.id)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="ms-btn"
                          style={{ fontSize: 10, padding: "2px 8px" }}
                          onClick={() => startEditRoles(u)}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ padding: "12px 14px" }}>
        <div className="tiny-label" style={{ marginBottom: 8 }}>Your roles — switch active</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {user?.roles?.map((r) => (
            <button
              key={r}
              onClick={() => switchRole(r)}
              className={user?.active_role === r ? "ms-btn primary" : "ms-btn"}
              style={{ fontSize: 11, fontFamily: "monospace" }}
              data-testid={`admin-switch-${r}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #C8C8C8", background: "#F0F0F0" }}>
          <span className="tiny-label">Recent audit</span>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {audit.map((a) => (
            <li key={a.id} style={{ padding: "6px 14px", borderBottom: "1px solid #E8E8E8", fontSize: 11 }}>
              <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#212121" }}>{a.action}</span>
              <span style={{ color: "#605E5C" }}> · {a.entity_type} · {a.author} · {fmtDate(a.date)}</span>
              {a.justification && <div style={{ color: "#605E5C", fontSize: 10, marginTop: 2 }}>{a.justification}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
