
import { useEffect, useState } from "react";
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
import { POLICY_LABELS, validateTuitionPolicy } from "./tuitionPolicy";

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
  const [error, setError] = useState("");
  const [policy, setPolicy] = useState({loai:"binh_thuong", giaTri:0, lyDo:"", tuNgay:"", denNgay:""});
  const [policySaving, setPolicySaving] = useState(false);
  const [policyMessage, setPolicyMessage] = useState("");

  const isAdmin = profile?.role === "admin";

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
    if (!open || !member?.id || !isAdmin) return;

    const listeners = [
      {
        name: "chuyển điểm tập",
        collectionName: "memberTransferHistory",
        field: "memberId",
        setter: setTransfers,
      },
      {
        name: "thi cấp",
        collectionName: "examRegistrations",
        field: "memberDocId",
        setter: setExams,
      },
      {
        name: "học phí",
        collectionName: "tuitionPayments",
        field: "memberId",
        setter: setPayments,
      },
    ];

    const unsubscribes = listeners.map((item) =>
      onSnapshot(
        query(
          collection(db, item.collectionName),
          where(item.field, "==", member.id)
        ),
        (snapshot) => {
          item.setter(
            snapshot.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }))
          );
        },
        (err) => {
          console.error(item.name, err);
          setError(
            `Không đọc được lịch sử ${item.name}. ` +
            "Hãy kiểm tra Firestore Rules."
          );
        }
      )
    );

    return () => unsubscribes.forEach((fn) => fn());
  }, [open, member?.id, isAdmin]);

    useEffect(() => {
    if (!open || !isAdmin) {
      setExamPeriods([]);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, "examPeriods"),
      (snapshot) => {
        setExamPeriods(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      (err) => {
        console.error("Lỗi tải danh sách đợt thi:", err);
        setError("Không đọc được danh sách đợt thi.");
      }
    );

    return () => unsubscribe();
  }, [open, isAdmin]);

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
    (b.ngayThu || "").localeCompare(a.ngayThu || "")
  );

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

        {tab !== 0 && tab !== 4 && !isAdmin && (
          <Alert severity="info">
            Phần lịch sử hiện chỉ dành cho Admin.
          </Alert>
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

        {tab === 2 && isAdmin && (
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

        {tab === 3 && isAdmin && (
          <Stack spacing={2}>
            {orderedPayments.length === 0 && (
              <Typography color="text.secondary">
                Chưa có lịch sử đóng học phí.
              </Typography>
            )}
            {orderedPayments.map((item) => (
              <Box
                key={item.id}
                sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}
              >
                <Typography fontWeight={700}>
                  {money(item.soTien)} — {display(item.loaiHocPhi)}
                </Typography>
                <Typography variant="body2">
                  Ngày thu: {dateVN(item.ngayThu)}
                </Typography>
                <Typography variant="body2">
                  Kỳ học phí: {dateVN(item.ngayBatDauKy)} đến{" "}
                  {dateVN(item.ngayHetHanMoi)}
                </Typography>
                <Typography variant="body2">
                  Người thu: {display(item.nguoiThu)}
                </Typography>
                <Typography variant="body2">
                  Ghi chú: {display(item.ghiChu)}
                </Typography>
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
