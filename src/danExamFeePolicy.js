// Biểu phí thi đẳng theo đợt; không dùng chung với phí thi cấp của điểm tập.
export const DAN_EXAM_LEVELS = Object.freeze(
  Array.from({length:7}, (_,i) => `${i+1} Đẳng`)
);
export function parseDanFees(draft = {}) {
  const out = {};
  for (const level of DAN_EXAM_LEVELS) {
    const raw = draft[level];
    if (raw === "" || raw === null || raw === undefined) continue;
    const text = String(raw).trim();
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < 0)
      throw new Error(`Lệ phí thi lên ${level} phải là số nguyên không âm.`);
    out[level] = Number(text);
  }
  return out;
}
export function getDanExamFee(fees = {}, level) {
  if (!DAN_EXAM_LEVELS.includes(level)) return null;
  const value = fees?.[level];
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
export function formatDanFee(value) {
  return value === null ? "Chưa cấu hình" : `${value.toLocaleString("vi-VN")} đ`;
}
