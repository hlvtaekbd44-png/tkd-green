
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
import DanExamResultsPreview from "./DanExamResultsPreview";
import ExamTopScorers from "./ExamTopScorers";
import { nextExamLevel, normalizeExamLevel, isDanExamLevel, EXAM_RANK_SEQUENCE } from "./examRankPolicy";
import * as XLSX from "xlsx";
import { DAN_EXAM_LEVELS, parseDanFees, getDanExamFee, formatDanFee } from "./danExamFeePolicy";

// Cấp/đẳng kế tiếp dùng chung với Import kết quả thi.
function currentLevel(student) {
  return String(student.belt || student.capDaiDang || "").trim();
}
const nextLevel = nextExamLevel;
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
  const index = EXAM_RANK_SEQUENCE.indexOf(normalizeExamLevel(value));
  return index < 0 ? 1000 : index;
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
// Chỉ loại các hồ sơ đã nghỉ học khỏi đề xuất và đăng ký thi mới.
// App.jsx truyền trạng thái qua `status`; hồ sơ Firestore dùng `trangThai`.
function isQuitMember(student) {
  const value = String(student?.trangThai ?? student?.status ?? "")
    .trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi").replace(/\s+/g, " ");
  return value === "nghi hoc";
}

function eligibility(student, examDate, registeredIds, examType = "cap") {
  if (isQuitMember(student)) return "Hội viên đã nghỉ học, không được đề xuất đăng ký thi";
  if (registeredIds.has(student.id)) return "Đã đăng ký đợt thi này";
  const birth = parseBirth(student.ngaySinh);
  if (!birth) return "Thiếu hoặc sai ngày sinh";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(examDate || "") ? new Date(`${examDate}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime())) return "Đợt thi chưa có ngày thi hợp lệ";
  // Theo yêu cầu: xét NĂM SINH, không xét đủ ngày sinh nhật.
  if (date.getUTCFullYear() - birth.getUTCFullYear() < 6) return "Chưa đủ 6 tuổi theo năm sinh";
  const target = nextLevel(currentLevel(student));
  if (!target) return "Chưa xác định được bậc thi tiếp theo";
  if (isDanExamLevel(target) !== (examType === "dan")) return examType === "dan" ? "Chưa đến bậc thi đẳng" : "Đã chuyển sang nhóm thi đẳng";
  return "";
}


export default function ExamManagement({
  students = [],
  profile,
  loading = false,
  error = "",
  location = "Tất cả điểm tập",
  examType = "cap",
}) {
  const [periods, setPeriods] = useState([]);
  const [registrations, setRegistrations] = useState([]);

  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [filterExamLocation, setFilterExamLocation] = useState(location);

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
  const [danFeeDraft, setDanFeeDraft] = useState({});
  const [danFeeDialog, setDanFeeDialog] = useState(false);

  const [studentId, setStudentId] = useState("");
  const [dangDuThi, setDangDuThi] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSelection, setBulkSelection] = useState([]);
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkExamType, setBulkExamType] = useState(examType);
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
        })).filter(item => item.archived !== true && item.deleted !== true && (item.examType || "cap") === examType);

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
  }, [examType]);

  // ============================================
  // 2. LẤY DANH SÁCH ĐĂNG KÝ THI
  // ============================================

  useEffect(() => {
    if (!selectedPeriod || !profile) {
      setRegistrations([]);
      return undefined;
    }

    const registrationsRef = collection(db, "examRegistrations");

    const moduleKey = examType === "dan" ? "dan" : "exams";
    const assignedLocations = profile.role === "admin"
      ? []
      : Array.isArray(profile.locationPermissions?.[moduleKey])
        ? profile.locationPermissions[moduleKey]
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
  }, [selectedPeriod, profile, examType]);

  // ============================================
  // 3. DANH SÁCH VÕ SINH ĐƯỢC PHÉP QUẢN LÝ
  // ============================================

  // Danh sách hội viên đã được App.jsx giới hạn quyền đọc từ Firestore.
  // Chỉ lọc thêm theo điểm tập tại trang Thi cấp/Thi đẳng.
  const examLocationOptions = useMemo(() => ['Tất cả điểm tập', ...new Set(
    students.map(s => String(s.location || '').trim()).filter(Boolean)
  )].sort((a, b) => a === 'Tất cả điểm tập' ? -1 : b === 'Tất cả điểm tập' ? 1 : a.localeCompare(b, 'vi')), [students]);
  const validExamLocation = examLocationOptions.includes(filterExamLocation) ? filterExamLocation : 'Tất cả điểm tập';
  const visibleStudents = useMemo(() => students.filter(student =>
    validExamLocation === 'Tất cả điểm tập' || student.location === validExamLocation
  ), [students, validExamLocation]);

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
  const moduleKey = examType === "dan" ? "dan" : "exams";
  const assignedExamLocations = profile?.locationPermissions?.[moduleKey] || [];
  const canManage = isAdmin || (profile?.role === "hlv"
    && profile?.permissions?.[moduleKey]?.manage === true
    && Array.isArray(assignedExamLocations)
    && assignedExamLocations.length > 0);
  const eligibleStudents = useMemo(() => visibleStudents.filter(s => !eligibility(s, selectedPeriodData?.examDate, registeredIds, examType)), [visibleStudents, selectedPeriodData?.examDate, registeredIds, examType]);
  const eligibleCount = eligibleStudents.length;
  const sortedRegistrations = useMemo(() => registrations.filter(r => {
    if (r.status === 'Không dự thi') return false;
    if (validExamLocation === 'Tất cả điểm tập') return true;
    const name = r.diemTap || students.find(s => s.id === r.memberDocId)?.location;
    return name === filterExamLocation;
  }).sort(sortExamRows), [registrations, validExamLocation, students]);
  const bulkCandidates = useMemo(() => visibleStudents.filter(s => {
    if (isQuitMember(s)) return false;
    const proposed = nextLevel(currentLevel(s));
    if (!proposed || isDanExamLevel(proposed) !== (examType === "dan")) return false;
    const q = bulkSearch.trim().toLocaleLowerCase("vi");
    return !q || `${s.name} ${s.maHV} ${s.maHoiVienNoiBo} ${s.location}`.toLocaleLowerCase("vi").includes(q);
  }), [visibleStudents, bulkSearch, examType]);
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
    if (!canManage) throw new Error(`Tài khoản chưa có quyền đăng ký ${examType === "dan" ? "Thi đẳng" : "Thi cấp"}.`);
    if (!isAdmin && !assignedExamLocations.includes(student.location))
      throw new Error("Hội viên không thuộc điểm tập được phân quyền đăng ký kỳ thi này.");
    if (!registrationOpen) throw new Error("Đợt thi đang khóa đăng ký.");
    const reason = eligibility(student, selectedPeriodData?.examDate, registeredIds, examType);
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
      if ((periodData.examType || "cap") !== examType) throw new Error("Đợt thi không thuộc phân hệ này. Vui lòng tải lại.");
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
      const featureKey = examType === "dan" ? "dan" : "exams";
      if (config.active === false || config.features?.[featureKey] !== true || config.name !== actual.diemTap || config.name !== student.location)
        throw new Error(`Điểm tập đã thay đổi hoặc chưa bật chức năng ${examType === "dan" ? "Thi đẳng" : "Thi cấp"}.`);
      const tuitionEnabled = config.features?.tuition !== false;
      // Thi cấp dùng mức phí của điểm tập; Thi đẳng dùng biểu phí riêng theo
      // ĐẲNG DỰ THI và theo từng đợt. Không dùng phí thi cấp cho thi đẳng.
      const feeAmount = examType === "dan"
        ? getDanExamFee(periodData.danFees, level)
        : config.fees?.exam;
      if (examType === "dan" && feeAmount === null)
        throw new Error(`Đợt ${periodData.name} chưa cấu hình lệ phí thi lên ${level}. Admin cần thiết lập biểu phí trước khi đăng ký.`);
      if (examType === "cap" && tuitionEnabled && (feeAmount === null || feeAmount === undefined || feeAmount === "" || !Number.isSafeInteger(Number(feeAmount)) || Number(feeAmount) < 0))
        throw new Error("Điểm tập có Học phí nhưng chưa cấu hình lệ phí thi cấp. Hãy thiết lập trong Cài đặt.");
      // Đọc lại điều kiện tuổi/cấp từ hồ sơ thật, tránh dữ liệu danh sách đã cũ.
      if (isQuitMember(actual)) throw new Error("Hội viên đã nghỉ học; không thể đăng ký thi cấp.");
      const current = { ...student, ngaySinh: actual.ngaySinh, belt: actual.capDaiDang, trangThai: actual.trangThai };
      const reason = eligibility(current, selectedPeriodData?.examDate, new Set(), examType);
      if (reason) throw new Error(reason);
      if (nextLevel(actual.capDaiDang) !== level) throw new Error("Cấp đai đã thay đổi; vui lòng tải lại danh sách trước khi đăng ký.");
      const examFee = (examType === "dan" || tuitionEnabled) ? {
        phaiThu: Number(feeAmount), daThu:0, conNo:Number(feeAmount),
        trangThai:Number(feeAmount) === 0 ? "Đã miễn" : "Chưa đóng",
        diemTap:config.name, ngayGhiNhan: periodData.examDate,
        loaiThi:examType, dangDuThi:level,
        bieuPhiDotThi:periodData.name || "",
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
        examType,
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

    // Thi cấp theo quý; thi đẳng có mã đợt riêng (L1-2026, L2-2026...).
    const validCode = examType === "dan" ? /^L[1-9]\d*-\d{4}$/.test(code) : /^Q[1-4]-\d{4}$/.test(code);
    if (!validCode) {
      setMessage(examType === "dan" ? "Mã đợt thi đẳng có dạng L1-2026, L2-2026..." : "Mã thi cấp có dạng Q1-2026 đến Q4-2026.");
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

    let danFees = {};
    if (examType === "dan") {
      try { danFees = parseDanFees(danFeeDraft); }
      catch (e) { setMessage(e.message); setMessageType("warning"); return; }
    }
    setBusy(true);
    setMessage("");

    try {
      const ref = await addDoc(collection(db, "examPeriods"), {
        name: code,
        examType,
        ...(examType === "dan" ? { danFees } : {}),
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
      setDanFeeDraft({});

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

  // Chỉ điều chỉnh biểu phí cho các đăng ký TƯƠNG LAI. Lệ phí tại
  // examRegistrations.lePhiThi là số tiền chốt lúc đăng ký, không bị sửa.
  const saveDanFees = async () => {
    if (!isAdmin || examType !== "dan" || !selectedPeriodData || busy) return;
    let fees;
    try { fees = parseDanFees(danFeeDraft); }
    catch (e) { setMessage(e.message); setMessageType("warning"); return; }
    setBusy(true);
    try {
      await runTransaction(db, async tx => {
        const ref = doc(db, "examPeriods", selectedPeriodData.id);
        const snap = await tx.get(ref);
        if (!snap.exists() || snap.data().examType !== "dan")
          throw new Error("Đợt thi đẳng không còn tồn tại.");
        tx.update(ref, { danFees: fees, danFeesUpdatedAt: serverTimestamp(), danFeesUpdatedBy: profile?.email || "" });
      });
      setDanFeeDialog(false);
      setMessage("Đã lưu biểu phí thi đẳng. Đăng ký cũ giữ nguyên lệ phí; đăng ký mới dùng biểu phí cập nhật.");
      setMessageType("success");
    } catch (e) { setMessage(e.message || "Không lưu được biểu phí."); setMessageType("error"); }
    finally { setBusy(false); }
  };

  const danFeeFields = (values, change) => (
    <Stack spacing={1.5}>
      <Alert severity="info">Nhập mức thu theo đẳng dự thi (VNĐ). Ví dụ 1 Đẳng: 1200000; 2 Đẳng: 700000 hoặc 1000000, tùy đợt. Để trống nghĩa là chưa cấu hình và không thể đăng ký bậc đó. Nhập 0 khi thực sự miễn phí.</Alert>
      <Box sx={{ display:"grid", gridTemplateColumns:{ xs:"1fr", sm:"repeat(2,minmax(0,1fr))" }, gap:1.5 }}>
        {DAN_EXAM_LEVELS.map(level => <TextField
          key={level} fullWidth type="number" label={`Thi lên ${level}`}
          value={values[level] ?? ""} onChange={e=>change(old=>({...old,[level]:e.target.value}))}
          slotProps={{ inputLabel:{shrink:true}, htmlInput:{min:0,step:1000,inputMode:"numeric"} }}
          helperText="VNĐ · để trống nếu chưa có biểu phí"
        />)}
      </Box>
    </Stack>
  );

  // ============================================
  // 6. GIAO DIỆN QUẢN LÝ THI CẤP
  // ============================================

  const approvedCount = sortedRegistrations.filter(r => ['Đạt', 'DAT', 'PASS'].includes(String(r.ketQua || r.result || '').trim())).length;
  const waitCount = sortedRegistrations.filter(r => !String(r.ketQua || r.result || '').trim()).length;
  return (
    <Box className={`tkg-exam-module tkg-exam-${examType}`} sx={{ p: { xs: 0, md: 0 }, minWidth:0, width:"100%", maxWidth:"100%" }}>
      <div className="tkg-module-kpis" aria-label="Thống kê kỳ thi">
        <div className="tkg-module-kpi"><span>Đợt thi</span><strong>{periods.length.toLocaleString('vi-VN')}</strong><small>{examType === 'dan' ? 'Kỳ thi đẳng' : 'Kỳ thi cấp'} đang theo dõi</small></div>
        <div className="tkg-module-kpi"><span>Đăng ký</span><strong>{sortedRegistrations.length.toLocaleString('vi-VN')}</strong><small>Đúng điểm tập đang lọc</small></div>
        <div className="tkg-module-kpi"><span>Đã đạt</span><strong>{approvedCount.toLocaleString('vi-VN')}</strong><small>Đã có kết quả Đạt</small></div>
        <div className="tkg-module-kpi"><span>Chưa kết quả</span><strong>{waitCount.toLocaleString('vi-VN')}</strong><small>Chưa chốt trong danh sách lọc</small></div>
      </div>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ sm: "center" }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h5" fontWeight={800}>
            {examType === "dan" ? "Quản lý thi đẳng" : "Quản lý thi cấp"}
          </Typography>

          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {examType === "dan" ? "Kỳ thi đẳng riêng: Cấp 1 → 1 Đẳng → … → 7 Đẳng." : "Kỳ thi cấp riêng: Cấp 10 → Cấp 9 → … → Cấp 1."} Hội viên nghỉ học không được đề xuất.
          </Typography>
        </Box>

        <Stack className="tkg-exam-actions" direction="row" spacing={1} useFlexGap flexWrap="wrap"
          sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: 0, alignItems: 'stretch',
            '& .MuiButton-root': { whiteSpace: 'normal', textAlign: 'center', minWidth: 0,
              flex: { xs: '1 1 calc(50% - 8px)', sm: '0 1 auto' } } }}>
          {isAdmin && (
            <Button
              variant="outlined"
              onClick={() => setPeriodDialog(true)}
            >
              Tạo đợt thi
            </Button>
          )}

          {isAdmin && examType === "dan" && selectedPeriodData && <Button variant="outlined" onClick={() => {
            setDanFeeDraft(Object.fromEntries(DAN_EXAM_LEVELS.map(level => [level, selectedPeriodData.danFees?.[level] ?? ""])));
            setDanFeeDialog(true);
          }}>Cấu hình lệ phí thi đẳng</Button>}
          {isAdmin && <Button variant="outlined" color={registrationOpen ? "warning" : "success"} disabled={!selectedPeriodData || busy || togglingRegistration} onClick={toggleRegistration}>{togglingRegistration ? "Đang cập nhật..." : registrationOpen ? "Khóa đăng ký" : "Mở đăng ký"}</Button>}
          {isAdmin && <Button variant="outlined" color="error" disabled={!selectedPeriodData || busy || togglingRegistration} onClick={openDeletePeriod}>Xóa đợt thi</Button>}
          {canManage && <Button variant="contained" onClick={() => setRegisterDialog(true)} disabled={!selectedPeriod || loading || !registrationOpen || busy} sx={{ bgcolor: "#176b45" }}>{examType === "dan" ? "Đăng ký thi đẳng" : "Đăng ký thi cấp"}</Button>}
          {canManage && <Button variant="contained" color="success" onClick={() => {setBulkOpen(true);setBulkReport([]);setBulkSelection([]);}} disabled={!selectedPeriod || loading || !registrationOpen || busy}>Đăng ký hàng loạt ({eligibleCount} đủ điều kiện)</Button>}
          <Button variant="outlined" onClick={exportExcel} disabled={!selectedPeriod || !sortedRegistrations.length}>Xuất Excel (.xlsx)</Button>
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <TextField select fullWidth size="small" label="Lọc điểm tập tham gia thi"
          value={validExamLocation}
          onChange={e => setFilterExamLocation(e.target.value)}>
          {examLocationOptions.map(point => <MenuItem key={point} value={point}>{point}</MenuItem>)}
        </TextField>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Bộ lọc áp dụng cho danh sách đề xuất, đăng ký, Excel và đối chiếu kết quả.
        </Typography>
      </Paper>

      {examType === "dan" && selectedPeriodData && <Paper variant="outlined" sx={{p:2,mb:2,borderRadius:2}}>
        <Typography fontWeight={800} sx={{mb:1}}>Biểu phí thi đẳng · {selectedPeriodData.name}</Typography>
        <Stack direction="row" gap={1} useFlexGap flexWrap="wrap">
          {DAN_EXAM_LEVELS.map(level => <Chip key={level}
            label={`${level}: ${formatDanFee(getDanExamFee(selectedPeriodData.danFees,level))}`}
            color={getDanExamFee(selectedPeriodData.danFees,level) === null ? "default" : "success"}
            variant="outlined" />)}
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{mt:1}}>Lệ phí được lưu vào từng đăng ký khi đăng ký thành công. Thay biểu phí không thay đổi số tiền của các đăng ký đã ghi nhận.</Typography>
      </Paper>}
      {selectedPeriodData && sortedRegistrations.some(r => isDanExamLevel(r.dangDuThi) !== (examType === "dan")) && <Alert severity="warning" sx={{ mb: 2 }}>Đợt thi cũ có đăng ký khác loại. Dữ liệu lịch sử được giữ nguyên; cần đối soát trước khi nhập kết quả, không tự di chuyển đăng ký.</Alert>}
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

      <ExamTopScorers period={selectedPeriodData} registrations={sortedRegistrations} profile={profile} />

      {/* DANH SÁCH ĐĂNG KÝ THI */}

      <TableContainer component={Paper} variant="outlined" className="tkg-exam-table-scroll" sx={{ width: "100%", maxWidth: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
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
  (examType === "dan" ? (
    <DanExamResultsPreview key={selectedPeriod} period={selectedPeriodData} registrations={sortedRegistrations} isAdmin={isAdmin} />
  ) : (
    <ExamResultsPreview key={selectedPeriod} period={selectedPeriodData} registrations={sortedRegistrations} isAdmin={isAdmin} />
  ))
)}
      {!registrationOpen && selectedPeriodData && <Alert severity="warning" sx={{mb:2}}>Đợt {selectedPeriodData.name} đã khóa đăng ký. Vẫn có thể xem danh sách và xuất Excel, nhưng không thể thêm võ sinh mới.</Alert>}
      {/* HỘP THOẠI ĐĂNG KÝ HÀNG LOẠT */}
      <Dialog open={bulkOpen} onClose={() => !busy && setBulkOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle>Đăng ký {examType === "dan" ? "thi đẳng" : "thi cấp"} hàng loạt — {selectedPeriodData?.name || ""}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">Danh sách chỉ gồm võ sinh đủ điều kiện {examType === "dan" ? "thi đẳng" : "thi cấp"} của đợt đang chọn. Không trộn hai loại kỳ thi.</Alert>
            <TextField size="small" label="Tìm võ sinh (tên / VTF / điểm tập)" value={bulkSearch} onChange={e=>setBulkSearch(e.target.value)} fullWidth />
            <Stack direction="row" alignItems="center" spacing={2}>
              <Button disabled={busy} onClick={()=>setBulkSelection(eligibleStudents.filter(s=>bulkCandidates.some(x=>x.id===s.id)).map(s=>s.id))}>Chọn tất cả đủ điều kiện đang lọc</Button>
              <Button disabled={busy} onClick={()=>setBulkSelection([])}>Bỏ chọn</Button>
              <Chip label={`${bulkSelection.length} đã chọn`} />
            </Stack>
            <TableContainer sx={{maxHeight:380}}><Table size="small" stickyHeader>
              <TableHead><TableRow><TableCell padding="checkbox">Chọn</TableCell><TableCell>Họ tên</TableCell><TableCell>Ngày sinh</TableCell><TableCell>Giới tính</TableCell><TableCell>Đang mang</TableCell><TableCell>Dự thi</TableCell><TableCell>Điều kiện</TableCell></TableRow></TableHead>
              <TableBody>{bulkCandidates.map(s=>{
                const reason=eligibility(s,selectedPeriodData?.examDate,registeredIds,examType);
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

      {examType === "dan" && <Dialog open={danFeeDialog} onClose={() => !busy && setDanFeeDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{fontWeight:800}}>Cấu hình lệ phí · {selectedPeriodData?.name}</DialogTitle>
        <DialogContent dividers>{danFeeFields(danFeeDraft,setDanFeeDraft)}</DialogContent>
        <DialogActions><Button onClick={()=>setDanFeeDialog(false)} disabled={busy}>Hủy</Button><Button variant="contained" onClick={saveDanFees} disabled={busy}>{busy?"Đang lưu…":"Lưu biểu phí"}</Button></DialogActions>
      </Dialog>}

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
              placeholder={examType === "dan" ? "Ví dụ: L1-2026" : "Ví dụ: Q4-2026"}
              value={periodName}
              onChange={(event) =>
                setPeriodName(event.target.value)
              }
              helperText={examType === "dan" ? "Mã L1-2026, L2-2026...; biểu phí đặt riêng cho từng đợt." : "Mã Q1-2026 đến Q4-2026."}
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
            {examType === "dan" && <>
              <Typography fontWeight={800}>Lệ phí thi đẳng theo bậc</Typography>
              {danFeeFields(danFeeDraft,setDanFeeDraft)}
            </>}
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
        <DialogTitle>Đăng ký võ sinh {examType === "dan" ? "thi đẳng" : "thi cấp"}</DialogTitle>

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
                  (student) => !eligibility(student, selectedPeriodData?.examDate, registeredIds, examType)
                )
                .map((student) => (
                  <MenuItem
                    key={student.id}
                    value={student.id}
                  >
                    {student.maHV} — {student.name} (
                    {student.location}) → {nextLevel(currentLevel(student))}
                  </MenuItem>
                ))}
            </TextField>

            <TextField label="Cấp đai hiện tại" value={studentForSingle ? currentLevel(studentForSingle) : ""} InputProps={{readOnly:true}} fullWidth />
            <TextField label="Cấp/đẳng dự thi tự động" value={studentForSingle ? nextLevel(currentLevel(studentForSingle)) : ""} InputProps={{readOnly:true}} fullWidth />
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
            disabled={busy || !registrationOpen || !studentForSingle || !!eligibility(studentForSingle, selectedPeriodData?.examDate, registeredIds, examType)}
            variant="contained"
          >
            Lưu đăng ký
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
