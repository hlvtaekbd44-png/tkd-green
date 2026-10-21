
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

// =====================================
// 1. TẠO HỘI VIÊN VÀ CẤP MÃ TỰ ĐỘNG
// =====================================

export async function createMemberWithAutoId(memberData) {
  const prefix = getMemberPrefix(memberData.diemTap);

  if (!prefix) {
    throw new Error("Điểm tập không hợp lệ.");
  }

  if (!String(memberData.hoTen || "").trim()) {
    throw new Error("Chưa nhập họ tên hội viên.");
  }

  const counterRef = doc(db, "memberCounters", prefix);
  const memberRef = doc(collection(db, "members"));

  return runTransaction(db, async (transaction) => {
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

    transaction.update(counterRef, {
      lastNumber: nextNumber,
      updatedAt: serverTimestamp(),
    });

    transaction.set(memberRef, {
      ...memberData,
      maHoiVienNoiBo,
      maHV: "",
      hoTen: String(memberData.hoTen).trim(),
      trangThai: memberData.trangThai || "Đang học",
      capDaiDang: memberData.capDaiDang || "Cấp 10",
      mauDai: memberData.mauDai || "Trắng",
      createdAt: serverTimestamp(),
    });

    return {
      id: memberRef.id,
      maHoiVienNoiBo,
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
    // Phải đọc dữ liệu trước khi ghi.
    const memberSnap = await transaction.get(memberRef);
    const counterSnap = await transaction.get(counterRef);

    if (!memberSnap.exists()) {
      throw new Error("Không tìm thấy hồ sơ hội viên.");
    }

    const member = memberSnap.data();

    // Không thay đổi điểm tập thì không cấp mã mới.
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
