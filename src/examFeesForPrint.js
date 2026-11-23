import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";

const valid = n => Number.isSafeInteger(Number(n)) && Number(n) >= 0;
const clean = v => String(v ?? "").trim();

// Lấy từ dữ liệu ĐĂNG KÝ THI thực tế. Không suy đoán tiền từ bảng giá hiện hành.
// Phí thi đã chốt trong lePhiThi khi đăng ký, kể cả đợt cũ có mức phí khác.
export async function loadOutstandingExamFees(members, profile) {
  const list = Array.isArray(members) ? members : [];
  const byMember = Object.fromEntries(list.filter(m => m?.id).map(m => [m.id, []]));
  if (!list.length) return byMember;
  const points = [...new Set(list.map(m => clean(m.diemTap || m.location)).filter(Boolean))];
  const isAdmin = profile?.role === 'admin';
  const allowed = Array.isArray(profile?.locationPermissions?.tuition) ? profile.locationPermissions.tuition : [];
  for (const point of points) {
    if (!isAdmin && !(profile?.permissions?.tuition?.view === true && allowed.includes(point))) {
      throw new Error(`Không có quyền đọc lệ phí thi của điểm tập ${point}.`);
    }
    // Truy vấn có ràng buộc điểm tập để phù hợp Firestore Rules dành cho HLV.
    const snapshot = await getDocs(query(collection(db, 'examRegistrations'), where('diemTap', '==', point)));
    const ids = new Set(list.filter(m => clean(m.diemTap || m.location) === point).map(m => m.id));
    for (const document of snapshot.docs) {
      const reg = document.data();
      if (!ids.has(reg.memberDocId)) continue;
      if (['Không dự thi', 'Đã hủy', 'Đã huỷ'].includes(clean(reg.status))) continue;
      const fee = reg.lePhiThi;
      if (!fee) continue;
      if (!valid(fee.phaiThu) || !valid(fee.daThu)) {
        throw new Error(`Lệ phí thi của ${reg.hoTen || reg.memberDocId} ở đăng ký ${document.id} chưa hợp lệ.`);
      }
      const remaining = Number(fee.phaiThu) - Number(fee.daThu);
      if (remaining < 0 || (fee.conNo !== undefined && (!valid(fee.conNo) || Number(fee.conNo) !== remaining))) {
        throw new Error(`Lệ phí thi của ${reg.hoTen || reg.memberDocId} ở đăng ký ${document.id} chưa khớp. Cần đối soát.`);
      }
      if (remaining === 0) continue;
      if (['Đã hủy', 'Đã huỷ'].includes(clean(fee.trangThai))) continue;
      const dan = reg.examType === 'dan' || /đẳng/i.test(clean(reg.dangDuThi));
      byMember[reg.memberDocId].push({
        id: document.id,
        type: dan ? 'Thi đẳng' : 'Thi cấp',
        period: clean(reg.periodName || fee.bieuPhiDotThi || reg.periodCode || reg.periodId),
        level: clean(reg.dangDuThi),
        amount: Number(fee.phaiThu),
        paid: Number(fee.daThu),
        remaining,
      });
    }
  }
  for (const rows of Object.values(byMember)) rows.sort((a,b) => a.period.localeCompare(b.period,'vi') || a.level.localeCompare(b.level,'vi'));
  return byMember;
}
