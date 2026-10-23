
import React, { useEffect, useMemo, useState } from "react";

import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  doc,
  where,
  runTransaction,
  getDocs,
  deleteDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Tooltip,

  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

import { db } from "./firebase";
import ExamResultsPreview from "./ExamResultsPreview";
import * as XLSX from "xlsx";

// Quy ước đăng ký: Cấp 10 -> Cấp 9 -> ... -> Cấp 1.
// Đẳng/đai đen cần quy tắc riêng, không tự suy đoán.
function currentLevel(student) {
  return String(student.belt || student.capDaiDang || "").trim();
}
function nextLevel(level) {
  const match = String(level).match(/(?:cấp|cap)\s*(10|[1-9])\b/i);
  if (!match) return "";
  const number = Number(match[1]);
  return number > 1 ? `Cấp ${number - 1}` : "";
}
function parseBirth(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const raw = String(value).trim();
  let y, m, d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) [y,m,d] = raw.split("-").map(Number);
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) [d,m,y] = raw.split("/").map(Number);
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}
function formatBirth(value) {
  const date = parseBirth(value);
  return date ? `${String(date.getUTCDate()).padStart(2,"0")}/${String(date.getUTCMonth()+1).padStart(2,"0")}/${date.getUTCFullYear()}` : "";
}
function gradeOrder(value) {
  const n = Number(String(value).match(/(?:cấp|cap)\s*(10|[1-9])\b/i)?.[1]);
  return n >= 1 && n <= 10 ? 10 - n : 1000;
}
function genderOrder(value) {
  const s = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return s.includes("nam") && !s.includes("nu") ? 0 : s.includes("nu") ? 1 : 2;
}
function sortExamRows(a,b) {
  const grade = gradeOrder(a.dangDuThi) - gradeOrder(b.dangDuThi);
  if (grade) return grade;
  const gender = genderOrder(a.gioiTinh) - genderOrder(b.gioiTinh);
  if (gender) return gender;
  // Ít tuổi hơn trước: ngày sinh mới hơn được xếp trước.
  const birthA = parseBirth(a.ngaySinh)?.getTime() ?? -Infinity;
  const birthB = parseBirth(b.ngaySinh)?.getTime() ?? -Infinity;
  if (birthA !== birthB) return birthB - birthA;
  return String(a.hoTen || "").localeCompare(String(b.hoTen || ""), "vi");
}
function eligibility(student, examDate, registeredIds) {
  if (registeredIds.has(student.id)) return "Đã đăng ký đợt thi này";
  const birth = parseBirth(student.ngaySinh);
  if (!birth) return "Thiếu hoặc sai ngày sinh";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(examDate || "") ? new Date(`${examDate}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime())) return "Đợt thi chưa có ngày thi hợp lệ";
  // Theo yêu cầu: xét NĂM SINH, không xét đủ ngày sinh nhật.
  if (date.getUTCFullYear() - birth.getUTCFullYear() < 6) return "Chưa đủ 6 tuổi theo năm sinh";
  if (!nextLevel(currentLevel(student))) return "Chưa xác định được cấp thi tiếp theo";
  return "";
}


export default function ExamManagement({
  students = [],
  profile,
  loading = false,
  error = "",
  location = "Tất cả điểm tập",
}) {
  const [periods, setPeriods] = useState([]);
  const [registrations, setRegistrations] = useState([]);

  const [selectedPeriod, setSelectedPeriod] = useState("");

  const [periodDialog, setPeriodDialog] = useState(false);
  const [registerDialog, setRegisterDialog] = useState(false);
  const [deletePeriodDialog, setDeletePeriodDialog] = useState(false);
  const [deletePeriodSummary, setDeletePeriodSummary] = useState(null);
  const [checkingDelete, setCheckingDelete] = useState(false);
  const [togglingRegistration, setTogglingRegistration] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  // name chính là mã đợt thi: Q1-2026, Q2-2026...
  const [periodName, setPeriodName] = useState("");

  const [examDate, setExamDate] = useState("");
  const [examLocation, setExamLocation] = useState("");

  const [studentId, setStudentId] = useState("");
  const [dangDuThi, setDangDuThi] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSelection, setBulkSelection] = useState([]);
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkReport, setBulkReport] = useState([]);

  const [busy, setBusy] = useState(false);
  const [feeLocations, setFeeLocations] = useState([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const isAdmin = profile?.role === "admin";

  // Phí thi lấy từ cấu hình điểm tập. Không tự tạo khoản phí nếu chưa thiết lập.
  useEffect(() => onSnapshot(collection(db, "locations"), snap => {
    setFeeLocations(snap.docs.map(d => ({id:d.id, ...d.data()})));
  }, err => { console.error("Không đọc được cấu hình lệ phí thi", err); setMessage("Không đọc được cấu hình điểm tập/lệ phí thi."); setMessageType("error"); }), []);

  // ============================================
  // 1. LẤY DANH SÁCH ĐỢT THI
  // ============================================

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "examPeriods")),
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })).filter(item => item.archived !== true && item.deleted !== true);

        setPeriods(data);

        setSelectedPeriod((current) => {
          if (current && data.some((item) => item.id === current)) {
            return current;
          }

          return data.length ? data[0].id : "";
        });
      },
      (err) => {
        console.error("Không tải được đợt thi:", err);
        setMessage(
          "Không tải được đợt thi. Cần kiểm tra quyền Firestore."
        );
        setMessageType("error");
      }
    );

    return unsubscribe;
  }, []);

  // ============================================
  // 2. LẤY DANH SÁCH ĐĂNG KÝ THI
  // ============================================

  useEffect(() => {
    if (!selectedPeriod || !profile) {
      setRegistrations([]);
      return undefined;
    }

    const registrationsRef = collection(db, "examRegistrations");

    const assignedLocations = Array.isArray(profile.diemTap)
      ? profile.diemTap
      : [];

    // HLV chưa được phân công điểm tập thì không truy vấn.
    if (profile.role !== "admin" && assignedLocations.length === 0) {
      setRegistrations([]);
      return undefined;
    }

    const registrationsQuery =
      profile.role === "admin"
        ? query(
            registrationsRef,
            where("periodId", "==", selectedPeriod)
          )
        : query(
            registrationsRef,
            where("periodId", "==", selectedPeriod),
            where("diemTap", "in", assignedLocations.slice(0, 30))
          );

    const unsubscribe = onSnapshot(
      registrationsQuery,
      (snapshot) => {
        setRegistrations(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      (err) => {
        console.error("Không tải được đăng ký:", err);
        setMessage(
          "Không tải được danh sách đăng ký. Cần kiểm tra quyền Firestore."
        );
        setMessageType("error");
      }
    );

    return unsubscribe;
  }, [selectedPeriod, profile]);

  // ============================================
  // 3. DANH SÁCH VÕ SINH ĐƯỢC PHÉP QUẢN LÝ
  // ============================================

  const visibleStudents = useMemo(() => {
    return students.filter((student) => {
      const locationMatches =
        location === "Tất cả điểm tập" ||
        student.location === location;

      const assignedLocations = Array.isArray(profile?.diemTap)
        ? profile.diemTap
        : [];

      const permissionMatches =
        isAdmin || assignedLocations.includes(student.location);

      return locationMatches && permissionMatches;
    });
  }, [students, location, profile, isAdmin]);

  const selectedPeriodData = periods.find(
    (period) => period.id === selectedPeriod
  );

  // Tương thích đợt cũ: nếu chưa có registrationOpen thì dựa trên trạng thái cũ.
  const registrationOpen = !!selectedPeriodData &&
    (typeof selectedPeriodData.registrationOpen === "boolean"
      ? selectedPeriodData.registrationOpen
      : !["Khóa đăng ký", "Đã khóa", "Đóng đăng ký", "Đã kết thúc"].includes(selectedPeriodData.status));

  const toggleRegistration = async () => {
    if (!isAdmin || !selectedPeriodData || busy || togglingRegistration) return;
    const nextOpen = !registrationOpen;
    const action = nextOpen ? "MỞ" : "KHÓA";
    if (!window.confirm(`${action} đăng ký đợt ${selectedPeriodData.name}? ${nextOpen ? "Cho phép đăng ký mới." : "Ngăn đăng ký mới; giữ nguyên danh sách và lệ phí đã ghi nhận."}`)) return;
    setTogglingRegistration(true);
    setMessage("");
    try {
      const periodRef = doc(db, "examPeriods", selectedPeriodData.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(periodRef);
        if (!snap.exists()) throw new Error("Đợt thi không còn tồn tại.");
        const current = snap.data();
        const actuallyOpen = typeof current.registrationOpen === "boolean"
          ? current.registrationOpen
          : !["Khóa đăng ký", "Đã khóa", "Đóng đăng ký", "Đã kết thúc"].includes(current.status);
        if (actuallyOpen !== registrationOpen) throw new Error("Trạng thái đợt thi đã thay đổi. Hãy thử lại.");
        tx.update(periodRef, {
          registrationOpen: nextOpen,
          status: nextOpen ? "Đang đăng ký" : "Khóa đăng ký",
          registrationChangedAt: serverTimestamp(),
          registrationChangedBy: profile?.email || "",
        });
      });
      if (!nextOpen) {setRegisterDialog(false);setBulkOpen(false);setBulkSelection([]);}
      setMessage(`Đã ${nextOpen ? "mở" : "khóa"} đăng ký đợt ${selectedPeriodData.name}.`);
      setMessageType("success");
    } catch (err) {
      setMessage(`Không đổi được trạng thái đăng ký: ${err.message || err.code}. Kiểm tra Firestore Rules.`);
      setMessageType("error");
    } finally { setTogglingRegistration(false); }
  };

  const registeredIds = useMemo(() => new Set(registrations.filter(item => item.status !== "Không dự thi").map(item => item.memberDocId)), [registrations]);
  const canManage = isAdmin || (profile?.role === "hlv" && profile?.permissions?.exams?.manage === true);
  const eligibleStudents = useMemo(() => visibleStudents.filter(s => !eligibility(s, selectedPeriodData?.examDate, registeredIds)), [visibleStudents, selectedPeriodData?.examDate, registeredIds]);
  const sortedRegistrations = useMemo(() => registrations.filter(r => r.status !== "Không dự thi").sort(sortExamRows), [registrations]);
  const bulkCandidates = useMemo(() => visibleStudents.filter(s => {
    const q = bulkSearch.trim().toLocaleLowerCase("vi");
    return !q || `${s.name} ${s.maHV} ${s.maHoiVienNoiBo} ${s.location}`.toLocaleLowerCase("vi").includes(q);
  }), [visibleStudents, bulkSearch]);
  const studentForSingle = visibleStudents.find(s => s.id === studentId);

  const exportExcel = () => {
    if (!selectedPeriodData || !sortedRegistrations.length) return;
    const rows = sortedRegistrations.map((r, i) => ({
      "STT": i + 1,
      "SBD": r.sbd || "",
      "VTF ID": String(r.maHV || ""),
      "Họ và Tên": r.hoTen || "",
      "Giới tính": r.gioiTinh || "",
      "Ngày sinh": formatBirth(r.ngaySinh),
      "Điểm tập": r.diemTap || "",
      "Cấp đai hiện tại": r.capDaiHienTai || "",
      "Đẳng dự thi": r.dangDuThi || "",
      "Kết quả": r.ketQua || "",
      "Trạng thái": r.status || "Đã đăng ký",
      "Lệ phí thi": r.lePhiThi?.phaiThu ?? "",
      "Còn nợ phí thi": r.lePhiThi?.conNo ?? "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [6,9,17,28,13,16,21,18,17,14,17,15,15].map(wch=>({wch}));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Danh sach thi cap");
    const name = String(selectedPeriodData.name || "DotThi").replace(/[^a-zA-Z0-9_-]/g, "_");
    XLSX.writeFile(book, `Danh_Sach_Thi_Cap_${name}.xlsx`);
  };

  const money = n => Number(n || 0).toLocaleString("vi-VN") + " đ";

  const cancelRegistration = async (item) => {
    if (!canManage || busy) return;
    if (!window.confirm(`Hủy đăng ký thi của ${item.hoTen}? Hồ sơ sẽ được giữ để đối soát và không có mặt trong danh sách xuất Excel.`)) return;
    setBusy(true); setMessage("");
    try {
      const regRef = doc(db, "examRegistrations", item.id);
      await runTransaction(db, async tx => {
        const snap = await tx.get(regRef);
        if (!snap.exists()) throw new Error("Không tìm thấy đăng ký.");
        const reg = snap.data();
        if (reg.status === "Không dự thi") throw new Error("Đăng ký đã bị hủy.");
        if (reg.ketQua || reg.status === "Đạt" || reg.status === "Không đạt") throw new Error("Đã có kết quả thi. Cần đối soát trước khi hủy.");
        const fee = reg.lePhiThi;
        if (Number(fee?.daThu || 0) > 0) throw new Error("Đã thu lệ phí thi. Cần hoàn/đối soát tiền trước khi hủy.");
        tx.update(regRef, {
          status: "Không dự thi", huyLuc: serverTimestamp(), huyBoi: profile?.email || "",
          ...(fee ? {lePhiThi:{...fee,conNo:0,phaiThu:0,trangThai:"Đã hủy",soTienHuy:Number(fee.phaiThu||0)}} : {})
        });
      });
      setMessage(`Đã hủy đăng ký thi của ${item.hoTen}; khoản lệ phí chưa thu được hủy theo.`); setMessageType("success");
    } catch (err) {setMessage(err.message || "Hủy đăng ký thất bại.");setMessageType("error");}
    finally {setBusy(false);}
  };

  const saveRegistration = async (student) => {
    if (!canManage) throw new Error("Tài khoản chưa có quyền quản lý thi cấp.");
    if (!registrationOpen) throw new Error("Đợt thi đang khóa đăng ký.");
    const reason = eligibility(student, selectedPeriodData?.examDate, registeredIds);
    if (reason) throw new Error(reason);
    const level = nextLevel(currentLevel(student));
    const registrationId = `${selectedPeriod}_${encodeURIComponent(student.id)}`;
    const ref = doc(db, "examRegistrations", registrationId);
    const pointMatches = feeLocations.filter(p => String(p.name||"").trim() === String(student.location||"").trim());
    if (pointMatches.length !== 1) throw new Error("Chưa có cấu hình duy nhất cho điểm tập của võ sinh.");
    const pointRef = doc(db, "locations", pointMatches[0].id);
    const memberRef = doc(db, "members", student.id);
    await runTransaction(db, async tx => {
      // Kiểm tra trạng thái trực tiếp trong transaction để tránh đăng ký
      // lọt qua khi Admin vừa khóa đợt thi.
      const periodSnap = await tx.get(doc(db, "examPeriods", selectedPeriod));
      if (!periodSnap.exists()) throw new Error("Đợt thi không còn tồn tại.");
      const periodData = periodSnap.data();
      const isOpenNow = typeof periodData.registrationOpen === "boolean"
        ? periodData.registrationOpen
        : !["Khóa đăng ký", "Đã khóa", "Đóng đăng ký", "Đã kết thúc"].includes(periodData.status);
      if (!isOpenNow) throw new Error("Đợt thi đã khóa đăng ký. Không thể thêm võ sinh.");
      const existing = await tx.get(ref);
      const configSnap = await tx.get(pointRef);
      const memberSnap = await tx.get(memberRef);
      // Cho phép đăng ký lại khi bản ghi cũ đã hủy và chưa từng thu lệ phí.
      const oldRegistration = existing.exists() ? existing.data() : null;
      if (oldRegistration && oldRegistration.status !== "Không dự thi")
        throw new Error("Võ sinh đã đăng ký trong đợt thi này.");
      if (oldRegistration && Number(oldRegistration.lePhiThi?.daThu || 0) > 0)
        throw new Error("Đăng ký cũ đã phát sinh khoản thu. Cần đối soát trước khi đăng ký lại.");
      if (!configSnap.exists() || !memberSnap.exists()) throw new Error("Thiếu hồ sơ hoặc cấu hình điểm tập.");
      const config = configSnap.data();
      const actual = memberSnap.data();
      if (config.active === false || config.features?.exams === false || config.name !== actual.diemTap || config.name !== student.location)
        throw new Error("Điểm tập đã thay đổi hoặc chưa bật chức năng Thi cấp.");
      const tuitionEnabled = config.features?.tuition !== false;
      const feeAmount = config.fees?.exam;
      if (tuitionEnabled && (feeAmount === null || feeAmount === undefined || feeAmount === "" || !Number.isSafeInteger(Number(feeAmount)) || Number(feeAmount) < 0))
        throw new Error("Điểm tập có Học phí nhưng chưa cấu hình lệ phí thi cấp. Hãy thiết lập trong Cài đặt.");
      // Đọc lại điều kiện tuổi/cấp từ hồ sơ thật, tránh dữ liệu danh sách đã cũ.
      const current = { ...student, ngaySinh:actual.ngaySinh, belt:actual.capDaiDang };
      const reason = eligibility(current, selectedPeriodData?.examDate, new Set());
      if (reason) throw new Error(reason);
      if (nextLevel(actual.capDaiDang) !== level) throw new Error("Cấp đai đã thay đổi; vui lòng tải lại danh sách trước khi đăng ký.");
      const examFee = tuitionEnabled ? {
        phaiThu: Number(feeAmount), daThu:0, conNo:Number(feeAmount),
        trangThai:Number(feeAmount) === 0 ? "Đã miễn" : "Chưa đóng",
        diemTap:config.name, ngayGhiNhan: selectedPeriodData.examDate,
      } : null;
      // Tái sử dụng cùng ID, không tạo hồ sơ trùng. Lưu dấu vết hủy trước đó.
      const lichSuHuyDangKy = oldRegistration
        ? [
            ...(Array.isArray(oldRegistration.lichSuHuyDangKy) ? oldRegistration.lichSuHuyDangKy : []),
            {
              huyLuc: oldRegistration.huyLuc || null,
              huyBoi: oldRegistration.huyBoi || "",
              dangDuThi: oldRegistration.dangDuThi || "",
              lePhiDaHuy: Number(oldRegistration.lePhiThi?.soTienHuy || 0),
            },
          ]
        : [];
      tx.set(ref, {
        periodId: selectedPeriod,
        memberDocId: student.id,
        maHV: student.maHV || "",
        hoTen: student.name || "",
        gioiTinh: student.gioiTinh || "",
        ngaySinh: actual.ngaySinh || "",
        diemTap: student.location || "",
        capDaiHienTai: actual.capDaiDang || "",
        dangDuThi: level,
        status: "Đã đăng ký",
        ...(examFee ? {lePhiThi:examFee} : {lePhiThi:null}),
        lichSuHuyDangKy,
        soLanDangKy: oldRegistration ? Number(oldRegistration.soLanDangKy || 1) + 1 : 1,
        createdBy: profile?.email || "",
        createdAt: serverTimestamp(),
      });
    });
  };

  const handleBulkRegister = async () => {
    if (!selectedPeriodData || !bulkSelection.length || !canManage || !registrationOpen) return;
    setBusy(true); setMessage("");
    const report = [];
    for (const id of bulkSelection) {
      const student = visibleStudents.find(s => s.id === id);
      if (!student) {report.push({id,ok:false,reason:"Không tìm thấy hội viên"});continue;}
      try {
        await saveRegistration(student);
        report.push({id, name:student.name, ok:true, reason:"Đã đăng ký"});
      } catch(e) {report.push({id, name:student.name, ok:false, reason:e.message || "Lỗi lưu"});}
    }
    setBulkReport(report);
    setBulkSelection([]);
    setBusy(false);
    const ok = report.filter(r=>r.ok).length;
    setMessage(`Đăng ký thành công ${ok}/${report.length} võ sinh. ${report.length-ok} hồ sơ chưa lưu; xem lý do trong bảng kết quả.`);
    setMessageType(ok === report.length ? "success" : "warning");
  };

  // ============================================
  // 4. TẠO ĐỢT THI
  // ============================================

  const handleCreatePeriod = async () => {
    if (!isAdmin) {
      setMessage("Chỉ quản trị viên được tạo đợt thi.");
      setMessageType("error");
      return;
    }

    // Chỉ dùng name làm mã đợt thi.
    const code = periodName.trim().toUpperCase();

    if (!code || !examDate || !examLocation.trim()) {
      setMessage(
        "Vui lòng nhập mã đợt thi, ngày thi và địa điểm thi."
      );
      setMessageType("warning");
      return;
    }

    // Ví dụ mã hợp lệ: Q1-2026, Q2-2026, Q3-2026.
    if (!/^Q[1-4]-\d{4}$/.test(code)) {
      setMessage(
        "Mã đợt thi phải có dạng Q1-2026, Q2-2026, Q3-2026 hoặc Q4-2026."
      );
      setMessageType("warning");
      return;
    }

    // Kiểm tra trùng mã dựa trên trường name.
    const duplicate = periods.some(
      (period) =>
        String(period.name || "").trim().toUpperCase() === code
    );

    if (duplicate) {
      setMessage(
        "Mã đợt thi này đã tồn tại. Vui lòng chọn mã khác."
      );
      setMessageType("warning");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const ref = await addDoc(collection(db, "examPeriods"), {
        name: code,
        examDate,
        examLocation: examLocation.trim(),
        status: "Đang đăng ký",
        registrationOpen: true,
        createdBy: profile?.email || "",
        createdAt: serverTimestamp(),
      });

      setSelectedPeriod(ref.id);
      setPeriodDialog(false);

      setPeriodName("");
      setExamDate("");
      setExamLocation("");

      setMessage("Đã tạo đợt thi với mã " + code + ".");
      setMessageType("success");
    } catch (err) {
      console.error("Lỗi tạo đợt thi:", err);

      setMessage(
        "Chưa tạo được đợt thi. Kiểm tra quyền Firestore trước khi thử lại."
      );
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  };

  // Xóa vĩnh viễn đợt thi và đăng ký chưa có phát sinh tài chính/kết quả.
  // KHÔNG xóa giao dịch tài chính đã thu hoặc kết quả thi đã ghi nhận.
  const inspectPeriodDeletion = async (periodId) => {
    const registrationSnap = await getDocs(query(
      collection(db, "examRegistrations"), where("periodId", "==", periodId)
    ));
    const paymentSnap = await getDocs(query(
      collection(db, "tuitionPayments"), where("periodId", "==", periodId)
    ));
    const registrationsToDelete = registrationSnap.docs;
    const payments = paymentSnap.docs;
    const moneyInRegistration = registrationsToDelete.filter((entry) => {
      const reg = entry.data();
      return Number(reg.lePhiThi?.daThu || 0) > 0 ||
        Number(reg.lePhiDaThu || reg.daThuLePhi || 0) > 0;
    });
    const results = registrationsToDelete.filter((entry) => {
      const reg = entry.data();
      const result = String(reg.ketQua || "").trim().toLowerCase();
      return (result !== "" && !["chưa cập nhật", "chưa có", "chưa thi"].includes(result)) ||
        ["đạt", "không đạt"].includes(String(reg.status || "").trim().toLowerCase());
    });
    return {
      registrationsToDelete,
      total: registrationsToDelete.length,
      paymentCount: payments.length,
      receivedCount: moneyInRegistration.length,
      resultCount: results.length,
      blocked: payments.length > 0 || moneyInRegistration.length > 0 || results.length > 0,
    };
  };

  const openDeletePeriod = async () => {
    if (!isAdmin || !selectedPeriodData || busy) return;
    setCheckingDelete(true);
    setDeletePeriodSummary(null);
    setDeleteConfirmation("");
    setDeletePeriodDialog(true);
    try {
      const inspection = await inspectPeriodDeletion(selectedPeriodData.id);
      setDeletePeriodSummary({
        total: inspection.total,
        paymentCount: inspection.paymentCount,
        receivedCount: inspection.receivedCount,
        resultCount: inspection.resultCount,
        blocked: inspection.blocked,
      });
    } catch (err) {
      console.error("Không kiểm tra được dữ liệu đợt thi:", err);
      setMessage("Không thể đọc hết đăng ký/giao dịch để kiểm tra. Không thực hiện xóa: " + err.message);
      setMessageType("error");
      setDeletePeriodDialog(false);
    } finally {
      setCheckingDelete(false);
    }
  };

  const confirmDeletePeriod = async () => {
    if (!isAdmin || !selectedPeriodData || !deletePeriodSummary || busy) return;
    const periodId = selectedPeriodData.id;
    const code = String(selectedPeriodData.name || "");
    if (deleteConfirmation.trim() !== code) return;
    setBusy(true);
    try {
      const inspection = await inspectPeriodDeletion(periodId);
      if (inspection.blocked) throw new Error(
        `Không thể xóa: có ${inspection.paymentCount} giao dịch thu lệ phí, ` +
        `${inspection.receivedCount} đăng ký đã ghi nhận tiền và ${inspection.resultCount} kết quả thi. ` +
        "Hãy đối soát dữ liệu này trước."
      );
      // Một batch nguyên tử, tối đa 450 đăng ký + 1 đợt thi.
      // Không xóa từng phần khi danh sách quá lớn.
      if (inspection.total > 450) throw new Error(
        "Đợt thi có trên 450 đăng ký. Cần dùng quy trình xóa phía máy chủ " +
        "để bảo đảm toàn vẹn; chưa xóa dữ liệu nào."
      );
      const batch = writeBatch(db);
      for (const entry of inspection.registrationsToDelete) batch.delete(entry.ref);
      batch.delete(doc(db, "examPeriods", periodId));
      await batch.commit();
      setMessage(`Đã xóa vĩnh viễn đợt ${code} và ${inspection.total} đăng ký liên quan.`);
      setMessageType("success");
      setDeletePeriodDialog(false);
      setDeleteConfirmation("");
      setSelectedPeriod("");
    } catch (err) {
      console.error("Xóa đợt thi thất bại:", err);
      setMessage(`Không thể xóa đợt thi: ${err.message || err.code}. Kiểm tra Firestore Rules.`);
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  };

  // ============================================
  // 5. ĐĂNG KÝ VÕ SINH THI CẤP
  // ============================================

  const handleRegister = async () => {
    const student = visibleStudents.find(item => item.id === studentId);
    if (!selectedPeriodData || !student) {
      setMessage("Vui lòng chọn đợt thi và võ sinh."); setMessageType("warning"); return;
    }
    setBusy(true); setMessage("");
    try {
      await saveRegistration(student);
      setRegisterDialog(false); setStudentId(""); setDangDuThi("");
      setMessage("Đã đăng ký thi: " + nextLevel(currentLevel(student)));
      setMessageType("success");
    } catch(err) {
      setMessage(err.message || "Không lưu được đăng ký."); setMessageType("error");
    } finally {setBusy(false);}
  };

  // ============================================
  // 6. GIAO DIỆN QUẢN LÝ THI CẤP
  // ============================================

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ sm: "center" }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h5" fontWeight={800}>
            Quản lý thi cấp
          </Typography>

          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Quản lý đợt thi và đăng ký võ sinh trên web.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          {isAdmin && (
            <Button
              variant="outlined"
              onClick={() => setPeriodDialog(true)}
            >
              Tạo đợt thi
            </Button>
          )}

          {isAdmin && <Button variant="outlined" color={registrationOpen ? "warning" : "success"} disabled={!selectedPeriodData || busy || togglingRegistration} onClick={toggleRegistration}>{togglingRegistration ? "Đang cập nhật..." : registrationOpen ? "Khóa đăng ký" : "Mở đăng ký"}</Button>}
          {isAdmin && <Button variant="outlined" color="error" disabled={!selectedPeriodData || busy || togglingRegistration} onClick={openDeletePeriod}>Xóa đợt thi</Button>}
          {canManage && <Button variant="contained" onClick={() => setRegisterDialog(true)} disabled={!selectedPeriod || loading || !registrationOpen || busy} sx={{ bgcolor: "#176b45" }}>Đăng ký một võ sinh</Button>}
          {canManage && <Button variant="contained" color="success" onClick={() => {setBulkOpen(true);setBulkReport([]);setBulkSelection([]);}} disabled={!selectedPeriod || loading || !registrationOpen || busy}>Đăng ký hàng loạt</Button>}
          <Button variant="outlined" onClick={exportExcel} disabled={!selectedPeriod || !sortedRegistrations.length}>Xuất Excel (.xlsx)</Button>
        </Stack>
      </Stack>

      {message && (
        <Alert
          severity={messageType}
          onClose={() => setMessage("")}
          sx={{ mb: 2 }}
        >
          {message}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Dialog open={deletePeriodDialog} onClose={() => { if (!busy) setDeletePeriodDialog(false); }} fullWidth maxWidth="sm">
        <DialogTitle>Xóa vĩnh viễn đợt thi — {selectedPeriodData?.name || ""}</DialogTitle>
        <DialogContent>
          {checkingDelete ? <Typography>Đang kiểm tra đăng ký, kết quả và giao dịch thu...</Typography> : deletePeriodSummary && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography>Đăng ký liên quan: <strong>{deletePeriodSummary.total}</strong></Typography>
              <Typography>Giao dịch thu lệ phí: <strong>{deletePeriodSummary.paymentCount}</strong></Typography>
              <Typography>Đăng ký ghi nhận đã thu tiền: <strong>{deletePeriodSummary.receivedCount}</strong></Typography>
              <Typography>Đăng ký có kết quả: <strong>{deletePeriodSummary.resultCount}</strong></Typography>
              {deletePeriodSummary.blocked ? (
                <Alert severity="error">
                  Không thể xóa vĩnh viễn vì đã có giao dịch tài chính hoặc kết quả thi.
                  Hãy đối soát trước để bảo đảm không làm sai lịch sử hội viên và các khoản tiền đã thu.
                </Alert>
              ) : (
                <>
                  <Alert severity="warning">
                    Xóa vĩnh viễn đợt thi và toàn bộ {deletePeriodSummary.total} đăng ký
                    (kể cả đăng ký đã hủy). Thao tác này không thể hoàn tác.
                  </Alert>
                  <TextField fullWidth label="Nhập chính xác mã đợt thi để xác nhận"
                    value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder={selectedPeriodData?.name || ""} />
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletePeriodDialog(false)} disabled={busy}>Đóng</Button>
          <Button variant="contained" color="error" onClick={confirmDeletePeriod}
            disabled={busy || checkingDelete || !deletePeriodSummary || deletePeriodSummary.blocked || deleteConfirmation.trim() !== String(selectedPeriodData?.name || "")}>
            {busy ? "Đang xóa..." : "Xóa vĩnh viễn cả dữ liệu"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* CHỌN ĐỢT THI */}

      <Paper
        variant="outlined"
        sx={{ p: 2, mb: 3, borderRadius: 3 }}
      >
        <Typography fontWeight={700} sx={{ mb: 1 }}>
          Đợt thi
        </Typography>

        <TextField
          select
          fullWidth
          label="Chọn đợt thi"
          value={selectedPeriod}
          onChange={(event) =>
            setSelectedPeriod(event.target.value)
          }
        >
          {periods.map((period) => (
            <MenuItem key={period.id} value={period.id}>
              {period.name || "Chưa có mã"} —{" "}
              {period.examDate || "Chưa có ngày thi"}
            </MenuItem>
          ))}
        </TextField>

        {selectedPeriodData && (
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            flexWrap="wrap"
            sx={{ mt: 2 }}
          >
            <Chip
              label={`Mã đợt thi: ${
                selectedPeriodData.name || "Chưa có mã"
              }`}
            />

            <Chip
              label={`Ngày thi: ${
                selectedPeriodData.examDate || "Chưa xác định"
              }`}
            />

            <Chip
              label={`Địa điểm: ${
                selectedPeriodData.examLocation || "Chưa xác định"
              }`}
            />

            <Chip
              label={
                selectedPeriodData.status || "Chưa xác định"
              }
            />

            <Chip label={registrationOpen ? "ĐANG MỞ ĐĂNG KÝ" : "ĐÃ KHÓA ĐĂNG KÝ"} color={registrationOpen ? "success" : "warning"} />
            <Chip
              label={`${sortedRegistrations.length} thí sinh đăng ký`}
            />
          </Stack>
        )}

        {!periods.length && (
          <Typography
            color="text.secondary"
            sx={{ mt: 2 }}
          >
            Chưa có đợt thi. Quản trị viên có thể tạo đợt thi mới.
          </Typography>
        )}
      </Paper>

      {/* DANH SÁCH ĐĂNG KÝ THI */}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>STT</TableCell>
              <TableCell>Mã VTF</TableCell>
              <TableCell>Họ và tên</TableCell>
              <TableCell>Giới tính</TableCell>
              <TableCell>Ngày sinh</TableCell>
              <TableCell>Điểm tập</TableCell>
              <TableCell>Đẳng dự thi</TableCell>
              <TableCell>Trạng thái</TableCell>
              <TableCell>Lệ phí thi</TableCell>
              <TableCell>Thao tác</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {sortedRegistrations.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{item.maHV}</TableCell>
                <TableCell>{item.hoTen}</TableCell>
                <TableCell>{item.gioiTinh || "—"}</TableCell>
                <TableCell>{formatBirth(item.ngaySinh) || "—"}</TableCell>
                <TableCell>{item.diemTap}</TableCell>
                <TableCell>{item.dangDuThi}</TableCell>

                <TableCell>
                  <Chip
                    size="small"
                    label={item.status || "Đã đăng ký"}
                    color="success"
                  />
                </TableCell>
                <TableCell>{item.lePhiThi ? `${money(item.lePhiThi.conNo)} còn nợ` : "—"}</TableCell>
                <TableCell>{canManage && <Button size="small" color="error" variant="outlined" disabled={busy} onClick={() => cancelRegistration(item)}>Không dự thi</Button>}</TableCell>
              </TableRow>
            ))}

            {!sortedRegistrations.length && (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  Chưa có thí sinh đăng ký trong đợt thi này.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

            {/* NHẬP KẾT QUẢ THI - CHỈ ADMIN */}
{isAdmin && selectedPeriodData && (
  <ExamResultsPreview
    key={selectedPeriod}
    period={selectedPeriodData}
    registrations={sortedRegistrations}
    isAdmin={isAdmin}
  />
)}
      {!registrationOpen && selectedPeriodData && <Alert severity="warning" sx={{mb:2}}>Đợt {selectedPeriodData.name} đã khóa đăng ký. Vẫn có thể xem danh sách và xuất Excel, nhưng không thể thêm võ sinh mới.</Alert>}
      {/* HỘP THOẠI ĐĂNG KÝ HÀNG LOẠT */}
      <Dialog open={bulkOpen} onClose={() => !busy && setBulkOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle>Đăng ký thi cấp hàng loạt — {selectedPeriodData?.name || ""}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">Tự chọn cấp liền kề (Cấp 10 → Cấp 9), xét đủ 6 tuổi theo năm sinh của ngày thi, bỏ qua võ sinh đã đăng ký. Cấp 1 hoặc đẳng chưa thiết lập quy đổi sẽ không tự đăng ký.</Alert>
            <TextField size="small" label="Tìm võ sinh (tên / VTF / điểm tập)" value={bulkSearch} onChange={e=>setBulkSearch(e.target.value)} fullWidth />
            <Stack direction="row" alignItems="center" spacing={2}>
              <Button disabled={busy} onClick={()=>setBulkSelection(eligibleStudents.filter(s=>bulkCandidates.some(x=>x.id===s.id)).map(s=>s.id))}>Chọn tất cả đủ điều kiện đang lọc</Button>
              <Button disabled={busy} onClick={()=>setBulkSelection([])}>Bỏ chọn</Button>
              <Chip label={`${bulkSelection.length} đã chọn`} />
            </Stack>
            <TableContainer sx={{maxHeight:380}}><Table size="small" stickyHeader>
              <TableHead><TableRow><TableCell padding="checkbox">Chọn</TableCell><TableCell>Họ tên</TableCell><TableCell>Ngày sinh</TableCell><TableCell>Giới tính</TableCell><TableCell>Đang mang</TableCell><TableCell>Dự thi</TableCell><TableCell>Điều kiện</TableCell></TableRow></TableHead>
              <TableBody>{bulkCandidates.map(s=>{
                const reason=eligibility(s,selectedPeriodData?.examDate,registeredIds);
                return <TableRow key={s.id}>
                  <TableCell padding="checkbox"><Checkbox checked={bulkSelection.includes(s.id)} disabled={!!reason||busy} onChange={e=>setBulkSelection(v=>e.target.checked?[...new Set([...v,s.id])]:v.filter(id=>id!==s.id))}/></TableCell>
                  <TableCell>{s.name}<Typography variant="caption" display="block" color="text.secondary">{s.location}</Typography></TableCell>
                  <TableCell>{formatBirth(s.ngaySinh)||"—"}</TableCell><TableCell>{s.gioiTinh||"—"}</TableCell><TableCell>{currentLevel(s)||"—"}</TableCell><TableCell>{nextLevel(currentLevel(s))||"—"}</TableCell>
                  <TableCell><Chip size="small" color={reason?"warning":"success"} label={reason||"Đủ điều kiện"}/></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table></TableContainer>
            {bulkReport.length>0 && <Alert severity={bulkReport.every(r=>r.ok)?"success":"warning"}>
              Hoàn tất: {bulkReport.filter(r=>r.ok).length}/{bulkReport.length}. {bulkReport.filter(r=>!r.ok).slice(0,15).map(r=>`${r.name||r.id}: ${r.reason}`).join("; ")}
            </Alert>}
          </Stack>
        </DialogContent>
        <DialogActions><Button disabled={busy} onClick={()=>setBulkOpen(false)}>Đóng</Button><Button variant="contained" disabled={busy||!registrationOpen||!bulkSelection.length} onClick={handleBulkRegister}>{busy?"Đang lưu...":`Lưu ${bulkSelection.length} đăng ký`}</Button></DialogActions>
      </Dialog>

      {/* HỘP THOẠI TẠO ĐỢT THI */}

      <Dialog
        open={periodDialog}
        onClose={() => !busy && setPeriodDialog(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Tạo đợt thi mới</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Mã đợt thi"
              placeholder="Ví dụ: Q4-2026"
              value={periodName}
              onChange={(event) =>
                setPeriodName(event.target.value)
              }
              helperText="Mã này phải trùng với cột MaDotThi trong Google Sheets."
              fullWidth
            />

            <TextField
              label="Ngày thi"
              type="date"
              value={examDate}
              onChange={(event) =>
                setExamDate(event.target.value)
              }
              slotProps={{
                inputLabel: { shrink: true },
              }}
              fullWidth
            />

            <TextField
              label="Địa điểm thi"
              value={examLocation}
              onChange={(event) =>
                setExamLocation(event.target.value)
              }
              fullWidth
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setPeriodDialog(false)}
            disabled={busy}
          >
            Hủy
          </Button>

          <Button
            onClick={handleCreatePeriod}
            disabled={busy}
            variant="contained"
          >
            Lưu đợt thi
          </Button>
        </DialogActions>
      </Dialog>

      {/* HỘP THOẠI ĐĂNG KÝ VÕ SINH */}

      <Dialog
        open={registerDialog}
        onClose={() => !busy && setRegisterDialog(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Đăng ký võ sinh thi cấp</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              select
              label="Võ sinh"
              value={studentId}
              onChange={(event) =>
                setStudentId(event.target.value)
              }
              fullWidth
            >
              {visibleStudents
                .filter(
                  (student) => !eligibility(student, selectedPeriodData?.examDate, registeredIds)
                )
                .map((student) => (
                  <MenuItem
                    key={student.id}
                    value={student.id}
                  >
                    {student.maHV} — {student.name} (
                    {student.location})
                  </MenuItem>
                ))}
            </TextField>

            <TextField label="Cấp đai hiện tại" value={studentForSingle ? currentLevel(studentForSingle) : ""} InputProps={{readOnly:true}} fullWidth />
            <TextField label="Cấp dự thi tự động" value={studentForSingle ? nextLevel(currentLevel(studentForSingle)) : ""} InputProps={{readOnly:true}} fullWidth />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setRegisterDialog(false)}
            disabled={busy}
          >
            Hủy
          </Button>

          <Button
            onClick={handleRegister}
            disabled={busy || !registrationOpen || !studentForSingle || !!eligibility(studentForSingle, selectedPeriodData?.examDate, registeredIds)}
            variant="contained"
          >
            Lưu đăng ký
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
