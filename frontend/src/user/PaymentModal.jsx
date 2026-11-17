import { useEffect, useState } from "react";
import { Lock, X } from "lucide-react";
import { formatMoney } from "../utils/format.js";

const BANKS = [
  "State Bank of India",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Punjab National Bank",
  "Kotak Mahindra Bank",
  "Bank of Baroda",
];

const TITLES = {
  UPI: "Pay with UPI",
  CARD: "Pay with Card",
  NET_BANKING: "Pay with Net Banking",
};

const inputCls =
  "h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/25 disabled:bg-slate-100";

// "4111111111111111" -> "4111 1111 1111 1111"
const formatCardNumber = (v) =>
  v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();

// "1228" -> "12/28"
const formatExpiry = (v) => {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

// The card is valid until the end of the expiry month
function isExpiryValid(value) {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

// Demo payment popup. The details are only checked here and are never sent to the server.
export default function PaymentModal({ method, amount, onClose, onPay }) {
  const [form, setForm] = useState({
    upiId: "",
    cardNumber: "",
    cardName: "",
    expiry: "",
    cvv: "",
    bank: "",
  });
  const [errors, setErrors] = useState({});
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !processing && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, processing]);

  const set = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: "" }));
  };

  const validate = () => {
    const e = {};
    if (method === "UPI") {
      if (!/^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/.test(form.upiId.trim()))
        e.upiId = "Enter a valid UPI ID (for example name@okhdfc)";
    } else if (method === "CARD") {
      if (form.cardNumber.replace(/\s/g, "").length !== 16)
        e.cardNumber = "Enter the 16 digit card number";
      if (form.cardName.trim().length < 2) e.cardName = "Enter the name on the card";
      if (!isExpiryValid(form.expiry)) e.expiry = "Enter a valid expiry (MM/YY)";
      if (!/^\d{3}$/.test(form.cvv)) e.cvv = "Enter the 3 digit CVV";
    } else if (!form.bank) {
      e.bank = "Select your bank";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const pay = async () => {
    if (!validate()) return;
    setProcessing(true);
    // Short delay to imitate a payment gateway (no real payment is made)
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await onPay();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !processing && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={TITLES[method]}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{TITLES[method]}</h2>
              <p className="text-xs text-slate-500">Amount payable: {formatMoney(amount)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={processing}
            aria-label="Close"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Fields for the selected method */}
        <div className="space-y-4 px-6 py-5">
          {method === "UPI" && (
            <Field label="UPI ID" error={errors.upiId}>
              <input
                className={inputCls}
                placeholder="name@okhdfc"
                autoComplete="off"
                disabled={processing}
                value={form.upiId}
                onChange={(e) => set("upiId", e.target.value)}
              />
            </Field>
          )}

          {method === "CARD" && (
            <>
              <Field label="Card number" error={errors.cardNumber}>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="1234 5678 9012 3456"
                  autoComplete="off"
                  disabled={processing}
                  value={form.cardNumber}
                  onChange={(e) => set("cardNumber", formatCardNumber(e.target.value))}
                />
              </Field>
              <Field label="Name on card" error={errors.cardName}>
                <input
                  className={inputCls}
                  placeholder="Full name"
                  autoComplete="off"
                  disabled={processing}
                  value={form.cardName}
                  onChange={(e) => set("cardName", e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Expiry (MM/YY)" error={errors.expiry}>
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    placeholder="MM/YY"
                    autoComplete="off"
                    disabled={processing}
                    value={form.expiry}
                    onChange={(e) => set("expiry", formatExpiry(e.target.value))}
                  />
                </Field>
                <Field label="CVV" error={errors.cvv}>
                  <input
                    className={inputCls}
                    type="password"
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="123"
                    autoComplete="off"
                    disabled={processing}
                    value={form.cvv}
                    onChange={(e) => set("cvv", e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
              </div>
            </>
          )}

          {method === "NET_BANKING" && (
            <Field label="Select your bank" error={errors.bank}>
              <select
                className={inputCls}
                disabled={processing}
                value={form.bank}
                onChange={(e) => set("bank", e.target.value)}
              >
                <option value="">Choose bank</option>
                {BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Demo payment: no real money is charged. Please do not enter real card details.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={pay}
            disabled={processing}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processing ? "Processing payment..." : `Pay ${formatMoney(amount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}