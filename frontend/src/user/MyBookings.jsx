import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import api from "../api/axios";
import UserNavbar from "../components/UserNavbar.jsx";
import Pagination, { usePagination } from "../components/Pagination.jsx";
import { escapeHtml, formatDate, formatMoney, formatTime } from "../utils/format.js";
import { remarkInputOptions } from "../utils/remark.js";

const statusCls = {
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const refundCls = {
  PENDING: "bg-amber-100 text-amber-700",
  REFUNDED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-slate-200 text-slate-700",
};

const refundText = (b) => {
  if (b.refund_status === "PENDING")
    return b.refund_reapply_count > 0
      ? `Refund re-requested: ${formatMoney(b.refund_amount)}`
      : `Refund pending: ${formatMoney(b.refund_amount)}`;
  if (b.refund_status === "REFUNDED") return `Refunded: ${formatMoney(b.refund_amount)}`;
  if (b.refund_status === "REJECTED")
    return b.refund_amount > 0 ? "Refund rejected" : "No refund applicable";
  return "";
};

// Shared style for the remark boxes inside the popup
const remarkBox = (bg, color) =>
  `margin:4px 0 12px;padding:10px;border-radius:8px;background:${bg};color:${color};` +
  "white-space:pre-wrap;word-break:break-word;max-height:160px;overflow-y:auto";

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const pagination = usePagination(bookings, 5);

  const loadBookings = () =>
    api
      .get("bookings/my/")
      .then((res) => setBookings(res.data))
      .catch(() => setError("Could not load your bookings."))
      .finally(() => setLoading(false));

  useEffect(() => {
    loadBookings();
  }, []);

  // 1) Ask the server what the refund will be, 2) confirm with the user, 3) cancel
  const cancelBooking = async (b) => {
    let preview;
    try {
      preview = (await api.get(`bookings/cancel-preview/${b.pnr}/`)).data;
    } catch (err) {
      Swal.fire(
        "Cannot cancel",
        err.response?.data?.detail ||
          (err.response ? "Could not check the cancellation rules." : "Cannot reach the server."),
        "error"
      );
      return;
    }

    const result = await Swal.fire({
      title: "Cancel this ticket?",
      html: `
        <div style="text-align:left;font-size:14px;line-height:1.7">
          <div>PNR: <b>${escapeHtml(b.pnr)}</b></div>
          <div>Amount paid: <b>${formatMoney(preview.total_amount)}</b></div>
          <div>Cancellation charge: <b>${formatMoney(preview.cancellation_charge)}</b></div>
          <div>Refund amount: <b style="color:#059669">${formatMoney(preview.refund_amount)}</b></div>
          <div style="margin-top:6px;color:#64748b;font-size:12px">${escapeHtml(preview.rule)}</div>
        </div>`,
      icon: "warning",
      input: "text",
      inputPlaceholder: "Reason (optional)",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Cancel ticket",
      cancelButtonText: "Keep ticket",
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async (reason) => {
        try {
          const res = await api.post(`bookings/cancel/${b.pnr}/`, { reason: reason || "" });
          return res.data;
        } catch (err) {
          Swal.showValidationMessage(
            err.response?.data?.detail ||
              (err.response ? "Could not cancel the ticket." : "Cannot reach the server.")
          );
          return false;
        }
      },
    });

    if (!result.isConfirmed) return;

    const amount = result.value?.refund_amount ?? 0;
    Swal.fire({
      title: "Ticket cancelled",
      text:
        amount > 0
          ? `Your refund of ${formatMoney(amount)} has been requested. It will be processed soon.`
          : "Your ticket is cancelled. No refund is applicable for this cancellation.",
      icon: "success",
    });

    loadBookings();
  };

  // Rejected refund: show the reason. If the user can still apply again, show the remark box too.
  const viewRejectReason = async (b) => {
    const reasonHtml = `
      <div style="text-align:left;font-size:14px;line-height:1.6">
        <div style="color:#64748b;font-size:12px">Reason given by admin</div>
        <div style="${remarkBox("#fef2f2", "#991b1b")}">${escapeHtml(b.refund_admin_remark)}</div>
        ${
          b.refund_user_remark
            ? `<div style="color:#64748b;font-size:12px">Your earlier remark</div>
               <div style="${remarkBox("#f1f5f9", "#334155")}">${escapeHtml(b.refund_user_remark)}</div>`
            : ""
        }
        ${
          b.refund_can_reapply
            ? `<div style="font-size:12px;color:#64748b">You can apply for this refund again <b>one more time</b>.</div>`
            : `<div style="font-size:12px;color:#64748b">${
                b.refund_reapply_count > 0
                  ? "You have already applied again. This decision is final."
                  : "This decision is final."
              }</div>`
        }
      </div>`;

    // The user cannot apply again: only show the reason
    if (!b.refund_can_reapply) {
      Swal.fire({
        title: "Refund rejected",
        html: reasonHtml,
        icon: "info",
        width: 640,
        confirmButtonText: "Close",
      });
      return;
    }

    const result = await Swal.fire({
      title: "Refund rejected",
      html: reasonHtml,
      icon: "info",
      width: 640,
      ...remarkInputOptions(
        "Your remark for applying again (required)",
        "Explain clearly why you should get this refund..."
      ),
      showCancelButton: true,
      confirmButtonText: "Apply for refund again",
      cancelButtonText: "Close",
      confirmButtonColor: "#0f172a",
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async (remark) => {
        try {
          await api.post(`bookings/refund-reapply/${b.pnr}/`, { remark: remark.trim() });
          return true;
        } catch (err) {
          const d = err.response?.data;
          Swal.showValidationMessage(
            d?.detail ||
              (d?.remark && String(d.remark)) ||
              (err.response ? "Could not send the request." : "Cannot reach the server.")
          );
          return false;
        }
      },
    });

    if (result.isConfirmed) {
      Swal.fire({
        title: "Request sent",
        text: "Your refund request has been sent to the admin again.",
        icon: "success",
      });
      loadBookings();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white">
        <UserNavbar />
      </div>

      <main className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-2xl font-bold text-slate-900">My Bookings</h1>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-6 text-slate-500">Loading...</p>
        ) : bookings.length === 0 && !error ? (
          <div className="mt-6 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-900/10">
            <p className="font-semibold text-slate-900">No bookings yet</p>
            <Link to="/home" className="mt-2 inline-block text-sm font-semibold text-amber-700 hover:underline">
              Search trains
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-4">
              {pagination.pageItems.map((b) => (
                <article
                  key={b.pnr}
                  className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/10"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-bold text-slate-900">
                        {b.train_name} <span className="font-normal text-slate-500">#{b.train_number}</span>
                      </h2>
                      <p className="text-sm text-slate-600">
                        {b.from_name} ({formatTime(b.departure_time)}) → {b.to_name} (
                        {formatTime(b.arrival_time)})
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {b.refund_status && (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            refundCls[b.refund_status] || "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {refundText(b)}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          statusCls[b.status] || "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {b.status}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
                      <span>PNR <b className="font-mono text-slate-900">{b.pnr}</b></span>
                      <span>{formatDate(b.travel_date)}</span>
                      <span>Class {b.class_code}</span>
                      <span>{b.passengers.length} passenger{b.passengers.length > 1 ? "s" : ""}</span>
                      <span className="font-semibold text-slate-900">{formatMoney(b.total_amount)}</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {b.can_cancel && (
                        <button
                          onClick={() => cancelBooking(b)}
                          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                        >
                          Cancel ticket
                        </button>
                      )}
                      {b.refund_status === "REJECTED" && b.refund_admin_remark && (
                        <button
                          onClick={() => viewRejectReason(b)}
                          className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
                        >
                          {b.refund_can_reapply ? "View reason / Apply again" : "View reason"}
                        </button>
                      )}
                      <Link
                        to={`/ticket/${b.pnr}`}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                      >
                        View ticket
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <Pagination {...pagination} pageSizeOptions={[5, 10, 20]} itemLabel="bookings" />
          </>
        )}
      </main>
    </div>
  );
}