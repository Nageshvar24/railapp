import { useEffect, useMemo, useState } from "react";
import { Plus, X, TrainFront, Eye, Pencil, Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import api from "../api/axios";
import Pagination, { usePagination } from "../components/Pagination.jsx";


const TRAIN_TYPES = [
  "Rajdhani",
  "Shatabdi",
  "Vande Bharat",
  "Duronto",
  "Superfast",
  "Express",
  "Mail",
  "Passenger",
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Arrival day options: Day 1 = same day the train starts
const ARRIVAL_DAYS = [1, 2, 3, 4, 5, 6, 7];

const arrivalDayLabel = (d) =>
  d === 1 ? "Day 1 (same day)" : d === 2 ? "Day 2 (next day)" : `Day ${d}`;

const CLASSES = [
  { code: "SL", label: "Sleeper (SL)" },
  { code: "3A", label: "AC 3 Tier (3A)" },
  { code: "2A", label: "AC 2 Tier (2A)" },
  { code: "1A", label: "AC First (1A)" },
  { code: "CC", label: "Chair Car (CC)" },
];

const CLASS_LABELS = Object.fromEntries(CLASSES.map((c) => [c.code, c.label]));

// Small success message in the top-right corner
const toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
});

const emptyForm = () => ({
  train_number: "",
  train_name: "",
  train_type: "",
  source: "",
  destination: "",
  departure_time: "", // "HH:mm"
  arrival_time: "", // "HH:mm"
  arrival_day: "1", // 1 = same day, 2 = next day, ...
  running_days: [],
  classes: CLASSES.reduce(
    (acc, c) => ({ ...acc, [c.code]: { enabled: false, seats: "", fare: "" } }),
    {}
  ),
  is_active: true,
});

// Fill the form from an existing train (used for Edit)
const trainToForm = (t) => {
  const base = emptyForm();
  const classes = { ...base.classes };
  (t.classes || []).forEach((c) => {
    if (classes[c.class_code]) {
      classes[c.class_code] = {
        enabled: true,
        seats: String(c.total_seats),
        fare: String(Number(c.fare)),
      };
    }
  });
  return {
    ...base,
    train_number: t.train_number,
    train_name: t.train_name,
    train_type: t.train_type,
    source: t.source,
    destination: t.destination,
    departure_time: (t.departure_time || "").slice(0, 5),
    arrival_time: (t.arrival_time || "").slice(0, 5),
    arrival_day: String(t.arrival_day ?? 1),
    running_days: t.running_days || [],
    classes,
    is_active: t.is_active,
  };
};

// "16:25" -> minutes since midnight (null if invalid)
const toMinutes = (t) => {
  const [h, m] = (t || "").split(":").map(Number);
  const mins = h * 60 + m;
  return Number.isFinite(mins) ? mins : null;
};

// "15h 50m" or "2d 22h 10m" from departure time, arrival time and arrival day
function calcDuration(departure, arrival, arrivalDay = 1) {
  const dep = toMinutes(departure);
  const arr = toMinutes(arrival);
  if (dep === null || arr === null) return "";
  const total = (Number(arrivalDay) - 1) * 1440 + (arr - dep);
  if (total <= 0) return "";
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  return days > 0 ? `${days}d ${hours}h ${mins}m` : `${hours}h ${mins}m`;
}

// "16:25" -> "04:25 PM"
function formatTime(value) {
  const mins = toMinutes(value);
  if (mins === null) return "-";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

const formatFare = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

// Friendly message for network / auth problems. Returns null for anything else.
function describeRequestError(err, action) {
  if (!err.response) return "Cannot reach the server. Make sure the backend is running.";
  if (err.response.status === 401) return "Your session has expired. Please log in again.";
  if (err.response.status === 403)
    return action === "load"
      ? "You do not have permission to view trains."
      : "Only admins can add, edit or delete trains.";
  if (err.response.status === 404)
    return action === "load"
      ? "Trains API not found. Check the trains URLs in config/urls.py."
      : "Train not found. It may already be deleted.";
  return null;
}

const FIELD_LABELS = {
  train_number: "Train number",
  train_name: "Train name",
  train_type: "Train type",
  source: "Source station",
  destination: "Destination station",
  departure_time: "Departure time",
  arrival_time: "Arrival time",
  arrival_day: "Arrival day",
  running_days: "Running days",
  classes: "Classes",
  total_seats: "Total seats",
  fare: "Fare",
  class_code: "Class",
  is_active: "Status",
};

// Flatten DRF error responses (strings, lists, nested objects) into readable messages
function collectMessages(value, label = "") {
  if (typeof value === "string") return [label ? `${label}: ${value}` : value];
  if (Array.isArray(value)) return value.flatMap((v) => collectMessages(v, label));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, v]) => {
      if (/^\d+$/.test(key)) return collectMessages(v, label); // list index
      if (key === "detail" || key === "non_field_errors") return collectMessages(v, "");
      return collectMessages(v, FIELD_LABELS[key] || key);
    });
  return [];
}

const INLINE_FIELDS = [
  "train_number",
  "train_name",
  "train_type",
  "source",
  "destination",
  "departure_time",
  "arrival_time",
  "arrival_day",
  "running_days",
  "classes",
];

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30";

/* ---------- small shared pieces ---------- */

function Field({ label, error, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

function IconButton({ label, onClick, className, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded-lg p-2 transition ${className}`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ active }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

// Shows the time and, when the train arrives after day 1, the arrival day
function TimeCell({ value, day }) {
  return (
    <>
      <div className="text-slate-900">{formatTime(value)}</div>
      {day > 1 && <div className="text-xs text-slate-500">Day {day}</div>}
    </>
  );
}

// Overlay + header. Closes on Escape or outside click and locks background scrolling.
function ModalShell({ title, onClose, maxWidth = "max-w-3xl", children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full ${maxWidth} flex-col rounded-2xl bg-white shadow-xl`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <TrainFront className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Add / Edit modal ---------- */

function TrainFormModal({ train, onClose, onSaved }) {
  const isEdit = Boolean(train);
  const [form, setForm] = useState(() => (train ? trainToForm(train) : emptyForm()));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");

  // Total duration is calculated from departure, arrival and arrival day
  const duration = useMemo(
    () => calcDuration(form.departure_time, form.arrival_time, form.arrival_day),
    [form.departure_time, form.arrival_time, form.arrival_day]
  );

  const set = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const toggleDay = (day) =>
    set(
      "running_days",
      form.running_days.includes(day)
        ? form.running_days.filter((d) => d !== day)
        : [...form.running_days, day]
    );

  const setClass = (code, patch) =>
    setForm((f) => ({
      ...f,
      classes: { ...f.classes, [code]: { ...f.classes[code], ...patch } },
    }));

  const validate = () => {
    const e = {};
    if (!form.train_number.trim()) e.train_number = "Enter the train number";
    else if (!/^\d{4,5}$/.test(form.train_number.trim()))
      e.train_number = "Train number must be 4 or 5 digits";
    if (!form.train_name.trim()) e.train_name = "Enter the train name";
    if (!form.train_type) e.train_type = "Select a train type";
    if (!form.source.trim()) e.source = "Enter the source station";
    if (!form.destination.trim()) e.destination = "Enter the destination station";
    if (
      form.source.trim() &&
      form.source.trim().toLowerCase() === form.destination.trim().toLowerCase()
    )
      e.destination = "Source and destination must be different";
    if (!form.departure_time) e.departure_time = "Select the departure time";
    if (!form.arrival_time) e.arrival_time = "Select the arrival time";
    if (
      form.departure_time &&
      form.arrival_time &&
      Number(form.arrival_day) === 1 &&
      toMinutes(form.arrival_time) <= toMinutes(form.departure_time)
    )
      e.arrival_time =
        "For same day arrival, time must be after departure. Select a later arrival day.";
    if (form.running_days.length === 0) e.running_days = "Select at least one running day";

    const enabled = Object.entries(form.classes).filter(([, v]) => v.enabled);
    if (enabled.length === 0) e.classes = "Select at least one class";
    else if (enabled.some(([, v]) => !(Number(v.seats) > 0) || !(Number(v.fare) > 0)))
      e.classes = "Seats and fare must be greater than 0 for each selected class";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setServerError("");
    if (!validate()) return;

    const payload = {
      train_number: form.train_number.trim(),
      train_name: form.train_name.trim(),
      train_type: form.train_type,
      source: form.source.trim(),
      destination: form.destination.trim(),
      departure_time: form.departure_time,
      arrival_time: form.arrival_time,
      arrival_day: Number(form.arrival_day),
      running_days: form.running_days,
      classes: Object.entries(form.classes)
        .filter(([, v]) => v.enabled)
        .map(([code, v]) => ({
          class_code: code,
          total_seats: Number(v.seats),
          fare: Number(v.fare),
        })),
      is_active: form.is_active,
    };

    try {
      setSaving(true);
      const res = isEdit
        ? await api.put(`trains/update/${train.id}/`, payload)
        : await api.post("trains/add/", payload);
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      const friendly = describeRequestError(err, "write");
      const data = err.response?.data;

      if (friendly) {
        setServerError(friendly);
      } else if (err.response?.status === 400 && data && typeof data === "object") {
        // Field errors go under the matching inputs, everything else in the banner
        const fieldErrors = {};
        INLINE_FIELDS.forEach((key) => {
          if (data[key]) {
            fieldErrors[key] = collectMessages(data[key], key === "classes" ? "Classes" : "")[0];
          }
        });
        setErrors(fieldErrors);

        const rest = Object.fromEntries(
          Object.entries(data).filter(([key]) => !INLINE_FIELDS.includes(key))
        );
        const restMessages = collectMessages(rest);
        if (restMessages.length) setServerError(restMessages.join(" "));
        else if (Object.keys(fieldErrors).length === 0)
          setServerError("Could not save the train. Please check the details and try again.");
      } else {
        setServerError("Could not save the train. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={isEdit ? "Edit Train" : "Add Train"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Basic details */}
          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-900">Train details</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Train number" error={errors.train_number}>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="12951"
                  value={form.train_number}
                  onChange={(e) => set("train_number", e.target.value.replace(/\D/g, ""))}
                />
              </Field>
              <Field label="Train name" error={errors.train_name}>
                <input
                  className={inputCls}
                  placeholder="Mumbai Rajdhani"
                  value={form.train_name}
                  onChange={(e) => set("train_name", e.target.value)}
                />
              </Field>
              <Field label="Train type" error={errors.train_type}>
                <select
                  className={inputCls}
                  value={form.train_type}
                  onChange={(e) => set("train_type", e.target.value)}
                >
                  <option value="">Select type</option>
                  {TRAIN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          {/* Route & timing */}
          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-900">Route and timing</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Source station" error={errors.source}>
                <input
                  className={inputCls}
                  placeholder="Mumbai Central (MMCT)"
                  value={form.source}
                  onChange={(e) => set("source", e.target.value)}
                />
              </Field>
              <Field label="Destination station" error={errors.destination}>
                <input
                  className={inputCls}
                  placeholder="New Delhi (NDLS)"
                  value={form.destination}
                  onChange={(e) => set("destination", e.target.value)}
                />
              </Field>
              <Field label="Departure time (Day 1)" error={errors.departure_time}>
                <input
                  type="time"
                  className={inputCls}
                  value={form.departure_time}
                  onChange={(e) => set("departure_time", e.target.value)}
                />
              </Field>
              <Field label="Arrival day" hint="Day 1 = the day the train starts">
                <select
                  className={inputCls}
                  value={form.arrival_day}
                  onChange={(e) => set("arrival_day", e.target.value)}
                >
                  {ARRIVAL_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {arrivalDayLabel(d)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Arrival time" error={errors.arrival_time}>
                <input
                  type="time"
                  className={inputCls}
                  value={form.arrival_time}
                  onChange={(e) => set("arrival_time", e.target.value)}
                />
              </Field>
              <Field label="Total duration (calculated automatically)">
                <input
                  readOnly
                  tabIndex={-1}
                  className={`${inputCls} cursor-not-allowed bg-slate-50 text-slate-600`}
                  placeholder="Select departure, arrival day and time"
                  value={duration}
                />
              </Field>
            </div>
          </section>

          {/* Running days */}
          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-900">Running days</h3>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const on = form.running_days.includes(d);
                return (
                  <button
                    type="button"
                    key={d}
                    onClick={() => toggleDay(d)}
                    aria-pressed={on}
                    className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
                      on
                        ? "border-amber-500 bg-amber-500 text-slate-900"
                        : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  set("running_days", form.running_days.length === 7 ? [] : [...DAYS])
                }
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 underline-offset-2 hover:underline"
              >
                {form.running_days.length === 7 ? "Clear all" : "Daily"}
              </button>
            </div>
            {errors.running_days && (
              <p className="mt-1 text-xs text-red-600">{errors.running_days}</p>
            )}
          </section>

          {/* Classes, seats, fare */}
          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-900">Classes, seats and fare</h3>
            <div className="space-y-2.5">
              {CLASSES.map((c) => {
                const v = form.classes[c.code];
                return (
                  <div
                    key={c.code}
                    className="grid items-center gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1.4fr_1fr_1fr]"
                  >
                    <label className="flex items-center gap-2.5 text-sm font-medium text-slate-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-amber-500"
                        checked={v.enabled}
                        onChange={(e) => setClass(c.code, { enabled: e.target.checked })}
                      />
                      {c.label}
                    </label>
                    <input
                      type="number"
                      min="1"
                      disabled={!v.enabled}
                      className={`${inputCls} disabled:bg-slate-100 disabled:text-slate-400`}
                      placeholder="Total seats"
                      aria-label={`${c.code} total seats`}
                      value={v.seats}
                      onChange={(e) => setClass(c.code, { seats: e.target.value })}
                    />
                    <input
                      type="number"
                      min="1"
                      disabled={!v.enabled}
                      className={`${inputCls} disabled:bg-slate-100 disabled:text-slate-400`}
                      placeholder="Fare (₹)"
                      aria-label={`${c.code} fare in rupees`}
                      value={v.fare}
                      onChange={(e) => setClass(c.code, { fare: e.target.value })}
                    />
                  </div>
                );
              })}
            </div>
            {errors.classes && <p className="mt-1 text-xs text-red-600">{errors.classes}</p>}
          </section>

          {/* Status */}
          <label className="flex items-center gap-2.5 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-500"
              checked={form.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
            />
            Active (available for booking)
          </label>

          {serverError && (
            <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">{serverError}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:opacity-60"
          >
            {saving ? "Saving..." : isEdit ? "Save changes" : "Save train"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ---------- View modal (read-only) ---------- */

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function TrainViewModal({ train, onClose, onEdit }) {
  const days = train.running_days || [];
  const arrivalDay = train.arrival_day ?? 1;

  return (
    <ModalShell title="Train details" onClose={onClose} maxWidth="max-w-2xl">
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-lg font-bold text-slate-900">{train.train_name}</p>
            <p className="text-sm text-slate-500">Train no. {train.train_number}</p>
          </div>
          <StatusBadge active={train.is_active} />
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Train type">{train.train_type}</Detail>
          <Detail label="Total duration">{train.duration || "-"}</Detail>
          <Detail label="Source">{train.source}</Detail>
          <Detail label="Destination">{train.destination}</Detail>
          <Detail label="Departure time">{formatTime(train.departure_time)} (Day 1)</Detail>
          <Detail label="Arrival time">
            {formatTime(train.arrival_time)} (Day {arrivalDay})
          </Detail>
          <Detail label="Running days">
            {days.length === 7 ? "Daily" : days.join(", ") || "-"}
          </Detail>
        </dl>

        <section>
          <h3 className="mb-2 text-sm font-bold text-slate-900">Classes, seats and fare</h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="px-3 py-2 font-medium">Class</th>
                  <th className="px-3 py-2 font-medium">Total seats</th>
                  <th className="px-3 py-2 font-medium">Fare</th>
                </tr>
              </thead>
              <tbody>
                {(train.classes || []).map((c) => (
                  <tr key={c.class_code} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-900">
                      {CLASS_LABELS[c.class_code] || c.class_code}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{c.total_seats}</td>
                    <td className="px-3 py-2 text-slate-700">{formatFare(c.fare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Close
        </button>
        <button
          onClick={onEdit}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit train
        </button>
      </div>
    </ModalShell>
  );
}

/* ---------- Trains page ---------- */

export default function Trains({ autoOpen = false }) {
  // modal: null | { type: "add" } | { type: "view" | "edit", train }
  const [modal, setModal] = useState(autoOpen ? { type: "add" } : null);
  const [trains, setTrains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const pagination = usePagination(trains, 5);

  const closeModal = () => setModal(null);

  const loadTrains = async () => {
    try {
      setLoadError("");
      const res = await api.get("trains/list/");
      setTrains(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch (err) {
      setLoadError(describeRequestError(err, "load") || "Could not load trains. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrains();
  }, []);

  const handleSaved = (train) => {
    const verb = modal?.type === "edit" ? "updated" : "added";
    toast.fire({
      icon: "success",
      title: `Train ${train.train_number} (${train.train_name}) ${verb} successfully`,
    });
    loadTrains();
  };

  const removeTrain = async (t) => {
    const result = await Swal.fire({
      title: "Delete train?",
      text: `${t.train_number} - ${t.train_name} will be deleted. Its stations will be removed too.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      // The delete request runs inside the popup, so errors show in the popup itself
      preConfirm: async () => {
        try {
          await api.delete(`trains/delete/${t.id}/`);
          return true;
        } catch (err) {
          Swal.showValidationMessage(
            describeRequestError(err, "write") || "Could not delete the train. Please try again."
          );
          return false;
        }
      },
    });

    if (result.isConfirmed) {
      toast.fire({
        icon: "success",
        title: `Train ${t.train_number} (${t.train_name}) deleted`,
      });
      loadTrains();
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">All Trains</h2>
          <button
            onClick={() => setModal({ type: "add" })}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Train
          </button>
        </div>

        {loadError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
            {loadError}
          </p>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-3 font-medium">Train</th>
                <th className="py-2.5 pr-3 font-medium">Route</th>
                <th className="py-2.5 pr-3 font-medium">Departure</th>
                <th className="py-2.5 pr-3 font-medium">Arrival</th>
                <th className="py-2.5 pr-3 font-medium">Duration</th>
                <th className="py-2.5 pr-3 font-medium">Classes</th>
                <th className="py-2.5 pr-3 font-medium">Status</th>
                <th className="py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Loading trains...
                  </td>
                </tr>
              ) : trains.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No trains added yet. Click "Add Train" to add the first one.
                  </td>
                </tr>
              ) : (
                pagination.pageItems.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-slate-900">{t.train_number}</div>
                      <div className="text-slate-700">{t.train_name}</div>
                    </td>
                    <td className="py-3 pr-3 text-slate-700">
                      {t.source} → {t.destination}
                    </td>
                    <td className="py-3 pr-3">
                      <TimeCell value={t.departure_time} day={1} />
                    </td>
                    <td className="py-3 pr-3">
                      <TimeCell value={t.arrival_time} day={t.arrival_day ?? 1} />
                    </td>
                    <td className="py-3 pr-3 text-slate-700">{t.duration || "-"}</td>
                    <td className="py-3 pr-3 text-slate-700">
                      {(t.classes || []).map((c) => c.class_code).join(", ") || "-"}
                    </td>
                    <td className="py-3 pr-3">
                      <StatusBadge active={t.is_active} />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <IconButton
                          label={`View train ${t.train_number}`}
                          onClick={() => setModal({ type: "view", train: t })}
                          className="text-slate-600 hover:bg-slate-100"
                        >
                          <Eye className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label={`Edit train ${t.train_number}`}
                          onClick={() => setModal({ type: "edit", train: t })}
                          className="text-amber-600 hover:bg-amber-100"
                        >
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label={`Delete train ${t.train_number}`}
                          onClick={() => removeTrain(t)}
                          className="text-red-600 hover:bg-red-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && <Pagination {...pagination} itemLabel="trains" />}
      </section>

      {modal?.type === "add" && <TrainFormModal onClose={closeModal} onSaved={handleSaved} />}
      {modal?.type === "edit" && (
        <TrainFormModal train={modal.train} onClose={closeModal} onSaved={handleSaved} />
      )}
      {modal?.type === "view" && (
        <TrainViewModal
          train={modal.train}
          onClose={closeModal}
          onEdit={() => setModal({ type: "edit", train: modal.train })}
        />
      )}
    </div>
  );
}