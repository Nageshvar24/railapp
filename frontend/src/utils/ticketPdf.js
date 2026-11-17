import { jsPDF } from "jspdf";
import { formatDate, formatTime } from "./format.js";

// The default PDF font cannot draw the rupee symbol, so "Rs." is used here
const money = (n) =>
  `Rs. ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Builds the e-ticket and downloads it as a PDF file (no print dialog)
export function downloadTicketPdf(booking) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const left = 20;
  const width = 170;
  const right = left + width;
  const pad = 6;
  const top = 25;
  let y = top;

  const setText = (size, bold, color) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const label = (text, x, yy, align = "left") => {
    setText(8, false, [100, 116, 139]);
    doc.text(text, x, yy, { align });
  };

  const value = (text, x, yy, { size = 11, align = "left" } = {}) => {
    setText(size, true, [15, 23, 42]);
    doc.text(String(text ?? "-"), x, yy, { align });
  };

  const dashedLine = (yy) => {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.line(left + pad, yy, right - pad, yy);
    doc.setLineDashPattern([], 0);
  };

  // ---------- Header ----------
  doc.setFillColor(15, 23, 42);
  doc.rect(left, y, width, 16, "F");
  setText(15, true, [255, 255, 255]);
  doc.text("RailBook", left + pad, y + 10.5);
  setText(11, true, [251, 191, 36]);
  doc.text(`PNR ${booking.pnr}`, right - pad, y + 10.5, { align: "right" });
  y += 16;

  const bodyTop = y;

  // ---------- From / To ----------
  y += 10;
  label("From", left + pad, y);
  label("To", right - pad, y, "right");
  y += 7;
  value(booking.from_name, left + pad, y, { size: 14 });
  value(booking.to_name, right - pad, y, { size: 14, align: "right" });
  y += 5;
  label(`Departs ${formatTime(booking.departure_time)}`, left + pad, y);
  label(`Arrives ${formatTime(booking.arrival_time)}`, right - pad, y, "right");

  // ---------- Train / Date / Class ----------
  y += 7;
  dashedLine(y);
  y += 8;
  const col2 = left + 85;
  const col3 = left + 130;
  label("Train", left + pad, y);
  label("Date", col2, y);
  label("Class", col3, y);
  y += 6;
  value(booking.train_number, left + pad, y);
  value(formatDate(booking.travel_date), col2, y);
  value(booking.class_code, col3, y);
  y += 5;
  setText(9, false, [100, 116, 139]);
  doc.text(String(booking.train_name || ""), left + pad, y, { maxWidth: 75 });

  // ---------- Passengers ----------
  y += 7;
  dashedLine(y);
  y += 8;
  label("Passengers", left + pad, y);
  label("Coach / Seat", right - pad, y, "right");
  y += 3;

  booking.passengers.forEach((p) => {
    y += 4;
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.2);
    doc.line(left + pad, y, right - pad, y);
    y += 5.5;
    value(p.name, left + pad, y, { size: 10 });
    const nameWidth = doc.getTextWidth(p.name);
    setText(9, false, [100, 116, 139]);
    doc.text(`(${p.age}, ${p.gender})`, left + pad + nameWidth + 2, y);
    value(p.seat, right - pad, y, { size: 10, align: "right" });
  });

  // ---------- Status / Paid ----------
  y += 5;
  dashedLine(y);
  y += 8;
  label("Status", left + pad, y);
  label("Paid", right - pad, y, "right");
  y += 6;
  value(booking.status, left + pad, y);
  value(money(booking.total_amount), right - pad, y, { align: "right" });
  y += 8;

  // ---------- Border around the body ----------
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(left, bodyTop, width, y - bodyTop);

  // ---------- Footer note ----------
  setText(8, false, [100, 116, 139]);
  doc.text(
    "This is a computer generated e-ticket. Please carry a valid photo ID during the journey.",
    left,
    y + 8
  );

  doc.save(`RailBook-Ticket-${booking.pnr}.pdf`);
}