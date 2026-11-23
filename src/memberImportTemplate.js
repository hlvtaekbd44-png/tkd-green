import * as XLSX from "xlsx";
import { IMPORT_COLUMNS } from "./memberImportService";
import { EDUCATION_LEVELS } from "./educationLevels";

/** Tạo file tại thời điểm nhấn nút: không bao giờ dùng danh sách điểm tập viết cứng. */
export function downloadMemberTemplate(locationNames) {
  const names = [...new Set(locationNames.map(x => String(x || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "vi"));
  if (!names.length) throw new Error("Không có điểm tập đang hoạt động và được cấp quyền. Hãy kiểm tra Cài đặt điểm tập.");

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([IMPORT_COLUMNS]);
  worksheet["!cols"] = [25, 15, 12, 22, 18, 24, 15, 20, 18, 18, 18, 15, 30]
    .map(wch => ({ wch }));
  // Giữ nguyên định dạng ngày và 13 cột (bổ sung Trình độ văn hóa).
  for (const col of ["B", "I", "J"]) {
    for (let row = 2; row <= 1001; row++) worksheet[`${col}${row}`] = { t: "z", z: "dd/mm/yyyy" };
  }
  worksheet["!ref"] = "A1:M1001";
  XLSX.utils.book_append_sheet(workbook, worksheet, "DanhSachHoiVien");

  const help = [
    ["HƯỚNG DẪN IMPORT HỘI VIÊN TKD GREEN"],
    ["Danh sách điểm tập được tải trực tiếp từ hệ thống khi tạo file."],
    ["Khi có thay đổi trong Cài đặt điểm tập, hãy tải lại file mẫu mới."],
    ["Giữ nguyên 13 tên cột tại DanhSachHoiVien; bắt đầu nhập từ dòng 2."],
    ["Điểm tập: bắt buộc, nhập chính xác tên trong danh sách bên dưới."],
    ["Trình độ văn hóa: có thể để trống; nếu nhập hãy chọn đúng 1 trong 6 giá trị."],
    ["TÙY CHỌN: Mã VTF, SĐT phụ huynh, Ngày bắt đầu, Ngày hết hạn, Loại học phí."],
    ["Màu đai không cần nhập; tự quy đổi từ Cấp đai."],
    ["Khi cập nhật hồ sơ cũ, các ô bỏ trống KHÔNG xóa giá trị đang lưu."],
    ["Vui lòng kiểm tra các thay đổi ở màn hình xem trước rồi mới xác nhận Import."],
    ["Ngày tháng nếu có: dd/mm/yyyy. VTF + Điểm tập trùng: so sánh để cập nhật hoặc bỏ qua."],
    [], ["DANH SÁCH ĐIỂM TẬP HIỆN CÓ"],
    ...names.map(name => [name]),
    [], ["TRÌNH ĐỘ VĂN HÓA"],
    ...EDUCATION_LEVELS.map(level => [level]),
    [], ["LOẠI HỌC PHÍ"], ["Ngày"], ["Tháng"], ["Quý"],
    [], ["TRẠNG THÁI"], ["Đang học"], ["Nghỉ học"],
  ];
  const guide = XLSX.utils.aoa_to_sheet(help);
  guide["!cols"] = [{ wch: 95 }];
  XLSX.utils.book_append_sheet(workbook, guide, "HuongDan");
  XLSX.writeFile(workbook, "TKD_Green_Mau_Import_Hoi_Vien.xlsx");
}
