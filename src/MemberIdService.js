
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "./firebase";
import {
  getMemberPrefix,
  formatMemberId,
} from "./memberLocations";

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
