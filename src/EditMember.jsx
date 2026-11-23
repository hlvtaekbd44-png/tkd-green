
import { useState } from "react";
import {
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { db } from "./firebase";
import { transferMemberLocation } from "./memberIdService";
import { useClubLocations, namesForProfile } from "./useClubLocations";
import { EDUCATION_LEVELS } from "./educationLevels";



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

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isAdmin = profile?.role === "admin";

  const allowedLocations = namesForProfile(locations, profile);

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
      const updateData = {
        maHV: form.maHV.trim(),
        hoTen: form.hoTen.trim(),
        ngaySinh: form.ngaySinh,
        gioiTinh: form.gioiTinh,
        trinhDoVanHoa: form.trinhDoVanHoa,
        soDienThoaiPhuHuynh: form.soDienThoaiPhuHuynh.trim(),
        loaiHocPhi: form.loaiHocPhi,
        ngayBatDau: form.ngayBatDau,
        capDaiDang: form.capDaiDang.trim(),
        trangThai: form.trangThai,
        updatedAt: serverTimestamp(),
      };

      const previousLocation = originalLocation;
      if (isAdmin && form.diemTap !== previousLocation) {
        // Chuyển điểm tập đúng nghiệp vụ: cập nhật bộ đếm mã CLB và ghi lịch sử.
        // Không dùng updateDoc(diemTap) trực tiếp vì sẽ làm lệch mã CLB.
        await transferMemberLocation(member.id, form.diemTap, updateData);
      } else {
        await updateDoc(doc(db, "members", member.id), updateData);
      }

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
              helperText={loadingLocations ? "Đang tải điểm tập từ Cài đặt..." : "Danh sách lấy trực tiếp từ Cài đặt điểm tập (Firebase)."}
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
      </Paper>
    </Box>
  );
}
