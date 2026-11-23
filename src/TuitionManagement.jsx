
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  getDoc,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Chip,
  Checkbox,
  FormControlLabel,
  Avatar,
  Divider,
  InputAdornment,
  TablePagination,
  CircularProgress,
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
import {
  PaymentsRounded,
  SearchRounded,
  ReceiptLongRounded,
  GroupsRounded,
  AccountBalanceWalletRounded,
  CalendarMonthRounded,
  FilterAltRounded,
  WarningAmberRounded,
  ArrowForwardRounded,
} from "@mui/icons-material";
import { db } from "./firebase";
import { calculateTuitionPolicy } from "./tuitionPolicy";
import ExamFeeCollection from "./ExamFeeCollection";
import { printTuitionNoticesA5 } from "./TuitionNoticeA5";
import { loadOutstandingExamFees } from "./examFeesForPrint";

const dateVN = (value) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
};
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const cardStyle = { border: "1px solid", borderColor: "divider", borderRadius: 3, bgcolor: "background.paper" };
const money = (value) =>
  Number(value || 0).toLocaleString("vi-VN") + " ₫";

// Tạo các kỳ còn thiếu và phân bổ khoản thu theo thứ tự kỳ cũ trước.
// Không tự suy diễn kỳ đã đóng khi lịch sử cũ thiếu thông tin.
// Nghỉ học: không lập kỳ mới, vẫn giữ nợ của các kỳ đã ghi nhận.
const isQuitMember = member => {
  const raw = String(member?.trangThai ?? member?.status ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');
  return ['nghi hoc', 'da nghi', 'nghi', 'ngung hoc'].includes(raw);
};
const validMoney = v => Number.isSafeInteger(Number(v)) && Number(v) >= 0;
const cycleOwed = c => Number(c.soTienPhaiDong ?? c.soTien ?? 0);
const cyclePaid = c => Number(c.daThu ?? c.soTien ?? 0);
const cycleDebt = c => Math.max(0, cycleOwed(c) - cyclePaid(c));
const nextDayISO = iso => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const cycleEndISO = (start, type) => {
  if (type === 'Ngày') return start;
  const [y,m,d] = start.split('-').map(Number);
  const months = type === 'Quý' ? 3 : 1;
  const target = new Date(y, m-1+months, 1, 12);
  const last = new Date(target.getFullYear(), target.getMonth()+1, 0).getDate();
  target.setDate(Math.min(d,last)); target.setDate(target.getDate()-1);
  return `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')}`;
};
const normalizeCycles = history => history.map(c => ({
  ...c, soTienPhaiDong: cycleOwed(c), daThu: cyclePaid(c),
  conNo: cycleDebt(c), trangThai: cycleDebt(c) ? 'Còn nợ' : 'Đã đóng',
}));
const prepareLedger = (member, type, rate, untilISO) => {
  const old = Array.isArray(member.lichSuChuKy) ? member.lichSuChuKy : [];
  if (old.some(c => !c.ngayBatDau || !c.ngayHetHan || !validMoney(c.soTienPhaiDong ?? c.soTien) || !validMoney(c.daThu ?? c.soTien))) {
    throw new Error('Lịch sử kỳ thu cũ thiếu thông tin. Cần đối soát trước khi tính nợ.');
  }
  const cycles = normalizeCycles(old).sort((a,b)=>a.ngayBatDau.localeCompare(b.ngayBatDau));
  if (cycles.some(c=>c.daThu>c.soTienPhaiDong)) throw new Error('Lịch sử có số đã thu lớn hơn phải đóng. Cần đối soát.');
  for(let i=1;i<cycles.length;i++) if(cycles[i].ngayBatDau<=cycles[i-1].ngayHetHan) throw new Error('Lịch sử kỳ thu bị trùng. Cần đối soát.');
  // Chỉ thu lại các kỳ nợ đã hình thành khi võ sinh ngừng học.
  // Không tự tính thêm phí tháng/quý kể từ ngày nghỉ đến ngày thu.
  if (isQuitMember(member)) {
    const debt = cycles.reduce((sum, cycle) => sum + cycleDebt(cycle), 0);
    const storedRaw = member.noHocPhi ?? member.conNo;
    if (storedRaw !== undefined && storedRaw !== null && storedRaw !== '' &&
        (!validMoney(storedRaw) || Number(storedRaw) !== debt)) {
      throw new Error('Công nợ lưu trong hồ sơ và lịch sử kỳ thu chưa khớp. Cần đối soát trước khi thu.');
    }
    return cycles;
  }
  const last = cycles[cycles.length-1];
  if (last && member.ngayHetHan && member.ngayHetHan > last.ngayHetHan) throw new Error('Ngày đã thanh toán đến không khớp lịch sử. Cần đối soát.');
  if (!last && member.ngayHetHan) throw new Error('Hồ sơ có ngày đã thanh toán đến nhưng thiếu lịch sử kỳ thu. Cần đối soát.');
  let start = last ? nextDayISO(last.ngayHetHan) : member.ngayBatDau;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) throw new Error('Thiếu ngày bắt đầu hợp lệ.');
  if (last && last.conNo>0 && last.loaiHocPhi !== type) throw new Error('Còn nợ kỳ cũ: giữ nguyên loại học phí để tránh chồng kỳ.');
  if (last && last.conNo>0) type = last.loaiHocPhi;
  let added=0;
  while(start<=untilISO) {
    if (++added>60) throw new Error('Có trên 60 kỳ chưa đối soát; cần xử lý theo từng giai đoạn.');
    const end=cycleEndISO(start,type);
    const policy=calculateTuitionPolicy(rate,member.chinhSachHocPhi,start);
    cycles.push({ ngayBatDau:start, ngayHetHan:end, loaiHocPhi:type,
      hocPhiGoc:rate, soTienGiam:policy.soTienGiam, lyDoGiam:policy.lyDoGiam,
      chinhSachSnapshot:policy.chinhSachSnapshot, soTienPhaiDong:policy.soTienPhaiDong,
      soTien:0, daThu:0, conNo:policy.soTienPhaiDong,
      trangThai:policy.soTienPhaiDong===0?'Đã miễn':'Còn nợ', paymentIds:[] });
    start=nextDayISO(end);
  }
  return cycles;
};
const allocatePayment = (cycles, amount, paymentId, date) => {
  let remaining=amount;
  const allocations=[];
  const updated=cycles.map(c=>{
    const debt=cycleDebt(c);
    const applied=Math.min(debt,remaining);
    remaining-=applied;
    if(applied) allocations.push({ngayBatDauKy:c.ngayBatDau,ngayHetHanKy:c.ngayHetHan,soTien:applied});
    const paid=cyclePaid(c)+applied;
    return {...c, daThu:paid, soTien:paid, conNo:Math.max(0,cycleOwed(c)-paid),
      trangThai:cycleOwed(c)===0?'Đã miễn':paid>=cycleOwed(c)?'Đã đóng':'Còn nợ',
      ...(applied?{ngayThuCuoi:date,paymentIds:[...(c.paymentIds||[]),paymentId]}:{})};
  });
  if(remaining) throw new Error('Số tiền thu vượt tổng công nợ hiện tại.');
  return {cycles:updated,allocations};
};

export default function TuitionManagement({
  students = [],
  profile,
  loading = false,
  error = "",
  location,
  onLocationChange,
  locations = [],
  focusMemberId = "",
  onFocusHandled,
}) {
  const [locationRates, setLocationRates] = useState([]);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesError, setRatesError] = useState("");
  const [rateReady, setRateReady] = useState(false);
  const [rateWarning, setRateWarning] = useState("");
  const [search, setSearch] = useState("");
  const [feeFilter, setFeeFilter] = useState("Tất cả");
  const [dueFilter, setDueFilter] = useState("Tất cả");
  const [memberPage, setMemberPage] = useState(0);
  const [memberRows, setMemberRows] = useState(20);
  const [paymentPage, setPaymentPage] = useState(0);
  const [paymentRows, setPaymentRows] = useState(10);

  const [period, setPeriod] = useState("Tháng");
  const [selectedMember, setSelectedMember] = useState(null);
  const [bulkDialog,setBulkDialog] = useState(false);
  const [selectedPrintIds,setSelectedPrintIds] = useState([]);
  const [printLocation, setPrintLocation] = useState('Tất cả điểm tập');
  const [printSearch, setPrintSearch] = useState('');
  const [printing,setPrinting] = useState(false);
  const [printBatchIndex,setPrintBatchIndex] = useState(0);
  const PRINT_BATCH_SIZE = 50;
  const [printIssue,setPrintIssue] = useState('');
  const [handledFocus, setHandledFocus] = useState("");
  const [amount, setAmount] = useState("");
  const [baseFee, setBaseFee] = useState("");
  const [discount, setDiscount] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [memberPolicy, setMemberPolicy] = useState(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [paymentDate, setPaymentDate] = useState(
    todayISO()
  );
  const parseLocalDate = (value) => {
  if (!value || typeof value !== "string") return null;

  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;

  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

const toISODate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const addMonthsClamped = (date, months) => {
  const target = new Date(
    date.getFullYear(),
    date.getMonth() + months,
    1
  );

  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();

  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
};

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};
  const [note, setNote] = useState("");
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  // Bảng giá cấu hình tại Cài đặt → Quản lý điểm tập.
  useEffect(() => onSnapshot(collection(db, "locations"), snapshot => {
    setLocationRates(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    setRatesLoading(false);
    setRatesError("");
  }, err => {
    setRatesLoading(false);
    setRatesError(`Không đọc được bảng giá điểm tập: ${err.message}`);
  }), []);

  const feeKey = (value) => value === "Ngày" ? "daily" : value === "Quý" ? "quarterly" : "monthly";
  const getRate = (member, type, source = locationRates) => {
    const point = String(member?.diemTap || member?.location || "").trim();
    const matches = source.filter(x => String(x.name || "").trim() === point);
    if (matches.length !== 1) return { error: matches.length ? "Tên điểm tập bị trùng trong bảng giá." : `Chưa có cấu hình mức thu cho điểm tập ${point || "(trống)"}.` };
    const config = matches[0];
    if (config.active === false || config.features?.tuition === false) return { error: "Điểm tập đang ngừng hoạt động hoặc đã tắt chức năng Học phí." };
    const value = config.fees?.[feeKey(type)];
    if (value === null || value === undefined || value === "" || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
      return { error: `Chưa thiết lập mức Học phí ${type} hợp lệ cho ${point}.` };
    }
    return { value: Number(value), configId: config.id, point };
  };

  useEffect(() => {
    if (!selectedMember) return;
    if (ratesLoading || ratesError) {
      setRateReady(false); setRateWarning(ratesError || "Đang tải bảng giá điểm tập...");
      setBaseFee(""); setAmount("");
      return;
    }
    if (isQuitMember(selectedMember)) {
      setRateReady(true);
      setRateWarning('Hội viên đã nghỉ học: chỉ thu nợ các kỳ đã ghi nhận, không lập kỳ hoặc tính phí mới.');
      setBaseFee('0');
      return;
    }
    const result = getRate(selectedMember, period);
    if (result.error) {
      setRateReady(false); setRateWarning(result.error); setBaseFee(""); setAmount("");
      return;
    }
    setRateReady(true); setRateWarning("");
    setBaseFee(String(result.value));
    // Số tiền thực thu được tính lại bởi effect riêng theo chính sách.
  }, [selectedMember?.id, selectedMember?.diemTap, selectedMember?.location, period, locationRates, ratesLoading, ratesError]);

  // Không tự ghi đè số thực thu khi bảng giá hoặc chính sách thay đổi.

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "tuitionPayments"),
      (snapshot) => {
        setPayments(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setPaymentsLoading(false);
      },
      (err) => {
        console.error("Lỗi đọc lịch sử học phí:", err);
        setPaymentsLoading(false);
        setFormError(
          "Không đọc được lịch sử thu. Hãy kiểm tra quyền Firestore."
        );
      }
    );

    return unsubscribe;
  }, []);

  // Ngày đã thanh toán đến khác với ngày kết thúc kỳ đầu tiên.
  // Không suy diễn số tiền nợ nếu chưa có bảng giá và các kỳ phải thu.
  const dueInfo = useMemo(() => {
    const today = todayISO();
    const map = new Map();
    for (const student of students) {
      const active = !["Nghỉ học", "Đã nghỉ", "Nghỉ", "Ngừng học"].includes(
        student.trangThai || student.status || ""
      );
      const paidUntil = student.ngayHetHan || "";
      const firstDue = student.ngayDenHanDauTien || "";
      const expiry = paidUntil || firstDue;
      let category = "Chưa có hạn";
      let days = null;
      if (!active) {
        category = "Ngừng học";
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
        const target = parseLocalDate(expiry);
        const now = parseLocalDate(today);
        if (target && now) {
          days = Math.round((target - now) / 86400000);
          if (days < 0) category = "Đã quá hạn";
          else if (days === 0) category = "Đến hạn hôm nay";
          else if (days <= 5) category = "Sắp đến hạn";
          else category = paidUntil ? "Còn hạn" : "Chưa đến hạn";
        }
      }
      map.set(student.id, { category, days, expiry, paidUntil, firstDue });
    }
    return map;
  }, [students]);

  const dueCounts = useMemo(() => {
    const scoped = students.filter((student) =>
      !isQuitMember(student) &&
      (!location || location === "Tất cả điểm tập" || (student.location || student.diemTap) === location)
    );
    const count = (category) => scoped.filter(
      (student) => dueInfo.get(student.id)?.category === category
    ).length;
    return {
      soon: count("Sắp đến hạn"),
      today: count("Đến hạn hôm nay"),
      overdue: count("Đã quá hạn"),
      unknown: count("Chưa có hạn"),
    };
  }, [students, location, dueInfo]);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");

    return students.filter((student) => {
      // Hội viên nghỉ học không nằm trong danh sách ĐỀ XUẤT thu.
      // Khoản nợ vẫn tồn tại và được truy cập riêng qua hồ sơ hội viên.
      if (isQuitMember(student)) return false;
      const matchLocation =
        location === "Tất cả điểm tập" ||
        (student.location || student.diemTap) === location;

      const matchSearch =
        !keyword ||
        `${student.maHV || ""} ${student.maHoiVienNoiBo || ""} ${student.name || ""} ${student.location || ""}`
          .toLocaleLowerCase("vi")
          .includes(keyword);

      const status = dueInfo.get(student.id)?.category;
      const fee = ["Đã quá hạn", "Đến hạn hôm nay"].includes(status)
        ? "Chưa đóng"
        : status === "Còn hạn" ? "Đã đóng" : "Chưa cập nhật";
      const matchFee = feeFilter === "Tất cả" || fee === feeFilter ||
        (feeFilter === "Còn nợ" && status === "Đã quá hạn");
      const matchDue = dueFilter === "Tất cả" ||
        dueInfo.get(student.id)?.category === dueFilter;
      return matchLocation && matchSearch && matchFee && matchDue;
    });
  }, [students, location, search, feeFilter, dueFilter, dueInfo]);

  // Danh sách in hàng loạt có bộ lọc riêng, độc lập với bộ lọc đề xuất thu.
  // Chỉ dùng students đã được App.jsx giới hạn theo quyền; KHÔNG đọc thêm điểm tập khác.
  // Hội viên Nghỉ học không được đề xuất in hàng loạt, nhưng vẫn có thể in từ hồ sơ.
  const printLocations = useMemo(() => [
    'Tất cả điểm tập',
    ...[...new Set(students.filter(s => !isQuitMember(s))
      .map(s => String(s.location || s.diemTap || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
  ], [students]);
  const bulkCandidates = useMemo(() => {
    const keyword = printSearch.trim().toLocaleLowerCase('vi');
    return students.filter(s => {
      if (isQuitMember(s)) return false;
      const point = String(s.location || s.diemTap || '').trim();
      if (printLocation !== 'Tất cả điểm tập' && point !== printLocation) return false;
      if (!keyword) return true;
      return `${s.name || ''} ${s.maHoiVienNoiBo || ''} ${s.maHV || ''} ${point}`
        .toLocaleLowerCase('vi').includes(keyword);
    });
  }, [students, printLocation, printSearch]);
  const eligiblePrintIds = new Set(bulkCandidates.map(x => x.id));
  const chosenPrintIds = selectedPrintIds.filter(id => eligiblePrintIds.has(id));
  const selectedPrintMembers = bulkCandidates.filter(x=>chosenPrintIds.includes(x.id));
  const printBatchCount = Math.ceil(selectedPrintMembers.length / PRINT_BATCH_SIZE);
  const activePrintBatch = Math.min(printBatchIndex, Math.max(0, printBatchCount-1));
  const batchMembers = selectedPrintMembers.slice(activePrintBatch*PRINT_BATCH_SIZE,(activePrintBatch+1)*PRINT_BATCH_SIZE);
  const openBulkPrint = () => {
    const preferred = location && printLocations.includes(location) ? location : 'Tất cả điểm tập';
    setPrintLocation(preferred);
    setPrintSearch('');
    setSelectedPrintIds([]);
    setPrintBatchIndex(0);
    setPrintIssue('');
    setBulkDialog(true);
  };
  const doBulkPrint = async () => {
    if (printing || chosenPrintIds.length===0) return;
    if (!batchMembers.length) {setPrintIssue('Chưa có hội viên trong đợt in này.');return;}
    // Mở cửa sổ ngay trong click để trình duyệt không chặn do tác vụ async.
    const popup = window.open('', '_blank', 'width=830,height=960');
    if (!popup) {setPrintIssue('Trình duyệt chặn cửa sổ in. Hãy cho phép pop-up.');return;}
    popup.document.write('<!doctype html><html lang="vi"><meta charset="utf-8"><body style="font-family:Arial;padding:28px">Đang đối chiếu dữ liệu kỳ học phí...</body></html>');
    popup.document.close();
    setPrinting(true);setPrintIssue('');
    try {
      if (ratesLoading || ratesError) throw new Error(ratesError || 'Chưa tải xong bảng giá điểm tập.');
      const date = todayISO();
      const candidates=batchMembers;
      const documents = await Promise.all(candidates.map(async student => {
        const snap=await getDoc(doc(db,'members',student.id));
        if (!snap.exists()) throw new Error(`Không tìm thấy hội viên: ${student.name}`);
        const data=snap.data();
        if (String(data.diemTap || '') !== String(student.location || student.diemTap || '')) throw new Error(`Điểm tập của ${student.name} vừa thay đổi. Hãy tải lại trang.`);
        const member={id:snap.id,...data};
        const feeType=['Ngày','Tháng','Quý'].includes(member.loaiHocPhi)?member.loaiHocPhi:'Tháng';
        const config=locationRates.filter(x=>x.name===member.diemTap);
        if(config.length!==1) throw new Error(`Điểm tập ${member.diemTap} chưa có cấu hình duy nhất.`);
        const rate=getRate(member,feeType);
        if(!isQuitMember(member) && rate.error) throw new Error(`${student.name}: ${rate.error}`);
        const cycles=prepareLedger(member,feeType,isQuitMember(member)?0:rate.value,date);
        const totalDebt=cycles.reduce((n,c)=>n+cycleDebt(c),0);
        return {member,locationInfo:config[0],cycles,totalDebt};
      }));
      const examMap = await loadOutstandingExamFees(documents.map(x=>x.member),profile);
      const withFees=documents.map(x=>({...x,examFees:examMap[x.member.id] || []}));
      const due=withFees.filter(x=>x.totalDebt>0 || x.examFees.length>0);
      if(!due.length) throw new Error('Không có khoản học phí hoặc lệ phí thi còn phải đóng trong đợt in này.');
      printTuitionNoticesA5(due,{date,targetWindow:popup});
      const skipped=withFees.length-due.length;
      const next=activePrintBatch+1;
      setPrintIssue(`Đã mở ${due.length} phiếu ở đợt ${next}/${printBatchCount}. ${skipped ? `Bỏ qua ${skipped} hội viên không còn khoản phải đóng. ` : ''}${next<printBatchCount?'Chọn đợt tiếp theo để tiếp tục in.':'Đã chuẩn bị hết các đợt đã chọn.'}`);
      if(next<printBatchCount) setPrintBatchIndex(next);
    }catch(e){
      setPrintIssue(e.message || 'Không chuẩn bị được danh sách in.');
      try {popup.document.open();popup.document.write('<!doctype html><html lang="vi"><meta charset="utf-8"><body style="font-family:Arial;padding:28px"><h3>Đã dừng in do có hồ sơ cần đối chiếu.</h3><p>Quay về TKD Green để xem thông báo lỗi. Không có dữ liệu nào được thay đổi.</p></body></html>');popup.document.close();}catch(_){}
    }finally{setPrinting(false);}
  };

  const handleSingleNoticePrint = async () => {
    if (!selectedMember?.id || !previewLedger || previewLedger.error || printing) return;
    const popup=window.open('','_blank','width=830,height=960');
    if (!popup) {setFormError('Trình duyệt chặn cửa sổ in. Hãy cho phép pop-up.');return;}
    popup.document.write('<!doctype html><html lang="vi"><meta charset="utf-8"><body style="font-family:Arial;padding:24px">Đang đối chiếu học phí và lệ phí thi...</body></html>');
    popup.document.close();
    setPrinting(true);setFormError('');
    try {
      const snap=await getDoc(doc(db,'members',selectedMember.id));
      if(!snap.exists()) throw new Error('Hồ sơ hội viên không còn tồn tại.');
      const member={id:snap.id,...snap.data()};
      const point=locationRates.filter(x=>x.name===member.diemTap);
      if(point.length!==1) throw new Error('Điểm tập chưa có cấu hình duy nhất.');
      if(String(member.diemTap)!==String(selectedMember.diemTap||selectedMember.location)) throw new Error('Điểm tập đã thay đổi; vui lòng mở lại hồ sơ.');
      const type=['Ngày','Tháng','Quý'].includes(member.loaiHocPhi)?member.loaiHocPhi:'Tháng';
      const price=getRate(member,type);
      if(!isQuitMember(member)&&price.error) throw new Error(price.error);
      const cycles=prepareLedger(member,type,isQuitMember(member)?0:price.value,todayISO());
      const totalDebt=cycles.reduce((s,c)=>s+cycleDebt(c),0);
      const examMap=await loadOutstandingExamFees([member],profile);
      const examFees=examMap[member.id]||[];
      if(totalDebt===0&&!examFees.length) throw new Error('Hội viên không còn khoản học phí hoặc lệ phí thi cần đóng.');
      printTuitionNoticesA5([{member,locationInfo:point[0],cycles,totalDebt,examFees}],{date:todayISO(),targetWindow:popup});
    } catch(e) {
      setFormError('Không chuẩn bị được phiếu: '+(e.message||e));
      try {popup.close();}catch(_){}
    } finally {setPrinting(false);}
  };

  const orderedPayments = useMemo(() => [...payments].sort((a, b) =>
    (b.ngayThu || "").localeCompare(a.ngayThu || "") ||
    (b.id || "").localeCompare(a.id || "")
  ), [payments]);
  const visibleMembers = filteredStudents.slice(memberPage * memberRows, (memberPage + 1) * memberRows);
  const visiblePayments = orderedPayments.slice(paymentPage * paymentRows, (paymentPage + 1) * paymentRows);
  useEffect(() => { setMemberPage(0); }, [search, location, feeFilter, dueFilter]);
  const totalCollected = useMemo(() => {
    const now = new Date();
    return payments.reduce((sum, payment) => {
      if (!payment.ngayThu) return sum;

      const date = new Date(`${payment.ngayThu}T12:00:00`);
      if (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      ) {
        return sum + Number(payment.soTien || 0);
      }
      return sum;
    }, 0);
  }, [payments]);

  const openPayment = async (member) => {
    setFormError("");
    setSelectedMember(member);
    setMemberPolicy(null);
    setPolicyLoading(true);
    try {
      const snap = await getDoc(doc(db,"members",member.id));
      if (!snap.exists()) throw new Error("Hồ sơ không tồn tại.");
      setMemberPolicy(snap.data().chinhSachHocPhi || {loai:"binh_thuong"});
      setSelectedMember({...member,...snap.data(), id:member.id, name:member.name || snap.data().hoTen, location:member.location || snap.data().diemTap});
    } catch(e) { setFormError("Không tải được chính sách học phí: " + e.message); }
    finally { setPolicyLoading(false); }
    setAmount("");
    setBaseFee("");
    setDiscount("0");
    setDiscountReason("");
    setPeriod(["Ngày", "Tháng", "Quý"].includes(member.loaiHocPhi || member.fee) ? (member.loaiHocPhi || member.fee) : "Tháng");
    setPaymentDate(todayISO());
    setNote("");
    setMessage("");
  };

  useEffect(() => { if (!focusMemberId) setHandledFocus(''); }, [focusMemberId]);

  // Mở thu nợ từ Danh sách/Hồ sơ Hội viên, dù hội viên đã nghỉ học.
  // Chỉ nhận hội viên có trong danh sách đã cấp theo quyền người dùng.
  useEffect(() => {
    if (!focusMemberId || focusMemberId === handledFocus || loading) return;
    const candidate = students.find(s => s.id === focusMemberId);
    if (!candidate) {
      setFormError('Không tìm thấy hội viên trong phạm vi được phân quyền.');
      setHandledFocus(focusMemberId);
      onFocusHandled?.();
      return;
    }
    setHandledFocus(focusMemberId);
    void openPayment(candidate);
    onFocusHandled?.();
  }, [focusMemberId, handledFocus, loading, students]);

  const closePayment = () => {
    if (saving) return;
    setSelectedMember(null);
    setFormError("");
  };

  const previewLedger = (() => {
    if (!selectedMember || policyLoading || !memberPolicy ||
        (!isQuitMember(selectedMember) && (!rateReady || !baseFee))) return null;
    try {
      const ledger = prepareLedger({...selectedMember, chinhSachHocPhi:memberPolicy},period,Number(baseFee),paymentDate);
      return {ledger, debt:ledger.reduce((n,c)=>n+cycleDebt(c),0), error:""};
    } catch(e) { return {ledger:[],debt:0,error:e.message}; }
  })();
  const policyPreview = (()=>{
    const last=previewLedger?.ledger?.at(-1);
    return last ? {soTienGiam:last.soTienGiam,soTienPhaiDong:last.soTienPhaiDong} : null;
  })();
  const previewStart = previewLedger?.ledger?.at(-1)?.ngayBatDau || selectedMember?.ngayBatDau || "";

  const submitPayment = async event => {
    event.preventDefault(); setMessage(""); setFormError("");
    if (!selectedMember?.id || policyLoading ||
        (!isQuitMember(selectedMember) && (!rateReady || ratesLoading || ratesError))) {
      setFormError('Chưa đủ dữ liệu hồ sơ, bảng giá hoặc chính sách.'); return;
    }
    if (profile?.role !== 'admin') {
      setFormError('Quy tắc Firestore hiện tại chỉ cho Admin cập nhật lịch sử kỳ học phí. Chưa thể thu bằng tài khoản HLV.'); return;
    }
    const received=Number(amount);
    if (!Number.isSafeInteger(received) || received < 0 || amount==='') {
      setFormError('Số tiền thực thu phải là số nguyên không âm.');return;
    }
    if (isQuitMember(selectedMember) && received === 0) { setFormError('Hội viên nghỉ học: chỉ ghi nhận số thực thu để giảm nợ cũ.'); return; }
    if (!parseLocalDate(paymentDate)) {setFormError('Ngày thu không hợp lệ.');return;}
    setSaving(true);
    try {
      const memberRef=doc(db,'members',selectedMember.id);
      const pointName=String(selectedMember.diemTap || selectedMember.location || '').trim();
      const points=locationRates.filter(x=>String(x.name||'').trim()===pointName);
      if(points.length!==1) throw new Error('Không tìm thấy duy nhất điểm tập trong bảng giá.');
      const configRef=doc(db,'locations',points[0].id);
      const paymentRef=doc(collection(db,'tuitionPayments'));
      const result=await runTransaction(db,async tx=>{
        // Firestore transaction: tất cả đọc trước, tất cả ghi sau.
        const memberSnap=await tx.get(memberRef);
        const configSnap=await tx.get(configRef);
        if(!memberSnap.exists()||!configSnap.exists()) throw new Error('Hồ sơ hoặc điểm tập không tồn tại.');
        const memberData=memberSnap.data(), config=configSnap.data();
        const quitNow = isQuitMember(memberData);
        if (quitNow !== isQuitMember(selectedMember)) throw new Error('Trạng thái học tập vừa thay đổi. Đóng và mở lại phiếu thu.');
        if(String(memberData.diemTap||'').trim()!==pointName || config.name!==pointName)
          throw new Error('Điểm tập đã thay đổi. Hãy mở lại hồ sơ.');
        if (!quitNow && (config.active === false || config.features?.tuition === false))
          throw new Error('Điểm tập đã ngừng hoạt động hoặc đã tắt Học phí.');
        const liveRate = quitNow ? 0 : Number(config.fees?.[feeKey(period)]);
        if (!quitNow && (!Number.isSafeInteger(liveRate) || liveRate <= 0 || liveRate !== Number(baseFee)))
          throw new Error('Bảng giá đã thay đổi. Đóng và mở lại phiếu thu.');
        const ledger=prepareLedger(memberData,period,liveRate,paymentDate);
        const totalDebt=ledger.reduce((n,c)=>n+cycleDebt(c),0);
        if(received>totalDebt) throw new Error(`Số tiền thu vượt tổng phải thu ${money(totalDebt)}.`);
        if(received===0 && totalDebt>0) throw new Error('Để ghi nhận công nợ mà chưa thu tiền, cần quy trình chốt kỳ riêng; không tạo phiếu thu 0đ.');
        if(received===0 && !ledger.some(c=>c.trangThai==='Đã miễn')) throw new Error('Không có khoản miễn 100% cần ghi nhận.');
        const allocation=allocatePayment(ledger,received,paymentRef.id,paymentDate);
        const newLedger=allocation.cycles;
        // ngayHetHan chỉ phản ánh chuỗi kỳ ĐÃ ĐÓNG ĐỦ liên tục từ kỳ đầu.
        let paidThrough='';
        for(const c of newLedger){if(c.conNo>0) break;paidThrough=c.ngayHetHan;}
        const remainingDebt=newLedger.reduce((n,c)=>n+cycleDebt(c),0);
        const affected=allocation.allocations;
        tx.set(paymentRef,{
          memberId:selectedMember.id, maHV:memberData.maHV||selectedMember.id,
          hoTen:memberData.hoTen||selectedMember.name||'',diemTap:pointName,
          ngayThu:paymentDate, soTien:received, loaiHocPhi:period,
          ngayBatDauKy:affected[0]?.ngayBatDauKy||newLedger.at(-1)?.ngayBatDau||'',
          ngayHetHanMoi:paidThrough, phanBoKy:affected,
          tongNoTruocThu:totalDebt,conNoSauThu:remainingDebt,
          loaiGiaoDich:received===0?'mien_hoc_phi':'thu_hoc_phi',
          ghiChu:note.trim(),nguoiThu:profile?.email||'',createdAt:serverTimestamp(),
        });
        tx.update(memberRef,{
          ...(!quitNow ? { loaiHocPhi: period, ngayHetHan: paidThrough } : {}),
          lichSuChuKy:newLedger, noHocPhi:remainingDebt,conNo:remainingDebt,
          tinhTrangHocPhi:remainingDebt>0?'Còn nợ':'Đã đóng',
        });
        return {received,remainingDebt,cycles:newLedger.length};
      });
      setMessage(`Đã thu ${money(result.received)}. Tổng công nợ còn lại: ${money(result.remainingDebt)} (${result.cycles} kỳ được đối soát).`);
      setSelectedMember(null);
    }catch(err){console.error('Lỗi thu học phí:',err);setFormError(`Không thể lưu khoản thu: ${err.code||''} ${err.message||''}`);}
    finally{setSaving(false);}
  };

  return (
    <Stack spacing={2.5} sx={{ minWidth: 0, pb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Avatar variant="rounded" sx={{ bgcolor: "success.dark", width: 50, height: 50, borderRadius: 2.5 }}>
          <AccountBalanceWalletRounded />
        </Avatar>
        <Box>
          <Typography variant="h5" fontWeight={900}>Quản lý học phí</Typography>
          <Typography variant="body2" color="text.secondary">Theo dõi khoản thu, tình trạng học phí và lịch sử giao dịch</Typography>
        </Box>
      </Box>
      {message && <Alert severity="success" onClose={() => setMessage("")}>{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
       {ratesError && <Alert severity="error">{ratesError}</Alert>}
      {formError && !selectedMember && <Alert severity="error" onClose={() => setFormError("")}>{formError}</Alert>}

      {/* Dashboard tài chính: không suy diễn công nợ khi chưa có dữ liệu */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", lg: "repeat(4,minmax(0,1fr))" }, gap: 1.5 }}>
        {[
          { label: "Đã thu trong tháng", value: money(totalCollected), detail: "Theo ngày thu thực tế", icon: <AccountBalanceWalletRounded />, accent: "#80dea7", bg: "rgba(29,120,75,.18)" },
          { label: "Giao dịch ghi nhận", value: payments.length.toLocaleString("vi-VN"), detail: "Lịch sử đã lưu", icon: <ReceiptLongRounded />, accent: "#a5c8ff", bg: "rgba(55,108,180,.16)" },
          { label: "Hội viên đang hiển thị", value: filteredStudents.length.toLocaleString("vi-VN"), detail: "Theo bộ lọc hiện tại", icon: <GroupsRounded />, accent: "#e4eaf0", bg: "rgba(120,138,155,.12)" },
          { label: "Công nợ đã ghi nhận", value: money(students.reduce((n,m)=>n+Number(m.noHocPhi || m.conNo || 0),0)), detail: "Chỉ gồm công nợ đã lưu trên hồ sơ; chưa tính kỳ chưa chốt", icon: <WarningAmberRounded />, accent: "#f3c47b", bg: "rgba(181,115,29,.15)" },
        ].map((item) => (
          <Paper key={item.label} elevation={0} sx={{ p: { xs: 1.8, sm: 2.5 }, borderRadius: 3.5, border: "1px solid", borderColor: "divider", bgcolor: item.bg, minWidth: 0, minHeight: 136 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
              <Typography variant="caption" fontWeight={800} sx={{ color: "text.secondary" }}>{item.label}</Typography>
              <Box sx={{ color: item.accent }}>{item.icon}</Box>
            </Stack>
            <Typography sx={{ color: item.accent, mt: 1.8, fontWeight: 900, fontSize: item.value === "Chưa tổng hợp" ? { xs: 15, sm: 19 } : { xs: 22, sm: 28 }, overflowWrap: "anywhere" }}>{item.value}</Typography>
            <Typography variant="caption" color="text.secondary">{item.detail}</Typography>
          </Paper>
        ))}
      </Box>

      <Paper elevation={0} sx={{ ...cardStyle, p: { xs: 1.5, sm: 2 } }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography fontWeight={900} variant="h6">Theo dõi hạn học phí</Typography>
            <Typography variant="body2" color="text.secondary">
              Cảnh báo đối chiếu ngày đã thanh toán đến hoặc ngày kết thúc kỳ đầu. Số tiền công nợ chưa xác định nếu thiếu bảng giá/kỳ phải thu.
            </Typography>
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", lg: "repeat(4,minmax(0,1fr))" }, gap: 1.25 }}>
            {[
              { label: "Sắp đến hạn (5 ngày)", count: dueCounts.soon, filter: "Sắp đến hạn", color: "info.main" },
              { label: "Đến hạn hôm nay", count: dueCounts.today, filter: "Đến hạn hôm nay", color: "warning.main" },
              { label: "Đã quá hạn", count: dueCounts.overdue, filter: "Đã quá hạn", color: "error.main" },
              { label: "Thiếu dữ liệu kỳ học phí", count: dueCounts.unknown, filter: "Chưa có hạn", color: "text.secondary" },
            ].map((item) => (
              <Paper key={item.label} component="button" type="button" onClick={() => setDueFilter((old) => old === item.filter ? "Tất cả" : item.filter)}
                elevation={0} sx={{ ...cardStyle, p: 1.5, textAlign: "left", cursor: "pointer", color: "text.primary", font: "inherit", borderColor: dueFilter === item.filter ? item.color : "divider", minHeight: 100 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={800}>{item.label}</Typography>
                <Typography variant="h4" fontWeight={900} sx={{ color: item.color, mt: 1 }}>{item.count}</Typography>
              </Paper>
            ))}
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
            <TextField select size="small" label="Lọc theo hạn học phí" value={dueFilter} onChange={(e) => setDueFilter(e.target.value)} sx={{ minWidth: 230 }}>
              {["Tất cả", "Sắp đến hạn", "Đến hạn hôm nay", "Đã quá hạn", "Còn hạn", "Chưa có hạn", "Chưa đến hạn", "Ngừng học"].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </TextField>
            <Typography variant="caption" color="text.secondary">
              Nhấn vào thẻ thống kê để lọc danh sách bên dưới.
            </Typography>
          </Stack>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ ...cardStyle, p: { xs: 1.5, sm: 2 } }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
          <TextField fullWidth size="small" label="Tìm kiếm hội viên" placeholder="Tên, mã nội bộ, mã VTF..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }} />
          <TextField select size="small" label="Điểm tập" value={location || ""}
            onChange={(e) => onLocationChange?.(e.target.value)} sx={{ minWidth: { md: 185 } }}>
            {locations.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Trạng thái học phí" value={feeFilter}
            onChange={(e) => setFeeFilter(e.target.value)} sx={{ minWidth: { md: 190 } }}>
            {["Tất cả", "Đã đóng", "Chưa cập nhật", "Chưa đóng", "Còn nợ"].map((item) =>
              <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </TextField>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ ...cardStyle, overflow: "hidden" }}>
        <Box sx={{ px: 2, py: 2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
          <Box>
            <Typography fontWeight={900}>Danh sách thu học phí</Typography>
            <Typography variant="caption" color="text.secondary">Chọn hội viên để ghi nhận khoản thu</Typography>
          </Box>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Chip size="small" label={`${filteredStudents.length} hội viên`} />
            <Button size="small" variant="outlined" startIcon={<ReceiptLongRounded />} onClick={openBulkPrint} disabled={!filteredStudents.length || loading}>In thông báo hàng loạt A5</Button>
          </Stack>
        </Box>
        <Divider />
        {loading ? <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress /></Box> : <>
          {/* Điện thoại: thẻ võ sinh */}
          <Stack spacing={1.25} sx={{ display: { xs: "flex", md: "none" }, p: 1.5 }}>
            {visibleMembers.map((student) => (
              <Paper key={student.id} elevation={0} sx={{ ...cardStyle, p: 1.5 }}>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Avatar sx={{ bgcolor: "success.dark", fontWeight: 800 }}>{(student.name || "?").trim().slice(-1).toUpperCase()}</Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={800} sx={{ overflowWrap: "anywhere" }}>{student.name || "Chưa có tên"}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {student.maHoiVienNoiBo || "Chưa có mã"} · VTF: {student.maHV || "Chưa cấp"}
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ my: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">{student.location || "—"}</Typography>
                  <Chip size="small" color={dueInfo.get(student.id)?.category === "Đã quá hạn" ? "error" : dueInfo.get(student.id)?.category === "Đến hạn hôm nay" ? "warning" : dueInfo.get(student.id)?.category === "Còn hạn" ? "success" : "default"} label={dueInfo.get(student.id)?.category || "Chưa có hạn"} />
                </Stack>
                <Typography variant="caption" sx={{ display: "block", mb: 1, color: ["Đã quá hạn", "Đến hạn hôm nay"].includes(dueInfo.get(student.id)?.category) ? "error.main" : "text.secondary" }}>
                  Hạn đối chiếu: {dateVN(dueInfo.get(student.id)?.expiry)} · {dueInfo.get(student.id)?.category}
                </Typography>
                <Button fullWidth variant="contained" color="success" startIcon={<PaymentsRounded />}
                  onClick={() => openPayment(student)} sx={{ minHeight: 44, borderRadius: 2, fontWeight: 800 }}>Thu học phí</Button>
              </Paper>
            ))}
            {!visibleMembers.length && <Typography color="text.secondary" textAlign="center" sx={{ p: 3 }}>Không có hội viên phù hợp.</Typography>}
          </Stack>
          {/* Máy tính: thẻ hồ sơ như thiết kế đã thống nhất */}
          <Box sx={{ display: { xs: "none", md: "grid" }, gridTemplateColumns: { md: "repeat(2,minmax(0,1fr))", xl: "repeat(3,minmax(0,1fr))" }, gap: 1.5, p: 2 }}>
            {visibleMembers.map((student) => (
              <Paper key={student.id} elevation={0} sx={{ p: 2, borderRadius: 3, border: "1px solid", borderColor: "divider", bgcolor: "background.default", minWidth: 0, transition: "border-color .15s", "&:hover": { borderColor: "success.main" } }}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Avatar sx={{ bgcolor: "success.dark", width: 46, height: 46, fontWeight: 800 }}>{(student.name || "?").trim().split(/\s+/).pop()?.[0]?.toUpperCase() || "?"}</Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={800} sx={{ overflowWrap: "anywhere" }}>{student.name || "Chưa có tên"}</Typography>
                    <Typography variant="caption" color="text.secondary">{student.maHoiVienNoiBo || "Chưa có mã"} · VTF: {student.maHV || "Chưa cấp"}</Typography>
                  </Box>
                </Stack>
                <Divider sx={{ my: 1.5 }} />
                <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                  <Typography variant="body2" color="text.secondary">{student.location || "—"}</Typography>
                  <Chip size="small" color={dueInfo.get(student.id)?.category === "Đã quá hạn" ? "error" : dueInfo.get(student.id)?.category === "Đến hạn hôm nay" ? "warning" : dueInfo.get(student.id)?.category === "Còn hạn" ? "success" : "default"} label={dueInfo.get(student.id)?.category || "Chưa có hạn"} />
                </Stack>
                <Typography variant="caption" sx={{ display: "block", mt: 1, color: ["Đã quá hạn", "Đến hạn hôm nay"].includes(dueInfo.get(student.id)?.category) ? "error.main" : "text.secondary" }}>
                  Hạn đối chiếu: {dateVN(dueInfo.get(student.id)?.expiry)} · {dueInfo.get(student.id)?.category}
                </Typography>
                <Button fullWidth variant="contained" color="success" startIcon={<PaymentsRounded />} endIcon={<ArrowForwardRounded />} onClick={() => openPayment(student)} sx={{ mt: 2, minHeight: 42, borderRadius: 2, fontWeight: 800 }}>Thu học phí</Button>
              </Paper>
            ))}
            {!visibleMembers.length && <Typography color="text.secondary">Không có hội viên phù hợp.</Typography>}
          </Box>
          <TablePagination component="div" count={filteredStudents.length} page={memberPage} rowsPerPage={memberRows}
            onPageChange={(_, page) => setMemberPage(page)}
            onRowsPerPageChange={(e) => { setMemberRows(Number(e.target.value)); setMemberPage(0); }}
            rowsPerPageOptions={[10, 20, 50]} labelRowsPerPage="Số hội viên/trang" />
        </>}
      </Paper>

      <Paper elevation={0} sx={{ ...cardStyle, overflow: "hidden" }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 2 }}>
          <ReceiptLongRounded color="success" />
          <Box><Typography fontWeight={900}>Lịch sử thu học phí</Typography>
            <Typography variant="caption" color="text.secondary">Các khoản thu đã ghi nhận trên Firebase</Typography></Box>
        </Stack>
        <Divider />
        {paymentsLoading ? <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress /></Box> : <>
          <Stack spacing={1} sx={{ display: { xs: "flex", md: "none" }, p: 1.5 }}>
            {visiblePayments.map((payment) => <Paper key={payment.id} elevation={0} sx={{ ...cardStyle, p: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" spacing={1}>
                <Box sx={{ minWidth: 0 }}><Typography fontWeight={800}>{payment.hoTen || "—"}</Typography>
                  <Typography variant="caption" color="text.secondary">{dateVN(payment.ngayThu)} · {payment.loaiHocPhi || "—"}</Typography></Box>
                <Typography fontWeight={900} color="success.main" sx={{ whiteSpace: "nowrap" }}>{money(payment.soTien)}</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">VTF: {payment.maHV || "—"}</Typography>
              {payment.ghiChu && <Typography variant="body2" sx={{ mt: 1 }}>{payment.ghiChu}</Typography>}
            </Paper>)}
          </Stack>
          <TableContainer sx={{ display: { xs: "none", md: "block" } }}>
            <Table size="small" sx={{ "& th": { fontWeight: 800, bgcolor: "action.hover" } }}>
              <TableHead><TableRow><TableCell>Ngày thu</TableCell><TableCell>Mã VTF</TableCell><TableCell>Họ tên</TableCell><TableCell>Loại HP</TableCell><TableCell align="right">Số tiền</TableCell><TableCell>Ghi chú</TableCell></TableRow></TableHead>
              <TableBody>{visiblePayments.map((payment) => <TableRow hover key={payment.id}>
                <TableCell>{dateVN(payment.ngayThu)}</TableCell><TableCell>{payment.maHV || "—"}</TableCell><TableCell>{payment.hoTen || "—"}</TableCell>
                <TableCell>{payment.loaiHocPhi || "—"}</TableCell><TableCell align="right"><Typography fontWeight={800} color="success.main">{money(payment.soTien)}</Typography></TableCell><TableCell>{payment.ghiChu || "—"}</TableCell>
              </TableRow>)}
              {!visiblePayments.length && <TableRow><TableCell colSpan={6} align="center">Chưa có giao dịch thu học phí.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={orderedPayments.length} page={paymentPage} rowsPerPage={paymentRows}
            onPageChange={(_, page) => setPaymentPage(page)}
            onRowsPerPageChange={(e) => { setPaymentRows(Number(e.target.value)); setPaymentPage(0); }}
            rowsPerPageOptions={[10, 20, 50]} labelRowsPerPage="Giao dịch/trang" />
        </>}
      </Paper>

      {printIssue && <Alert severity="warning" onClose={()=>setPrintIssue('')}>{printIssue}</Alert>}
      <Dialog open={bulkDialog} onClose={()=>!printing && setBulkDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>In thông báo học phí hàng loạt · A5 đen trắng</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Alert severity="info">Chọn hội viên muốn in. Chỉ in các khoản phải đóng đã được đối chiếu từ chính sách học phí. Hội viên Nghỉ học không có trong danh sách đề xuất này.</Alert>
            {printIssue && <Alert severity="warning">{printIssue}</Alert>}
            <Box sx={{ display:'grid', gridTemplateColumns:{ xs:'1fr', sm:'minmax(200px, 1fr) minmax(220px, 1.5fr)' }, gap:1.5 }}>
              <TextField select fullWidth size="small" label="Điểm tập cần in"
                value={printLocation} disabled={printing}
                onChange={e => { setPrintLocation(e.target.value); setSelectedPrintIds([]); setPrintBatchIndex(0); setPrintIssue(''); }}>
                {printLocations.map(point => <MenuItem key={point} value={point}>{point}</MenuItem>)}
              </TextField>
              <TextField size="small" fullWidth label="Tìm hội viên để in"
                placeholder="Tên, mã nội bộ hoặc VTF ID"
                value={printSearch} disabled={printing}
                onChange={e => { setPrintSearch(e.target.value); setSelectedPrintIds([]); setPrintBatchIndex(0); setPrintIssue(''); }} />
            </Box>
            <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
              <Chip variant="outlined" color="primary" label={`${bulkCandidates.length} hội viên tại bộ lọc`} />
              <Chip color="success" variant="outlined" label={`${chosenPrintIds.length} hội viên đã chọn`} />
              <Button disabled={printing || !bulkCandidates.length}
                onClick={()=>{setSelectedPrintIds(bulkCandidates.map(x=>x.id));setPrintBatchIndex(0);}}>
                Chọn tất cả hội viên đang lọc
              </Button>
              <Button disabled={printing || !selectedPrintIds.length} onClick={()=>{setSelectedPrintIds([]);setPrintBatchIndex(0);}}>Bỏ chọn</Button>
            </Stack>
            <Box sx={{maxHeight:340,overflow:'auto',border:'1px solid',borderColor:'divider',borderRadius:2,p:1}}>
              {!bulkCandidates.length && <Typography sx={{p:2}} color="text.secondary">Không có hội viên đang học phù hợp với điểm tập hoặc từ khóa tìm kiếm.</Typography>}
              {bulkCandidates.map(m=><Box key={m.id} sx={{borderBottom:'1px solid',borderColor:'divider'}}>
                <FormControlLabel control={<Checkbox disabled={printing} checked={chosenPrintIds.includes(m.id)} onChange={e=>{setSelectedPrintIds(old=>e.target.checked?[...old,m.id]:old.filter(id=>id!==m.id));setPrintBatchIndex(0);}}/>} label={`${m.name || 'Chưa có tên'} · ${m.maHoiVienNoiBo || m.maHV || 'Chưa có mã'} · ${m.location || ''}`}/>
              </Box>)}
            </Box>
            {printBatchCount>0 && <Stack direction={{xs:'column',sm:'row'}} spacing={1.5} alignItems={{sm:'center'}}>
              <TextField select size="small" label="Đợt in (50 hội viên/đợt)" sx={{minWidth:280}}
                value={activePrintBatch} disabled={printing} onChange={e=>setPrintBatchIndex(Number(e.target.value))}>
                {Array.from({length:printBatchCount},(_,i)=><MenuItem key={i} value={i}>
                  Đợt {i+1}/{printBatchCount} · Hội viên {i*PRINT_BATCH_SIZE+1}–{Math.min((i+1)*PRINT_BATCH_SIZE,selectedPrintMembers.length)}
                </MenuItem>)}
              </TextField>
              <Chip label={`${batchMembers.length} hội viên trong đợt đang chọn`} variant="outlined" />
            </Stack>}
            <Typography variant="caption">Có thể chọn hơn 100 hội viên. Hệ thống chia mỗi lần in thành 50 hội viên để máy in hoạt động ổn định. Chọn lần lượt Đợt 1, Đợt 2...; mỗi đợt chỉ mở bản in, không ghi thanh toán. Phiếu gồm học phí và lệ phí Thi cấp/Thi đẳng chưa đóng, cộng vào tổng tiền bằng chữ. Các phiếu lấy HLV/ngân hàng/QR riêng theo điểm tập.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions><Button disabled={printing} onClick={()=>setBulkDialog(false)}>Đóng</Button><Button variant="contained" disabled={printing || !batchMembers.length} onClick={doBulkPrint}>{printing?'Đang đối chiếu...':`In đợt ${activePrintBatch+1}/${printBatchCount} · ${batchMembers.length} hội viên`}</Button></DialogActions>
      </Dialog>

      <ExamFeeCollection profile={profile} students={students} location={location} />

      <Dialog open={Boolean(selectedMember)} onClose={closePayment} fullWidth maxWidth="sm" fullScreen={false}
        PaperProps={{ sx: { borderRadius: { xs: 2, sm: 3 }, m: { xs: 1.5, sm: 4 }, width: { xs: "calc(100% - 24px)", sm: "100%" } } }}>
        <Box component="form" onSubmit={submitPayment}>
          <DialogTitle sx={{ fontWeight: 900, display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:1, alignItems:'center' }}>
            <span>Ghi nhận thu học phí</span>
            <Button type="button" variant="outlined" size="small" startIcon={<ReceiptLongRounded />}
              disabled={!previewLedger || !!previewLedger.error || !selectedMember || policyLoading || saving}
              onClick={handleSingleNoticePrint}>
              In thông báo A5
            </Button>
          </DialogTitle>
          <DialogContent>
            {selectedMember && isQuitMember(selectedMember) &&
              <Alert severity="warning" sx={{mt:1,mb:1}}>Hội viên đã nghỉ học. Phiếu thu này chỉ thanh toán các kỳ nợ có trong lịch sử, không phát sinh học phí mới.</Alert>}
            {selectedMember && <Paper elevation={0} sx={{ ...cardStyle, p: 1.5, mb: 2, mt: 1 }}>
              <Typography fontWeight={800}>{selectedMember.name}</Typography>
              <Typography variant="body2" color="text.secondary">{selectedMember.maHoiVienNoiBo || "—"} · VTF: {selectedMember.maHV || "Chưa cấp"} · {selectedMember.location}</Typography>
              <Typography variant="caption" color="text.secondary">Đã thanh toán đến: {dateVN(selectedMember.ngayHetHan)} · Kết thúc kỳ đầu: {dateVN(selectedMember.ngayDenHanDauTien)}</Typography>
            </Paper>}
            {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField select label="Loại học phí" value={period} onChange={(e) => setPeriod(e.target.value)} fullWidth disabled={saving}>
                <MenuItem value="Ngày">Ngày</MenuItem><MenuItem value="Tháng">Tháng</MenuItem><MenuItem value="Quý">Quý</MenuItem>
              </TextField>
              {profile?.role !== "admin" && <Alert severity="warning">Cần bổ sung Firestore Rules an toàn để HLV được ghi nhận khoản thu. Hiện chỉ Admin có thể lưu.</Alert>}
              <Alert severity={rateWarning ? "warning" : "info"}>{rateWarning || "Mức học phí gốc được tự động lấy từ Cài đặt → Quản lý điểm tập. Hệ thống cộng dồn các kỳ đến ngày thu và ưu tiên trừ nợ kỳ cũ trước."}</Alert>
              <TextField label="Học phí gốc (VNĐ)" type="number" value={baseFee} slotProps={{ htmlInput: { min: 1, step: 1 }, input: { readOnly: true } }} required fullWidth disabled={saving || !rateReady || isQuitMember(selectedMember)} />
              <Alert severity="info">{policyLoading ? "Đang tải chính sách..." : `Chính sách: ${memberPolicy?.loai || "binh_thuong"}. Áp dụng theo ngày bắt đầu kỳ ${dateVN(previewStart)}.`}</Alert>
              <Paper variant="outlined" sx={{p:1.5,borderRadius:2}}>
                <Typography>Miễn/giảm theo hồ sơ: {policyPreview ? money(policyPreview.soTienGiam) : "—"}</Typography>
                <Typography fontWeight={800}>Tổng cần thu (gồm nợ cũ và các kỳ đến ngày thu): {previewLedger && !previewLedger.error ? money(previewLedger.debt) : "—"}</Typography>
                {previewLedger?.error && <Alert severity="warning">{previewLedger.error}</Alert>}
                <Typography variant="body2">Số kỳ theo dõi: {previewLedger?.ledger?.length ?? 0} · Còn nợ sau khoản thu: {previewLedger && !previewLedger.error && validMoney(amount) ? money(Math.max(0,previewLedger.debt-Number(amount))) : "—"}</Typography>
                {policyPreview?.loaiChinhSach === "mien_100" && <Typography variant="caption">Kỳ miễn 100% được ghi nhận riêng, không cộng vào doanh thu thực thu.</Typography>}
              </Paper>
              <TextField label="Số tiền thực thu (VNĐ)" type="number" value={amount} onChange={(e)=>setAmount(e.target.value)}
                slotProps={{htmlInput:{min:0,step:1}}} required fullWidth disabled={saving || policyLoading}
                helperText="Có thể đóng một phần; số còn lại được ghi nợ và ưu tiên thanh toán kỳ cũ." />
              <TextField label="Ngày thu" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }} required fullWidth disabled={saving} />
              <TextField label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: Học phí tháng 10" multiline minRows={2} fullWidth disabled={saving} />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5, pt: 0 }}>
            <Button onClick={closePayment} disabled={saving}>Hủy</Button>
            <Button type="submit" variant="contained" color="success" disabled={saving || policyLoading || !memberPolicy || (!isQuitMember(selectedMember) && !rateReady) || amount === "" || !!previewLedger?.error || profile?.role !== "admin"} startIcon={saving ? <CircularProgress size={16} /> : <PaymentsRounded />}>
              {saving ? "Đang lưu..." : "Lưu khoản thu"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}
