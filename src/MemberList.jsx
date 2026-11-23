import useRetainedFilter from "./useRetainedFilter";
import { useMemo, useState } from "react";
import {
  Alert, Avatar, Box, Button, Chip, Divider, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Menu, Tooltip,
  MenuItem, Paper, Stack, TextField, Typography,
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
import PaymentsRounded from "@mui/icons-material/PaymentsRounded";
import MoreVertRounded from "@mui/icons-material/MoreVertRounded";
import ManageAccountsRounded from "@mui/icons-material/ManageAccountsRounded";
import DeleteForeverRounded from "@mui/icons-material/DeleteForeverRounded";
import { accountRequest } from "./accountApi";
import MemberAccountDialog from "./MemberAccountDialog";
import BeltBadge from "./BeltBadge";
import ImportMembers from "./ImportMembers";

const isQuitMember = m => ['nghi hoc','da nghi','nghi','ngung hoc'].includes(
  String(m?.status ?? m?.trangThai ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ')
);
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
  onCollectTuition,
  profile,
}) {
  const [search, setSearch] = useRetainedFilter(`tkd-green:${profile?.uid || profile?.email || 'guest'}:members:search`, "");
  const [statusFilter, setStatusFilter] = useRetainedFilter(`tkd-green:${profile?.uid || profile?.email || 'guest'}:members:statusFilter`, ALL);
  const [beltFilter, setBeltFilter] = useRetainedFilter(`tkd-green:${profile?.uid || profile?.email || 'guest'}:members:beltFilter`, ALL);
  const [viewMember, setViewMember] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [actionMenu, setActionMenu] = useState(null);
  const [accountMember, setAccountMember] = useState(null);
  const [deleteMember, setDeleteMember] = useState(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState("");
  const isAdmin = profile?.role === "admin";
  const closeMenu = () => setActionMenu(null);
  const openAccount = (student) => { closeMenu(); if (isAdmin) setAccountMember(student); };
  const openDelete = (student) => {
    closeMenu();
    if (!isAdmin) return;
    setDeleteMember(student);
    setConfirmCode(""); setConfirmChecked(false); setDeleteError("");
  };
  const memberConfirmCode = deleteMember ? String(
    deleteMember.maHoiVienNoiBo || deleteMember.maHV || deleteMember.id || ""
  ).trim() : "";
  const executeDelete = async () => {
    if (!isAdmin || deleteBusy || !deleteMember || !confirmChecked || confirmCode.trim() !== memberConfirmCode) return;
    setDeleteBusy(true); setDeleteError("");
    try {
      await accountRequest("deleteMemberForever", {
        memberDocId: deleteMember.id,
        confirmCode: memberConfirmCode,
      });
      setDeleteSuccess(`Đã xử lý yêu cầu xóa hội viên ${deleteMember.name}. Danh sách sẽ cập nhật từ Firebase.`);
      setDeleteMember(null);
    } catch (err) {
      setDeleteError(`Không thể xóa hội viên: ${err.message || "Lỗi không xác định"}`);
    } finally { setDeleteBusy(false); }
  };

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

  // Hiển thị toàn bộ dữ liệu ĐÃ được giới hạn quyền và lọc, không cắt theo trang.

  const clearFilters = () => {
    setSearch("");
    setStatusFilter(ALL);
    setBeltFilter(ALL);
    if (locations.includes("Tất cả điểm tập")) onLocationChange?.("Tất cả điểm tập");
  };

  const memberActions = (student, compact = false) => (
    <Stack direction="row" spacing={0.4} alignItems="center" justifyContent={compact ? "flex-end" : "flex-start"}
      sx={{ minWidth: 0, width: compact ? "100%" : "auto" }}>
      <Tooltip title="Xem hồ sơ">
        <IconButton aria-label={`Xem hồ sơ ${student.name}`} size="small" color="primary" onClick={() => setViewMember(student)}>
          <VisibilityRounded fontSize="small" />
        </IconButton>
      </Tooltip>
      {onEdit && canEditMember && <Tooltip title="Sửa hồ sơ">
        <IconButton aria-label={`Sửa hồ sơ ${student.name}`} size="small" onClick={() => onEdit(student)}>
          <EditRounded fontSize="small" />
        </IconButton>
      </Tooltip>}
      {(onCollectTuition || isAdmin) && <Tooltip title="Thêm thao tác">
        <IconButton size="small" aria-label={`Thao tác với ${student.name}`} aria-haspopup="menu"
          onClick={e => setActionMenu({ anchor: e.currentTarget, student })}>
          <MoreVertRounded fontSize="small" />
        </IconButton>
      </Tooltip>}
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
            {filteredStudents.map((student) => (
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
                    <BeltBadge level={student.belt} showName compact />
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
              <Box sx={{ minWidth: 660 }}>
                <Box sx={{ display: "grid", gridTemplateColumns: "minmax(105px,1.15fr) minmax(135px,1.6fr) minmax(90px,1fr) minmax(95px,1fr) minmax(94px,0.9fr) 98px", gap: 1.5, px: 2, py: 1.8, bgcolor: "action.hover" }}>
                  {["Mã nội bộ / VTF", "Họ và tên", "Điểm tập", "Cấp đai", "Trạng thái", "Thao tác"].map((title) => (
                    <Typography key={title} variant="caption" fontWeight={900} sx={cellSx}>{title}</Typography>
                  ))}
                </Box>
                {filteredStudents.map((student) => (
                  <Box key={student.id} sx={{ display: "grid", gridTemplateColumns: "minmax(105px,1.15fr) minmax(135px,1.6fr) minmax(90px,1fr) minmax(95px,1fr) minmax(94px,0.9fr) 98px", gap: 1.5, px: 2, py: 1.6, alignItems: "center", borderTop: "1px solid", borderColor: "divider", "&:hover": { bgcolor: "action.hover" } }}>
                    <Box sx={cellSx}>
                      <Typography variant="body2" fontWeight={800} color="success.main">{student.maHoiVienNoiBo || "Chưa cấp ID"}</Typography>
                      <Typography variant="caption" color="text.secondary">VTF: {student.maHV || "Chưa cấp"}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center" sx={cellSx}>
                      <Avatar sx={{ width: 34, height: 34, bgcolor: "success.dark", fontSize: 13 }}>{getInitial(student.name)}</Avatar>
                      <Typography variant="body2" fontWeight={800} sx={cellSx}>{student.name || "Chưa có tên"}</Typography>
                    </Stack>
                    <Typography variant="body2" sx={cellSx}>{student.location || "—"}</Typography>
                    <BeltBadge level={student.belt} compact />
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
        <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
          Đang hiển thị tất cả {filteredStudents.length.toLocaleString("vi-VN")} hội viên phù hợp · Không chia trang
        </Typography>
      )}

      {deleteSuccess && <Alert severity="success" onClose={() => setDeleteSuccess("")}>{deleteSuccess}</Alert>}
      <Menu anchorEl={actionMenu?.anchor || null} open={Boolean(actionMenu)} onClose={closeMenu}>
        {onCollectTuition && <MenuItem onClick={() => {
          const selected = actionMenu?.student; closeMenu();
          if (selected) { setViewMember(null); onCollectTuition(selected); }
        }}><PaymentsRounded fontSize="small" sx={{ mr: 1.2 }} />{isQuitMember(actionMenu?.student) ? "Thu nợ cũ" : "Thu học phí"}</MenuItem>}
        {isAdmin && <MenuItem onClick={() => openAccount(actionMenu?.student)}>
          <ManageAccountsRounded fontSize="small" sx={{ mr: 1.2 }} />Tài khoản
        </MenuItem>}
        {isAdmin && <Divider />}
        {isAdmin && <MenuItem sx={{ color: "error.main" }} onClick={() => openDelete(actionMenu?.student)}>
          <DeleteForeverRounded fontSize="small" sx={{ mr: 1.2 }} />Xóa hội viên
        </MenuItem>}
      </Menu>
      <MemberAccountDialog open={Boolean(accountMember)} member={accountMember}
        onClose={() => setAccountMember(null)} />
      <Dialog open={Boolean(deleteMember)} onClose={deleteBusy ? undefined : () => setDeleteMember(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800, color: "error.main" }}>Xóa vĩnh viễn hội viên</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="error">Thao tác này có thể xóa hồ sơ, tài khoản đăng nhập và dữ liệu liên quan, bao gồm lịch sử học phí, thi và điểm danh. Không thể hoàn tác. Chỉ thực hiện sau khi sao lưu và đối soát.</Alert>
            <Typography>Hội viên: <strong>{deleteMember?.name || ""}</strong></Typography>
            <Typography variant="body2">Mã xác nhận: <strong>{memberConfirmCode}</strong></Typography>
            <TextField fullWidth label="Nhập chính xác mã hội viên" value={confirmCode} disabled={deleteBusy}
              onChange={e => setConfirmCode(e.target.value)} />
            <Button variant={confirmChecked ? "contained" : "outlined"} color={confirmChecked ? "error" : "inherit"}
              onClick={() => setConfirmChecked(v => !v)} disabled={deleteBusy}>
              {confirmChecked ? "Đã xác nhận xóa vĩnh viễn" : "Tôi hiểu việc xóa không thể hoàn tác"}
            </Button>
            {deleteError && <Alert severity="error">{deleteError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button disabled={deleteBusy} onClick={() => setDeleteMember(null)}>Hủy</Button>
          <Button variant="contained" color="error" disabled={deleteBusy || !confirmChecked || confirmCode.trim() !== memberConfirmCode}
            onClick={executeDelete}>{deleteBusy ? "Đang xóa..." : "Xóa vĩnh viễn"}</Button>
        </DialogActions>
      </Dialog>
      <MemberProfile open={Boolean(viewMember)} onClose={() => setViewMember(null)} member={viewMember} profile={profile} onCollectTuition={onCollectTuition} />
      <ImportMembers open={importOpen && canCreateMember} onClose={() => setImportOpen(false)} students={students} profile={profile} />
    </Box>
  );
}
