import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

async function registerUser(payload) {
  try {
    const { data } = await api.post("auth/register/", payload);
    return data;
  } catch (err) {
    const d = err.response?.data;
    const first = d && typeof d === "object" ? Object.values(d).flat()[0] : null;
    throw new Error(
      first ||
        (err.request
          ? "Server can not connect"
          : "Registration failed. Please try again.")
    );
  }
}

/* ---------------------------- Validation ---------------------------- */
const validators = {
  fullName: (v) => (v.trim().length < 2 ? "Enter your full name" : ""),
  username: (v) =>
    /^[a-zA-Z0-9_]{4,20}$/.test(v) ? "" : "4–20 characters: letters, numbers, underscore",
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Enter a valid email address"),
  password: (v) => (v.length < 8 ? "Minimum 8 characters" : ""),
  confirmPassword: (v, form) => (v !== form.password ? "Passwords do not match" : ""),
};

const initialForm = {
  fullName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function getStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

const strengthMeta = [
  { label: "Too weak", bar: "bg-red-500", text: "text-red-600" },
  { label: "Weak", bar: "bg-red-500", text: "text-red-600" },
  { label: "Fair", bar: "bg-amber-500", text: "text-amber-600" },
  { label: "Good", bar: "bg-lime-500", text: "text-lime-600" },
  { label: "Strong", bar: "bg-emerald-500", text: "text-emerald-600" },
];

/* --------------------------- Small pieces --------------------------- */
const features = [
  { icon: "🔍", label: "Search" },
  { icon: "🎫", label: "Book" },
  { icon: "💳", label: "Pay" },
  { icon: "↩️", label: "Refund" },
];

function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a17.6 17.6 0 0 1 4.06-5.06M9.9 5.24A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-2.16 3.19M1 1l22 22" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  );
}

function Field({ id, label, error, hint, icon, right, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-800">
        {icon && <span aria-hidden="true">{icon}</span>}
        {label}
      </label>
      <div className="relative">{children}{right}</div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

const inputBase =
  "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:ring-4";
const inputOk = "border-slate-300 focus:border-slate-900 focus:ring-slate-900/10";
const inputBad = "border-red-400 focus:border-red-500 focus:ring-red-500/15";

/* -------------------------------- Page ------------------------------ */
export default function Registration() {
  const [form, setForm] = useState(initialForm);
  const [touched, setTouched] = useState({});
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | loading | success
  const [serverError, setServerError] = useState("");

  const errors = useMemo(() => {
    const out = {};
    Object.keys(validators).forEach((k) => {
      out[k] = validators[k](form[k], form);
    });
    return out;
  }, [form]);

  const strength = getStrength(form.password);
  const meta = strengthMeta[strength];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setServerError("");
  };

  const handleBlur = (e) => setTouched((t) => ({ ...t, [e.target.name]: true }));

  const shown = (name) => (touched[name] ? errors[name] : "");
  const cls = (name, extra = "") => `${inputBase} ${shown(name) ? inputBad : inputOk} ${extra}`;
  const aria = (name) => ({
    "aria-invalid": shown(name) ? true : undefined,
    "aria-describedby": shown(name) ? `${name}-error` : undefined,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched(Object.keys(form).reduce((a, k) => ({ ...a, [k]: true }), {}));
    if (Object.values(errors).some(Boolean)) return;

    try {
      setStatus("loading");
      setServerError("");
      // eslint-disable-next-line no-unused-vars
      const { confirmPassword, ...payload } = form;
      await registerUser(payload);
      setStatus("success");
    } catch (err) {
      setServerError(err.message);
      setStatus("idle");
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-slate-50">
      <style>{`
        @keyframes rb-ride { from { left: 0; } to { left: calc(100% - 1.75rem); } }
        .rb-train { animation: rb-ride 7s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) { .rb-train { animation: none; } }
      `}</style>

      {/* LEFT */}
      <aside className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-700 lg:flex lg:items-center lg:justify-center">
        <div className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full bg-white/10" />

        <div className="relative z-10 w-full max-w-md px-10">
          <div className="mb-10 flex items-center gap-2.5">
            <span className="text-2xl" aria-hidden="true">🚆</span>
            <span className="text-xl font-bold tracking-tight text-white">RailBook</span>
          </div>

          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">
            Create your account
          </h1>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-slate-300">
            Search trains, book seats and manage your tickets easily.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-3">
            {features.map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-4 backdrop-blur-sm"
              >
                <span className="text-xl" aria-hidden="true">{f.icon}</span>
                <span className="text-sm font-medium text-white">{f.label}</span>
              </div>
            ))}
          </div>

          <div className="relative mt-10 h-7" aria-hidden="true">
            <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-slate-500" />
            <span className="rb-train absolute top-0 text-xl leading-7">🚆</span>
          </div>
        </div>
      </aside>

      {/* RIGHT */}
      <main className="flex w-full items-center justify-center px-4 py-10 sm:px-8 lg:w-1/2">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border-t-4 border-amber-500 bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5">
          {status === "success" ? (
            <div className="px-8 py-14 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
                ✓
              </div>
              <h2 className="mt-5 text-xl font-bold text-slate-900">Account created</h2>
              <p className="mt-2 text-sm text-slate-600">
                Your account is ready. You can now log in with your username and password.
              </p>
              <Link
                to="/login"
                className="mt-7 inline-block rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20"
              >
                Go to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="px-6 py-7 sm:px-8">
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Register Here</h2>

              {serverError && (
                <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  {serverError}
                </div>
              )}

              <div className="mt-6 space-y-4">
                <Field id="fullName" label="Full Name" error={shown("fullName")}>
                  <input
                    id="fullName" name="fullName" type="text" autoComplete="name"
                    placeholder="Your name" value={form.fullName}
                    onChange={handleChange} onBlur={handleBlur}
                    className={cls("fullName")} {...aria("fullName")}
                  />
                </Field>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="username" label="Username" error={shown("username")}>
                    <input
                      id="username" name="username" type="text" autoComplete="username"
                      placeholder="username" value={form.username}
                      onChange={handleChange} onBlur={handleBlur}
                      className={cls("username")} {...aria("username")}
                    />
                  </Field>
                  <Field id="email" label="Email" error={shown("email")}>
                    <input
                      id="email" name="email" type="email" autoComplete="email"
                      placeholder="name@mail.com" value={form.email}
                      onChange={handleChange} onBlur={handleBlur}
                      className={cls("email")} {...aria("email")}
                    />
                  </Field>
                </div>

                <div>
                  <Field
                    id="password" label="Password" error={shown("password")}
                    right={
                      <button
                        type="button" onClick={() => setShowPw((s) => !s)}
                        aria-label={showPw ? "Hide password" : "Show password"}
                        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-900"
                      >
                        <EyeIcon open={showPw} />
                      </button>
                    }
                  >
                    <input
                      id="password" name="password" type={showPw ? "text" : "password"}
                      autoComplete="new-password" placeholder="Min 8 characters"
                      value={form.password} onChange={handleChange} onBlur={handleBlur}
                      className={cls("password", "pr-11")} {...aria("password")}
                    />
                  </Field>

                  {form.password && (
                    <div className="mt-2.5" aria-live="polite">
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4].map((i) => (
                          <span
                            key={i}
                            className={`h-1.5 flex-1 rounded-full transition-colors ${
                              i <= strength ? meta.bar : "bg-slate-200"
                            }`}
                          />
                        ))}
                      </div>
                      <p className={`mt-1.5 text-xs font-medium ${meta.text}`}>{meta.label}</p>
                    </div>
                  )}
                </div>

                <Field
                  id="confirmPassword" label="Confirm Password" error={shown("confirmPassword")}
                  right={
                    <button
                      type="button" onClick={() => setShowConfirm((s) => !s)}
                      aria-label={showConfirm ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-900"
                    >
                      <EyeIcon open={showConfirm} />
                    </button>
                  }
                >
                  <input
                    id="confirmPassword" name="confirmPassword"
                    type={showConfirm ? "text" : "password"} autoComplete="new-password"
                    placeholder="Repeat password" value={form.confirmPassword}
                    onChange={handleChange} onBlur={handleBlur}
                    className={cls("confirmPassword", "pr-11")} {...aria("confirmPassword")}
                  />
                </Field>
              </div>

              <button
                type="submit" disabled={status === "loading"}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {status === "loading" && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                )}
                {status === "loading" ? "Creating account…" : "Create Account"}
              </button>

              <div className="mt-5 text-center text-sm text-slate-600">
                <p>
                  Already have an account?{" "}
                  <Link to="/login" className="font-semibold text-orange-600 hover:underline">
                    Login
                  </Link>
                </p>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}