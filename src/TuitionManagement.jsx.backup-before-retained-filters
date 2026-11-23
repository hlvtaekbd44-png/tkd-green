
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
      !location || location === "Tất cả điểm tập" || (student.location || student.diemTap) === location
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

  const closePayment = () => {
    if (saving) return;
    setSelectedMember(null);
    setFormError("");
  };

  const previewLedger = (() => {
    if (!selectedMember || !rateReady || !baseFee || policyLoading || !memberPolicy) return null;
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
    if (!selectedMember?.id || !rateReady || ratesLoading || ratesError || policyLoading) {
      setFormError('Chưa đủ dữ liệu hồ sơ, bảng giá hoặc chính sách.'); return;
    }
    if (profile?.role !== 'admin') {
      setFormError('Quy tắc Firestore hiện tại chỉ cho Admin cập nhật lịch sử kỳ học phí. Chưa thể thu bằng tài khoản HLV.'); return;
    }
    const received=Number(amount);
    if (!Number.isSafeInteger(received) || received < 0 || amount==='') {
      setFormError('Số tiền thực thu phải là số nguyên không âm.');return;
    }
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
        if(String(memberData.diemTap||'').trim()!==pointName || config.name!==pointName || config.active===false || config.features?.tuition===false)
          throw new Error('Điểm tập đã thay đổi hoặc chức năng Học phí đã tắt.');
        const liveRate=Number(config.fees?.[feeKey(period)]);
        if(!Number.isSafeInteger(liveRate)||liveRate<=0 || liveRate!==Number(baseFee)) throw new Error('Bảng giá đã thay đổi. Đóng và mở lại phiếu thu.');
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
          loaiHocPhi:period, ngayHetHan:paidThrough,
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
          <Chip size="small" label={`${filteredStudents.length} hội viên`} />
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

      <ExamFeeCollection profile={profile} students={students} location={location} />

      <Dialog open={Boolean(selectedMember)} onClose={closePayment} fullWidth maxWidth="sm" fullScreen={false}
        PaperProps={{ sx: { borderRadius: { xs: 2, sm: 3 }, m: { xs: 1.5, sm: 4 }, width: { xs: "calc(100% - 24px)", sm: "100%" } } }}>
        <Box component="form" onSubmit={submitPayment}>
          <DialogTitle sx={{ fontWeight: 900 }}>Ghi nhận thu học phí</DialogTitle>
          <DialogContent>
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
              <TextField label="Học phí gốc (VNĐ)" type="number" value={baseFee} slotProps={{ htmlInput: { min: 1, step: 1 }, input: { readOnly: true } }} required fullWidth disabled={saving || !rateReady} />
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
            <Button type="submit" variant="contained" color="success" disabled={saving || policyLoading || !memberPolicy || !rateReady || amount === "" || !!previewLedger?.error || profile?.role !== "admin"} startIcon={saving ? <CircularProgress size={16} /> : <PaymentsRounded />}>
              {saving ? "Đang lưu..." : "Lưu khoản thu"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}
