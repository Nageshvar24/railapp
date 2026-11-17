// "16:25" -> "04:25 PM"
export function formatTime(value) {
  if (!value) return "-";
  const [h, m] = value.split(":").map(Number);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${
    h >= 12 ? "PM" : "AM"
  }`;
}

// 2570 -> "₹2,570"
export const formatMoney = (n) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// "2026-11-12" -> "12 Nov 2026"
export function formatDate(value) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Turns DRF error JSON into a list of readable strings
export const flatten = (v) =>
  typeof v === "string"
    ? [v]
    : Array.isArray(v)
    ? v.flatMap(flatten)
    : v && typeof v === "object"
    ? Object.values(v).flatMap(flatten)
    : [];

// Escapes text before it is placed inside a SweetAlert popup (HTML)
export const escapeHtml = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));