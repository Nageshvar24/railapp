import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrainFront, MapPin, Ticket, IndianRupee } from "lucide-react";
import api from "../api/axios";
import { formatDate, formatMoney } from "../utils/format.js";

const statusCls = {
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get("bookings/admin/stats/"),
      api.get("bookings/admin/all/", { params: { limit: 5 } }),
    ])
      .then(([s, b]) => {
        setStats(s.data);
        setRecent(b.data.results);
      })
      .catch(() => setError("Could not load dashboard data."))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { icon: TrainFront, label: "Total Trains", value: stats?.total_trains },
    { icon: MapPin, label: "Stations", value: stats?.total_stations },
    { icon: Ticket, label: "Bookings Today", value: stats?.bookings_today },
    {
      icon: IndianRupee,
      label: "Total Revenue",
      value: stats ? formatMoney(stats.revenue) : undefined,
    },
  ];

  return (
    <>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Statistics */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="rounded-2xl border-t-4 border-amber-500 bg-white p-5 shadow-sm ring-1 ring-slate-900/5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">{c.label}</span>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {loading ? "..." : c.value ?? "-"}
              </p>
            </div>
          );
        })}
      </section>

      {/* Booking summary */}
      {stats && (
        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Total bookings", stats.total_bookings],
            ["Confirmed", stats.confirmed],
            ["Cancelled", stats.cancelled],
            ["Passengers travelling", stats.total_passengers],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </section>
      )}

      {/* Recent bookings */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Recent Bookings</h2>
          <Link
            to="/admin/bookings"
            className="text-sm font-semibold text-amber-700 hover:underline"
          >
            View all
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 font-medium">PNR</th>
                <th className="py-2.5 font-medium">User</th>
                <th className="py-2.5 font-medium">Route</th>
                <th className="py-2.5 font-medium">Date</th>
                <th className="py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    Loading...
                  </td>
                </tr>
              ) : recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    No bookings yet.
                  </td>
                </tr>
              ) : (
                recent.map((b) => (
                  <tr key={b.pnr} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 font-mono font-semibold text-slate-900">{b.pnr}</td>
                    <td className="py-3 text-slate-700">{b.username}</td>
                    <td className="py-3 text-slate-700">
                      {b.from_name} → {b.to_name}
                    </td>
                    <td className="py-3 text-slate-700">{formatDate(b.travel_date)}</td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          statusCls[b.status] || "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}