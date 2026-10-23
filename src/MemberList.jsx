import { useEffect, useMemo, useState } from "react";
import {
  Alert, Avatar, Box, Button, Chip, Divider, FormControl, InputAdornment,
  MenuItem, Pagination, Paper, Select, Stack, TextField, Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
import HowToRegRounded from "@mui/icons-material/HowToRegRounded";
import PauseCircleOutlineRounded from "@mui/icons-material/PauseCircleOutlineRounded";
import PersonOffRounded from "@mui/icons-material/PersonOffRounded";
import FilterAltOffRounded from "@mui/icons-material/FilterAltOffRounded";
import MemberProfile from "./MemberProfile";
import ImportMembers from "./ImportMembers";
import MemberAccountDialog from "./MemberAccountDialog";
import PersonAddAlt1Rounded from "@mui/icons-material/PersonAddAlt1Rounded";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const ALL = "Tất cả";
const cellSx = { minWidth: 0, overflowWrap: "anywhere" };

function memberStatus(value) {
  return String(value || "Chưa cập nhật").trim();
}

function getStatusColor(value) {
  if (value === "Đang học") return "success";
  if (value === "Tạm nghỉ") return "warning";
  if (value === "Nghỉ học") return "error";
  return "default";
}

function getInitial(name) {
  const words = String(name || "").trim().split(/\s+/);
  return (words[words.length - 1] || "?").charAt(0).toUpperCase();
}

function Metric({ title, value, icon, color = "primary.main" }) {
  return (
    <Paper elevation={0} sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3, border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Typography variant="caption" color="text.secondary" fontWeight={700}>{title}</Typography>
        <Box sx={{ color, display: "flex" }}>{icon}</Box>
      </Stack>
      <Typography sx={{ mt: 1, fontSize: { xs: 25, sm: 31 }, fontWeight: 900, color, lineHeight: 1.15 }}>
        {value.toLocaleString("vi-VN")}
      </Typography>
    </Paper>
  );
}

export default function MemberList({
  students = [],
  loading = false,
  error = "",
  location = "Tất cả điểm tập",
  onLocationChange,
  locations = [],
  onAdd,
  onEdit,
  profile,
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [beltFilter, setBeltFilter] = useState(ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [viewMember, setViewMember] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [accountMember, setAccountMember] = useState(null);

  const canCreateMember = profile?.role === "admin" ||
    (profile?.role === "hlv" && profile?.permissions?.members?.create === true);
  const canEditMember = profile?.role === "admin" ||
    (profile?.role === "hlv" && profile?.permissions?.members?.edit === true);

  // Chỉ tính toán trên dữ liệu đã được App.jsx cấp theo quyền tài khoản.
  const locationStudents = useMemo(() => students.filter((s) =>
    location === "Tất cả điểm tập" || s.location === location
  ), [students, location]);

  const statusOptions = useMemo(() => [ALL, ...new Set(locationStudents.map((s) => memberStatus(s.status)))].sort((a, b) =>
    a === ALL ? -1 : b === ALL ? 1 : a.localeCompare(b, "vi")
  ), [locationStudents]);

  const beltOptions = useMemo(() => [ALL, ...new Set(locationStudents.map((s) => String(s.belt || "Chưa cập nhật")))].sort((a, b) =>
    a === ALL ? -1 : b === ALL ? 1 : a.localeCompare(b, "vi")
  ), [locationStudents]);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    return locationStudents.filter((s) => {
      const text = [s.maHoiVienNoiBo, s.maHV, s.name, s.location].filter(Boolean).join(" ").toLocaleLowerCase("vi");
      return text.includes(keyword)
        && (statusFilter === ALL || memberStatus(s.status) === statusFilter)
        && (beltFilter === ALL || String(s.belt || "Chưa cập nhật") === beltFilter);
    });
  }, [locationStudents, search, statusFilter, beltFilter]);

  const counts = useMemo(() => ({
    total: locationStudents.length,
    active: locationStudents.filter((s) => memberStatus(s.status) === "Đang học").length,
    paused: locationStudents.filter((s) => memberStatus(s.status) === "Tạm nghỉ").length,
    inactive: locationStudents.filter((s) => memberStatus(s.status) === "Nghỉ học").length,
  }), [locationStudents]);

  useEffect(() => { setPage(1); }, [search, location, statusFilter, beltFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const from = filteredStudents.length ? (currentPage - 1) * pageSize + 1 : 0;
  const to = Math.min(currentPage * pageSize, filteredStudents.length);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter(ALL);
    setBeltFilter(ALL);
    if (locations.includes("Tất cả điểm tập")) onLocationChange?.("Tất cả điểm tập");
  };

  const memberActions = (student, compact = false) => (
    <Stack direction="row" spacing={1} sx={{ width: compact ? "100%" : "auto" }}>
      <Button size="small" variant="outlined" startIcon={<VisibilityRounded />} onClick={() => setViewMember(student)}
        sx={{ borderRadius: 2, minHeight: 39, flex: compact ? 1 : "none", whiteSpace: "nowrap" }}>Xem</Button>
      {profile?.role === "admin" && <Button size="small" variant="outlined" startIcon={<PersonAddAlt1Rounded />} onClick={() => setAccountMember(student)}
        sx={{ borderRadius: 2, minHeight: 39, whiteSpace: "nowrap" }}>Cấp tài khoản</Button>}
      <Button size="small" variant="outlined" startIcon={<EditRounded />} onClick={() => onEdit?.(student)} disabled={!onEdit || !canEditMember}
        sx={{ borderRadius: 2, minHeight: 39, flex: compact ? 1 : "none", whiteSpace: "nowrap" }}>Sửa hồ sơ</Button>
    </Stack>
  );

  return (
    <Box sx={{ display: "grid", gap: 2.5, mt: 2, minWidth: 0, pb: 3 }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} spacing={2}>
        <Box>
          <Typography variant="overline" sx={{ color: "success.main", fontWeight: 900, letterSpacing: 1.2 }}>TKD GREEN · MEMBER MANAGEMENT</Typography>
          <Typography variant="h5" fontWeight={900} sx={{ fontSize: { xs: 23, sm: 28 } }}>Quản lý hội viên</Typography>
          <Typography variant="body2" color="text.secondary">Theo dõi hồ sơ, cấp đai và tình trạng học tập của võ sinh</Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {canCreateMember && (
            <Button variant="outlined" startIcon={<UploadFileRounded />} onClick={() => setImportOpen(true)} sx={{ borderRadius: 2, minHeight: 44 }}>Import Excel</Button>
          )}
          <Button variant="contained" startIcon={<AddRounded />} onClick={onAdd} disabled={!onAdd || !canCreateMember} sx={{ borderRadius: 2, minHeight: 44, fontWeight: 800 }}>Thêm hội viên</Button>
        </Stack>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }, gap: 1.5 }}>
        <Metric title="Tổng hội viên" value={counts.total} icon={<GroupsRounded />} />
        <Metric title="Đang học" value={counts.active} color="success.main" icon={<HowToRegRounded />} />
        <Metric title="Tạm nghỉ" value={counts.paused} color="warning.main" icon={<PauseCircleOutlineRounded />} />
        <Metric title="Nghỉ học" value={counts.inactive} color="error.main" icon={<PersonOffRounded />} />
      </Box>

      <Paper elevation={0} sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "minmax(250px, 2fr) repeat(3, minmax(145px, 1fr))" }, gap: 1.5 }}>
          <TextField fullWidth size="small" label="Tìm kiếm hội viên" placeholder="Họ tên, mã nội bộ, VTF ID..." value={search} onChange={(e) => setSearch(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }} />
          <TextField select fullWidth size="small" label="Điểm tập" value={location} onChange={(e) => onLocationChange?.(e.target.value)} disabled={!onLocationChange}>
            {locations.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </TextField>
          <TextField select fullWidth size="small" label="Trạng thái" value={statusOptions.includes(statusFilter) ? statusFilter : ALL} onChange={(e) => setStatusFilter(e.target.value)}>
            {statusOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </TextField>
          <TextField select fullWidth size="small" label="Cấp đai" value={beltOptions.includes(beltFilter) ? beltFilter : ALL} onChange={(e) => setBeltFilter(e.target.value)}>
            {beltOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </TextField>
        </Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5 }}>
          <Typography variant="body2" color="text.secondary">Tìm thấy <Box component="span" sx={{ fontWeight: 900, color: "text.primary" }}>{filteredStudents.length.toLocaleString("vi-VN")}</Box> hội viên</Typography>
          <Button size="small" startIcon={<FilterAltOffRounded />} onClick={clearFilters}>Xóa bộ lọc</Button>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}
      {loading ? (
        <Paper elevation={0} sx={{ p: 4, borderRadius: 3, textAlign: "center" }}>Đang tải hội viên từ Firebase...</Paper>
      ) : filteredStudents.length === 0 ? (
        <Paper elevation={0} sx={{ p: 5, borderRadius: 3, textAlign: "center", border: "1px solid", borderColor: "divider" }}>
          <GroupsRounded sx={{ fontSize: 44, color: "text.disabled", mb: 1 }} />
          <Typography fontWeight={700}>Không có hội viên phù hợp</Typography>
          <Typography variant="body2" color="text.secondary">Hãy thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</Typography>
        </Paper>
      ) : (
        <>
          {/* Điện thoại: thẻ hội viên, không phải cuộn bảng ngang */}
          <Box sx={{ display: { xs: "grid", md: "none" }, gap: 1.5 }}>
            {pageStudents.map((student) => (
              <Paper key={student.id} elevation={0} sx={{ p: 1.75, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Avatar sx={{ width: 45, height: 45, bgcolor: "success.dark", color: "common.white", fontWeight: 800 }}>{getInitial(student.name)}</Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={800} sx={{ overflowWrap: "anywhere" }}>{student.name || "Chưa có tên"}</Typography>
                    <Typography variant="caption" color="text.secondary">{student.maHoiVienNoiBo || "Chưa cấp ID"} · VTF: {student.maHV || "Chưa cấp"}</Typography>
                  </Box>
                </Stack>
                <Divider sx={{ my: 1.5 }} />
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary">{student.location || "Chưa có điểm tập"}</Typography>
                    <Typography variant="body2" fontWeight={700}>{student.belt || "Chưa cập nhật cấp đai"}</Typography>
                  </Box>
                  <Chip size="small" variant="outlined" color={getStatusColor(student.status)} label={memberStatus(student.status)} />
                </Stack>
                <Box sx={{ mt: 1.5 }}>{memberActions(student, true)}</Box>
              </Paper>
            ))}
          </Box>

          {/* Máy tính: bảng rõ ràng, có dòng hover */}
          <Paper elevation={0} sx={{ display: { xs: "none", md: "block" }, borderRadius: 3, overflow: "hidden", border: "1px solid", borderColor: "divider" }}>
            <Box sx={{ overflowX: "auto" }}>
              <Box sx={{ minWidth: 870 }}>
                <Box sx={{ display: "grid", gridTemplateColumns: "1.2fr 1.7fr 1fr 1fr 1fr 190px", gap: 1.5, px: 2, py: 1.8, bgcolor: "action.hover" }}>
                  {["Mã nội bộ / VTF", "Họ và tên", "Điểm tập", "Cấp đai", "Trạng thái", "Thao tác"].map((title) => (
                    <Typography key={title} variant="caption" fontWeight={900} sx={cellSx}>{title}</Typography>
                  ))}
                </Box>
                {pageStudents.map((student) => (
                  <Box key={student.id} sx={{ display: "grid", gridTemplateColumns: "1.2fr 1.7fr 1fr 1fr 1fr 190px", gap: 1.5, px: 2, py: 1.6, alignItems: "center", borderTop: "1px solid", borderColor: "divider", "&:hover": { bgcolor: "action.hover" } }}>
                    <Box sx={cellSx}>
                      <Typography variant="body2" fontWeight={800} color="success.main">{student.maHoiVienNoiBo || "Chưa cấp ID"}</Typography>
                      <Typography variant="caption" color="text.secondary">VTF: {student.maHV || "Chưa cấp"}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center" sx={cellSx}>
                      <Avatar sx={{ width: 34, height: 34, bgcolor: "success.dark", fontSize: 13 }}>{getInitial(student.name)}</Avatar>
                      <Typography variant="body2" fontWeight={800} sx={cellSx}>{student.name || "Chưa có tên"}</Typography>
                    </Stack>
                    <Typography variant="body2" sx={cellSx}>{student.location || "—"}</Typography>
                    <Typography variant="body2" sx={cellSx}>{student.belt || "Chưa cập nhật"}</Typography>
                    <Box><Chip size="small" variant="outlined" color={getStatusColor(student.status)} label={memberStatus(student.status)} /></Box>
                    {memberActions(student)}
                  </Box>
                ))}
              </Box>
            </Box>
          </Paper>
        </>
      )}

      {!loading && filteredStudents.length > 0 && (
        <Paper elevation={0} sx={{ px: 2, py: 1.5, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
          <Stack direction={{ xs: "column", sm: "row" }} alignItems="center" justifyContent="space-between" spacing={1.5}>
            <Typography variant="caption" color="text.secondary">Hiển thị {from}–{to} / {filteredStudents.length.toLocaleString("vi-VN")} hội viên</Typography>
            <Pagination count={totalPages} page={currentPage} onChange={(_, value) => setPage(value)} color="primary" size="small" siblingCount={0} />
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" color="text.secondary">Số dòng/trang</Typography>
              <FormControl size="small">
                <Select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} sx={{ minWidth: 74 }}>
                  {PAGE_SIZE_OPTIONS.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
          </Stack>
        </Paper>
      )}

      <MemberAccountDialog open={Boolean(accountMember)} member={accountMember} onClose={() => setAccountMember(null)} />
      <MemberProfile open={Boolean(viewMember)} onClose={() => setViewMember(null)} member={viewMember} profile={profile} />
      <ImportMembers open={importOpen && canCreateMember} onClose={() => setImportOpen(false)} students={students} profile={profile} />
    </Box>
  );
}
