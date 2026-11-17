import { useEffect, useState } from "react";
import {
  Search,
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  IndianRupee,
  Pencil,
} from "lucide-react";
import Swal from "sweetalert2";
import api from "../api/axios";
import { escapeHtml, formatDate, formatMoney } from "../utils/format.js";
import { MAX_REMARK_LENGTH, MIN_REMARK_LENGTH, remarkInputOptions } from "../utils/remark.js";
import Pagination, { usePagination } from "../components/Pagination.jsx";

const statusCls = {
  PENDING: "bg-amber-100 text-amber-700",
  REFUNDED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};

const statusLabel = {
  PENDING: "Pending",
  REFUNDED: "Refunded",
  REJECTED: "Rejected",
};

const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30";

const toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
});

const fmtDateTime = (v) => (v ? new Date(v).toLocaleString("en-IN") : "-");

const emptySummary = {
  total: 0,
  pending_count: 0,
  pending_amount: 0,
  done_count: 0,
  done_amount: 0,
  rejected_count: 0,
};

const errorMessage = (err) =>
  err.response?.data?.detail ||
  (err.response?.data?.remark && String(err.response.data.remark)) ||
  (err.response ? "Could not update the refund." : "Cannot reach the server.");

export default function Refund() {
  const [refunds, setRefunds] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(emptySummary);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0); // Change it to reload the list
  const [busyId, setBusyId] = useState(null);

  const pagination = usePagination(refunds, 5);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError("");
        const res = await api.get("bookings/admin/refunds/", {
          params: { search: search.trim(), status },
        });
        setRefunds(res.data.results || []);
        setTotal(res.data.total ?? 0);
        setSummary(res.data.summary || emptySummary);
      } catch (err) {
        setError(
          !err.response
            ? "Cannot reach the server. Make sure the backend is running."
            : err.response.status === 403
            ? "Only admins can view refunds."
            : err.response.status === 404
            ? "Refunds API not found. Check the refund URLs in the backend."
            : "Could not load refunds."
        );
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, status, reloadKey]);

  // The summary comes from the server and covers all refunds (not only the filtered rows)
  const cards = [
    { icon: RotateCcw, label: "Total requests", value: summary.total },
    { icon: Clock, label: "Pending", value: summary.pending_count, sub: formatMoney(summary.pending_amount) },
    { icon: CheckCircle2, label: "Refunded", value: summary.done_count, sub: formatMoney(summary.done_amount) },
    { icon: XCircle, label: "Rejected", value: summary.rejected_count },
  ];

  const afterSuccess = (message) => {
    toast.fire({ icon: "success", title: message });
    setReloadKey((k) => k + 1);
  };

  const afterError = (err) => {
    Swal.fire("Error", errorMessage(err), "error");
    // Someone else may have processed this refund already, so show the latest data
    if (err.response?.status === 400) setReloadKey((k) => k + 1);
  };

  const approveRefund = async (r) => {
    const result = await Swal.fire({
      title: "Approve refund?",
      html: `<b>${formatMoney(r.refund_amount)}</b> will be refunded to <b>${escapeHtml(r.username)}</b> for PNR <b>${escapeHtml(r.pnr)}</b>.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#059669",
      confirmButtonText: "Approve",
    });
    if (!result.isConfirmed) return;

    try {
      setBusyId(r.id);
      await api.post(`bookings/admin/refunds/${r.id}/process/`, { action: "approve" });
      afterSuccess(`Refund approved for ${r.pnr}`);
    } catch (err) {
      afterError(err);
    } finally {
      setBusyId(null);
    }
  };

  // Reject: the admin must write a reason (5 to 200 characters)
  const rejectRefund = async (r) => {
    const result = await Swal.fire({
      title: "Reject refund?",
      html: `Refund request for PNR <b>${escapeHtml(r.pnr)}</b> will be rejected. The user will see your reason.`,
      icon: "warning",
      width: 640,
      ...remarkInputOptions(
        "Reason for rejection (required)",
        "Write clearly why this refund is rejected..."
      ),
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Reject refund",
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async (remark) => {
        try {
          await api.post(`bookings/admin/refunds/${r.id}/process/`, {
            action: "reject",
            remark: remark.trim(),
          });
          return true;
        } catch (err) {
          Swal.showValidationMessage(errorMessage(err));
          return false;
        }
      },
    });
    if (result.isConfirmed) afterSuccess(`Refund rejected for ${r.pnr}`);
  };

  // Edit: change an earlier decision (approve <-> reject) or only update the remark
  const editRefund = async (r) => {
    const current = r.status === "REFUNDED" ? "approve" : "reject";

    const result = await Swal.fire({
      title: "Edit refund decision",
      width: 640,
      showCancelButton: true,
      confirmButtonText: "Save changes",
      confirmButtonColor: "#0f172a",
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      html: `
        <div style="text-align:left;font-size:14px;line-height:1.6">
          <div style="color:#64748b;font-size:13px;margin-bottom:10px">
            PNR <b>${escapeHtml(r.pnr)}</b> &middot; ${escapeHtml(r.username)} &middot;
            Refund <b>${formatMoney(r.refund_amount)}</b><br/>
            Current decision: <b>${current === "approve" ? "Approved" : "Rejected"}</b>
          </div>

          <label style="display:block;margin-bottom:6px;cursor:pointer">
            <input type="radio" name="decision" value="approve" ${current === "approve" ? "checked" : ""} />
            Approve (refund the amount to the user)
          </label>
          <label style="display:block;margin-bottom:12px;cursor:pointer">
            <input type="radio" name="decision" value="reject" ${current === "reject" ? "checked" : ""} />
            Reject (the user will see your reason)
          </label>

          <div id="edit-remark-label" style="color:#64748b;font-size:12px"></div>
          <textarea id="edit-remark" class="swal2-textarea" rows="4"
            maxlength="${MAX_REMARK_LENGTH}"
            style="margin:4px 0 0;width:100%;box-sizing:border-box"
            placeholder="Write the remark here...">${escapeHtml(r.admin_remark || "")}</textarea>
          <div id="edit-remark-counter" style="margin-top:6px;font-size:12px;text-align:right"></div>
        </div>`,
      didOpen: () => {
        const popup = Swal.getPopup();
        const textarea = popup.querySelector("#edit-remark");
        const label = popup.querySelector("#edit-remark-label");
        const counter = popup.querySelector("#edit-remark-counter");
        const radios = popup.querySelectorAll('input[name="decision"]');

        const selected = () => popup.querySelector('input[name="decision"]:checked')?.value;

        const update = () => {
          const rejecting = selected() === "reject";
          label.textContent = rejecting
            ? "Reason for rejection (required)"
            : "Remark (optional)";

          const length = textarea.value.length;
          counter.textContent = `${length} / ${MAX_REMARK_LENGTH} characters`;
          const tooShort = rejecting && length < MIN_REMARK_LENGTH;
          counter.style.color = tooShort || length >= MAX_REMARK_LENGTH ? "#dc2626" : "#059669";
        };

        textarea.addEventListener("input", update);
        radios.forEach((radio) => radio.addEventListener("change", update));
        update();
      },
      preConfirm: async () => {
        const popup = Swal.getPopup();
        const action = popup.querySelector('input[name="decision"]:checked')?.value;
        const remark = popup.querySelector("#edit-remark").value.trim();

        if (action === "reject" && remark.length < MIN_REMARK_LENGTH) {
          Swal.showValidationMessage(
            `Please write a rejection reason (at least ${MIN_REMARK_LENGTH} characters)`
          );
          return false;
        }
        if (action === current && remark === (r.admin_remark || "")) {
          Swal.showValidationMessage("You have not changed anything");
          return false;
        }

        try {
          await api.post(`bookings/admin/refunds/${r.id}/edit/`, { action, remark });
          return true;
        } catch (err) {
          Swal.showValidationMessage(errorMessage(err));
          return false;
        }
      },
    });

    if (result.isConfirmed) afterSuccess(`Decision updated for ${r.pnr}`);
  };

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="rounded-2xl border-t-4 border-amber-500 bg-white p-5 shadow-sm ring-1 ring-slate-900/5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">{c.label}</span>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">{loading ? "..." : c.value}</p>
              {c.sub && (
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <IndianRupee className="h-3 w-3" aria-hidden="true" />
                  {c.sub.replace("₹", "")}
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* Refund list */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Refund Requests</h2>
            <p className="text-sm text-slate-500">{total} request(s) found</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputCls} w-64 pl-9`}
                placeholder="PNR, user, train..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  pagination.reset();
                }}
              />
            </div>
            <select
              className={inputCls}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                pagination.reset();
              }}
            >
              <option value="">All status</option>
              <option value="PENDING">Pending</option>
              <option value="REFUNDED">Refunded</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1250px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-3 font-medium">PNR</th>
                <th className="py-2.5 pr-3 font-medium">User</th>
                <th className="py-2.5 pr-3 font-medium">Train</th>
                <th className="py-2.5 pr-3 font-medium">Travel date</th>
                <th className="py-2.5 pr-3 font-medium">Paid</th>
                <th className="py-2.5 pr-3 font-medium">Cancellation charge</th>
                <th className="py-2.5 pr-3 font-medium">Refund</th>
                <th className="py-2.5 pr-3 font-medium">Requested on</th>
                <th className="py-2.5 pr-3 font-medium">Status / Remarks</th>
                <th className="py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    Loading refunds...
                  </td>
                </tr>
              ) : refunds.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    No refund requests found.
                  </td>
                </tr>
              ) : (
                pagination.pageItems.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="py-3 pr-3 font-mono font-semibold text-slate-900">{r.pnr}</td>
                    <td className="py-3 pr-3">
                      <div className="font-medium text-slate-900">{r.username}</div>
                      <div className="text-xs text-slate-500">{r.email}</div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="font-medium text-slate-900">{r.train_number}</div>
                      <div className="text-xs text-slate-500">
                        {r.train_name} ({r.from_code} → {r.to_code})
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-slate-700">
                      {formatDate(r.travel_date)}
                      <div className="text-xs text-slate-500">Class {r.class_code}</div>
                    </td>
                    <td className="py-3 pr-3 text-slate-700">
                      {formatMoney(r.total_amount)}
                      <div className="text-xs text-slate-500">{r.payment_method}</div>
                    </td>
                    <td className="py-3 pr-3 text-slate-700">{formatMoney(r.cancellation_charge || 0)}</td>
                    <td className="py-3 pr-3 font-semibold text-slate-900">
                      {formatMoney(r.refund_amount)}
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-600">
                      {fmtDateTime(r.requested_at)}
                      {r.reason && (
                        <div className="mt-1 max-w-[180px] break-words text-slate-500">
                          Cancel reason: {r.reason}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            statusCls[r.status] || "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {statusLabel[r.status] || r.status}
                        </span>
                        {r.reapply_count > 0 && (
                          <span className="rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-700">
                            Re-requested
                          </span>
                        )}
                        {r.decision_edit_count > 0 && (
                          <span
                            title={`Last edited: ${fmtDateTime(r.last_edited_at)}`}
                            className="rounded-full bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700"
                          >
                            Edited{r.decision_edit_count > 1 ? ` x${r.decision_edit_count}` : ""}
                          </span>
                        )}
                      </div>
                      {r.processed_at && (
                        <div className="mt-1 text-xs text-slate-500">{fmtDateTime(r.processed_at)}</div>
                      )}
                      {r.user_remark && (
                        <div className="mt-1.5 max-w-[280px] whitespace-pre-wrap break-words rounded bg-sky-50 px-2 py-1 text-xs text-sky-800">
                          <b>User remark:</b> {r.user_remark}
                        </div>
                      )}
                      {r.admin_remark && (
                        <div className="mt-1.5 max-w-[280px] whitespace-pre-wrap break-words rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          <b>{r.status === "PENDING" ? "Earlier rejection reason:" : "Admin remark:"}</b>{" "}
                          {r.admin_remark}
                        </div>
                      )}
                    </td>
                    <td className="py-3">
                      {r.status === "PENDING" ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveRefund(r)}
                            disabled={busyId === r.id}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectRefund(r)}
                            disabled={busyId === r.id}
                            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      ) : r.can_edit ? (
                        <button
                          type="button"
                          title="Edit decision"
                          aria-label={`Edit decision for ${r.pnr}`}
                          onClick={() => editRefund(r)}
                          className="rounded-lg p-2 text-amber-600 transition hover:bg-amber-100"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && <Pagination {...pagination} itemLabel="requests" />}
      </section>
    </div>
  );
}