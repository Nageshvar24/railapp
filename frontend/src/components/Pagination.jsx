/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Client-side pagination hook.
// Use pageItems for the rows, start for serial numbers, reset() when a filter changes.
export function usePagination(items, initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages); // fixes the page after delete or filter
  const start = (current - 1) * pageSize;

  return {
    page: current,
    pageSize,
    total,
    totalPages,
    start,
    from: total ? start + 1 : 0,
    to: Math.min(start + pageSize, total),
    pageItems: items.slice(start, start + pageSize),
    goTo: (p) => setPage(Math.min(Math.max(1, p), totalPages)),
    changePageSize: (n) => {
      setPageSize(Number(n));
      setPage(1);
    },
    reset: () => setPage(1),
  };
}

// Example: [1, "...", 4, 5, 6, "...", 12]
const pageList = (current, last) => {
  const pages = [];
  for (let p = 1; p <= last; p++) {
    if (p === 1 || p === last || Math.abs(p - current) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "...") pages.push("...");
  }
  return pages;
};

const btn =
  "flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";

// Usage: <Pagination {...pagination} itemLabel="bookings" />
export default function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  from,
  to,
  goTo,
  changePageSize,
  pageSizeOptions = [5, 10, 20, 50],
  itemLabel = "items",
}) {
  if (total === 0) return null;

  const sizes = pageSizeOptions.includes(pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, pageSize].sort((a, b) => a - b);

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"
    >
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span>
          Showing <b className="text-slate-900">{from}</b> to <b className="text-slate-900">{to}</b> of{" "}
          <b className="text-slate-900">{total}</b> {itemLabel}
        </span>
        <label className="flex items-center gap-2">
          Rows:
          <select
            value={pageSize}
            onChange={(e) => changePageSize(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
          >
            {sizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => goTo(page - 1)}
            disabled={page === 1}
            aria-label="Previous page"
            className={`${btn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          {pageList(page, totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`dots-${i}`} className="px-1 text-slate-400" aria-hidden="true">
                ...
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => goTo(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
                className={`${btn} ${
                  p === page
                    ? "border-amber-500 bg-amber-500 text-slate-900"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => goTo(page + 1)}
            disabled={page === totalPages}
            aria-label="Next page"
            className={`${btn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}