
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

const locations = [
  "Lê Văn Tám",
  "Nghĩa Trung",
  "Đồng Tâm",
  "Thôn 6",
  "Phước Sơn",
  "Minh Hưng",
];

export default function EditMember({
  member,
  profile,
  onSaved,
  onCancel,
}) {
  const [form, setForm] = useState({
    maHV: member?.maHV || "",
    hoTen: member?.name || "",
    ngaySinh: member?.ngaySinh || "",
    gioiTinh: member?.gioiTinh || "Nam",
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

  const allowedLocations =
    isAdmin
      ? locations
      : locations.filter((item) =>
          profile?.diemTap?.includes(item)
        );

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

    if (!form.maHV.trim() || !form.hoTen.trim()) {
      setError("Vui lòng nhập mã hội viên và họ tên.");
      return;
    }

    if (!allowedLocations.includes(form.diemTap)) {
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
        soDienThoaiPhuHuynh: form.soDienThoaiPhuHuynh.trim(),
        loaiHocPhi: form.loaiHocPhi,
        ngayBatDau: form.ngayBatDau,
        capDaiDang: form.capDaiDang.trim(),
        trangThai: form.trangThai,
        updatedAt: serverTimestamp(),
      };

      // Chỉ admin được đổi điểm tập.
      if (isAdmin) {
        updateData.diemTap = form.diemTap;
      }

      await updateDoc(
        doc(db, "members", member.id),
        updateData
      );

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

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              name="maHV"
              label="Mã hội viên"
              value={form.maHV}
              onChange={handleChange}
              required
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

            <TextField
              select
              name="diemTap"
              label="Điểm tập"
              value={form.diemTap}
              onChange={handleChange}
              disabled={!isAdmin}
              required
              fullWidth
            >
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
