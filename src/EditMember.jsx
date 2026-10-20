
import { useState } from "react";
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
import {
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const locations = [
  "Lê Văn Tám",
  "Nghĩa Trung",
  "Đồng Tâm",
  "T6",
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
    diemTap: member?.location || "",
    capDaiDang: member?.belt || "Chưa cập nhật",
    trangThai: member?.status || "Đang học",
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isAdmin = profile?.role === "admin";

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!member?.id) {
      setError("Không tìm thấy mã hồ sơ Firebase của hội viên.");
      return;
    }

    if (!form.maHV.trim() || !form.hoTen.trim()) {
      setError("Vui lòng nhập mã hội viên và họ tên.");
      return;
    }

    setSaving(true);

    try {
      const updateData = {
        maHV: form.maHV.trim(),
        hoTen: form.hoTen.trim(),
        capDaiDang: form.capDaiDang,
        trangThai: form.trangThai,
        updatedAt: serverTimestamp(),
      };

      // Chỉ quản trị viên được chuyển hội viên sang điểm tập khác.
      if (isAdmin) {
        updateData.diemTap = form.diemTap;
      }

      await updateDoc(
        doc(db, "members", member.id),
        updateData
      );

      setMessage("Đã cập nhật hồ sơ hội viên lên Firebase.");

      if (onSaved) {
        onSaved();
      }
    } catch (err) {
      console.error("Lỗi cập nhật hội viên:", err);
      setError(
        "Không thể cập nhật hồ sơ. Vui lòng kiểm tra quyền truy cập Firebase."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ mt: 2, maxWidth: 900, mx: "auto", width: "100%" }}>
      <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
        <Typography variant="h5" fontWeight={800} gutterBottom>
          Chỉnh sửa hồ sơ hội viên
        </Typography>

        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Cập nhật thông tin và lưu trực tiếp vào cơ sở dữ liệu Firebase.
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
              label="Mã hội viên"
              name="maHV"
              value={form.maHV}
              onChange={handleChange}
              required
              fullWidth
            />

            <TextField
              label="Họ và tên"
              name="hoTen"
              value={form.hoTen}
              onChange={handleChange}
              required
              fullWidth
            />

            <TextField
              select
              label="Điểm tập"
              name="diemTap"
              value={form.diemTap}
              onChange={handleChange}
              disabled={!isAdmin}
              fullWidth
              helperText={
                isAdmin
                  ? "Quản trị viên có thể thay đổi điểm tập."
                  : "Huấn luyện viên không thể chuyển điểm tập."
              }
            >
              {locations.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Cấp đai/đẳng"
              name="capDaiDang"
              value={form.capDaiDang}
              onChange={handleChange}
              fullWidth
            />

            <TextField
              select
              label="Trạng thái hội viên"
              name="trangThai"
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
