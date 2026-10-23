
import { useState } from "react";
import { createMemberWithAutoId } from "./memberIdService.js";
import {
  Box,
  Button,
  MenuItem,
  TextField,
  Typography,
  Alert,
} from "@mui/material";
import { tinhNgayKetThucKy, formatNgayVN } from "./tuitionDateUtils";

const locations = [
  "Lê Văn Tám",
  "Nghĩa Trung",
  "Đồng Tâm",
  "Thôn 6",
  "Phước Sơn",
  "Minh Hưng",
];

export default function AddMember({ profile, onSaved }) {
  const [form, setForm] = useState({
    maHV: "",
    hoTen: "",
    ngaySinh: "",
    gioiTinh: "Nam",
    diemTap:
      profile?.role === "hlv"
        ? profile.diemTap?.[0] || ""
        : "Lê Văn Tám",
    soDienThoaiPhuHuynh: "",
    loaiHocPhi: "Tháng",
    ngayBatDau: [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,"0"), String(new Date().getDate()).padStart(2,"0")].join("-"),
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");

  const allowedLocations =
    profile?.role === "admin"
      ? locations
      : locations.filter((item) =>
          profile?.diemTap?.includes(item)
        );

  function handleChange(event) {
    setSaved(false);
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  }

  
async function handleSubmit(event) {
  event.preventDefault();
  console.log("Đã nhấn Lưu hội viên", form);

  setMessage("");

  if (saved) {
    setMessage("Hồ sơ này đã được lưu. Hãy quay lại danh sách để thêm hồ sơ khác.");
    return;
  }

  if (!form.hoTen.trim()) {
  setMessage("Vui lòng nhập họ tên hội viên.");
  return;
}

  if (!allowedLocations.includes(form.diemTap)) {
    setMessage("Bạn không có quyền thêm hội viên tại điểm tập này.");
    return;
  }

  const laHocPhiNgay = form.loaiHocPhi === "Ngày";

const ngayKetThucKy = tinhNgayKetThucKy(
  form.ngayBatDau,
  form.loaiHocPhi
);

if (
  !/^\d{4}-\d{2}-\d{2}$/.test(form.ngayBatDau) ||
  (!laHocPhiNgay && !ngayKetThucKy)
) {
  setMessage("Ngày bắt đầu hoặc loại học phí không hợp lệ.");
  return;
}

  setSaving(true);
  setMessage("Đang lưu hồ sơ hội viên...");

  try {
    const result = await createMemberWithAutoId({
  ...form,
  maHV: "",
  maHoiVienNoiBo: "",
  hoTen: form.hoTen.trim(),
  trangThai: "Đang học",
  capDaiDang: "Chưa cập nhật",
});

setSaved(true);

setMessage(
  laHocPhiNgay
    ? `Đã lưu thành công! Mã hội viên: ${result.maHoiVienNoiBo}. Học phí Ngày sẽ được tính theo số buổi có mặt trong điểm danh; chưa phát sinh khoản thu.`
    : `Đã lưu thành công! Mã hội viên: ${result.maHoiVienNoiBo}. Kỳ đầu kết thúc ${formatNgayVN(ngayKetThucKy)}; chưa ghi nhận thanh toán.`
);

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
          value=""
          disabled
          helperText="Mã VTF sẽ được Admin cập nhật sau."
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
        <MenuItem value="Ngày">Ngày (theo điểm danh)</MenuItem>
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

      <Alert severity="info">
  {form.loaiHocPhi === "Ngày" ? (
    <>
      Học phí Ngày được tính theo số buổi có mặt
      trong chức năng Điểm danh.
      Mỗi buổi có mặt sẽ phát sinh một khoản phải thu.
      Có thể thanh toán từng buổi hoặc thanh toán gộp.
    </>
  ) : (
    <>
      Kỳ học phí đầu tiên:{" "}
      {formatNgayVN(form.ngayBatDau)} –{" "}
      {formatNgayVN(
        tinhNgayKetThucKy(
          form.ngayBatDau,
          form.loaiHocPhi
        )
      )}.
      Đây là lịch kỳ học phí, chưa xác nhận đã thanh toán.
    </>
  )}
</Alert>

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
        disabled={saving || saved || allowedLocations.length === 0}
      >
        {saving ? "Đang lưu..." : "Lưu hội viên"}
      </Button>
    </Box>
  );
}
