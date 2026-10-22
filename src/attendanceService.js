
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export const ATTENDANCE_LOCATIONS = [
  "Lê Văn Tám",
  "Nghĩa Trung",
  "Đồng Tâm",
  "Thôn 6",
  "Phước Sơn",
  "Minh Hưng",
];

const PREFIXES = {
  "Lê Văn Tám": "LVTA",
  "Nghĩa Trung": "NGTR",
  "Đồng Tâm": "DOTM",
  "Thôn 6": "T6",
  "Phước Sơn": "PHSo",
  "Minh Hưng": "MIHU",
};

export const ATTENDANCE_STATUSES = [
  "Chưa điểm danh",
  "Có mặt",
  "Vắng có phép",
  "Vắng không phép",
];

export function attendanceSessionId(location, date) {
  if (
    !PREFIXES[location] ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    throw new Error("Điểm tập hoặc ngày không hợp lệ.");
  }

  return `${PREFIXES[location]}_${date}`;
}

export async function loadAttendance(location, date) {
  const id = attendanceSessionId(location, date);
  const sessionRef = doc(db, "attendanceSessions", id);

  // Đọc buổi trước. Chỉ đọc records khi buổi tồn tại.
  const sessionSnap = await getDoc(sessionRef);

  if (!sessionSnap.exists()) {
    return { session: null, records: {} };
  }

  const snapshot = await getDocs(
    collection(sessionRef, "records")
  );

  const records = {};

  snapshot.forEach((item) => {
    records[item.id] = item.data();
  });

  return {
    session: {
      id: sessionSnap.id,
      ...sessionSnap.data(),
    },
    records,
  };
}

export async function saveAttendance({
  location,
  date,
  students,
  changes,
  user,
}) {
  if (!user?.uid) {
    throw new Error("Bạn chưa đăng nhập.");
  }

  const entries = Object.entries(changes);

  if (entries.length === 0) {
    return { count: 0 };
  }

  const studentsById = new Map(
    students.map((student) => [student.id, student])
  );

  // Kiểm tra toàn bộ dữ liệu trước khi ghi.
  for (const [memberId, change] of entries) {
    const student = studentsById.get(memberId);

    if (!student || student.location !== location) {
      throw new Error(
        `Võ sinh ${memberId} không thuộc điểm tập này.`
      );
    }

    if (!ATTENDANCE_STATUSES.includes(change.trangThai)) {
      throw new Error("Trạng thái điểm danh không hợp lệ.");
    }

    if (
      typeof change.ghiChu !== "string" ||
      change.ghiChu.length > 500
    ) {
      throw new Error("Ghi chú tối đa 500 ký tự.");
    }
  }

  const id = attendanceSessionId(location, date);
  const sessionRef = doc(db, "attendanceSessions", id);

  // Tạo buổi nếu chưa có; không sửa thông tin buổi cũ.
  const sessionSnap = await getDoc(sessionRef);

  if (!sessionSnap.exists()) {
    try {
      await setDoc(sessionRef, {
        diemTap: location,
        ngayTap: date,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      // Có thể một HLV khác vừa tạo cùng buổi.
      const latest = await getDoc(sessionRef);
      if (!latest.exists()) throw error;
    }
  }

  // Chỉ ghi những dòng đã thay đổi.
  // Mỗi batch tối đa 400 bản ghi.
  let saved = 0;

  for (let start = 0; start < entries.length; start += 400) {
    const chunk = entries.slice(start, start + 400);
    const batch = writeBatch(db);

    chunk.forEach(([memberId, change]) => {
      batch.set(
        doc(sessionRef, "records", memberId),
        {
          memberId,
          trangThai: change.trangThai,
          ghiChu: change.ghiChu,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    await batch.commit();
    saved += chunk.length;
  }

  return { sessionId: id, count: saved };
}
