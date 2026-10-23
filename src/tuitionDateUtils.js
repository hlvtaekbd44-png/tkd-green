
/**
 * Tiện ích ngày học phí TKD Green.
 * Lưu ngày trong Firebase theo định dạng YYYY-MM-DD.
 *
 * Quy tắc:
 * 20/07/2026 + 1 tháng - 1 ngày = 19/08/2026
 * 20/07/2026 + 3 tháng - 1 ngày = 19/10/2026
 */

export function isValidISODate(value) {
  if (typeof value !== "string") return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function formatDateVN(value) {
  if (!isValidISODate(value)) return "Chưa cập nhật";

  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function tinhNgayKetThucKy(ngayBatDau, loaiHocPhi) {
  if (!isValidISODate(ngayBatDau)) return "";

  const loai = String(loaiHocPhi || "").trim().toLowerCase();

  let soThang;

  if (loai === "tháng" || loai === "thang" || loai === "month") {
    soThang = 1;
  } else if (loai === "quý" || loai === "quy" || loai === "quarter") {
    soThang = 3;
  } else {
    return "";
  }

  const [year, month, day] = ngayBatDau.split("-").map(Number);

  // Xác định tháng đích, tránh lỗi khi ngày bắt đầu là 29, 30, 31.
  const thangDich = new Date(
    Date.UTC(year, month - 1 + soThang, 1)
  );

  const namDich = thangDich.getUTCFullYear();
  const thangDichIndex = thangDich.getUTCMonth();

  const ngayCuoiThangDich = new Date(
    Date.UTC(namDich, thangDichIndex + 1, 0)
  ).getUTCDate();

  // Nếu tháng đích không có ngày tương ứng, dùng ngày cuối tháng.
  const ngayBatDauKyTiepTheo = new Date(
    Date.UTC(
      namDich,
      thangDichIndex,
      Math.min(day, ngayCuoiThangDich)
    )
  );

  // Kỳ hiện tại kết thúc trước kỳ tiếp theo 1 ngày.
  ngayBatDauKyTiepTheo.setUTCDate(
    ngayBatDauKyTiepTheo.getUTCDate() - 1
  );

  return ngayBatDauKyTiepTheo.toISOString().slice(0, 10);
}

/**
 * Tương thích với AddMember.jsx.
 * Định dạng YYYY-MM-DD thành DD/MM/YYYY.
 */
export function formatNgayVN(value) {
  return formatDateVN(value);
}
