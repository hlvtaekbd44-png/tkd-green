import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";

// Báo cáo thời gian thực. Không mặc định 0 nếu chưa đọc được Firestore.
const normalizeLocations = (profile) => {
  if (profile?.role === "admin") return [];
  const raw = profile?.diemTap;
  return [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).filter(Boolean))];
};
const batches = (items, size = 30) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
const localMonthKey = (dateValue) => {
  if (typeof dateValue === "string") {
    const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : "";
  }
  const date = dateValue?.toDate?.() || (dateValue instanceof Date ? dateValue : null);
  return date && !Number.isNaN(date.getTime())
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "";
};

export default function useDashboardLiveMetrics(profile, selectedLocation) {
  const [payments, setPayments] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [paymentsState, setPaymentsState] = useState("loading");
  const [registrationsState, setRegistrationsState] = useState("loading");
  const points = useMemo(() => normalizeLocations(profile), [profile?.role, JSON.stringify(profile?.diemTap || [])]);
  const pointsKey = points.join("|");

  useEffect(() => {
    setPayments([]); setRegistrations([]);
    setPaymentsState("loading"); setRegistrationsState("loading");
    if (!profile || !["admin", "hlv"].includes(profile.role)) {
      setPaymentsState("unavailable"); setRegistrationsState("unavailable"); return;
    }
    if (profile.role !== "admin" && points.length === 0) {
      setPaymentsState("unavailable"); setRegistrationsState("unavailable"); return;
    }
    const definitions = [
      ["tuitionPayments", setPayments, setPaymentsState],
      ["examRegistrations", setRegistrations, setRegistrationsState],
    ];
    const unsubs = [];
    definitions.forEach(([name, setter, setState]) => {
      const ref = collection(db, name);
      const queries = profile.role === "admin" ? [ref] :
        batches(points).map(group => query(ref, where("diemTap", "in", group)));
      const pieces = new Map();
      queries.forEach((q, index) => {
        unsubs.push(onSnapshot(q, snap => {
          pieces.set(index, snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          setter([...new Map([...pieces.values()].flat().map(item => [item.id, item])).values()]);
          if (pieces.size === queries.length) setState("ready");
        }, err => {
          console.error(`Lỗi thống kê ${name}:`, err);
          setter([]); setState("unavailable");
        }));
      });
    });
    return () => unsubs.forEach(unsub => unsub());
  }, [profile?.role, profile?.uid, pointsKey]);

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const selected = item => selectedLocation === "Tất cả điểm tập" || item.diemTap === selectedLocation;
  const collected = payments.filter(p => selected(p) && localMonthKey(p.ngayThu) === month)
    .reduce((total, payment) => total + (Number(payment.soTien) || 0), 0);
  // Đăng ký chưa có kết quả và chưa hủy, ở tất cả các đợt thi.
  const pending = registrations.filter(r => selected(r)
    && !["Không dự thi", "Đạt", "Không đạt", "Đã hủy", "Hủy"].includes(String(r.status || "").trim())
    && !String(r.ketQua || "").trim()).length;
  return {
    collected: paymentsState === "ready" ? collected.toLocaleString("vi-VN") + " đ" : "—",
    pending: registrationsState === "ready" ? pending.toLocaleString("vi-VN") : "—",
    tuitionNote: paymentsState === "ready" ? `Tháng ${now.getMonth() + 1}/${now.getFullYear()}` : "Chưa đọc được dữ liệu học phí",
    examNote: registrationsState === "ready" ? "Đăng ký chưa có kết quả, tất cả đợt" : "Chưa đọc được dữ liệu thi cấp",
    periodLabel: `Tháng ${now.getMonth() + 1}, ${now.getFullYear()}`,
  };
}
