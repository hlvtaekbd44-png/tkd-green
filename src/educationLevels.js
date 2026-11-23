// Danh mục dùng thống nhất trong Hội viên và Import Excel.
export const EDUCATION_LEVELS = [
  'Mẫu giáo',
  'Tiểu học',
  'Trung học',
  'Phổ thông',
  'Trung cấp',
  'Đại học',
];

export function normalizeEducationLevel(value) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return ""; // Hội viên cũ chưa có dữ liệu không bị lỗi.
  return EDUCATION_LEVELS.find(level => level.toLocaleLowerCase("vi") === text.toLocaleLowerCase("vi")) || null;
}
