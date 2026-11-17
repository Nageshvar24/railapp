import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import api from "../api/axios";
import { formatMoney } from "../utils/format.js";
import Pagination, { usePagination } from "../components/Pagination.jsx";

const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30";

const fmtDateTime = (v) => (v ? new Date(v).toLocaleString("en-IN") : "-");

export default function Users() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const pagination = usePagination(users, 5);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError("");
        const res = await api.get("auth/admin/users/", {
          params: { search: search.trim() },
        });
        setUsers(res.data.results);
        setTotal(res.data.total);
      } catch (err) {
        setError(
          err.response?.status === 403
            ? "Only admins can view users."
            : "Could not load users."
        );
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Registered Users</h2>
          <p className="text-sm text-slate-500">{total} user(s) registered</p>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} w-64 pl-9`}
            placeholder="Name, username, email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              pagination.reset();
            }}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2.5 pr-3 font-medium">Sr.no</th>
              <th className="py-2.5 pr-3 font-medium">User</th>
              <th className="py-2.5 pr-3 font-medium">Email</th>
              <th className="py-2.5 pr-3 font-medium">Joined</th>
              <th className="py-2.5 pr-3 font-medium">Last login</th>
              <th className="py-2.5 pr-3 font-medium">Tickets booked</th>
              <th className="py-2.5 pr-3 font-medium">Cancelled</th>
              <th className="py-2.5 font-medium">Total spent</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  Loading users...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  No users found.
                </td>
              </tr>
            ) : (
              pagination.pageItems.map((u, i) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-3 text-slate-500">{pagination.start + i + 1}</td>
                  <td className="py-3 pr-3">
                    <div className="font-semibold text-slate-900">{u.full_name || u.username}</div>
                    <div className="text-xs text-slate-500">@{u.username}</div>
                  </td>
                  <td className="py-3 pr-3 text-slate-700">{u.email}</td>
                  <td className="py-3 pr-3 text-xs text-slate-600">{fmtDateTime(u.date_joined)}</td>
                  <td className="py-3 pr-3 text-xs text-slate-600">{fmtDateTime(u.last_login)}</td>
                  <td className="py-3 pr-3">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {u.confirmed_bookings}
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                      {u.cancelled_bookings}
                    </span>
                  </td>
                  <td className="py-3 font-semibold text-slate-900">{formatMoney(u.total_spent)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && <Pagination {...pagination} itemLabel="users" />}
    </section>
  );
}