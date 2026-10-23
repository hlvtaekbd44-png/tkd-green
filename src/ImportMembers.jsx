
import { useState } from "react";
import * as XLSX from "xlsx";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import {
  IMPORT_COLUMNS,
  importOneMember,
  validateImportRows,
  formatDateVN,
} from "./memberImportService";

export default function ImportMembers({
  open,
  onClose,
  students = [],
  profile,
}) {
  const [rows, setRows] = useState([]);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState([]);

  const isAdmin = profile?.role === "admin";
  const canCreate = isAdmin || (
    profile?.role === "hlv" &&
    profile?.permissions?.members?.create === true
  );
  const allowedLocations = isAdmin
    ? null
    : (profile?.locationPermissions?.members || []);

  const hasLocationAccess = (location) =>
    isAdmin || (canCreate && allowedLocations.includes(location));

  const validRows = rows.filter((row) =>
    row.valid && hasLocationAccess(row.member.diemTap)
  );
  const invalidRows = rows.filter((row) =>
    !row.valid || !hasLocationAccess(row.member.diemTap)
  );

  function downloadExcelTemplate() {
  const headers = IMPORT_COLUMNS;

  const worksheet = XLSX.utils.aoa_to_sheet([
    headers,
  ]);

  // Thiết lập độ rộng các cột
  worksheet["!cols"] = [
    { wch: 25 }, // Họ và tên
    { wch: 15 }, // Ngày sinh
    { wch: 12 }, // Giới tính
    { wch: 18 }, // Mã VTF
    { wch: 20 }, // Điểm tập
    { wch: 15 }, // Cấp đai
    { wch: 15 }, // Màu đai
    { wch: 20 }, // SĐT phụ huynh
    { wch: 18 }, // Ngày bắt đầu
    { wch: 18 }, // Ngày hết hạn
    { wch: 18 }, // Loại học phí
    { wch: 15 }, // Trạng thái
    { wch: 30 }, // Ghi chú
  ];
  
  // Chuẩn bị định dạng ngày cho các cột B, I, J
for (const col of ["B", "I", "J"]) {
  for (let row = 2; row <= 1001; row++) {
    const address = `${col}${row}`;

    worksheet[address] = {
      t: "z",
      z: "dd/mm/yyyy",
    };
  }
}

  const guide = XLSX.utils.aoa_to_sheet([
    ["HƯỚNG DẪN IMPORT HỘI VIÊN TKD GREEN"],
    [],
    ["1. Không thay đổi tên sheet DanhSachHoiVien."],
    ["2. Không thay đổi tên các cột ở dòng đầu tiên."],
    ["3. Họ và tên: bắt buộc."],
    ["4. Điểm tập: bắt buộc."],
    ["5. Mã VTF: có thể để trống."],
    ["6. Ngày sinh, ngày bắt đầu, ngày hết hạn: dd/mm/yyyy."],
    ["7. Mã nội bộ sẽ do ứng dụng tự cấp."],
    ["8. Không nhập hội viên trùng."],
    [],
    ["DANH SÁCH ĐIỂM TẬP"],
    ["Lê Văn Tám"],
    ["Nghĩa Trung"],
    ["Đồng Tâm"],
    ["Thôn 6"],
    ["Phước Sơn"],
    ["Minh Hưng"],
    [],
    ["LOẠI HỌC PHÍ"],
    ["Ngày"],
    ["Tháng"],
    ["Quý"],
    [],
    ["TRẠNG THÁI"],
    ["Đang học"],
    ["Nghỉ học"],
  ]);

  guide["!cols"] = [{ wch: 65 }];

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "DanhSachHoiVien"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    guide,
    "HuongDan"
  );

  XLSX.writeFile(
    workbook,
    "TKD_Green_Mau_Import_Hoi_Vien.xlsx"
  );
}

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setRows([]);
    setResults([]);
    setMessage("");
    setProgress(0);

    if (!/\.xlsx$/i.test(file.name)) {
      setMessage("Chỉ hỗ trợ file Excel .xlsx");
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets["DanhSachHoiVien"];

      if (!sheet) {
        throw new Error("Không tìm thấy sheet DanhSachHoiVien.");
      }

      const data = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: true,
      });

      const headerRows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
      });
      const headers = (headerRows[0] || []).map(String);

      const missing = IMPORT_COLUMNS.filter(
        (column) => !headers.includes(column)
      );

      if (missing.length) {
        throw new Error(
          "Thiếu cột: " + missing.join(", ")
        );
      }

      const nonEmpty = data.filter((row) =>
        IMPORT_COLUMNS.some((key) =>
          String(row[key] ?? "").trim() !== ""
        )
      );

      setFilename(file.name);
      setRows(validateImportRows(nonEmpty, students, profile));
    } catch (error) {
      setMessage(error.message || "Không đọc được file Excel.");
    }
  }

  async function handleImport() {
    if (!canCreate || !validRows.length || invalidRows.length || busy) return;

    setBusy(true);
    setResults([]);
    setMessage("");
    setProgress(0);

    const completed = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];

      try {
        if (!hasLocationAccess(row.member.diemTap)) {
          throw new Error("Không có quyền thêm hội viên tại điểm tập này.");
        }
        const result = await importOneMember(row.member, profile);
        completed.push({
          rowNumber: row.rowNumber,
          success: true,
          code: result.maHoiVienNoiBo,
        });
      } catch (error) {
        completed.push({
          rowNumber: row.rowNumber,
          success: false,
          error: error.message,
        });

        // Dừng khi có lỗi để tránh tiếp tục nhập sai.
        setResults([...completed]);
        setMessage(
          `Đã dừng tại dòng ${row.rowNumber}: ${error.message}`
        );
        setBusy(false);
        return;
      }

      setProgress(i + 1);
      setResults([...completed]);
    }

    setMessage(
      `Hoàn thành: ${completed.length} hội viên đã được tạo.`
    );
    setBusy(false);
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="lg"
    >
      <DialogTitle>Import Excel hội viên</DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack
  direction={{ xs: "column", sm: "row" }}
  spacing={2}
>
  <Button
    variant="contained"
    color="success"
    onClick={downloadExcelTemplate}
    disabled={busy}
  >
    Tải file Excel mẫu
  </Button>

  <Button
    component="label"
    variant="outlined"
    disabled={busy}
  >
    Chọn file Excel (.xlsx)
    <input
      hidden
      type="file"
      accept=".xlsx"
      onChange={handleFile}
    />
  </Button>
</Stack>
          {filename && (
            <Typography variant="body2">
              File: {filename}
            </Typography>
          )}

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip label={`Tổng: ${rows.length}`} />
            <Chip
              color="success"
              label={`Hợp lệ: ${validRows.length}`}
            />
            <Chip
              color="error"
              label={`Cần kiểm tra: ${invalidRows.length}`}
            />
          </Stack>

          {message && (
            <Alert severity={message.startsWith("Hoàn thành") ? "success" : "warning"}>
              {message}
            </Alert>
          )}

          {busy && (
            <Box>
              <LinearProgress
                variant="determinate"
                value={
                  validRows.length
                    ? (progress / validRows.length) * 100
                    : 0
                }
              />
              <Typography variant="caption">
                Đã xử lý {progress}/{validRows.length}
              </Typography>
            </Box>
          )}

          <TableContainer sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Dòng</TableCell>
                  <TableCell>Họ tên</TableCell>
                  <TableCell>Ngày sinh</TableCell>
                  <TableCell>VTF</TableCell>
                  <TableCell>Điểm tập</TableCell>
                  <TableCell>Kiểm tra</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>{row.member.hoTen}</TableCell>
                    <TableCell>{formatDateVN(row.member.ngaySinh)}</TableCell>
                    <TableCell>{row.member.maHV}</TableCell>
                    <TableCell>{row.member.diemTap}</TableCell>
                    <TableCell>
                      {row.valid ? (
                        <Chip
                          size="small"
                          color="success"
                          label="Hợp lệ"
                        />
                      ) : (
                        <Typography color="error" variant="caption">
                          {row.errors.join("; ")}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {results.length > 0 && (
            <Typography variant="body2">
              Đã tạo thành công:{" "}
              {results.filter((r) => r.success).length} hội viên.
            </Typography>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Đóng
        </Button>
        <Button
          variant="contained"
          disabled={
            busy ||
            !validRows.length ||
            invalidRows.length > 0 ||
            results.length > 0
          }
          onClick={handleImport}
        >
          Xác nhận Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}
