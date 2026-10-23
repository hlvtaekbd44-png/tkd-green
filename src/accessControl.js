
export const MODULES = [
  "dashboard",
  "members",
  "tuition",
  "exams",
  "attendance",
  "reports",
  "settings",
];

export const MODULE_LABELS = {
  dashboard: "Tổng quan",
  members: "Hội viên",
  tuition: "Học phí",
  exams: "Thi cấp",
  attendance: "Điểm danh",
  reports: "Báo cáo",
  settings: "Cài đặt",
};

// Mặc định không cấp quyền cho HLV
// nếu chưa được cấu hình rõ ràng.
export function canAccess(profile, module, action = "view") {
  if (!profile || profile.active === false) return false;

  if (profile.role === "admin") return true;

  if (profile.role === "member") {
    return (
      action === "view" &&
      ["members", "tuition", "exams", "attendance"].includes(module) &&
      Boolean(profile.memberId)
    );
  }

  if (profile.role !== "hlv") return false;

  return profile.permissions?.[module]?.[action] === true;
}

// Kiểm tra quyền tại một điểm tập cụ thể.
export function canAccessLocation(
  profile,
  module,
  location,
  action = "view"
) {
  if (!canAccess(profile, module, action)) return false;

  if (profile.role === "admin") return true;

  if (profile.role === "member") return false;

  const allowed =
    profile.locationPermissions?.[module] || [];

  return allowed.includes(location);
}

// Dùng để xác định các điểm tập được phép quản lý.
export function getAllowedLocations(profile, module) {
  if (!profile || profile.active === false) return [];

  if (profile.role === "admin") {
    return [
      "Lê Văn Tám",
      "Nghĩa Trung",
      "Đồng Tâm",
      "Thôn 6",
      "Phước Sơn",
      "Minh Hưng",
    ];
  }

  if (profile.role !== "hlv") return [];

  if (!canAccess(profile, module)) return [];

  return profile.locationPermissions?.[module] || [];
}
