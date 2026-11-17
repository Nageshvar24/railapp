import { formatMoney, formatTime } from "../utils/format.js";
import Pagination, { usePagination } from "../components/Pagination.jsx";

// The cheapest class is shown on the card (like "from ₹980")
const cheapestClass = (classes) =>
  classes.reduce((min, c) => (!min || c.fare < min.fare ? c : min), null);

export default function TrainResults({ results, onBook }) {
  // Hooks must run before any early return
  const pagination = usePagination(results, 5);

  if (results.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-md ring-1 ring-slate-900/5">
        <p className="text-base font-semibold text-slate-900">No trains found</p>
        <p className="mt-1 text-sm text-slate-500">
          There are no trains on this route for the selected date. Try another date or station.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-base font-semibold text-slate-900">
        {results.length} train{results.length > 1 ? "s" : ""} found
      </p>

      {pagination.pageItems.map((t) => {
        const cheapest = cheapestClass(t.classes);
        const soldOut = t.classes.every((c) => c.seats_left === 0);
        const days = t.running_days || [];
        const low = cheapest && cheapest.seats_left <= 10;

        return (
          <article
            key={t.id}
            className="grid items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/10 md:grid-cols-[1.2fr_1.6fr_auto]"
          >
            {/* Train name */}
            <div>
              <h3 className="text-base font-bold text-slate-900">{t.train_name}</h3>
              <p className="text-sm text-slate-500">#{t.train_number}</p>
              <p className="mt-1 text-xs text-slate-400">
                {t.train_type} · {days.length === 7 ? "Daily" : days.join(", ")}
              </p>
            </div>

            {/* Times */}
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-900">
                  {formatTime(t.from.departure_time)}
                </p>
                <p className="text-xs text-slate-500">{t.from.station_name}</p>
              </div>

              <span className="flex items-center gap-2 text-xs text-slate-400">
                <span className="h-px w-5 bg-slate-300" />
                {t.duration || "-"}
                <span className="h-px w-5 bg-slate-300" />
              </span>

              <div className="text-center">
                <p className="text-lg font-bold text-slate-900">
                  {formatTime(t.to.arrival_time)}
                  {t.to.day_offset > 0 && (
                    <span className="ml-1 text-[11px] font-medium text-slate-400">
                      +{t.to.day_offset}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">{t.to.station_name}</p>
              </div>
            </div>

            {/* Price and book button */}
            <div className="text-right">
              {cheapest && (
                <>
                  <p className="text-xl font-bold text-amber-600">
                    {formatMoney(cheapest.fare)}
                  </p>
                  <p
                    className={`text-xs ${
                      soldOut || low ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {soldOut
                      ? "Sold out"
                      : `${cheapest.class_code} · ${cheapest.seats_left} seats left`}
                  </p>
                </>
              )}
              <button
                onClick={() => onBook(t)}
                disabled={soldOut}
                className="mt-2 rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Book Now
              </button>
            </div>
          </article>
        );
      })}

      <Pagination {...pagination} pageSizeOptions={[5, 10, 20]} itemLabel="trains" />
    </div>
  );
}