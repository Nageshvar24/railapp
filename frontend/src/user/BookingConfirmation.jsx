import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check } from "lucide-react";
import api from "../api/axios";
import UserNavbar from "../components/UserNavbar.jsx";
import { downloadTicketPdf } from "../utils/ticketPdf.js";
import { formatDate, formatMoney } from "../utils/format.js";

function Info({ label, children }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-900">{children}</p>
    </div>
  );
}

export default function BookingConfirmation() {
  const { pnr } = useParams();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`bookings/detail/${pnr}/`)
      .then((res) => setBooking(res.data))
      .catch((err) =>
        setError(err.response?.status === 404 ? "Ticket not found." : "Could not load the ticket.")
      );
  }, [pnr]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white">
        <UserNavbar />
      </div>

      <main className="mx-auto max-w-xl px-5 py-10">
        {error && (
          <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {!booking && !error && <p className="text-center text-slate-500">Loading ticket...</p>}

        {booking && (
          <>
            <div className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="h-8 w-8" aria-hidden="true" />
              </span>
              <h1 className="mt-4 text-2xl font-bold text-slate-900">Booking Confirmed</h1>
              <p className="text-sm text-slate-500">Your e-ticket is ready.</p>
            </div>

            {/* Ticket */}
            <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/5">
              <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
                <span className="flex items-center gap-2 font-bold">
                  <span aria-hidden="true">🚆</span> RailBook
                </span>
                <span className="font-mono text-sm font-bold text-amber-400">PNR {booking.pnr}</span>
              </div>

              <div className="px-6 py-5">
                <div className="flex justify-between">
                  <div>
                    <p className="text-xs text-slate-500">From</p>
                    <p className="text-lg font-bold text-slate-900">{booking.from_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">To</p>
                    <p className="text-lg font-bold text-slate-900">{booking.to_name}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-4 border-t border-dashed border-slate-300 pt-4">
                  <Info label="Train">
                    {booking.train_number}
                    <span className="block text-xs font-normal text-slate-500">{booking.train_name}</span>
                  </Info>
                  <Info label="Date">{formatDate(booking.travel_date)}</Info>
                  <Info label="Class">{booking.class_code}</Info>
                </div>

                <div className="mt-4 border-t border-dashed border-slate-300 pt-4">
                  <p className="text-xs text-slate-500">Passengers</p>
                  <ul className="mt-1 divide-y divide-slate-100">
                    {booking.passengers.map((p) => (
                      <li key={p.id} className="flex justify-between py-2 text-sm">
                        <span className="font-medium text-slate-900">
                          {p.name}{" "}
                          <span className="font-normal text-slate-500">
                            ({p.age}, {p.gender})
                          </span>
                        </span>
                        <span className="font-semibold text-slate-900">{p.seat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 flex justify-between border-t border-dashed border-slate-300 pt-4">
                  <Info label="Status">{booking.status}</Info>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Paid</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">
                      {formatMoney(booking.total_amount)}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Buttons */}
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => downloadTicketPdf(booking)}
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Download PDF
              </button>
              <Link
                to="/my-bookings"
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                My Bookings
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}