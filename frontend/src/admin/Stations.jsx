import { useEffect, useState } from "react";
import { Plus, X, MapPin, Pencil, Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import api from "../api/axios";
import Pagination, { usePagination } from "../components/Pagination.jsx";


const toMinutes = (t) => {
  const [h, m] = (t || "").split(":").map(Number);
  const mins = h * 60 + m;
  return Number.isFinite(mins) ? mins : null;
};

function formatTime(value) {
  const mins = toMinutes(value);
  if (mins === null) return null;
  const h = Math.floor(mins / 60);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

const calcHalt = (arr, dep) => {
  const a = toMinutes(arr);
  const d = toMinutes(dep);
  if (a === null || d === null) return "";
  return `${(d - a + 1440) % 1440} min`;
};

// "Mumbai Central (MMCT)" -> { name: "Mumbai Central", code: "MMCT" }
// If the train has no code in brackets, the code is left empty for the admin to type
const parseStation = (text) => {
  const value = (text || "").trim();
  const m = /^(.*?)\s*\(([A-Za-z0-9]{2,10})\)\s*$/.exec(value);
  return m ? { name: m[1].trim(), code: m[2].toUpperCase() } : { name: value, code: "" };
};

// Turn DRF error JSON into readable strings
const flatten = (v) =>
  typeof v === "string"
    ? [v]
    : Array.isArray(v)
    ? v.flatMap(flatten)
    : v && typeof v === "object"
    ? Object.values(v).flatMap(flatten)
    : [];

// Fields that have an input in the form (server errors for these show under the input)
const FORM_FIELDS = [
  "stop_order",
  "station_name",
  "station_code",
  "arrival_time",
  "departure_time",
  "day",
  "leg_km",
  "platform",
];

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

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

/* ---------- Add / Edit station modal ---------- */
function StopFormModal({ train, stop, nextOrder, onClose, onSaved }) {
  const isEdit = Boolean(stop);

  // Stop 1 = source of the train, last stop = destination of the train
  const sourceInfo = parseStation(train.source);
  const destInfo = parseStation(train.destination);

  const applyFirst = (f) => ({
    ...f,
    station_name: sourceInfo.name,
    station_code: sourceInfo.code || f.station_code,
    departure_time: (train.departure_time || "").slice(0, 5),
    arrival_time: "",
    day: "1",
    leg_km: "0",
    terminal: false,
  });

  const applyLast = (f) => ({
    ...f,
    station_name: destInfo.name,
    station_code: destInfo.code || f.station_code,
    arrival_time: (train.arrival_time || "").slice(0, 5),
    departure_time: "",
    day: String(train.arrival_day ?? 1),
  });

  const [form, setForm] = useState(() => {
    const base = {
      stop_order: String(stop?.stop_order ?? nextOrder),
      station_name: stop?.station_name ?? "",
      station_code: stop?.station_code ?? "",
      arrival_time: (stop?.arrival_time || "").slice(0, 5),
      departure_time: (stop?.departure_time || "").slice(0, 5),
      day: String(stop?.day ?? 1),
      // distance from the PREVIOUS station (the first station is always 0)
      leg_km: stop ? String(stop.leg_km ?? 0) : nextOrder === 1 ? "0" : "",
      platform: stop?.platform ?? "",
      terminal: stop ? !stop.departure_time && stop.stop_order !== 1 : false, // last station: no departure
    };
    if (Number(base.stop_order) === 1) return applyFirst(base);
    if (base.terminal) return applyLast(base);
    return base;
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isFirst = Number(form.stop_order) === 1;
  const isLast = form.terminal && !isFirst;
  const locked = isFirst || isLast; // name, times and day come from the train
  const codeLocked = (isFirst && sourceInfo.code) || (isLast && destInfo.code);
  const halt = calcHalt(form.arrival_time, form.departure_time);

  const set = (name, value) =>
    setForm((f) => {
      let next = { ...f, [name]: value };

      if (name === "stop_order") {
        const wasFirst = Number(f.stop_order) === 1;
        const nowFirst = Number(value) === 1;
        if (nowFirst && !wasFirst) {
          next = applyFirst(next); // starting station: take everything from the train
        } else if (!nowFirst && wasFirst) {
          next = {
            ...next,
            station_name: "",
            station_code: "",
            departure_time: "",
            arrival_time: "",
            day: "1",
            leg_km: "",
          };
        }
      }

      if (name === "terminal") {
        if (value) {
          next = applyLast(next);
        } else {
          next = { ...next, station_name: "", station_code: "", arrival_time: "", day: "1" };
        }
      }
      return next;
    });

  const validate = () => {
    const e = {};
    if (!(Number(form.stop_order) >= 1)) e.stop_order = "Stop number must be 1 or more";
    if (!form.station_name.trim()) e.station_name = "Enter the station name";
    if (!/^[A-Za-z0-9]{2,10}$/.test(form.station_code.trim()))
      e.station_code = "2-10 letters or digits (e.g. ST)";
    if (!isFirst && !form.arrival_time) e.arrival_time = "Select the arrival time";
    if (isFirst && form.terminal)
      e.departure_time = "Starting station cannot be the last station";
    else if (!form.terminal && !form.departure_time)
      e.departure_time = "Select the departure time";
    if (!isFirst && (form.leg_km === "" || Number(form.leg_km) < 0))
      e.leg_km = "Enter the distance from the previous station (0 or more)";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setServerError("");
    if (!validate()) return;

    const payload = {
      train: train.id,
      stop_order: Number(form.stop_order),
      station_name: form.station_name.trim(),
      station_code: form.station_code.trim().toUpperCase(),
      arrival_time: isFirst ? null : form.arrival_time || null,
      departure_time: form.terminal && !isFirst ? null : form.departure_time || null,
      day: Number(form.day),
      leg_km: isFirst ? 0 : Number(form.leg_km),
      platform: form.platform.trim(),
    };

    try {
      setSaving(true);
      const res = isEdit
        ? await api.put(`stations/update/${stop.id}/`, payload)
        : await api.post("stations/add/", payload);
      onSaved(res.data);
      onClose();
    } catch (err) {
      if (!err.response) {
        setServerError("Cannot reach the server. Make sure the backend is running.");
      } else if (err.response.status === 403) {
        setServerError("Only admins can add or edit stations.");
      } else if (err.response.status === 400 && typeof err.response.data === "object") {
        // Show field errors under the matching inputs, the rest in the banner
        const data = err.response.data;
        const fieldErrors = {};
        FORM_FIELDS.forEach((key) => {
          if (data[key]) fieldErrors[key] = flatten(data[key]).join(" ");
        });
        setErrors(fieldErrors);

        const rest = Object.fromEntries(
          Object.entries(data).filter(([key]) => !FORM_FIELDS.includes(key))
        );
        const restMessages = flatten(rest);
        if (restMessages.length) setServerError(restMessages.join(" "));
        else if (Object.keys(fieldErrors).length === 0)
          setServerError("Could not save the station.");
      } else if (err.response.status === 404) {
        setServerError("Station or API not found. Check the stations URLs in config/urls.py.");
      } else {
        setServerError("Could not save the station. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const lockedCls = "bg-slate-50 text-slate-600 cursor-not-allowed";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {isEdit ? "Edit Station" : "Add Station"}
              </h2>
              <p className="text-xs text-slate-500">
                {train.train_number} - {train.train_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Stop number" error={errors.stop_order} hint="1 = starting station">
                <input
                  type="number"
                  min="1"
                  className={inputCls}
                  value={form.stop_order}
                  onChange={(e) => set("stop_order", e.target.value)}
                />
              </Field>
              <Field label="Station name" error={errors.station_name}>
                <input
                  readOnly={locked}
                  className={`${inputCls} ${locked ? lockedCls : ""}`}
                  placeholder="Surat"
                  value={form.station_name}
                  onChange={(e) => set("station_name", e.target.value)}
                />
              </Field>
              <Field
                label="Station code"
                error={errors.station_code}
                hint={
                  locked && !codeLocked
                    ? "Train has no code in brackets, type the code here"
                    : ""
                }
              >
                <input
                  readOnly={Boolean(codeLocked)}
                  className={`${inputCls} uppercase ${codeLocked ? lockedCls : ""}`}
                  maxLength={10}
                  placeholder="ST"
                  value={form.station_code}
                  onChange={(e) => set("station_code", e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Arrival time"
                error={errors.arrival_time}
                hint={isFirst ? "Not needed at the starting station" : ""}
              >
                <input
                  type="time"
                  disabled={isFirst}
                  readOnly={isLast}
                  className={`${inputCls} ${isLast ? lockedCls : ""}`}
                  value={isFirst ? "" : form.arrival_time}
                  onChange={(e) => set("arrival_time", e.target.value)}
                />
              </Field>
              <Field
                label="Departure time"
                error={errors.departure_time}
                hint={form.terminal ? "Not needed at the last station" : ""}
              >
                <input
                  type="time"
                  disabled={form.terminal}
                  readOnly={isFirst}
                  className={`${inputCls} ${isFirst ? lockedCls : ""}`}
                  value={form.terminal ? "" : form.departure_time}
                  onChange={(e) => set("departure_time", e.target.value)}
                />
              </Field>
              <Field label="Halt (calculated automatically)">
                <input
                  readOnly
                  tabIndex={-1}
                  className={`${inputCls} bg-slate-50 text-slate-600`}
                  placeholder="Arrival and departure needed"
                  value={halt}
                />
              </Field>
              <Field
                label="Journey day"
                error={errors.day}
                hint="Day 1 = the day the train starts"
              >
                <select
                  className={inputCls}
                  disabled={locked}
                  value={form.day}
                  onChange={(e) => set("day", e.target.value)}
                >
                  {[1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>
                      Day {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Distance from previous station (km)"
                error={errors.leg_km}
                hint={
                  isFirst
                    ? "Starting station: distance is 0"
                    : "Any value is fine (for example 2 km). Total distance is calculated automatically"
                }
              >
                <input
                  type="number"
                  min="0"
                  disabled={isFirst}
                  className={inputCls}
                  placeholder="2"
                  value={isFirst ? "0" : form.leg_km}
                  onChange={(e) => set("leg_km", e.target.value)}
                />
              </Field>
              <Field label="Platform (optional)" error={errors.platform}>
                <input
                  className={inputCls}
                  maxLength={5}
                  placeholder="3"
                  value={form.platform}
                  onChange={(e) => set("platform", e.target.value)}
                />
              </Field>
            </div>

            <label
              className={`flex items-center gap-2.5 text-sm font-medium ${
                isFirst ? "text-slate-400" : "text-slate-800"
              }`}
            >
              <input
                type="checkbox"
                disabled={isFirst}
                className="h-4 w-4 accent-amber-500"
                checked={form.terminal}
                onChange={(e) => set("terminal", e.target.checked)}
              />
              This is the last station (train ends here)
              {isFirst && <span className="text-xs font-normal">(not for starting station)</span>}
            </label>

            {serverError && (
              <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">{serverError}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-60"
            >
              {saving ? "Saving..." : isEdit ? "Save changes" : "Save station"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Stations page ---------- */
export default function Stations({ autoOpen = false }) {
  const [trains, setTrains] = useState([]);
  const [trainId, setTrainId] = useState(null);
  const [stops, setStops] = useState([]);
  const [loadingTrains, setLoadingTrains] = useState(true);
  const [loadingStops, setLoadingStops] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // modal: null | { type: "add" } | { type: "edit", stop }
  const [modal, setModal] = useState(autoOpen ? { type: "add" } : null);

  const pagination = usePagination(stops, 5);

  const train = trains.find((t) => t.id === trainId);

  const loadTrains = async () => {
    try {
      const res = await api.get("trains/list/");
      const list = Array.isArray(res.data) ? res.data : res.data.results || [];
      setTrains(list);
      setTrainId((id) => (list.some((t) => t.id === id) ? id : list[0]?.id ?? null));
    } catch (err) {
      setError(
        err.response
          ? "Could not load trains."
          : "Cannot reach the server. Make sure the backend is running."
      );
    } finally {
      setLoadingTrains(false);
    }
  };

  const loadStops = async (id) => {
    try {
      setLoadingStops(true);
      const res = await api.get("stations/list/", { params: { train: id } });
      setStops(Array.isArray(res.data) ? res.data : res.data.results || []);
      setError("");
    } catch {
      setError("Could not load the route stations.");
    } finally {
      setLoadingStops(false);
    }
  };

  useEffect(() => {
    loadTrains();
  }, []);

  useEffect(() => {
    if (trainId) loadStops(trainId);
    else setStops([]);
  }, [trainId]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const nextOrder = stops.length ? Math.max(...stops.map((s) => s.stop_order)) + 1 : 1;

  const handleSaved = (saved) => {
    setNotice(
      `${saved.station_name} (${saved.station_code}) ${modal?.type === "edit" ? "updated" : "added"} successfully.`
    );
    // Reload all stops, because the total distance of the other stations can change too
    loadStops(trainId);
  };

  const removeStop = async (s) => {
    const result = await Swal.fire({
      title: "Delete station?",
      text: `${s.station_name} (${s.station_code}) will be removed from this route.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!result.isConfirmed) return;
    try {
      await api.delete(`stations/delete/${s.id}/`);
      setNotice(`${s.station_name} removed from the route.`);
      loadStops(trainId);
    } catch {
      Swal.fire("Error", "Could not delete the station.", "error");
    }
  };

  const dash = <span className="text-slate-400">-</span>;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[260px]">
            <label htmlFor="train-select" className="mb-1 block text-sm font-medium text-slate-700">
              Select train
            </label>
            <select
              id="train-select"
              className={inputCls}
              value={trainId ?? ""}
              onChange={(e) => {
                setTrainId(Number(e.target.value));
                pagination.reset();
              }}
              disabled={trains.length === 0}
            >
              {trains.length === 0 && <option value="">No trains available</option>}
              {trains.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.train_number} - {t.train_name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setModal({ type: "add" })}
            disabled={!train}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Station
          </button>
        </div>

        {train && (
          <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Route</p>
              <p className="font-medium text-slate-900">
                {train.source} → {train.destination}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Departs / Arrives</p>
              <p className="font-medium text-slate-900">
                {formatTime(train.departure_time)} / {formatTime(train.arrival_time)}
                {train.arrival_day > 1 ? ` (Day ${train.arrival_day})` : ""}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Running days</p>
              <p className="font-medium text-slate-900">
                {(train.running_days || []).length === 7
                  ? "Daily"
                  : (train.running_days || []).join(", ")}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Stations added</p>
              <p className="font-medium text-slate-900">{stops.length}</p>
            </div>
          </div>
        )}

        {notice && (
          <p role="status" className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-3 font-medium">#</th>
                <th className="py-2.5 pr-3 font-medium">Station</th>
                <th className="py-2.5 pr-3 font-medium">Arrives</th>
                <th className="py-2.5 pr-3 font-medium">Departs</th>
                <th className="py-2.5 pr-3 font-medium">Halt</th>
                <th className="py-2.5 pr-3 font-medium">Day</th>
                <th className="py-2.5 pr-3 font-medium">Distance</th>
                <th className="py-2.5 pr-3 font-medium">Platform</th>
                <th className="py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingTrains || loadingStops ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    Loading...
                  </td>
                </tr>
              ) : !train ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    First add a train from the Trains page.
                  </td>
                </tr>
              ) : stops.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    No stations added for this train yet. Click "Add Station".
                  </td>
                </tr>
              ) : (
                pagination.pageItems.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-3 font-semibold text-slate-900">{s.stop_order}</td>
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-slate-900">{s.station_name}</div>
                      <div className="text-xs text-slate-500">{s.station_code}</div>
                    </td>
                    <td className="py-3 pr-3 text-slate-700">{formatTime(s.arrival_time) || dash}</td>
                    <td className="py-3 pr-3 text-slate-700">{formatTime(s.departure_time) || dash}</td>
                    <td className="py-3 pr-3 text-slate-700">
                      {s.halt_minutes ? `${s.halt_minutes} min` : dash}
                    </td>
                    <td className="py-3 pr-3 text-slate-700">Day {s.day}</td>
                    <td className="py-3 pr-3 text-slate-700">
                      {s.distance_km} km
                      {s.stop_order > 1 && (
                        <div className="text-xs text-slate-500">+{s.leg_km} km from previous</div>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-slate-700">{s.platform || dash}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <button
                          title="Edit"
                          aria-label={`Edit ${s.station_name}`}
                          onClick={() => setModal({ type: "edit", stop: s })}
                          className="rounded-lg p-2 text-amber-600 transition hover:bg-amber-100"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          title="Delete"
                          aria-label={`Delete ${s.station_name}`}
                          onClick={() => removeStop(s)}
                          className="rounded-lg p-2 text-red-600 transition hover:bg-red-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loadingTrains && !loadingStops && train && (
          <Pagination {...pagination} itemLabel="stations" />
        )}
      </section>

      {modal && train && (
        <StopFormModal
          key={modal.stop?.id ?? "new"}
          train={train}
          stop={modal.stop}
          nextOrder={nextOrder}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}