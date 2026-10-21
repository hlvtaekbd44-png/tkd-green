
/**
 * Cấu hình thi cấp TKD Green.
 *
 * Chưa điền màu đai mặc định để tránh cập nhật sai hồ sơ.
 * Quản trị viên sẽ cấu hình bảng quy đổi trong ứng dụng.
 */

export const DEFAULT_EXAM_CONFIG = {
  beltMappings: {},
  resultValues: {
    passed: ["Đạt"],
    failed: ["Không đạt", "Không Đạt"],
  },
};

export function normalizeExamText(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("vi-VN");
}

export function getExamResultStatus(value) {
  const result = normalizeExamText(value);

  if (result === "đạt") return "passed";
  if (result === "không đạt") return "failed";

  return "unknown";
}

export function getBeltMapping(dangDuThi, config = DEFAULT_EXAM_CONFIG) {
  const key = normalizeExamText(dangDuThi);

  return config.beltMappings[key] ?? null;
}
