
import { useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import {
  Box,
  Button,
  MenuItem,
  TextField,
  Typography,
  Alert,
} from "@mui/material";
import { db } from "./firebase";
import { useClubLocations, namesForProfile } from "./useClubLocations";
import { EDUCATION_LEVELS } from "./educationLevels";



export default function AddMember({ profile, onSaved }) {
  const { locations, loadingLocations, locationError } = useClubLocations();
  const [form, setForm] = useState({
    maHV: "",
    hoTen: "",
    ngaySinh: "",
    gioiTinh: "Nam",
    trinhDoVanHoa: "",
    diemTap: "",
    soDienThoaiPhuHuynh: "",
    loaiHocPhi: "Tháng",
    ngayBatDau: new Date().toISOString().slice(0, 10),
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const allowedLocations = namesForProfile(locations, profile);

  function handleChange(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  }

  
async function handleSubmit(event) {
  event.preventDefault();
  console.log("Đã nhấn Lưu hội viên", form);

  setMessage("");

  if (!form.maHV.trim() || !form.hoTen.trim()) {
    setMessage("Vui lòng nhập mã hội viên VTF và họ tên.");
    return;
  }

  if (!allowedLocations.includes(form.diemTap)) {
    setMessage("Bạn không có quyền thêm hội viên tại điểm tập này.");
    return;
  }

  setSaving(true);
  setMessage("Đang lưu hồ sơ hội viên...");

  try {
    const docRef = await addDoc(collection(db, "members"), {
      ...form,
      maHV: form.maHV.trim(),
      hoTen: form.hoTen.trim(),
      trangThai: "Đang học",
      capDaiDang: "Chưa cập nhật",
      createdAt: serverTimestamp(),
    });

    console.log("Đã lưu hội viên, ID:", docRef.id);
    setMessage(`Đã lưu thành công! Mã tài liệu: ${docRef.id}`);

    // Tạm thời không đóng biểu mẫu để bạn nhìn thấy kết quả.
    // onSaved?.();
  } catch (error) {
    console.error("Lỗi lưu hội viên:", error);
    setMessage(`Lỗi ${error.code || ""}: ${error.message || "Không xác định"}`);
  } finally {
    setSaving(false);
  }
}


  
     return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{ maxWidth: 800, display: "grid", gap: 2, mt: 2 }}
    >
      <Button
        type="button"
        variant="outlined"
        onClick={() => onSaved?.()}
        sx={{ justifySelf: "start" }}
      >
        ← Quay lại danh sách hội viên
      </Button>

      <Typography variant="h5" fontWeight={700}>
        Thêm hội viên mới
      </Typography>

      <TextField
        name="maHV"
        label="Mã hội viên VTF"
        value={form.maHV}
        onChange={handleChange}
        required
      />

      <TextField
        name="hoTen"
        label="Họ và tên"
        value={form.hoTen}
        onChange={handleChange}
        required
      />

      <TextField
        name="ngaySinh"
        label="Ngày sinh"
        type="date"
        value={form.ngaySinh}
        onChange={handleChange}
        slotProps={{ inputLabel: { shrink: true } }}
      />

      <TextField
        select
        name="gioiTinh"
        label="Giới tính"
        value={form.gioiTinh}
        onChange={handleChange}
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
        required
      >
        {allowedLocations.map((location) => (
          <MenuItem key={location} value={location}>
            {location}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        name="soDienThoaiPhuHuynh"
        label="Số điện thoại phụ huynh"
        value={form.soDienThoaiPhuHuynh}
        onChange={handleChange}
      />

      <TextField
        select
        name="loaiHocPhi"
        label="Loại học phí"
        value={form.loaiHocPhi}
        onChange={handleChange}
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
        required
      />

      {locationError && <Alert severity="error">{locationError}</Alert>}
      {message && (
        <Alert
          severity={
            message.startsWith("Đã lưu") ? "success" : "error"
          }
        >
          {message}
        </Alert>
      )}

      <Button
        type="submit"
        variant="contained"
        disabled={saving || loadingLocations || allowedLocations.length === 0}
      >
        {saving ? "Đang lưu..." : "Lưu hội viên"}
      </Button>
    </Box>
  );
}
