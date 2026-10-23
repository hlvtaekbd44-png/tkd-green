
 // TKD Green: chính sách miễn/giảm cho từng hội viên.

export const POLICY_TYPES = [
  "binh_thuong",
  "mien_100",
  "giam_phan_tram",
  "giam_co_dinh",
];

export const POLICY_LABELS = {
  binh_thuong: "Bình thường",
  mien_100: "Miễn 100%",
  giam_phan_tram: "Giảm theo %",
  giam_co_dinh: "Giảm số tiền cố định",
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Kiểm tra dữ liệu chính sách trước khi lưu.
export function validateTuitionPolicy(p) {
  if (!p || !POLICY_TYPES.includes(p.loai)) {
    throw new Error("Loại chính sách không hợp lệ.");
  }

  if (p.loai !== "binh_thuong") {
    if (!p.lyDo?.trim()) {
      throw new Error("Cần nhập lý do miễn/giảm.");
    }

    if (!ISO.test(p.tuNgay || "")) {
      throw new Error("Cần nhập ngày bắt đầu chính sách.");
    }

    if (
      p.denNgay &&
      (!ISO.test(p.denNgay) || p.denNgay < p.tuNgay)
    ) {
      throw new Error(
        "Ngày kết thúc chính sách không hợp lệ."
      );
    }
  }

  const n = Number(p.giaTri);

  if (
    p.loai === "giam_phan_tram" &&
    (!Number.isFinite(n) || n <= 0 || n > 100)
  ) {
    throw new Error(
      "Tỷ lệ giảm phải từ trên 0 đến 100%."
    );
  }

  if (
    p.loai === "giam_co_dinh" &&
    (!Number.isSafeInteger(n) || n <= 0)
  ) {
    throw new Error(
      "Số tiền giảm phải là số nguyên dương."
    );
  }
}

// Tính miễn/giảm theo ngày bắt đầu kỳ học phí.
export function calculateTuitionPolicy(
  baseFee,
  policy,
  cycleStartISO
) {
  const base = Number(baseFee);

  if (!Number.isSafeInteger(base) || base <= 0) {
    throw new Error(
      "Học phí gốc phải là số nguyên dương."
    );
  }

  const p = policy || { loai: "binh_thuong" };

  const active =
    p.loai !== "binh_thuong" &&
    p.tuNgay &&
    cycleStartISO >= p.tuNgay &&
    (!p.denNgay || cycleStartISO <= p.denNgay);

  const type = active ? p.loai : "binh_thuong";

  const raw =
    type === "mien_100"
      ? base
      : type === "giam_phan_tram"
        ? Math.round(base * Number(p.giaTri) / 100)
        : type === "giam_co_dinh"
          ? Number(p.giaTri)
          : 0;

  const discount = Math.max(
    0,
    Math.min(base, raw)
  );

  return {
    hocPhiGoc: base,
    soTienGiam: discount,
    soTienPhaiDong: base - discount,
    loaiChinhSach: type,
    lyDoGiam:
      type === "binh_thuong"
        ? ""
        : (p.lyDo || ""),
    chinhSachSnapshot: active
      ? { ...p }
      : { loai: "binh_thuong" },
  };
}
