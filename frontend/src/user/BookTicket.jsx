import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import api from "../api/axios";
import UserNavbar from "../components/UserNavbar.jsx";
import PaymentModal from "./PaymentModal.jsx";
import { flatten, formatMoney } from "../utils/format.js";

const MAX_PASSENGERS = 6;
const GST_PERCENT = 5;

const PAYMENT_METHODS = [
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "NET_BANKING", label: "Net Banking" },
];

const CLASS_LABELS = {
  SL: "Sleeper",
  "3A": "AC 3 Tier",
  "2A": "AC 2 Tier",
  "1A": "AC First",
  CC: "Chair Car",
};

const inputCls =
  "h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/25";

const emptyPassenger = () => ({ name: "", age: "", gender: "Male" });

function BookTicketForm({ initialTrain, initialDate }) {
  const navigate = useNavigate();
  const today = new Date().toISOString().split("T")[0];

  const [train, setTrain] = useState(initialTrain);
  const [date, setDate] = useState(initialDate || "");
  const [dateError, setDateError] = useState("");
  const [passengers, setPassengers] = useState([emptyPassenger()]);
  const [classCode, setClassCode] = useState(
    () =>
      (initialTrain.classes.find((c) => c.seats_left > 0) || initialTrain.classes[0])
        ?.class_code || ""
  );
  const [payment, setPayment] = useState("UPI");
  const [showPayment, setShowPayment] = useState(false);
  const [formError, setFormError] = useState("");
  const [serverError, setServerError] = useState("");

  const selected = train.classes.find((c) => c.class_code === classCode);
  const seatsLeft = selected ? selected.seats_left ?? selected.total_seats : 0;

  // Fare summary (the server calculates the final amount again)
  const base = selected ? selected.fare * passengers.length : 0;
  const taxes = Math.round(base * GST_PERCENT) / 100;
  const total = base + taxes;

  const updatePassenger = (index, patch) =>
    setPassengers((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  const addPassenger = () =>
    setPassengers((list) =>
      list.length < MAX_PASSENGERS ? [...list, emptyPassenger()] : list
    );

  const removePassenger = (index) =>
    setPassengers((list) => list.filter((_, i) => i !== index));

  // When the date changes, check again if the train runs and how many seats are left
  const changeDate = async (value) => {
    setDate(value);
    setDateError("");
    if (!value) return;
    try {
      const res = await api.get("trains/search/", {
        params: { from: train.from.station_code, to: train.to.station_code, date: value },
      });
      const found = res.data.find((t) => t.id === train.id);
      if (found) setTrain(found);
      else setDateError("This train does not run on the selected date.");
    } catch {
      setDateError("Could not check availability for this date.");
    }
  };

  const validate = () => {
    if (!date) return "Select the travel date";
    if (dateError) return dateError;
    if (!selected) return "Select a class";
    const invalid = passengers.some((p) => {
      const age = Number(p.age);
      return !p.name.trim() || !(age >= 1 && age <= 120);
    });
    if (invalid) return "Enter the name and a valid age (1-120) for every passenger";
    if (passengers.length > seatsLeft) return `Only ${seatsLeft} seat(s) left in this class`;
    return "";
  };

  // Step 1: "Pay and Book" checks the form and opens the payment popup
  const openPayment = () => {
    setServerError("");
    const problem = validate();
    setFormError(problem);
    if (!problem) setShowPayment(true);
  };

  // Step 2: the popup calls this after the payment details are filled
  const confirmBooking = async () => {
    const payload = {
      train: train.id,
      from_code: train.from.station_code,
      to_code: train.to.station_code,
      travel_date: date,
      class_code: classCode,
      payment_method: payment,
      passengers: passengers.map((p) => ({
        name: p.name.trim(),
        age: Number(p.age),
        gender: p.gender,
      })),
    };

    try {
      const res = await api.post("bookings/create/", payload);
      navigate(`/ticket/${res.data.pnr}`, { replace: true });
    } catch (err) {
      // Close the popup so the error message is visible on the page
      setShowPayment(false);
      if (!err.response) setServerError("Cannot reach the server.");
      else if (err.response.status === 400)
        setServerError(flatten(err.response.data).join(" ") || "Could not book the ticket.");
      else setServerError("Could not book the ticket. Please try again.");
    }
  };

  const card = "rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/10";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white">
        <UserNavbar />
      </div>

      <div className="mx-auto max-w-6xl px-5 py-8">
        <button
          onClick={() => navigate(-1)}
          className="text-sm font-semibold text-amber-700 hover:underline"
        >
          ← Back to results
        </button>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            {/* Passenger details */}
            <section className={card}>
              <h2 className="text-base font-bold text-slate-900">Passenger Details</h2>

              <div className="mt-4 space-y-3">
                {passengers.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_120px_auto] gap-3">
                    <input
                      className={inputCls}
                      placeholder="Full name"
                      aria-label={`Passenger ${i + 1} name`}
                      value={p.name}
                      onChange={(e) => updatePassenger(i, { name: e.target.value })}
                    />
                    <input
                      className={inputCls}
                      type="number"
                      min="1"
                      max="120"
                      placeholder="Age"
                      aria-label={`Passenger ${i + 1} age`}
                      value={p.age}
                      onChange={(e) => updatePassenger(i, { age: e.target.value })}
                    />
                    <select
                      className={inputCls}
                      aria-label={`Passenger ${i + 1} gender`}
                      value={p.gender}
                      onChange={(e) => updatePassenger(i, { gender: e.target.value })}
                    >
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                    {passengers.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removePassenger(i)}
                        aria-label={`Remove passenger ${i + 1}`}
                        className="rounded-lg p-3 text-red-600 hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="w-10" />
                    )}
                  </div>
                ))}
              </div>

              {passengers.length < MAX_PASSENGERS && (
                <button
                  type="button"
                  onClick={addPassenger}
                  className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:underline"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add passenger
                </button>
              )}
            </section>

            {/* Class and date */}
            <section className={card}>
              <h2 className="text-base font-bold text-slate-900">Class and Date</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <select
                    className={inputCls}
                    value={classCode}
                    onChange={(e) => setClassCode(e.target.value)}
                    aria-label="Class"
                  >
                    {train.classes.map((c) => (
                      <option key={c.class_code} value={c.class_code} disabled={c.seats_left === 0}>
                        {c.class_code} - {CLASS_LABELS[c.class_code]} ({formatMoney(c.fare)},{" "}
                        {c.seats_left} left)
                      </option>
                    ))}
                  </select>
                  {selected && (
                    <p className={`mt-1 text-xs ${seatsLeft <= 10 ? "text-red-600" : "text-emerald-600"}`}>
                      {seatsLeft} seats left in {selected.class_code}
                    </p>
                  )}
                </div>

                <div>
                  <input
                    type="date"
                    min={today}
                    className={inputCls}
                    value={date}
                    onChange={(e) => changeDate(e.target.value)}
                    aria-label="Travel date"
                  />
                  {dateError && <p className="mt-1 text-xs text-red-600">{dateError}</p>}
                </div>
              </div>
            </section>

            {/* Payment method */}
            <section className={card}>
              <h2 className="text-base font-bold text-slate-900">Payment Method</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {PAYMENT_METHODS.map((m) => (
                  <label
                    key={m.value}
                    className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm transition ${
                      payment === m.value
                        ? "border-amber-500 bg-amber-50 font-semibold text-slate-900"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      className="accent-amber-500"
                      checked={payment === m.value}
                      onChange={() => setPayment(m.value)}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </section>
          </div>

          {/* Fare summary */}
          <aside className="h-fit overflow-hidden rounded-2xl border-t-4 border-amber-500 bg-white p-6 shadow-sm ring-1 ring-slate-900/10 lg:sticky lg:top-6">
            <h2 className="text-base font-bold text-slate-900">Fare Summary</h2>
            <p className="mt-3 text-sm text-slate-600">{train.train_name}</p>
            <p className="text-sm text-slate-600">
              {train.from.station_name} → {train.to.station_name}
            </p>

            <dl className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-700">Base fare x {passengers.length}</dt>
                <dd className="text-slate-900">{formatMoney(base)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-700">Taxes (GST {GST_PERCENT}%)</dt>
                <dd className="text-slate-900">{formatMoney(taxes)}</dd>
              </div>
            </dl>

            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
              <span className="text-lg font-bold text-slate-900">Total</span>
              <span className="text-lg font-bold text-slate-900">{formatMoney(total)}</span>
            </div>

            {(formError || serverError) && (
              <p role="alert" className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
                {formError || serverError}
              </p>
            )}

            <button
              onClick={openPayment}
              className="mt-4 h-12 w-full rounded-lg bg-slate-900 text-[15px] font-semibold text-white transition hover:bg-slate-700"
            >
              Pay and Book
            </button>
          </aside>
        </div>
      </div>

      {/* Payment details popup for the selected method */}
      {showPayment && (
        <PaymentModal
          method={payment}
          amount={total}
          onClose={() => setShowPayment(false)}
          onPay={confirmBooking}
        />
      )}
    </div>
  );
}

export default function BookTicket() {
  const { state } = useLocation();

  // The page needs the selected train. Without it (for example after a refresh), go back to search.
  if (!state?.train) return <Navigate to="/home" replace />;

  return <BookTicketForm initialTrain={state.train} initialDate={state.date} />;
}