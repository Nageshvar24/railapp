import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";

const features = [
  { icon: "🔍", label: "Search" },
  { icon: "🎫", label: "Book" },
  { icon: "💳", label: "Pay" },
  { icon: "↩️", label: "Refund" },
];

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data } = await api.post("auth/login/", form);

      localStorage.setItem("access", data.access);
      localStorage.setItem("refresh", data.refresh);
      localStorage.setItem("role", data.role);
      localStorage.setItem("username", data.username);

      navigate(data.role === "admin" ? "/admin/dashboard" : "/home");
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          (err.request ? "Server can not connect " : "Login failed. Try again.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* LEFT PANEL */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-white lg:basis-[52.6%] lg:shrink-0">
        <div className="absolute -top-36 -right-5 h-[330px] w-[360px] rounded-full bg-white/20" />

        <div className="relative max-w-xl px-6 py-10 lg:px-12 lg:py-16">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🚆</span>
            <span className="text-2xl font-bold">RailBook</span>
          </div>

          <h1 className="mt-10 mb-3 text-3xl font-bold leading-tight lg:mt-12 lg:text-4xl">
            Your journey starts here
          </h1>
          <p className="mb-7 max-w-sm text-[15px] leading-7 text-slate-300">
            Search trains, book seats and manage your tickets easily.
          </p>

          <div className="grid max-w-[384px] grid-cols-2 gap-x-3 gap-y-3.5">
            {features.map((f) => (
              <div
                key={f.label}
                className="flex h-[62px] items-center gap-3.5 rounded-xl border border-white/10 bg-white/5 px-4 text-sm"
              >
                <span className="text-2xl">{f.icon}</span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-7 flex max-w-[384px] items-center">
            <span className="text-2xl">🚆</span>
            <span className="ml-1 flex-1 border-t-2 border-dashed border-slate-300/60" />
          </div>
        </div>
      </section>

      {/* RIGHT PANEL */}
      <section className="flex flex-1 items-center justify-center bg-slate-50 p-6 lg:p-8">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md rounded-[20px] border-t-4 border-amber-500 bg-white p-8 shadow-2xl shadow-slate-900/10"
        >
          <h2 className="mt-4 text-2xl font-bold text-slate-900">Login</h2>
          <p className="mb-6 text-[13px] text-slate-500">
            Welcome back, please login
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-100 px-3 py-2.5 text-[13px] text-red-800">
              {error}
            </div>
          )}

          <label htmlFor="username" className="mb-2 block text-[13px] font-semibold text-slate-900">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            placeholder="username"
            value={form.username}
            onChange={handleChange}
            autoComplete="username"
            required
            className="mb-[18px] h-[46px] w-full rounded-[10px] border border-slate-300 px-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/25"
          />

          <label htmlFor="password" className="mb-2 block text-[13px] font-semibold text-slate-900">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            autoComplete="current-password"
            required
            className="mb-[18px] h-[46px] w-full rounded-[10px] border border-slate-300 px-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/25"
          />

          <button
            type="submit"
            disabled={loading}
            className="mt-1 h-12 w-full rounded-[10px] bg-gray-900 text-[15px] font-semibold text-white transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          <p className="mt-5 text-center text-[13px] text-slate-600">
            New here?{" "}
            <Link to="/register" className="font-bold text-orange-700 hover:underline">
              Register
            </Link>
          </p>
        </form>
      </section>
    </div>
  );
}