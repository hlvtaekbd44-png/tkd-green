
/**
 * BẢNG QUY ĐỔI CẤP ĐAI - TKD GREEN
 *
 * Chỉ dùng để xác định cấp đai sau khi thi ĐẠT.
 * Không trực tiếp ghi dữ liệu vào Firestore.
 */

export const BELT_LEVELS = {
  "Cấp 10": "Trắng",
  "Cấp 9": "Trắng 1",
  "Cấp 8": "Trắng 2",
  "Cấp 7": "Vàng",
  "Cấp 6": "Xanh lá",
  "Cấp 5": "Xanh dương",
  "Cấp 4": "Đỏ",
  "Cấp 3": "Đỏ 1",
  "Cấp 2": "Đỏ 2",
  "Cấp 1": "Đỏ 3",

  "1 Đẳng": "Dan 1",
  "2 Đẳng": "Dan 2",
  "3 Đẳng": "Dan 3",
  "4 Đẳng": "Dan 4",
  "5 Đẳng": "Dan 5",
  "6 Đẳng": "Dan 6",
};

/**
 * Chuẩn hóa khoảng trắng và chữ hoa/thường.
 */
export function normalizeExamText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Chấp nhận các cách ghi như:
 * - Cap 7
 * - Cấp 7
 * - 1 Dang
 * - 1 Đẳng
 */
export function normalizeExamLevel(value) {
  const text = normalizeExamText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

  const capMatch = text.match(/^cap\s*(10|[1-9])$/);

  if (capMatch) {
    return `Cấp ${Number(capMatch[1])}`;
  }

  const dangMatch = text.match(/^([1-6])\s*dang$/);

  if (dangMatch) {
    return `${Number(dangMatch[1])} Đẳng`;
  }

  return normalizeExamText(value);
}

/**
 * Trả về cấp đai tương ứng với cấp thi.
 * Nếu không có trong bảng quy đổi thì trả về null.
 */
export function getBeltAfterExam(examLevel) {
  const normalizedLevel = normalizeExamLevel(examLevel);

  return BELT_LEVELS[normalizedLevel] ?? null;
}

/**
 * Chuẩn hóa kết quả thi.
 * Chỉ chấp nhận Đạt, Không đạt và Vắng.
 */
export function normalizeExamResult(value) {
  const text = normalizeExamText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

  if (text === "dat") {
    return "Đạt";
  }

  if (text === "khong dat") {
    return "Không đạt";
  }

  if (text === "vang") {
    return "Vắng";
  }

  return null;
}

/**
 * Xác định có được cập nhật cấp đai hay không.
 */
export function evaluateExamResult(examLevel, result) {
  const normalizedResult = normalizeExamResult(result);
  const capDai = normalizeExamLevel(examLevel);
  const mauDai = getBeltAfterExam(capDai);

  if (!normalizedResult) {
    return {
      valid: false,
      result: null,
      shouldUpdateBelt: false,
      capDai: null,
      mauDai: null,
      belt: null,
      error: "Kết quả thi không hợp lệ.",
    };
  }

  if (!mauDai) {
    return {
      valid: false,
      result: normalizedResult,
      shouldUpdateBelt: false,
      capDai: null,
      mauDai: null,
      belt: null,
      error: "Không tìm thấy cấp dự thi trong bảng quy đổi.",
    };
  }

  if (normalizedResult !== "Đạt") {
    return {
      valid: true,
      result: normalizedResult,
      shouldUpdateBelt: false,
      capDai: null,
      mauDai: null,
      belt: null,
      error: null,
    };
  }

  return {
    valid: true,
    result: normalizedResult,
    shouldUpdateBelt: true,

    // Cấp đai chính thức
    capDai,

    // Màu đai tương ứng
    mauDai,

    // Giữ tương thích với giao diện cũ
    belt: mauDai,

    error: null,
  };
}