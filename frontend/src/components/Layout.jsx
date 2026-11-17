import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  TrainFront,
  MapPin,
  Ticket,
  CreditCard,
  Users,
  Menu,
  LogOut,
} from "lucide-react";
import api from "../api/axios";

const menu = [
  { icon: LayoutDashboard, label: "Dashboard", to: "/admin/dashboard" },
  { icon: TrainFront, label: "Trains", to: "/admin/trains" },
  { icon: MapPin, label: "Stations", to: "/admin/stations" },
  { icon: Ticket, label: "Bookings", to: "/admin/bookings" },
  { icon: CreditCard, label: "Refunds", to: "/admin/refunds" },
  { icon: Users, label: "Users", to: "/admin/users" },
];

export default function Layout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // The sidebar is open by default (except on very small screens).
  // Clicking the menu icon slides it in or out.
  const [open, setOpen] = useState(() => window.innerWidth >= 768);

  const title =
    menu.find((m) => pathname.startsWith(m.to))?.label ?? "Admin";

  const logout = async () => {
    try {
      await api.post("auth/logout/", {
        refresh: localStorage.getItem("refresh"),
      });
    } catch (err) {
      console.log("Logout error:", err.message);
    }

    localStorage.clear();
    navigate("/login", { replace: true });
  };

  const toggleSidebar = () => {
    setOpen((prev) => !prev);
  };

  return (
    <div className="flex min-h-screen w-full bg-slate-100">

      {/* SIDEBAR */}
      <aside
        className={`flex min-h-screen shrink-0 flex-col overflow-hidden bg-slate-900 text-white transition-[width] duration-300 ease-in-out ${
          open ? "w-64" : "w-0"
        }`}
      >
        {/* SIDEBAR HEADER */}
        <div className="flex min-w-64 items-center gap-2 border-b border-white/10 px-3 py-5">

          <TrainFront
            className="h-7 w-7 shrink-0 text-amber-500"
            aria-hidden="true"
          />

          <span className="whitespace-nowrap text-xl font-bold">
            RailBook
          </span>

          <span className="whitespace-nowrap rounded bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-slate-900">
            ADMIN
          </span>

          {/* THREE LINE MENU ICON: closes the sidebar */}
          <button
            onClick={toggleSidebar}
            className="ml-auto shrink-0 rounded-lg border border-slate-300 p-2"
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            <Menu className="h-5 w-5 text-amber-500" />
          </button>
        </div>

        {/* SIDEBAR MENU */}
        <nav className="min-w-64 flex-1 space-y-1 p-4">
          {menu.map(({ icon: Icon, label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm font-medium transition ${
                  isActive
                    ? "bg-amber-500 text-slate-900"
                    : "text-slate-300 hover:bg-white/10"
                }`
              }
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* HEADER */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5">

          <div className="flex items-center gap-3">

            {/* MENU ICON: only shown when the sidebar is closed, opens it */}
            {!open && (
              <button
                onClick={toggleSidebar}
                className="rounded-lg border border-slate-300 p-2"
                aria-label="Open sidebar"
                title="Open sidebar"
              >
                <Menu className="h-5 w-5 text-amber-500" />
              </button>
            )}

            <h1 className="text-lg font-bold text-slate-900">
              {title}
            </h1>
          </div>

          {/* USER AND LOGOUT */}
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-slate-600 sm:inline">
              Hi,{" "}
              <b className="text-slate-900">
                {localStorage.getItem("username")}
              </b>
            </span>

            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-700"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Logout
            </button>
          </div>
        </header>

        {/* CURRENT PAGE */}
        <main className="min-w-0 flex-1 space-y-6 p-5 lg:p-8">
          <Outlet />
        </main>

      </div>
    </div>
  );
}