import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  LayoutDashboard,
  CircuitBoard,
  Database,
  ClipboardCheck,
  Rocket,
  Car,
  GitBranch,
  Settings2,
  LogOut,
  ChevronDown,
  UserCircle2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./ui/dropdown-menu";
import { Toaster } from "./ui/sonner";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/software-releases", label: "Software Releases", icon: CircuitBoard },
  { to: "/datasets", label: "Dataset Catalogue", icon: Database },
  { to: "/review-center", label: "Review Center", icon: ClipboardCheck },
  { to: "/release-center", label: "Release Center", icon: Rocket },
  { to: "/vehicle-assignment", label: "Vehicle Assignment", icon: Car },
  { to: "/traceability", label: "Traceability", icon: GitBranch },
  { to: "/admin", label: "Admin", icon: Settings2 },
];

export default function AppLayout({ children }) {
  const { user, logout, switchRole } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen">
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bar-gradient flex items-center justify-center">
              <span className="text-white font-bold text-sm tracking-tighter">H</span>
            </div>
            <div>
              <div className="font-semibold text-slate-900 tracking-tight" style={{ fontFamily: "Chivo" }}>
                HERKO
              </div>
              <div className="tiny-label -mt-0.5">Calibration Manager</div>
            </div>
          </div>
        </div>
        <div className="px-3 tiny-label pt-4 pb-2">Workspace</div>
        <nav className="px-3 flex-1 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              data-testid={`nav-${n.to.replaceAll("/", "") || "home"}`}
            >
              <n.icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-200">
          <div className="tiny-label px-2 pb-2">Active Role</div>
          <div className="px-2 py-2 rounded-md bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-mono text-slate-700 truncate">{user?.active_role}</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200 px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="tiny-label">ECU</span>
            <span className="text-sm font-medium text-slate-900" style={{ fontFamily: "Chivo" }}>
              ECM — Engine Control Module
            </span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="tiny-label">Env</span>
            <span className="text-xs font-mono text-slate-600">Calibration Data Model</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-md hover:bg-slate-100 transition"
              data-testid="topbar-user-menu"
            >
              <UserCircle2 className="w-6 h-6 text-slate-700" strokeWidth={1.5} />
              <div className="text-left">
                <div className="text-xs font-medium text-slate-900 leading-tight">{user?.name}</div>
                <div className="text-[10px] font-mono text-slate-500 leading-tight">{user?.email}</div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-xs">Switch active role</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={user?.active_role}
                onValueChange={(v) => switchRole(v)}
              >
                {(user?.roles || []).map((r) => (
                  <DropdownMenuRadioItem key={r} value={r} className="text-xs font-mono" data-testid={`switch-role-${r}`}>
                    {r}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
                className="text-xs"
                data-testid="topbar-logout"
              >
                <LogOut className="w-3.5 h-3.5 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 px-8 py-8">{children}</main>
        <Toaster />
      </div>
    </div>
  );
}
