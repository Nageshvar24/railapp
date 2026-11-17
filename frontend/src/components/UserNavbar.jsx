import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";

// Shared navbar for the user pages. The page decides the background color.
export default function UserNavbar() {
  const navigate = useNavigate();

  const logout = async () => {
    try {
      await api.post("auth/logout/", {
        refresh: localStorage.getItem("refresh"),
      });
    } catch (err) {
      console.log("Logout error:", err.message);
    }
    localStorage.clear();
    sessionStorage.removeItem("railbook_search");
    navigate("/login", { replace: true });
  };

  return (
    <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-4 print:hidden">
      <Link to="/home" className="flex items-center gap-2.5">
        <span className="text-2xl" aria-hidden="true">🚆</span>
        <span className="text-xl font-bold">HOME</span>
      </Link>

      <div className="flex items-center gap-4 text-sm">
        <Link to="/my-bookings" className="font-medium text-slate-200 hover:text-white">
          My Bookings
        </Link>
        <span className="hidden text-slate-300 sm:inline">
          Hi, {localStorage.getItem("username")}
        </span>
        <button
          onClick={logout}
          className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-slate-900 transition hover:bg-amber-400"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}