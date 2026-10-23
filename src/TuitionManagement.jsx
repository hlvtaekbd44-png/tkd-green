
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

export default function TuitionManagement({
  students = [],
  profile,
  loading = false,
  error = "",
  location,
  onLocationChange,
  locations = [],
}) {
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
    setPeriod(member.fee === "Quý" || member.loaiHocPhi === "Quý" ? "Quý" : "Tháng");
    setPaymentDate(todayISO());
    setNote("");
    setMessage("");
  };

  const closePayment = () => {
    if (saving) return;
    setSelectedMember(null);
    setFormError("");
  };

  const previewStart = selectedMember?.ngayHetHan
    ? toISODate(addDays(parseLocalDate(selectedMember.ngayHetHan),1))
    : selectedMember?.ngayBatDau || "";
  const policyPreview = (()=>{
    if (!baseFee || !previewStart || policyLoading || !memberPolicy) return null;
    try {return calculateTuitionPolicy(Number(baseFee),memberPolicy,previewStart);}catch{return null;}
  })();

  const submitPayment = async (event) => {
  event.preventDefault();
  setMessage("");
  setFormError("");

  if (!selectedMember?.id) {
    setFormError("Không tìm thấy hồ sơ hội viên.");
    return;
  }

  const numericAmount = Number(amount);
  const numericBase = Number(baseFee);
  if (!memberPolicy || policyLoading) {setFormError("Chưa tải xong chính sách học phí.");return;}
  if (!Number.isSafeInteger(numericBase) || numericBase <= 0) {setFormError("Học phí gốc phải là số nguyên dương.");return;}
  if (!Number.isSafeInteger(numericAmount) || numericAmount < 0) {setFormError("Số tiền thực thu không hợp lệ.");return;}

  const paidDate = parseLocalDate(paymentDate);

  if (!paidDate) {
    setFormError("Ngày thu không hợp lệ.");
    return;
  }

  setSaving(true);

  try {
    const memberRef = doc(db, "members", selectedMember.id);
    // ID cố định cho từng kỳ: ngăn ghi hai khoản thu đủ cho cùng một kỳ.
    const result = await runTransaction(db, async (tx) => {
      const memberSnap = await tx.get(memberRef);
      if (!memberSnap.exists()) throw new Error("Hồ sơ hội viên không còn tồn tại.");
      const current = memberSnap.data();
       // Không được gia hạn từ kỳ đầu nếu đã quá hạn và chưa đối soát công nợ.
       // Thu kỳ đầu vẫn được phép, các kỳ tiếp theo cần xác định theo lịch sử.
       if (!current.ngayHetHan && current.lichSuChuKy?.length) {
         throw new Error("Hồ sơ có lịch sử kỳ thu nhưng chưa xác định ngày đã thanh toán đến.");
       }
      const history = Array.isArray(current.lichSuChuKy) ? current.lichSuChuKy : [];
      const due = parseLocalDate(current.ngayHetHan);
      const enrollment = parseLocalDate(current.ngayBatDau);
      const latest = [...history].filter(x => x?.ngayHetHan && x?.ngayBatDau)
        .sort((a,b) => b.ngayHetHan.localeCompare(a.ngayHetHan))[0];

      // Không suy diễn các kỳ đã đóng khi lịch sử thiếu hoặc mâu thuẫn.
      if (due && (!latest || latest.ngayHetHan !== current.ngayHetHan)) {
        throw new Error("Ngày hết hạn không khớp lịch sử kỳ thu hoặc thiếu lịch sử. Cần đối soát hồ sơ trước khi gia hạn.");
      }
      if (latest) {
        const latestStart = parseLocalDate(latest.ngayBatDau);
        const latestMonths = latest.loaiHocPhi === "Quý" ? 3 : latest.loaiHocPhi === "Tháng" ? 1 : 0;
        if (!latestStart || !latestMonths ||
            toISODate(addDays(addMonthsClamped(latestStart, latestMonths), -1)) !== latest.ngayHetHan) {
          throw new Error("Lịch sử có kỳ thu không đúng chu kỳ. Cần đối soát trước khi tiếp tục.");
        }
      }
      if (!due && history.length) {
        throw new Error("Có lịch sử kỳ thu nhưng thiếu ngày hết hạn. Cần đối soát.");
      }
      if (!due && !enrollment) {
        throw new Error("Chưa có ngày bắt đầu hợp lệ để xác định kỳ học phí.");
      }

      const cycleStart = due ? addDays(due, 1) : enrollment;
      // Không tự tạo kỳ mới trước ngày bắt đầu; không thu hồi tố tự động.
      if (cycleStart > paidDate) {
        throw new Error(`Kỳ tiếp theo bắt đầu ${dateVN(toISODate(cycleStart))}. Chưa thể thu trước kỳ bằng quy trình này.`);
      }
      const months = period === "Quý" ? 3 : 1;
      const cycleEnd = addDays(addMonthsClamped(cycleStart, months), -1);
      const startISO = toISODate(cycleStart);
      const dueISO = toISODate(cycleEnd);
      if (history.some(x => x?.ngayBatDau === startISO ||
        (x?.ngayBatDau && x?.ngayHetHan && x.ngayBatDau <= dueISO && x.ngayHetHan >= startISO))) {
        throw new Error("Kỳ học phí này đã tồn tại hoặc trùng với lịch sử. Không thể thu trùng.");
      }
      const policyResult = calculateTuitionPolicy(numericBase,current.chinhSachHocPhi,startISO);
      if (numericAmount !== policyResult.soTienPhaiDong) {
        throw new Error(`Theo chính sách hiện tại, kỳ này phải thu ${money(policyResult.soTienPhaiDong)}. Hãy kiểm tra lại số tiền.`);
      }
      const numericDiscount = policyResult.soTienGiam;
      const discountReason = policyResult.lyDoGiam;
      const paymentRef = doc(db, "tuitionPayments", `${selectedMember.id}_${startISO}`);
      const existingPayment = await tx.get(paymentRef);
      if (existingPayment.exists()) throw new Error("Đã có giao dịch cho kỳ này.");
      const newCycle = {
        ngayBatDau: startISO, ngayHetHan: dueISO, loaiHocPhi: period,
        soTien: numericAmount, hocPhiGoc: numericBase,
        soTienGiam: numericDiscount, lyDoGiam: discountReason,
        chinhSachSnapshot: policyResult.chinhSachSnapshot,
        ngayThu: paymentDate, paymentId: paymentRef.id,
      };
      tx.set(paymentRef, {
        memberId: selectedMember.id,
        maHV: current.maHV || selectedMember.id,
        hoTen: current.hoTen || selectedMember.name || "",
        diemTap: current.diemTap || selectedMember.location || "",
        ngayThu: paymentDate, ngayBatDauKy: startISO, ngayHetHanMoi: dueISO,
        soTien: numericAmount, hocPhiGoc: numericBase,
        soTienGiam: numericDiscount, lyDoGiam: discountReason,
        chinhSachSnapshot: policyResult.chinhSachSnapshot,
        soTienPhaiDong: policyResult.soTienPhaiDong, loaiHocPhi: period,
        loaiGiaoDich: policyResult.soTienPhaiDong === 0 ? "mien_hoc_phi" : "thu_hoc_phi",
        ghiChu: note.trim(), nguoiThu: profile?.email || "",
        createdAt: serverTimestamp(),
      });
      tx.update(memberRef, {
        loaiHocPhi: period, ngayHetHan: dueISO,
        lichSuChuKy: [...history, newCycle],
        tinhTrangHocPhi: policyResult.soTienPhaiDong === 0 ? "Đã miễn" : "Đã đóng", soTienGiamGanNhat: numericDiscount,
      });
      return dueISO;
    });

    setMessage(
      `Đã ghi nhận kỳ học phí ${money(numericAmount)} của ${selectedMember.name}. Hạn mới: ${dateVN(result)}.`
    );

    setSelectedMember(null);
  } catch (err) {
    console.error("Lỗi lưu khoản thu:", err);

    setFormError(
      `Không thể lưu khoản thu: ${err.code || ""} ${err.message || ""}`
    );
  } finally {
    setSaving(false);
  }
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
      {formError && !selectedMember && <Alert severity="error" onClose={() => setFormError("")}>{formError}</Alert>}

      {/* Dashboard tài chính: không suy diễn công nợ khi chưa có dữ liệu */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", lg: "repeat(4,minmax(0,1fr))" }, gap: 1.5 }}>
        {[
          { label: "Đã thu trong tháng", value: money(totalCollected), detail: "Theo ngày thu thực tế", icon: <AccountBalanceWalletRounded />, accent: "#80dea7", bg: "rgba(29,120,75,.18)" },
          { label: "Giao dịch ghi nhận", value: payments.length.toLocaleString("vi-VN"), detail: "Lịch sử đã lưu", icon: <ReceiptLongRounded />, accent: "#a5c8ff", bg: "rgba(55,108,180,.16)" },
          { label: "Hội viên đang hiển thị", value: filteredStudents.length.toLocaleString("vi-VN"), detail: "Theo bộ lọc hiện tại", icon: <GroupsRounded />, accent: "#e4eaf0", bg: "rgba(120,138,155,.12)" },
          { label: "Công nợ học phí", value: "Chưa tổng hợp", detail: "Chưa có bảng kỳ phải thu để đối soát", icon: <WarningAmberRounded />, accent: "#f3c47b", bg: "rgba(181,115,29,.15)" },
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
                <MenuItem value="Tháng">Tháng</MenuItem><MenuItem value="Quý">Quý</MenuItem>
              </TextField>
              <Alert severity="info">Nhập mức học phí gốc của kỳ theo điểm tập. Hệ thống chưa có bảng giá cấu hình nên không tự suy đoán mức thu. Phiên bản này chỉ lưu kỳ đã thanh toán đủ.</Alert>
              <TextField label="Học phí gốc (VNĐ)" type="number" value={baseFee} onChange={(e) => setBaseFee(e.target.value)} slotProps={{ htmlInput: { min: 1, step: 1 } }} required fullWidth disabled={saving} />
              <Alert severity="info">{policyLoading ? "Đang tải chính sách..." : `Chính sách: ${memberPolicy?.loai || "binh_thuong"}. Áp dụng theo ngày bắt đầu kỳ ${dateVN(previewStart)}.`}</Alert>
              <Paper variant="outlined" sx={{p:1.5,borderRadius:2}}>
                <Typography>Miễn/giảm theo hồ sơ: {policyPreview ? money(policyPreview.soTienGiam) : "—"}</Typography>
                <Typography fontWeight={800}>Phải đóng: {policyPreview ? money(policyPreview.soTienPhaiDong) : "—"}</Typography>
                {policyPreview?.loaiChinhSach === "mien_100" && <Typography variant="caption">Kỳ miễn 100% được ghi nhận riêng, không cộng vào doanh thu thực thu.</Typography>}
              </Paper>
              <TextField label="Số tiền thực thu (VNĐ)" type="number" value={amount} onChange={(e)=>setAmount(e.target.value)}
                slotProps={{htmlInput:{min:0,step:1}}} required fullWidth disabled={saving || policyLoading}
                helperText="Nhập đúng số phải đóng; với kỳ miễn 100% nhập 0." />
              <TextField label="Ngày thu" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }} required fullWidth disabled={saving} />
              <TextField label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: Học phí tháng 10" multiline minRows={2} fullWidth disabled={saving} />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5, pt: 0 }}>
            <Button onClick={closePayment} disabled={saving}>Hủy</Button>
            <Button type="submit" variant="contained" color="success" disabled={saving || policyLoading || !memberPolicy} startIcon={saving ? <CircularProgress size={16} /> : <PaymentsRounded />}>
              {saving ? "Đang lưu..." : "Lưu khoản thu"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}
