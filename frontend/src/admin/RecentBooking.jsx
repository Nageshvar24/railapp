import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import api from "../api/axios";
import { formatDate, formatMoney } from "../utils/format.js";
import Pagination, { usePagination } from "../components/Pagination.jsx";

const statusCls = {
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30";

export default function RecentBooking() {
  const [bookings, setBookings] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const pagination = usePagination(bookings, 5);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError("");
        const res = await api.get("bookings/admin/all/", {
          params: { search: search.trim(), status },
        });
        setBookings(res.data.results);
        setTotal(res.data.total);
      } catch (err) {
        setError(
          err.response?.status === 403
            ? "Only admins can view bookings."
            : "Could not load bookings."
        );
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, status]);

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">All Bookings</h2>
          <p className="text-sm text-slate-500">{total} booking(s) found</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputCls} w-64 pl-9`}
              placeholder="PNR, user, train..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pagination.reset();
              }}
            />
          </div>
          <select
            className={inputCls}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              pagination.reset();
            }}
          >
            <option value="">All status</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2.5 pr-3 font-medium">PNR</th>
              <th className="py-2.5 pr-3 font-medium">User</th>
              <th className="py-2.5 pr-3 font-medium">Train</th>
              <th className="py-2.5 pr-3 font-medium">Route</th>
              <th className="py-2.5 pr-3 font-medium">Travel date</th>
              <th className="py-2.5 pr-3 font-medium">Class</th>
              <th className="py-2.5 pr-3 font-medium">Passengers</th>
              <th className="py-2.5 pr-3 font-medium">Amount</th>
              <th className="py-2.5 pr-3 font-medium">Payment</th>
              <th className="py-2.5 pr-3 font-medium">Status</th>
              <th className="py-2.5 font-medium">Booked on</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="py-8 text-center text-slate-500">
                  Loading bookings...
                </td>
              </tr>
            ) : bookings.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-8 text-center text-slate-500">
                  No bookings yet.
                </td>
              </tr>
            ) : (
              pagination.pageItems.map((b) => (
                <tr key={b.pnr} className="border-b border-slate-100 align-top last:border-0">
                  <td className="py-3 pr-3 font-mono font-semibold text-slate-900">{b.pnr}</td>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-slate-900">{b.username}</div>
                    <div className="text-xs text-slate-500">{b.email}</div>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-slate-900">{b.train_number}</div>
                    <div className="text-xs text-slate-500">{b.train_name}</div>
                  </td>
                  <td className="py-3 pr-3 text-slate-700">
                    {b.from_code} → {b.to_code}
                  </td>
                  <td className="py-3 pr-3 text-slate-700">{formatDate(b.travel_date)}</td>
                  <td className="py-3 pr-3 text-slate-700">{b.class_code}</td>
                  <td className="py-3 pr-3 text-slate-700">
                    {b.passengers.map((p) => (
                      <div key={p.id} className="text-xs">
                        {p.name} <span className="text-slate-400">({p.seat})</span>
                      </div>
                    ))}
                  </td>
                  <td className="py-3 pr-3 font-semibold text-slate-900">
                    {formatMoney(b.total_amount)}
                  </td>
                  <td className="py-3 pr-3 text-slate-700">{b.payment_method}</td>
                  <td className="py-3 pr-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        statusCls[b.status] || "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-slate-600">
                    {new Date(b.created_at).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && <Pagination {...pagination} itemLabel="bookings" />}
    </section>
  );
}