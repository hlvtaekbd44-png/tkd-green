import {
  collection, doc, getDoc, getDocs, serverTimestamp,
  setDoc, writeBatch, query, where,
} from "firebase/firestore";
import { db } from "./firebase";

// Tương thích những giao diện cũ; nguồn danh sách mới phải dùng useClubLocations.
export const ATTENDANCE_LOCATIONS = [
  "Lê Văn Tám", "Nghĩa Trung", "Đồng Tâm",
  "Thôn 6", "Phước Sơn", "Minh Hưng",
];
const PREFIXES = {
  "Lê Văn Tám": "LVTA", "Nghĩa Trung": "NGTR", "Đồng Tâm": "DOTM",
  "Thôn 6": "T6", "Phước Sơn": "PHSo", "Minh Hưng": "MIHU",
};
export const ATTENDANCE_STATUSES = [
  "Có mặt", "Vắng có phép", "Vắng không phép", "Chưa điểm danh",
];

/** Tra cứu nguồn dữ liệu điểm tập chuẩn. Không cần thay mã khi Admin thêm điểm tập. */
async function resolveAttendanceLocation(location) {
  const name = String(location || '').trim();
  if (!name) throw new Error('Vui lòng chọn điểm tập.');
  const found = await getDocs(query(collection(db, 'locations'), where('name', '==', name)));
  const matches = found.docs.filter(item => item.data().deleted !== true);
  if (matches.length !== 1) {
    throw new Error('Không xác định duy nhất điểm tập trong Cài đặt. Kiểm tra tên hoặc dữ liệu trùng.');
  }
  const record = matches[0];
  if (record.data().active === false) throw new Error('Điểm tập đang tạm ngừng hoạt động.');
  return record;
}

/** Giữ ID cũ cho 6 điểm tập lịch sử, dùng ID Firestore cho điểm tập mới. */
export async function attendanceSessionId(location, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('Ngày tập không hợp lệ.');
  const locationDoc = await resolveAttendanceLocation(location);
  const legacyPrefix = PREFIXES[location];
  const code = legacyPrefix || locationDoc.id;
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(code)) throw new Error('Mã điểm tập không hợp lệ.');
  return `${code}_${date}`;
}

export async function loadAttendance(location, date) {
  const id = await attendanceSessionId(location, date);
  const sessionRef = doc(db, "attendanceSessions", id);
  const sessionSnap = await getDoc(sessionRef);
  const recordSnap = sessionSnap.exists() ? await getDocs(collection(sessionRef, "records")) : {docs: []};
  return {
    session: sessionSnap.exists() ? sessionSnap.data() : null,
    records: Object.fromEntries(recordSnap.docs.map((d) => [d.id, d.data()])),
  };
}

export async function saveAttendance({ location, date, students, statuses, existingRecords = {}, user }) {
  if (!user?.uid) throw new Error("Bạn cần đăng nhập.");
  const id = await attendanceSessionId(location, date);
  const sessionRef = doc(db, "attendanceSessions", id);
  const validStudents = students.filter((s) => s.id && s.location === location);
  if (!validStudents.length) throw new Error("Không có võ sinh để lưu.");

  // Tạo buổi tập nếu chưa tồn tại; không ghi đè người tạo hay ngày tạo.
  const existing = await getDoc(sessionRef);
  if (!existing.exists()) {
    try {
      await setDoc(sessionRef, {
        ngayTap: date, diemTap: location,
        createdBy: user.uid, createdAt: serverTimestamp(),
      });
    } catch (error) {
      // Nếu buổi vừa được tạo ở thiết bị khác, tiếp tục dùng buổi đó.
      const latest = await getDoc(sessionRef);
      if (!latest.exists()) throw error;
    }
  }

  // Ghi theo lô 10 để phù hợp giới hạn đọc tài liệu của Firestore Rules trong batch.
  for (let start = 0; start < validStudents.length; start += 10) {
    const batch = writeBatch(db);
    const chunk = validStudents.slice(start, start + 10);
    for (const student of chunk) {
      const status = statuses[student.id] || "Chưa điểm danh";
      if (!ATTENDANCE_STATUSES.includes(status)) {
        throw new Error(`Trạng thái không hợp lệ: ${student.name}`);
      }
      batch.set(doc(sessionRef, "records", student.id), {
        memberId: student.id,
        trangThai: status,
        ghiChu: String(existingRecords[student.id]?.ghiChu || "").slice(0, 500),
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }
  return { sessionId: id, count: validStudents.length };
}
