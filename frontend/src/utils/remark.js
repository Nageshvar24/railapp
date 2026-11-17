import Swal from "sweetalert2";

// These two numbers must match MIN_REMARK_LENGTH and MAX_REMARK_LENGTH in bookings/services.py
export const MIN_REMARK_LENGTH = 5;
export const MAX_REMARK_LENGTH = 200;

// SweetAlert options for a textarea that accepts at most MAX_REMARK_LENGTH characters.
// The browser stops typing after the limit, and a live counter shows how many are used.
export function remarkInputOptions(label, placeholder) {
  return {
    input: "textarea",
    inputLabel: label,
    inputPlaceholder: placeholder,
    inputAttributes: { maxlength: MAX_REMARK_LENGTH, rows: 1 },
    inputValidator: (value) => {
      const length = (value || "").trim().length;
      return length < MIN_REMARK_LENGTH
        ? `Please write at least ${MIN_REMARK_LENGTH} characters`
        : null;
    },
    didOpen: () => {
      const textarea = Swal.getInput();
      if (!textarea) return;

      const counter = document.createElement("div");
      counter.style.cssText = "margin-top:6px;font-size:12px;text-align:right";
      textarea.insertAdjacentElement("afterend", counter);

      const update = () => {
        const length = textarea.value.length;
        counter.textContent = `${length} / ${MAX_REMARK_LENGTH} characters`;
        // Red while the text is too short or at the limit, green in between
        counter.style.color =
          length >= MIN_REMARK_LENGTH && length < MAX_REMARK_LENGTH ? "#059669" : "#dc2626";
      };
      textarea.addEventListener("input", update);
      update();
    },
  };
}