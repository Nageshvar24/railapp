import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import UserNavbar from "../components/UserNavbar.jsx";
import TrainResults from "./TrainResults.jsx";

const STORAGE_KEY = "railbook_search";

// This code runs only once, when the page is loaded in the browser.
// If the page was refreshed (F5 / reload button), the old search is removed,
// so the user sees an empty search form again.
// Moving to another page and coming back ("Back to results") is NOT a reload,
// so the saved search is kept for that case.
try {
  const nav = performance.getEntriesByType("navigation")[0];
  if (nav?.type === "reload") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
} catch {
  // ignore: the search will simply be kept
}

const features = [
  {
    icon: "🔍",
    title: "Search Trains",
    text: "Find trains between any two stations with live seat availability.",
  },
  {
    icon: "🎫",
    title: "Instant Tickets",
    text: "Book your seat in seconds and get your ticket right away.",
  },
  {
    icon: "↩️",
    title: "Easy Refunds",
    text: "Cancel a booking and get your refund without any hassle.",
  },
];

const selectCls =
  "h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-[15px] text-slate-700 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-500/25";

// The last search is kept in the session, so "Back to results" works from the booking page
const loadSaved = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
};

export default function UserDashboard() {
  const navigate = useNavigate();
  const [saved] = useState(loadSaved);
  const [stations, setStations] = useState([]);
  const [search, setSearch] = useState(saved?.search || { from: "", to: "", date: "" });
  const [results, setResults] = useState(saved?.results ?? null); // null = no search done yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toISOString().split("T")[0];

  // Load all stations added by the admin for the From / To dropdowns
  useEffect(() => {
    api
      .get("stations/names/")
      .then((res) => setStations(res.data))
      .catch(() => setError("Could not load stations. Please try again."));
  }, []);

  // The saved results can be old (seats may have been booked since), so search again
  // when the page opens. The old results stay visible until the new ones arrive.
  useEffect(() => {
    const s = saved?.search;
    if (!s?.from || !s?.to || !s?.date) return;

    api
      .get("trains/search/", { params: s })
      .then((res) => {
        setResults(res.data);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ search: s, results: res.data }));
      })
      .catch(() => {
        // keep showing the saved results if the refresh fails
      });
  }, [saved]);

  const handleChange = (e) => {
    setSearch({ ...search, [e.target.name]: e.target.value });
    setResults(null);
    setError("");
    sessionStorage.removeItem(STORAGE_KEY);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setError("");

    if (!search.from || !search.to || !search.date) {
      setError("Please select From, To and Date");
      return;
    }
    if (search.from === search.to) {
      setError("From and To stations cannot be same");
      return;
    }

    try {
      setLoading(true);
      const res = await api.get("trains/search/", { params: search });
      setResults(res.data);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ search, results: res.data }));
    } catch (err) {
      setResults(null);
      setError(
        err.response?.data?.detail ||
          (err.request ? "Cannot reach the server" : "Search failed. Please try again.")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBook = (train) =>
    navigate("/book", { state: { train, date: search.date } });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* HERO */}
      <header className="relative overflow-hidden bg-slate-900 text-white">
        <div className="pointer-events-none absolute -right-16 -top-40 h-80 w-80 rounded-full bg-neutral-800 sm:h-96 sm:w-96" />

        <UserNavbar />

        {/* HERO TEXT */}
        <div className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-12 sm:pt-16">
          <h1 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
            Book your railway journey in a few clicks
          </h1>
          <p className="mt-4 text-[15px] text-slate-300">
            Fast, secure and simple train ticket booking across the country.
          </p>

          {/* SEARCH BOX */}
          <form
            onSubmit={handleSearch}
            className="mt-10 grid gap-3 rounded-2xl bg-white p-4 shadow-xl sm:grid-cols-2 lg:grid-cols-4"
          >
            <select name="from" value={search.from} onChange={handleChange} className={selectCls}>
              <option value="">From</option>
              {stations
                .filter((s) => s.station_code !== search.to)
                .map((s) => (
                  <option key={s.station_code} value={s.station_code}>
                    {s.station_name} ({s.station_code})
                  </option>
                ))}
            </select>

            <select name="to" value={search.to} onChange={handleChange} className={selectCls}>
              <option value="">To</option>
              {stations
                .filter((s) => s.station_code !== search.from)
                .map((s) => (
                  <option key={s.station_code} value={s.station_code}>
                    {s.station_name} ({s.station_code})
                  </option>
                ))}
            </select>

            <input
              type="date"
              name="date"
              min={today}
              value={search.date}
              onChange={handleChange}
              className={selectCls}
            />

            <button
              type="submit"
              disabled={loading}
              className="h-12 rounded-lg bg-slate-900 text-[15px] font-semibold text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Searching..." : "Search Trains"}
            </button>
          </form>

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </header>

      {/* SEARCH RESULTS or FEATURE CARDS */}
      {results !== null ? (
        <main className="mx-auto max-w-6xl px-5 py-10">
          <TrainResults results={results} onBook={handleBook} />
        </main>
      ) : (
        <main className="mx-auto grid max-w-6xl gap-6 px-5 py-12 md:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border-t-4 border-amber-500 bg-white p-6 shadow-md ring-1 ring-slate-900/5"
            >
              <span className="text-3xl" aria-hidden="true">{f.icon}</span>
              <h3 className="mt-4 text-base font-bold text-slate-900">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{f.text}</p>
            </div>
          ))}
        </main>
      )}
    </div>
  );
}