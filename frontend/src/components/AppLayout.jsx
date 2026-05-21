import React, { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  LayoutDashboard, CircuitBoard, Database, ClipboardCheck,
  Rocket, Car, GitBranch, Settings2, LogOut, ChevronDown,
  UserCircle2, Plus, Search, RefreshCw, Home, Layers,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "./ui/dropdown-menu";
import { Toaster } from "./ui/sonner";

/* ── Ribbon tab definitions ─────────────────────────────────────────────── */
const TABS = [
  {
    id: "home",
    label: "Home",
    groups: [
      {
        label: "Navigate",
        items: [
          { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
          { to: "/software-releases", label: "SW Releases", icon: CircuitBoard },
          { to: "/datasets", label: "Datasets", icon: Database },
        ],
      },
      {
        label: "Workflow",
        items: [
          { to: "/review-center", label: "Review", icon: ClipboardCheck },
          { to: "/release-center", label: "Release", icon: Rocket },
          { to: "/vehicle-assignment", label: "Vehicles", icon: Car },
        ],
      },
      {
        label: "Tools",
        items: [
          { to: "/traceability", label: "Traceability", icon: GitBranch },
          { to: "/work-packages", label: "WorkPackages", icon: Layers },
          { to: "/admin", label: "Admin", icon: Settings2 },
        ],
      },
    ],
  },
  {
    id: "view",
    label: "View",
    groups: [
      {
        label: "Pages",
        items: [
          { to: "/datasets", label: "Catalogue", icon: Database },
          { to: "/traceability", label: "Traceability", icon: GitBranch },
        ],
      },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    groups: [
      {
        label: "Administration",
        items: [
          { to: "/admin", label: "Admin Panel", icon: Settings2 },
        ],
      },
    ],
  },
  {
    id: "herko",
    label: "HERKO View",
    groups: [
      {
        label: "HERKO Design",
        items: [
          { to: "/herko/datasets", label: "Datasets", icon: Database },
          { to: "/herko/labels", label: "Labels", icon: Layers },
        ],
      },
    ],
  },
];

function RibbonBtn({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `rb-btn${isActive ? " active" : ""}`}
    >
      <Icon size={20} strokeWidth={1.5} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function AppLayout({ children }) {
  const { user, logout, switchRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("home");

  const tab = TABS.find((t) => t.id === activeTab) || TABS[0];

  /* derive current page label for status bar */
  const currentNav = TABS.flatMap((t) => t.groups.flatMap((g) => g.items))
    .find((i) => i.end ? location.pathname === i.to : location.pathname.startsWith(i.to));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      {/* ── Ribbon root ─────────────────────────────────────────────────── */}
      <div className="ribbon-root">

        {/* Title bar */}
        <div className="ribbon-title-bar">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/favicons/favicon-32x32.png" alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
            <span className="ribbon-app-name">HERKO Calibration Manager</span>
          </div>

          <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.75 }}>
            ECM — Engine Control Module
          </span>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "2px 8px", background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.25)", cursor: "pointer",
                color: "#fff", fontSize: 11,
              }}
              data-testid="topbar-user-menu"
            >
              <UserCircle2 size={14} strokeWidth={1.5} />
              <span>{user?.name}</span>
              <ChevronDown size={11} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={{ minWidth: 240, fontSize: 12 }}>
              <DropdownMenuLabel style={{ fontSize: 11 }}>Switch active role</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={user?.active_role} onValueChange={(v) => switchRole(v)}>
                {(user?.roles || []).map((r) => (
                  <DropdownMenuRadioItem key={r} value={r} style={{ fontSize: 11, fontFamily: "monospace" }} data-testid={`switch-role-${r}`}>
                    {r}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => { logout(); navigate("/login"); }}
                style={{ fontSize: 11 }}
                data-testid="topbar-logout"
              >
                <LogOut size={12} style={{ marginRight: 6 }} /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Tab strip */}
        <div className="ribbon-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`ribbon-tab${activeTab === t.id ? " active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Ribbon content (command groups) ─────────────────────────────── */}
      <div className="ribbon-content">
        {tab.groups.map((g) => (
          <div key={g.label} className="ribbon-group">
            <div className="ribbon-group-buttons">
              {g.items.map((item) => (
                <RibbonBtn key={item.to} {...item} />
              ))}
            </div>
            <div className="ribbon-group-label">{g.label}</div>
          </div>
        ))}
      </div>

      {/* ── Page content ────────────────────────────────────────────────── */}
      <main className="page-content" style={{ flex: 1 }}>
        {children}
      </main>

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      <div className="ms-statusbar">
        <span>{currentNav?.label || "HERKO"}</span>
        <span style={{ opacity: 0.6 }}>|</span>
        <span style={{ fontFamily: "monospace", fontSize: 10 }}>{user?.active_role}</span>
        <span style={{ marginLeft: "auto", opacity: 0.7 }}>
          {user?.email}
        </span>
      </div>

      <Toaster position="top-right" />
    </div>
  );
}
