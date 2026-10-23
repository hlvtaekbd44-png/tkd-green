
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "./firebase";

import {
  getMemberPrefix,
  formatMemberId,
} from "./memberLocations";

import {
  tinhNgayKetThucKy,
  isValidISODate,
} from "./tuitionDateUtils";

// =====================================
// 1. TẠO HỘI VIÊN VÀ CẤP MÃ TỰ ĐỘNG
// =====================================

export async function createMemberWithAutoId(memberData) {
  const prefix = getMemberPrefix(memberData.diemTap);

  if (!prefix) {
    throw new Error("Điểm tập không hợp lệ.");
  }

  const hoTen = String(memberData.hoTen || "").trim();

  if (!hoTen) {
    throw new Error("Chưa nhập họ tên hội viên.");
  }

  const ngayBatDau = String(memberData.ngayBatDau || "").trim();
  const loaiHocPhi = String(memberData.loaiHocPhi || "").trim();

  if (!isValidISODate(ngayBatDau)) {
    throw new Error("Ngày bắt đầu tập không hợp lệ.");
  }

  
const laHocPhiNgay = loaiHocPhi === "Ngày";

const ngayDenHanDauTien = laHocPhiNgay
  ? ""
  : tinhNgayKetThucKy(ngayBatDau, loaiHocPhi);

if (!laHocPhiNgay && !ngayDenHanDauTien) {
  throw new Error(
    "Loại học phí phải là Ngày, Tháng hoặc Quý."
  );
}


  const counterRef = doc(db, "memberCounters", prefix);
  const memberRef = doc(collection(db, "members"));

  return runTransaction(db, async (transaction) => {
    // Đọc bộ đếm trước khi ghi.
    const counterSnap = await transaction.get(counterRef);

    if (!counterSnap.exists()) {
      throw new Error(
        `Chưa khởi tạo bộ đếm cho điểm tập ${memberData.diemTap}.`
      );
    }

    const currentNumber = counterSnap.data().lastNumber;

    if (
      !Number.isSafeInteger(currentNumber) ||
      currentNumber < 0
    ) {
      throw new Error("Bộ đếm ID không hợp lệ.");
    }

    const nextNumber = currentNumber + 1;

    const maHoiVienNoiBo = formatMemberId(
      prefix,
      nextNumber
    );

    // Tăng bộ đếm.
    transaction.update(counterRef, {
      lastNumber: nextNumber,
      updatedAt: serverTimestamp(),
    });

    // Tạo hội viên.
    transaction.set(memberRef, {
      ...memberData,

      maHoiVienNoiBo,

      // Giữ mã VTF khi thêm thủ công hoặc Import Excel.
      maHV: String(memberData.maHV ?? "").trim(),

      hoTen,
      ngayBatDau,
      loaiHocPhi,

      // Ngày kết thúc kỳ học phí đầu tiên.
      ngayDenHanDauTien,

      // Chưa thu tiền nên chưa có ngày đã thanh toán đến.
      ngayHetHan: "",

      trangThai: memberData.trangThai || "Đang học",
      capDaiDang: memberData.capDaiDang || "Cấp 10",
      mauDai: memberData.mauDai || "Trắng",

      createdAt: serverTimestamp(),
    });

    return {
      id: memberRef.id,
      maHoiVienNoiBo,
      ngayDenHanDauTien,
    };
  });
}

// =====================================
// 2. CHUYỂN ĐIỂM TẬP VÀ CẤP MÃ MỚI
// =====================================

export async function transferMemberLocation(
  memberId,
  newLocation,
  updateData = {}
) {
  const prefix = getMemberPrefix(newLocation);

  if (!prefix) {
    throw new Error("Điểm tập mới không hợp lệ.");
  }

  if (!memberId) {
    throw new Error("Thiếu ID hồ sơ hội viên.");
  }

  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Bạn cần đăng nhập để chuyển điểm tập.");
  }

  const memberRef = doc(db, "members", memberId);
  const counterRef = doc(db, "memberCounters", prefix);

  const historyRef = doc(
    collection(db, "memberTransferHistory")
  );

  return runTransaction(db, async (transaction) => {
    // Firestore yêu cầu đọc trước khi ghi.
    const memberSnap = await transaction.get(memberRef);
    const counterSnap = await transaction.get(counterRef);

    if (!memberSnap.exists()) {
      throw new Error("Không tìm thấy hồ sơ hội viên.");
    }

    const member = memberSnap.data();

    // Không đổi điểm tập thì không cấp mã mới.
    if (member.diemTap === newLocation) {
      transaction.update(memberRef, {
        ...updateData,
        updatedAt: serverTimestamp(),
      });

      return {
        changed: false,
        maHoiVienNoiBo: member.maHoiVienNoiBo || "",
      };
    }

    if (!counterSnap.exists()) {
      throw new Error(
        `Chưa có bộ đếm mã hội viên tại ${newLocation}.`
      );
    }

    const currentNumber = counterSnap.data().lastNumber;

    if (
      !Number.isSafeInteger(currentNumber) ||
      currentNumber < 0
    ) {
      throw new Error("Bộ đếm mã hội viên không hợp lệ.");
    }

    const nextNumber = currentNumber + 1;

    const newMemberCode = formatMemberId(
      prefix,
      nextNumber
    );

    // Tăng bộ đếm điểm tập mới.
    transaction.update(counterRef, {
      lastNumber: nextNumber,
      updatedAt: serverTimestamp(),
    });

    // Giữ nguyên Firebase document ID.
    // Chỉ đổi điểm tập và mã nội bộ.
    transaction.update(memberRef, {
      ...updateData,
      diemTap: newLocation,
      maHoiVienNoiBo: newMemberCode,
      updatedAt: serverTimestamp(),
    });

    // Lưu lịch sử chuyển điểm tập.
    transaction.set(historyRef, {
      memberId,
      diemTapCu: member.diemTap || "",
      diemTapMoi: newLocation,
      maNoiBoCu: member.maHoiVienNoiBo || "",
      maNoiBoMoi: newMemberCode,
      maHV: member.maHV || "",
      hoTen: member.hoTen || "",
      nguoiThucHienUid: currentUser.uid,
      nguoiThucHienEmail: currentUser.email || "",
      ngayChuyen: serverTimestamp(),
    });

    return {
      changed: true,
      oldMemberCode: member.maHoiVienNoiBo || "",
      maHoiVienNoiBo: newMemberCode,
    };
  });
}
