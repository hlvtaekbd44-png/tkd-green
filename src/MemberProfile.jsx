
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import {
  Alert,
  Button,
  MenuItem,
  TextField,
  CircularProgress,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import CloseRounded from "@mui/icons-material/CloseRounded";
import { db } from "./firebase";
import { POLICY_LABELS, validateTuitionPolicy, calculateTuitionPolicy } from "./tuitionPolicy";

const money = (value) =>
  Number(value || 0).toLocaleString("vi-VN") + " ₫";

const dateVN = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
};

const display = (value) =>
  value === null || value === undefined || value === ""
    ? "Chưa cập nhật"
    : String(value);

// Dữ liệu nợ theo kỳ do TuitionManagement lưu tại members.lichSuChuKy.
const owedOf = c => Number(c.soTienPhaiDong ?? c.hocPhiGoc ?? c.soTien ?? 0);
const paidOf = c => Number(c.daThu ?? c.soTien ?? 0);
const validAmount = n => Number.isSafeInteger(n) && n >= 0;
const nextDay = iso => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const stamp = v => {
  if (v?.toMillis) return v.toMillis();
  if (v?.seconds) return v.seconds * 1000;
  if (typeof v === "string") return Date.parse(v) || 0;
  return 0;
};

function Field({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography fontWeight={600}>
        {display(value)}
      </Typography>
    </Box>
  );
}

export default function MemberProfile({
  open,
  onClose,
  member,
  profile,
}) {
  const [tab, setTab] = useState(0);
  const [detail, setDetail] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [exams, setExams] = useState([]);
  const [examPeriods, setExamPeriods] = useState([]);
  const [payments, setPayments] = useState([]);
  const [locationRates, setLocationRates] = useState([]);
  const [ratesError, setRatesError] = useState("");
  const [error, setError] = useState("");
  const [policy, setPolicy] = useState({loai:"binh_thuong", giaTri:0, lyDo:"", tuNgay:"", denNgay:""});
  const [policySaving, setPolicySaving] = useState(false);
  const [policyMessage, setPolicyMessage] = useState("");

  const isAdmin = profile?.role === "admin";
  const isCoach = profile?.role === "hlv";
  const memberLocation = detail?.diemTap || member?.location || "";
  const canViewAt = (module) => isAdmin || (
    isCoach && profile?.permissions?.[module]?.view === true &&
    (profile?.locationPermissions?.[module] || []).includes(memberLocation)
  );
  const canViewExams = canViewAt("exams");
  const canViewTuition = canViewAt("tuition");

  useEffect(() => {
    if (!open || !member?.id) return;

    setTab(0);
    setDetail(null);
    setTransfers([]);
    setExams([]);
    setPayments([]);
    setError("");

    return onSnapshot(
      doc(db, "members", member.id),
      (snap) => {
        if (snap.exists()) {
          setDetail({ id: snap.id, ...snap.data() });
          const p = snap.data().chinhSachHocPhi;
          setPolicy({loai:p?.loai || "binh_thuong", giaTri:p?.giaTri ?? 0, lyDo:p?.lyDo || "", tuNgay:p?.tuNgay || "", denNgay:p?.denNgay || ""});
        } else {
          setError("Không tìm thấy hồ sơ hội viên.");
        }
      },
      (err) => {
        console.error(err);
        setError("Không đọc được thông tin hội viên.");
      }
    );
  }, [open, member?.id]);

  useEffect(() => {
    if (!open || !member?.id) return;
    // Truy vấn HLV phải có điều kiện diemTap để phù hợp Firestore Rules.
    const subscriptions = [];
    const listen = (collectionName, memberField, setter, name, permitted) => {
      setter([]);
      if (!permitted) return;
      const constraints = [where(memberField, "==", member.id)];
      if (!isAdmin) constraints.push(where("diemTap", "==", memberLocation));
      subscriptions.push(onSnapshot(
        query(collection(db, collectionName), ...constraints),
        snapshot => setter(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
        err => {
          console.error(`Lỗi đọc lịch sử ${name}:`, err);
          setError(`Không đọc được lịch sử ${name}. Kiểm tra quyền và dữ liệu điểm tập trong Firestore.`);
        }
      ));
    };
    listen("memberTransferHistory", "memberId", setTransfers, "chuyển điểm tập", isAdmin);
    // Lọc đăng ký đã hủy chỉ tại hồ sơ hiển thị; giữ bản ghi gốc để đối soát.
    listen("examRegistrations", "memberDocId", (items) => {
      setExams(items.filter(item => !["Không dự thi", "Đã hủy"].includes(String(item.status || "").trim())));
    }, "thi cấp", canViewExams);
    listen("tuitionPayments", "memberId", setPayments, "học phí", canViewTuition);
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  }, [open, member?.id, memberLocation, isAdmin, canViewExams, canViewTuition]);

  useEffect(() => {
    if (!open || !canViewExams) {
      setExamPeriods([]);
      return;
    }
    return onSnapshot(collection(db, "examPeriods"), snapshot => {
      setExamPeriods(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    }, err => {
      console.error("Lỗi tải danh sách đợt thi:", err);
      setError("Không đọc được danh sách đợt thi.");
    });
  }, [open, canViewExams]);

  useEffect(() => {
    if (!open || !canViewTuition) return;
    return onSnapshot(collection(db, "locations"), snapshot => {
      setLocationRates(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setRatesError("");
    }, err => setRatesError(`Không đọc được bảng giá điểm tập: ${err.message}`));
  }, [open, canViewTuition]);

  function getExamPeriodCode(periodId) {
    if (!periodId) return "Chưa xác định";

    const period = examPeriods.find(
      (item) => item.id === periodId
    );

    if (!period) return periodId;

    return (
      period.maDotThi ||
      period.code ||
      period.periodCode ||
      period.name ||
      period.tenDotThi ||
      periodId
    );
  }

  const savePolicy = async () => {
    if (!isAdmin || !detail?.id) return;
    setPolicyMessage("");
    try {
      validateTuitionPolicy(policy);
      setPolicySaving(true);
      const normalized = policy.loai === "binh_thuong"
        ? {loai:"binh_thuong", giaTri:0, lyDo:"", tuNgay:"", denNgay:""}
        : {...policy, giaTri:policy.loai === "mien_100" ? 100 : Number(policy.giaTri), lyDo:policy.lyDo.trim()};
      await updateDoc(doc(db, "members", detail.id), {
        chinhSachHocPhi: normalized,
        chinhSachHocPhiCapNhatLuc: serverTimestamp(),
      });
      setPolicyMessage("Đã lưu chính sách. Các kỳ thu trước đây không thay đổi.");
    } catch(e) { setPolicyMessage(e.message || "Không lưu được chính sách."); }
    finally { setPolicySaving(false); }
  };

  const dateTime = (value) => {
    if (!value) return "—";
    if (typeof value.toDate === "function") {
      return value.toDate().toLocaleString("vi-VN");
    }
    return String(value);
  };

  const orderedTransfers = [...transfers].sort(
    (a, b) =>
      (b.ngayChuyen?.seconds || 0) -
      (a.ngayChuyen?.seconds || 0)
  );

  const orderedPayments = [...payments].sort((a, b) =>
    String(b.ngayThu || "").localeCompare(String(a.ngayThu || "")) ||
    stamp(b.createdAt) - stamp(a.createdAt) ||
    String(b.id || "").localeCompare(String(a.id || ""))
  );

  const tuitionSummary = useMemo(() => {
    if (!detail) return null;
    const raw = detail.lichSuChuKy;
    const cycles = Array.isArray(raw) ? [...raw] : [];
    const sorted = cycles.sort((a, b) => String(a.ngayBatDau || "").localeCompare(String(b.ngayBatDau || "")));
    let debt = 0;
    let badData = false;
    let hasOldSchema = false;
    for (const c of sorted) {
      if (c.soTienPhaiDong === undefined || c.daThu === undefined) hasOldSchema = true;
      const owed = owedOf(c);
      const paid = paidOf(c);
      if (!validAmount(owed) || !validAmount(paid) || paid > owed) { badData = true; continue; }
      debt += Math.max(0, owed - paid);
    }
    const stored = Number(detail.noHocPhi ?? detail.conNo);
    const hasStoredDebt = detail.noHocPhi !== undefined || detail.conNo !== undefined;
    // Không ghép tổng công nợ đã lưu vào từng kỳ để tránh cộng đôi.
    const debtMismatch = !badData && hasStoredDebt && validAmount(stored) && sorted.length > 0 && debt !== stored;
    const location = String(detail.diemTap || member?.location || "").trim();
    const prices = locationRates.filter(l => String(l.name || "").trim() === location);
    const price = prices.length === 1 ? prices[0] : null;
    const type = detail.loaiHocPhi || sorted[sorted.length - 1]?.loaiHocPhi || "";
    const key = type === "Ngày" ? "daily" : type === "Tháng" ? "monthly" : type === "Quý" ? "quarterly" : "";
    const fee = key ? Number(price?.fees?.[key]) : NaN;
    const last = sorted[sorted.length - 1];
    // Chỉ dự báo kỳ CHƯA được tạo. Nếu thiếu lịch sử nhưng đã có ngày thanh toán
    // đến thì không suy đoán kỳ thu kế tiếp.
    const nextStart = last?.ngayHetHan ? nextDay(last.ngayHetHan)
      : !detail.ngayHetHan && !cycles.length ? detail.ngayBatDau || "" : "";
    let nextAmount = null;
    let nextError = "";
    if (!nextStart) nextError = "Chưa đủ dữ liệu chu kỳ để xác định kỳ tiếp theo.";
    else if (!price || price.active === false || price.features?.tuition === false) nextError = "Chưa có bảng giá hợp lệ tại điểm tập.";
    else if (!validAmount(fee) || fee <= 0) nextError = "Chưa cấu hình học phí cho loại thu này.";
    else {
      try { nextAmount = calculateTuitionPolicy(fee, detail.chinhSachHocPhi || { loai: "binh_thuong" }, nextStart).soTienPhaiDong; }
      catch(e) { nextError = `Không tính được chính sách học phí: ${e.message}`; }
    }
    return { cycles: sorted, debt, badData, hasOldSchema, debtMismatch, hasStoredDebt, stored,
      nextStart, nextAmount, nextError, type };
  }, [detail, member?.location, locationRates]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      scroll="paper"
    >
      <DialogTitle>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="h6" fontWeight={800}>
            Hồ sơ hội viên
          </Typography>
          <IconButton onClick={onClose}>
            <CloseRounded />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" fontWeight={800}>
            {detail?.hoTen || member?.name || "Hội viên"}
          </Typography>
          <Typography color="text.secondary">
            Mã nội bộ: {display(detail?.maHoiVienNoiBo)}
          </Typography>
          <Typography color="text.secondary">
            VTF: {display(detail?.maHV)}
          </Typography>
          <Chip
            sx={{ mt: 1 }}
            label={display(detail?.trangThai)}
            color={
              detail?.trangThai === "Đang học"
                ? "success"
                : "default"
            }
            size="small"
          />
        </Box>

        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 3 }}
        >
          <Tab label="Thông tin" />
          <Tab label="Chuyển điểm tập" />
          <Tab label="Thi cấp" />
          <Tab label="Học phí" />
          <Tab label="Chính sách học phí" />
        </Tabs>

        {tab === 0 && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
              },
              gap: 3,
            }}
          >
            <Field label="Họ và tên" value={detail?.hoTen} />
            <Field label="Ngày sinh" value={dateVN(detail?.ngaySinh)} />
            <Field label="Giới tính" value={detail?.gioiTinh} />
            <Field label="Điểm tập" value={detail?.diemTap} />
            <Field label="Cấp đai" value={detail?.capDaiDang} />
            <Field label="Màu đai" value={detail?.mauDai} />
            <Field
              label="SĐT phụ huynh"
              value={detail?.soDienThoaiPhuHuynh}
            />
            <Field label="Ngày bắt đầu" value={dateVN(detail?.ngayBatDau)} />
            <Field label="Loại học phí" value={detail?.loaiHocPhi} />
            <Field label="Kết thúc kỳ học phí đầu tiên" value={dateVN(detail?.ngayDenHanDauTien)} />
            <Field label="Đã thanh toán đến" value={detail?.ngayHetHan ? dateVN(detail.ngayHetHan) : "Chưa ghi nhận thanh toán"} />
            <Field label="Trạng thái" value={detail?.trangThai} />
            <Field label="Ghi chú" value={detail?.ghiChu} />
          </Box>
        )}

        {tab === 1 && !isAdmin && (
          <Alert severity="info">Lịch sử chuyển điểm tập hiện chỉ dành cho Admin.</Alert>
        )}
        {tab === 2 && !canViewExams && (
          <Alert severity="info">Bạn chưa được cấp quyền xem Thi cấp tại điểm tập này.</Alert>
        )}
        {tab === 3 && !canViewTuition && (
          <Alert severity="info">Bạn chưa được cấp quyền xem Học phí tại điểm tập này.</Alert>
        )}

        {tab === 1 && isAdmin && (
          <Stack spacing={2}>
            {orderedTransfers.length === 0 && (
              <Typography color="text.secondary">
                Chưa có lịch sử chuyển điểm tập được ghi nhận.
              </Typography>
            )}

            {orderedTransfers.map((item) => (
              <Box
                key={item.id}
                sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}
              >
                <Typography fontWeight={700}>
                  {display(item.diemTapCu)} → {display(item.diemTapMoi)}
                </Typography>
                <Typography variant="body2">
                  Mã: {display(item.maNoiBoCu)} → {display(item.maNoiBoMoi)}
                </Typography>
                <Typography variant="body2">
                  Ngày chuyển: {dateTime(item.ngayChuyen)}
                </Typography>
                <Typography variant="body2">
                  Thực hiện: {display(item.nguoiThucHienEmail)}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}

        {tab === 2 && canViewExams && (
          <Stack spacing={2}>
            {exams.length === 0 && (
              <Typography color="text.secondary">
                Chưa có lịch sử đăng ký thi cấp.
              </Typography>
            )}
            {exams.map((item) => (
              <Box
                key={item.id}
                sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}
              >
                <Typography fontWeight={700}>
                  Đẳng dự thi: {display(item.dangDuThi)}
                </Typography>
                <Typography variant="body2">
                  Mã đợt thi: {getExamPeriodCode(item.periodId)}
                </Typography>
                <Typography variant="body2">
                  Trạng thái: {display(item.status)}
                </Typography>
                <Typography variant="body2">
                  Kết quả: {display(item.ketQua)}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}

        {tab === 3 && canViewTuition && (
          <Stack spacing={2}>
            <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
              <Typography variant="h6" fontWeight={800}>Tổng hợp học phí</Typography>
              {tuitionSummary?.badData || tuitionSummary?.debtMismatch ? (
                <Alert severity="warning" sx={{ mt: 1 }}>Lịch sử kỳ học phí và công nợ chưa khớp. Cần đối soát dữ liệu trước khi xác nhận số dư.</Alert>
              ) : tuitionSummary?.hasOldSchema ? (
                <Alert severity="info" sx={{ mt: 1 }}>Một số kỳ dùng dữ liệu cũ; số dư chỉ được đối chiếu theo các khoản đã ghi nhận.</Alert>
              ) : null}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 1.5 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">Nợ còn lại đã ghi nhận</Typography>
                  <Typography variant="h6" fontWeight={800} color="warning.main">
                    {tuitionSummary?.badData || tuitionSummary?.debtMismatch ? "Cần đối soát" :
                      tuitionSummary?.cycles.length ? money(tuitionSummary.debt) :
                      tuitionSummary?.hasStoredDebt && validAmount(tuitionSummary.stored) ? money(tuitionSummary.stored) : "Chưa có kỳ ghi nhận"}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">Học phí kỳ tiếp theo (dự kiến)</Typography>
                  <Typography variant="h6" fontWeight={800}>
                    {tuitionSummary?.nextAmount === null || tuitionSummary?.nextAmount === undefined ? "Chưa xác định" : money(tuitionSummary.nextAmount)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Bắt đầu kỳ: {dateVN(tuitionSummary?.nextStart)} · Loại: {display(tuitionSummary?.type)}</Typography>
                </Box>
              </Stack>
              {tuitionSummary?.nextError && <Alert severity="info" sx={{ mt: 1 }}>{tuitionSummary.nextError}</Alert>}
              {ratesError && <Alert severity="warning" sx={{ mt: 1 }}>{ratesError}</Alert>}
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
                Công nợ chỉ gồm các kỳ đã lập trong hồ sơ. Học phí dự kiến chưa cộng vào nợ; kỳ quá hạn chưa lập sẽ được đối soát tại màn hình Thu học phí.
              </Typography>
            </Box>
            {tuitionSummary?.cycles.length > 0 && (
              <Box>
                <Typography fontWeight={800} sx={{ mb: 1 }}>Công nợ theo từng kỳ</Typography>
                {[...tuitionSummary.cycles].reverse().map((c, i) => (
                  <Box key={`${c.ngayBatDau || i}-${i}`} sx={{ p: 1.5, mb: 1, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                    <Typography fontWeight={700}>{dateVN(c.ngayBatDau)} – {dateVN(c.ngayHetHan)} · {display(c.loaiHocPhi)}</Typography>
                    <Typography variant="body2">Phải đóng: {money(owedOf(c))} · Đã thu: {money(paidOf(c))}</Typography>
                    <Typography variant="body2" color={owedOf(c) > paidOf(c) ? "warning.main" : "success.main"}>
                      Còn lại: {validAmount(owedOf(c)) && validAmount(paidOf(c)) ? money(Math.max(0, owedOf(c) - paidOf(c))) : "Cần đối soát"}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
            <Typography fontWeight={800}>Lịch sử giao dịch (mới nhất trước)</Typography>
            {orderedPayments.length === 0 && <Typography color="text.secondary">Chưa có lịch sử đóng học phí.</Typography>}
            {orderedPayments.map((item) => (
              <Box key={item.id} sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                <Typography fontWeight={700}>{money(item.soTien)} — {display(item.loaiHocPhi)}</Typography>
                <Typography variant="body2">Ngày thu: {dateVN(item.ngayThu)}</Typography>
                <Typography variant="body2">Kỳ học phí: {dateVN(item.ngayBatDauKy)} đến {dateVN(item.ngayHetHanKy || item.ngayHetHanMoi)}</Typography>
                <Typography variant="body2">Người thu: {display(item.nguoiThu)}</Typography>
                <Typography variant="body2">Ghi chú: {display(item.ghiChu)}</Typography>
              </Box>
            ))}
          </Stack>
        )}
        {tab === 4 && (
          <Stack spacing={2.2} sx={{maxWidth:650}}>
            <Alert severity="info">Chính sách áp dụng theo ngày bắt đầu của từng kỳ học phí. Để trống ngày kết thúc nếu không thời hạn. Kỳ đã thu trước đây không bị tính lại.</Alert>
            <TextField select label="Chế độ học phí" value={policy.loai} disabled={!isAdmin || policySaving}
              onChange={e=>setPolicy(p=>({...p,loai:e.target.value}))} fullWidth>
              {Object.entries(POLICY_LABELS).map(([k,v])=><MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
            {policy.loai === "giam_phan_tram" && <TextField label="Giảm (%)" type="number" value={policy.giaTri} disabled={!isAdmin || policySaving}
              onChange={e=>setPolicy(p=>({...p,giaTri:e.target.value}))} inputProps={{min:0.01,max:100,step:0.01}} />}
            {policy.loai === "giam_co_dinh" && <TextField label="Giảm cố định (VNĐ/kỳ)" type="number" value={policy.giaTri} disabled={!isAdmin || policySaving}
              onChange={e=>setPolicy(p=>({...p,giaTri:e.target.value}))} inputProps={{min:1,step:1}} />}
            {policy.loai !== "binh_thuong" && <>
              <TextField label="Lý do miễn/giảm" value={policy.lyDo} disabled={!isAdmin || policySaving}
                onChange={e=>setPolicy(p=>({...p,lyDo:e.target.value}))} fullWidth />
              <Stack direction={{xs:"column",sm:"row"}} spacing={2}>
                <TextField label="Có hiệu lực từ" type="date" value={policy.tuNgay} disabled={!isAdmin || policySaving}
                  onChange={e=>setPolicy(p=>({...p,tuNgay:e.target.value}))} InputLabelProps={{shrink:true}} fullWidth />
                <TextField label="Đến ngày (bỏ trống = không thời hạn)" type="date" value={policy.denNgay} disabled={!isAdmin || policySaving}
                  onChange={e=>setPolicy(p=>({...p,denNgay:e.target.value}))} InputLabelProps={{shrink:true}} fullWidth />
              </Stack>
            </>}
            {policyMessage && <Alert severity={policyMessage.startsWith("Đã lưu")?"success":"error"}>{policyMessage}</Alert>}
            {isAdmin ? <Button variant="contained" color="success" onClick={savePolicy} disabled={policySaving}
              startIcon={policySaving?<CircularProgress size={16}/>:null}>Lưu chính sách học phí</Button>
              : <Alert severity="info">Chỉ Admin được thay đổi chính sách học phí.</Alert>}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
