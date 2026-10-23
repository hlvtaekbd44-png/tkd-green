
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "./firebase";
import { createMemberWithAutoId } from "./memberIdService";

export const IMPORT_COLUMNS = [
  "Họ và tên",
  "Ngày sinh",
  "Giới tính",
  "Mã VTF",
  "Điểm tập",
  "Cấp đai",
  "Màu đai",
  "SĐT phụ huynh",
  "Ngày bắt đầu",
  "Ngày hết hạn",
  "Loại học phí",
  "Trạng thái",
  "Ghi chú",
];

const LOCATIONS = [
  "Lê Văn Tám",
  "Nghĩa Trung",
  "Đồng Tâm",
  "Thôn 6",
  "Phước Sơn",
  "Minh Hưng",
];

const TUITION_TYPES = ["Ngày", "Tháng", "Quý"];

const MEMBER_STATUSES = [
  "Đang học",
  "Tạm nghỉ",
  "Nghỉ học",
];

export function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("vi");
}

export function normalizeDate(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  // Ngày Excel dạng số.
  if (typeof value === "number") {
    if (
      !Number.isFinite(value) ||
      value < 1 ||
      value > 2958465
    ) {
      return "Ngày không hợp lệ";
    }

    const date = new Date(
      Date.UTC(1899, 11, 30) +
      Math.floor(value) * 86400000
    );

    return date.toISOString().slice(0, 10);
  }

  // Ngày dạng đối tượng Date.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return "Ngày không hợp lệ";
    }

    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }

  const text = String(value).trim();

  // Ngày Việt Nam: dd/mm/yyyy.
  const matchVN = text.match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/
  );

  if (matchVN) {
    const [, day, month, year] = matchVN;
    return `${year}-${month}-${day}`;
  }

  // Ngày ISO: yyyy-mm-dd.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  return text;
}

export function formatDateVN(value) {
  if (!value) return "";

  const normalized = normalizeDate(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split("-");
    return `${day}/${month}/${year}`;
  }

  return String(value);
}

function validDate(value) {
  if (!value) return true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export function makeIdentity(member) {
  return [
    normalizeText(member.hoTen ?? member.name),
    normalizeDate(member.ngaySinh),
  ].join("|");
}

// Kiểm tra quyền thêm hội viên.
// Đây là kiểm tra phía giao diện;
// Firestore Rules vẫn phải xác thực quyền ghi.
export function canImportAtLocation(profile, location) {
  if (!profile) return false;

  if (profile.role === "admin") {
    return true;
  }

  if (profile.role !== "hlv") {
    return false;
  }

  if (profile.permissions?.members?.create !== true) {
    return false;
  }

  const assignedLocations = Array.isArray(profile.diemTap)
    ? profile.diemTap
    : [];

  if (!assignedLocations.includes(location)) {
    return false;
  }

  const locationPermissions =
    profile.locationPermissions?.members;

  // Nếu cấu hình quyền theo điểm tập chưa được xác định,
  // không tự động cấp thêm quyền.
  if (!locationPermissions) {
    return false;
  }

  if (Array.isArray(locationPermissions)) {
    return locationPermissions.includes(location);
  }

  if (typeof locationPermissions === "object") {
    const value = locationPermissions[location];

    return (
      value === true ||
      value?.create === true
    );
  }

  return false;
}

export function validateImportRows(
  rawRows,
  existingMembers = [],
  profile = null
) {
  const existingVtf = new Set();
  const existingIdentity = new Set();

  existingMembers.forEach((member) => {
    const vtf = normalizeText(member.maHV);

    if (vtf) {
      existingVtf.add(vtf);
    }

    if (member.hoTen || member.name) {
      existingIdentity.add(makeIdentity(member));
    }
  });

  const seenVtf = new Set();
  const seenIdentity = new Set();

  return rawRows.map((raw, index) => {
    const member = {
      hoTen: String(raw["Họ và tên"] ?? "").trim(),
      ngaySinh: normalizeDate(raw["Ngày sinh"]),
      gioiTinh: String(raw["Giới tính"] ?? "").trim(),
      maHV: String(raw["Mã VTF"] ?? "").trim(),
      diemTap: String(raw["Điểm tập"] ?? "").trim(),
      capDaiDang:
        String(raw["Cấp đai"] ?? "").trim() || "Cấp 10",
      mauDai:
        String(raw["Màu đai"] ?? "").trim() || "Trắng",
      soDienThoaiPhuHuynh: String(
        raw["SĐT phụ huynh"] ?? ""
      ).trim(),
      ngayBatDau: normalizeDate(raw["Ngày bắt đầu"]),
      ngayHetHan: normalizeDate(raw["Ngày hết hạn"]),
      loaiHocPhi: String(
        raw["Loại học phí"] ?? ""
      ).trim(),
      trangThai:
        String(raw["Trạng thái"] ?? "").trim() ||
        "Đang học",
      ghiChu: String(raw["Ghi chú"] ?? "").trim(),
    };

    const errors = [];
    const vtf = normalizeText(member.maHV);
    const identity = makeIdentity(member);

    if (!member.hoTen) {
      errors.push("Thiếu họ tên");
    }

    if (!LOCATIONS.includes(member.diemTap)) {
      errors.push("Điểm tập không hợp lệ");
    }

    if (!member.ngayBatDau) {
      errors.push("Thiếu ngày bắt đầu");
    }

    for (const field of [
      "ngaySinh",
      "ngayBatDau",
      "ngayHetHan",
    ]) {
      if (!validDate(member[field])) {
        errors.push(`Ngày không hợp lệ: ${field}`);
      }
    }

    if (
      member.ngayBatDau &&
      member.ngayHetHan &&
      validDate(member.ngayBatDau) &&
      validDate(member.ngayHetHan) &&
      member.ngayHetHan < member.ngayBatDau
    ) {
      errors.push("Ngày hết hạn trước ngày bắt đầu");
    }

    if (
      !TUITION_TYPES.includes(member.loaiHocPhi)
    ) {
      errors.push(
        "Loại học phí phải là Ngày, Tháng hoặc Quý"
      );
    }

    if (
      !MEMBER_STATUSES.includes(member.trangThai)
    ) {
      errors.push("Trạng thái không hợp lệ");
    }

    if (
      vtf &&
      (existingVtf.has(vtf) || seenVtf.has(vtf))
    ) {
      errors.push("Trùng mã VTF");
    }

    if (
      member.hoTen &&
      member.ngaySinh &&
      (
        existingIdentity.has(identity) ||
        seenIdentity.has(identity)
      )
    ) {
      errors.push("Trùng họ tên và ngày sinh");
    }

    if (vtf) {
      seenVtf.add(vtf);
    }

    if (member.hoTen && member.ngaySinh) {
      seenIdentity.add(identity);
    }

    if (
      profile &&
      !canImportAtLocation(profile, member.diemTap)
    ) {
      errors.push(
        "Không có quyền thêm hội viên tại điểm tập này"
      );
    }

    return {
      rowNumber: index + 2,
      member,
      errors,
      valid: errors.length === 0,
    };
  });
}

export async function importOneMember(
  member,
  profile = null
) {
  // Kiểm tra quyền trước khi ghi.
  if (
    profile &&
    !canImportAtLocation(profile, member.diemTap)
  ) {
    throw new Error(
      "Tài khoản không có quyền thêm hội viên tại " +
      member.diemTap
    );
  }

  // Kiểm tra lại mã VTF trước khi ghi.
  if (member.maHV) {
    const existing = await getDocs(
      query(
        collection(db, "members"),
        where("maHV", "==", member.maHV)
      )
    );

    if (!existing.empty) {
      throw new Error(
        `Mã VTF ${member.maHV} đã tồn tại.`
      );
    }
  }

  // Giữ nguyên cơ chế cấp mã nội bộ hiện tại.
  return createMemberWithAutoId(member);
}
