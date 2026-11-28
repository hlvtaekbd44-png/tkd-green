
import { useEffect, useState } from "react";
import {
  doc,
  collection,
  getDocs,
  runTransaction,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Chip,
  CircularProgress,
  Divider,
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { auth, db } from "./firebase";
import { transferMemberLocation } from "./memberIdService";
import { useClubLocations, namesForProfile } from "./useClubLocations";
import { EDUCATION_LEVELS } from "./educationLevels";




// TKD_HLV_EDIT_AUDIT_V1: Lich su bat bien, ghi nguyen tu voi chinh sua.
const MEMBER_EDIT_FIELDS = [
  'hoTen', 'ngaySinh', 'gioiTinh', 'trinhDoVanHoa',
  'soDienThoaiPhuHuynh', 'loaiHocPhi', 'ngayBatDau',
  'capDaiDang', 'trangThai',
];
const MEMBER_FIELD_LABELS = {
  hoTen: 'Họ và tên', ngaySinh: 'Ngày sinh', gioiTinh: 'Giới tính',
  trinhDoVanHoa: 'Trình độ văn hóa', soDienThoaiPhuHuynh: 'SĐT phụ huynh',
  loaiHocPhi: 'Loại học phí', ngayBatDau: 'Ngày bắt đầu tập',
  capDaiDang: 'Cấp đai/đẳng', trangThai: 'Trạng thái hội viên',
};
function auditValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (value?.toDate instanceof Function) return value.toDate().toLocaleString('vi-VN');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function EditMember({
  member,
  profile,
  onSaved,
  onCancel,
}) {
  const { locations, loadingLocations, locationError } = useClubLocations();
  const [form, setForm] = useState({
    maHV: member?.maHV || "",
    hoTen: member?.name || "",
    ngaySinh: member?.ngaySinh || "",
    gioiTinh: member?.gioiTinh || "Nam",
    trinhDoVanHoa: member?.trinhDoVanHoa || "",
    diemTap: member?.location || "",
    soDienThoaiPhuHuynh: member?.soDienThoaiPhuHuynh || "",
    loaiHocPhi: member?.loaiHocPhi || "Tháng",
    ngayBatDau: member?.ngayBatDau || "",
    capDaiDang: member?.belt || "Chưa cập nhật",
    trangThai: member?.status || "Đang học",
  });

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isAdmin = profile?.role === "admin";

  const allowedLocations = namesForProfile(locations, profile);

  useEffect(() => {
    if (!member?.id) return;
    let live = true;
    setHistoryLoading(true);
    setHistoryError('');
    getDocs(collection(db, 'members', member.id, 'editHistory'))
      .then(snapshot => {
        if (!live) return;
        const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setHistory(items);
      })
      .catch(e => { if (live) setHistoryError(e.message || 'Không tải được lịch sử chỉnh sửa.'); })
      .finally(() => { if (live) setHistoryLoading(false); });
    return () => { live = false; };
  }, [member?.id, historyRefresh]);

  function handleChange(event) {
    setForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!member?.id) {
      setError("Không tìm thấy ID hồ sơ trong Firebase.");
      return;
    }

    if (!form.hoTen.trim()) {
      setError("Vui lòng nhập họ tên hội viên.");
      return;
    }

    if (loadingLocations || locationError) {
      setError("Chưa tải được danh sách điểm tập. Vui lòng kiểm tra Firebase.");
      return;
    }

    const originalLocation = member?.location || member?.diemTap || "";
    if (!allowedLocations.includes(form.diemTap) && form.diemTap !== originalLocation) {
      setError("Bạn không có quyền cập nhật tại điểm tập này.");
      return;
    }

    setSaving(true);

    try {

      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      // TKD_VTF_SYNC_V1: VTF chính thức chỉ Admin cập nhật; chặn mã trùng hồ sơ.
      // Lưu ý: tra cứu này không bảo đảm tính duy nhất tuyệt đối nếu hai Admin sửa đồng thời.
      const nextVtf = form.maHV.trim().toUpperCase();
      if (isAdmin && nextVtf && nextVtf !== String(member.maHV || "").trim().toUpperCase()) {
        const sameVtf = await getDocs(query(collection(db, 'members'), where('maHV', '==', nextVtf)));
        if (sameVtf.docs.some(d => d.id !== member.id)) {
          throw new Error('Mã VTF này đã được cấp cho hội viên khác. Không thể lưu mã trùng.');
        }
      }
      const nextValues = {
        hoTen: form.hoTen.trim(),
        ngaySinh: form.ngaySinh,
        gioiTinh: form.gioiTinh,
        trinhDoVanHoa: form.trinhDoVanHoa,
        soDienThoaiPhuHuynh: form.soDienThoaiPhuHuynh.trim(),
        loaiHocPhi: form.loaiHocPhi,
        ngayBatDau: form.ngayBatDau,
        capDaiDang: form.capDaiDang.trim(),
        trangThai: form.trangThai,
      };
      if (!isAdmin && form.diemTap !== originalLocation) {
        throw new Error('HLV không được chuyển điểm tập.');
      }
      if (isAdmin && form.diemTap !== originalLocation) {
        // Giu nguyen giao dich chuyen diem tap cua Admin va lich su chuyen.
        await transferMemberLocation(member.id, form.diemTap, {
          ...nextValues,
          maHV: nextVtf,
        });
        setMessage('Đã chuyển điểm tập và cập nhật hồ sơ. Lịch sử chuyển điểm tập được ghi riêng.');
        if (onSaved) onSaved();
        return;
      }
      const memberRef = doc(db, 'members', member.id);
      const historyRef = doc(collection(db, 'members', member.id, 'editHistory'));
      const changed = await runTransaction(db, async tx => {
        const snapshot = await tx.get(memberRef);
        if (!snapshot.exists()) throw new Error('Hồ sơ hội viên không còn tồn tại.');
        const before = snapshot.data();
        if (!isAdmin && before.diemTap !== originalLocation) {
          throw new Error('Điểm tập hội viên đã thay đổi. Hãy tải lại hồ sơ.');
        }
        const differences = {};
        for (const field of MEMBER_EDIT_FIELDS) {
          if (before[field] !== nextValues[field]) differences[field] = nextValues[field];
        }
        // Admin được sửa mã VTF; mã nội bộ và chuyển điểm tập
        // vẫn chỉ xử lý bằng quy trình chuyển điểm tập chuyên biệt.
        if (isAdmin && String(before.maHV || "").trim() !== nextVtf) differences.maHV = nextVtf;
        const changeKeys = Object.keys(differences);
        if (!changeKeys.length) return false;
        const updatedData = {
          ...differences,
          updatedAt: serverTimestamp(),
          lastEditAuditId: historyRef.id,
        };
        tx.update(memberRef, updatedData);
        tx.set(historyRef, {
          memberId: member.id,
          actorUid: currentUser.uid,
          actorEmail: currentUser.email || '',
          actorRole: isAdmin ? 'admin' : 'hlv',
          location: before.diemTap || '',
          createdAt: serverTimestamp(),
          changeKeys,
          before,
          after: { ...before, ...updatedData },
        });
        return true;
      });
      if (changed) setHistoryRefresh(n => n + 1);

      setMessage("Đã cập nhật hồ sơ hội viên thành công.");

      if (onSaved) {
        onSaved();
      }
    } catch (err) {
      console.error("Lỗi cập nhật hội viên:", err);
      setError(
        `Không thể cập nhật: ${err.code || ""} ${err.message || ""}`
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ mt: 2, maxWidth: 900, mx: "auto", width: "100%" }}>
      <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
        <Typography variant="h5" fontWeight={800} gutterBottom>
          Chỉnh sửa hồ sơ hội viên
        </Typography>

        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Thông tin được lưu trực tiếp vào Firebase.
        </Typography>

        {message && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {message}
          </Alert>
        )}

        {locationError && <Alert severity="error">{locationError}</Alert>}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              name="maHV"
              disabled={!isAdmin}
              label="Mã hội viên VTF"
              value={form.maHV}
              onChange={handleChange}
              helperText="Không bắt buộc; khi chưa có VTF vẫn dùng mã CLB."
              fullWidth
            />

            <TextField
              name="hoTen"
              label="Họ và tên"
              value={form.hoTen}
              onChange={handleChange}
              required
              fullWidth
            />

            <TextField
              name="ngaySinh"
              label="Ngày sinh"
              type="date"
              value={form.ngaySinh}
              onChange={handleChange}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />

            <TextField
              select
              name="gioiTinh"
              label="Giới tính"
              value={form.gioiTinh}
              onChange={handleChange}
              fullWidth
            >
              <MenuItem value="Nam">Nam</MenuItem>
              <MenuItem value="Nữ">Nữ</MenuItem>
            </TextField>

            <TextField select name="trinhDoVanHoa" label="Trình độ văn hóa (không bắt buộc)" value={form.trinhDoVanHoa} onChange={handleChange} fullWidth>
              <MenuItem value="">Chưa cập nhật</MenuItem>
              {EDUCATION_LEVELS.map(level => <MenuItem key={level} value={level}>{level}</MenuItem>)}
            </TextField>

            <TextField
              select
              name="diemTap"
              label="Điểm tập"
              value={form.diemTap}
              onChange={handleChange}
              disabled={!isAdmin || loadingLocations || Boolean(locationError)}
              helperText={isAdmin ? "Admin chuyển điểm tập qua quy trình ghi lịch sử và đổi mã CLB tự động." : "HLV không được chuyển điểm tập."}
              required
              fullWidth
            >
              {form.diemTap && !allowedLocations.includes(form.diemTap) && <MenuItem value={form.diemTap} disabled>{form.diemTap} (đã ngừng/không còn quyền)</MenuItem>}
              {allowedLocations.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              name="soDienThoaiPhuHuynh"
              label="Số điện thoại phụ huynh"
              value={form.soDienThoaiPhuHuynh}
              onChange={handleChange}
              fullWidth
            />

            <TextField
              select
              name="loaiHocPhi"
              label="Loại học phí"
              value={form.loaiHocPhi}
              onChange={handleChange}
              fullWidth
            >
              <MenuItem value="Ngày">Ngày</MenuItem>
              <MenuItem value="Tháng">Tháng</MenuItem>
              <MenuItem value="Quý">Quý</MenuItem>
            </TextField>

            <TextField
              name="ngayBatDau"
              label="Ngày bắt đầu tập"
              type="date"
              value={form.ngayBatDau}
              onChange={handleChange}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />

            <TextField
              name="capDaiDang"
              label="Cấp đai/đẳng"
              value={form.capDaiDang}
              onChange={handleChange}
              fullWidth
            />

            <TextField
              select
              name="trangThai"
              label="Trạng thái hội viên"
              value={form.trangThai}
              onChange={handleChange}
              fullWidth
            >
              <MenuItem value="Đang học">Đang học</MenuItem>
              <MenuItem value="Nghỉ học">Nghỉ học</MenuItem>
            </TextField>

            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button
                type="submit"
                variant="contained"
                disabled={saving}
              >
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>

              <Button
                type="button"
                variant="outlined"
                onClick={onCancel}
                disabled={saving}
              >
                Quay lại danh sách
              </Button>
            </Stack>
          </Stack>
        </Box>
        <Accordion sx={{ mt: 3 }} defaultExpanded>
          <AccordionSummary expandIcon={<span aria-hidden="true">▾</span>}>
            <Typography fontWeight={700}>Lịch sử chỉnh sửa ({history.length})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {historyLoading && <CircularProgress size={22} />}
            {historyError && <Alert severity="warning">{historyError}</Alert>}
            {!historyLoading && !historyError && history.length === 0 && (
              <Typography color="text.secondary">Chưa có lịch sử chỉnh sửa kể từ khi kích hoạt tính năng.</Typography>
            )}
            <Stack spacing={2}>
              {history.map(item => (
                <Box key={item.id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflowWrap: 'anywhere' }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
                    <Chip size="small" label={item.actorRole === 'admin' ? 'Admin' : 'HLV'} />
                    <Typography variant="body2" fontWeight={700}>{item.actorEmail || item.actorUid}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.createdAt?.toDate?.()?.toLocaleString('vi-VN') || 'Đang đồng bộ thời gian'}
                    </Typography>
                  </Stack>
                  {(item.changeKeys || []).map(key => (
                    <Box key={key} sx={{ py: 0.5 }}>
                      <Typography variant="body2" fontWeight={600}>{MEMBER_FIELD_LABELS[key] || key}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {auditValue(item.before?.[key])} → {auditValue(item.after?.[key])}
                      </Typography>
                    </Box>
                  ))}
                  <Divider sx={{ mt: 1 }} />
                </Box>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      </Paper>
    </Box>
  );
}
