import { useEffect, useMemo, useState } from "react";
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Divider, LinearProgress,
  MenuItem, Paper, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import {
  AssignmentTurnedInRounded, CalendarMonthRounded, CheckCircleRounded,
  CloseRounded, EventBusyRounded, FactCheckRounded, FileDownloadRounded,
  FilterAltOffRounded, GroupsRounded, HistoryRounded, HowToRegRounded,
  LocationOnRounded, RefreshRounded, SaveRounded, SearchRounded,
  WarningAmberRounded,
} from "@mui/icons-material";
import { auth, db } from "./firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  ATTENDANCE_LOCATIONS, ATTENDANCE_STATUSES,
  loadAttendance, saveAttendance,
} from "./attendanceService";

const STATUS = {
  present: "Có mặt",
  excused: "Vắng có phép",
  absent: "Vắng không phép",
  pending: "Chưa điểm danh",
};
const STATUS_STYLE = {
  [STATUS.present]: { main: "#087a4a", light: "#e5f5ec", icon: <CheckCircleRounded fontSize="small" /> },
  [STATUS.excused]: { main: "#b76c00", light: "#fff3db", icon: <EventBusyRounded fontSize="small" /> },
  [STATUS.absent]: { main: "#cb3447", light: "#ffebed", icon: <WarningAmberRounded fontSize="small" /> },
  [STATUS.pending]: { main: "#607a70", light: "#eef3f0", icon: <HistoryRounded fontSize="small" /> },
};
const PAGE_SIZE = 24;

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(-1)[0]?.charAt(0).toUpperCase() || "?";
}
function cleanStatus(value) {
  return ATTENDANCE_STATUSES.includes(value) ? value : STATUS.pending;
}
function exportCsv(rows, statuses, location, date) {
  const columns = ["STT", "Mã nội bộ", "VTF ID", "Họ và tên", "Điểm tập", "Ngày tập", "Trạng thái"];
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const values = rows.map((s, i) => [i + 1, s.maHoiVienNoiBo || "", s.maHV || "", s.name || "", location, formatDate(date), cleanStatus(statuses[s.id])]);
  const csv = "\uFEFF" + [columns, ...values].map(row => row.map(escape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `Diem_Danh_${String(location).replace(/[^\p{L}\p{N}-]+/gu, "_")}_${date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Stat({ label, count, icon, color, note }) {
  return (
    <Paper elevation={0} sx={{ p: 2, border: "1px solid #dceae1", borderRadius: 3.5, minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Typography color="text.secondary" fontWeight={700} sx={{ fontSize: 12 }}>{label}</Typography>
        <Box sx={{ color, display: "flex" }}>{icon}</Box>
      </Stack>
      <Typography sx={{ mt: 1, fontSize: 29, lineHeight: 1.1, fontWeight: 900, color }}>{count.toLocaleString("vi-VN")}</Typography>
      {note && <Typography variant="caption" color="text.secondary">{note}</Typography>}
    </Paper>
  );
}

function StatusAction({ label, value, current, icon, disabled, onClick, small = false }) {
  const active = current === value;
  const style = STATUS_STYLE[value];
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={label}
      startIcon={!small ? icon : undefined}
      variant={active ? "contained" : "outlined"}
      size="small"
      sx={{
        minHeight: 37, px: small ? 0.75 : 1.4, minWidth: 0, width: "100%",
        fontWeight: 800, borderRadius: 2.5, fontSize: small ? 11 : 12,
        textTransform: "none", whiteSpace: "nowrap",
        bgcolor: active ? style.main : "#fff",
        color: active ? "#fff" : style.main,
        borderColor: active ? style.main : "#cdded3",
        boxShadow: "none",
        "&:hover": { bgcolor: active ? style.main : style.light, borderColor: style.main, boxShadow: "none" },
      }}
    >{label}</Button>
  );
}

export default function AttendanceManagement({ students = [], profile, loading = false }) {
  const isAdmin = profile?.role === "admin";
  const canManage = isAdmin || (profile?.role === "hlv" && profile?.permissions?.attendance?.manage === true);
  const assigned = Array.isArray(profile?.diemTap) ? profile.diemTap : (profile?.diemTap ? [profile.diemTap] : []);
  const permitted = useMemo(() => isAdmin
    ? ATTENDANCE_LOCATIONS
    : ATTENDANCE_LOCATIONS.filter(loc => assigned.includes(loc)),
    [isAdmin, profile?.diemTap]);

  const [location, setLocation] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [statuses, setStatuses] = useState({});
  const [savedStatuses, setSavedStatuses] = useState({});
  const [approvedLeaveRequests, setApprovedLeaveRequests] = useState([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [sessionExists, setSessionExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tất cả");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const locationStudents = useMemo(() => students.filter(s =>
    s.location === location && (s.status || "Đang học") === "Đang học"
  ).slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi")), [students, location]);

  // Chỉ đọc đơn của điểm tập đang xem. Các trạng thái khác được lọc phía client
  // để không yêu cầu composite index. Không cập nhật điểm danh tự động.
  useEffect(() => {
    if (!location || !date || !profile) { setApprovedLeaveRequests([]); return undefined; }
    setLeaveLoading(true); setLeaveError(""); setApprovedLeaveRequests([]);
    return onSnapshot(query(collection(db, "leaveRequests"), where("diemTap", "==", location)), snap => {
      setApprovedLeaveRequests(snap.docs.map(d => ({ id:d.id, ...d.data() }))
        .filter(r => r.trangThai === "Đã duyệt" && r.tuNgay <= date && r.denNgay >= date));
      setLeaveLoading(false);
    }, err => {
      setLeaveError("Không đọc được đơn nghỉ đã duyệt: " + err.message);
      setLeaveLoading(false);
    });
  }, [location, date, profile?.uid]);
  const leaveByMember = useMemo(() => new Map(approvedLeaveRequests.map(r => [r.memberDocId, r])), [approvedLeaveRequests]);
  // Chỉ đề xuất cho người chưa có trạng thái lưu trong buổi này.
  const leaveSuggestions = useMemo(() => locationStudents.filter(s =>
    leaveByMember.has(s.id) &&
    cleanStatus(statuses[s.id]) === STATUS.pending &&
    cleanStatus(savedStatuses[s.id]) === STATUS.pending
  ), [locationStudents, leaveByMember, statuses, savedStatuses]);

  const dirtyIds = useMemo(() => locationStudents.filter(s => cleanStatus(statuses[s.id]) !== cleanStatus(savedStatuses[s.id])).map(s => s.id),
    [locationStudents, statuses, savedStatuses]);
  const dirty = dirtyIds.length;

  const counts = useMemo(() => {
    const out = Object.fromEntries(ATTENDANCE_STATUSES.map(status => [status, 0]));
    locationStudents.forEach(s => { out[cleanStatus(statuses[s.id])] += 1; });
    return out;
  }, [locationStudents, statuses]);
  const done = locationStudents.length - counts[STATUS.pending];
  const progress = locationStudents.length ? Math.round(done / locationStudents.length * 100) : 0;

  const filtered = useMemo(() => locationStudents.filter(s => {
    const term = search.trim().toLocaleLowerCase("vi");
    const matchesText = !term || [s.name, s.maHoiVienNoiBo, s.maHV, s.belt].join(" ").toLocaleLowerCase("vi").includes(term);
    return matchesText && (statusFilter === "Tất cả" || cleanStatus(statuses[s.id]) === statusFilter);
  }), [locationStudents, search, statusFilter, statuses]);
  const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, maxPage);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [location, date, search, statusFilter]);
  useEffect(() => {
    if (!permitted.includes(location)) {
      if (dirty && !window.confirm("Bạn có thay đổi điểm danh chưa lưu. Chuyển điểm tập và bỏ thay đổi?")) return;
      setLocation(permitted[0] || "");
    }
  }, [permitted, location]);

  useEffect(() => {
    if (!location || !date) { setStatuses({}); setSavedStatuses({}); setSessionExists(false); return; }
    let cancelled = false;
    setLoadingRecords(true);
    setStatuses({}); setSavedStatuses({});
    setMessage(""); setError("");
    loadAttendance(location, date)
      .then(({ records, session }) => {
        if (cancelled) return;
        const loaded = Object.fromEntries(Object.entries(records || {}).map(([id, record]) => [id, cleanStatus(record.trangThai)]));
        setStatuses(loaded);
        setSavedStatuses(loaded);
        setSessionExists(Boolean(session));
      })
      .catch(e => { if (!cancelled) setError(`Không đọc được điểm danh: ${e.message}`); })
      .finally(() => { if (!cancelled) setLoadingRecords(false); });
    return () => { cancelled = true; };
  }, [location, date, refreshKey]);

  const safeChangeContext = (setter, nextValue) => {
    if (busy || loadingRecords) return;
    if (dirty && !window.confirm(`Có ${dirty} võ sinh thay đổi chưa lưu. Bỏ thay đổi để chuyển buổi tập?`)) return;
    setter(nextValue);
  };
  const editable = canManage && !busy && !loading && !loadingRecords && !error && Boolean(location);
  const setStatus = (id, status) => {
    if (!editable) return;
    setStatuses(previous => ({ ...previous, [id]: status }));
    setMessage("");
  };
  const applyApprovedLeave = () => {
    if (!editable || leaveLoading || leaveError || !leaveSuggestions.length) return;
    if (!window.confirm(`Áp dụng VẮNG CÓ PHÉP cho ${leaveSuggestions.length} hội viên có đơn đã duyệt trong ngày ${formatDate(date)}? Các điểm danh đã lưu sẽ không bị ghi đè.`)) return;
    setStatuses(prev => ({ ...prev, ...Object.fromEntries(leaveSuggestions.map(s => [s.id, STATUS.excused])) }));
    setMessage("");
  };
  const markAllPresent = () => {
    if (!editable || !locationStudents.length) return;
    if (!window.confirm(`Đánh dấu CÓ MẶT cho toàn bộ ${locationStudents.length} võ sinh đang học tại ${location}? Bạn có thể chỉnh từng người trước khi lưu.`)) return;
    setStatuses(previous => ({ ...previous, ...Object.fromEntries(locationStudents.map(s => [s.id, STATUS.present])) }));
    setMessage("");
  };
  const discard = () => {
    if (!dirty || busy || loadingRecords) return;
    if (!window.confirm(`Bỏ ${dirty} thay đổi điểm danh chưa lưu?`)) return;
    setStatuses(savedStatuses);
    setMessage("");
  };
  const reload = () => {
    if (busy || loadingRecords) return;
    if (dirty && !window.confirm(`Có ${dirty} thay đổi chưa lưu. Tải lại sẽ bỏ các thay đổi này. Tiếp tục?`)) return;
    setRefreshKey(v => v + 1);
  };
  const handleSave = async () => {
    if (!editable || !locationStudents.length || !dirty) return;
    if (!window.confirm(`Lưu điểm danh ${location} ngày ${formatDate(date)} cho ${locationStudents.length} võ sinh? (${dirty} trạng thái đã thay đổi)`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      // Giữ nguyên API và cấu trúc Firebase của hệ thống TKD Green.
      const snapshot = { ...statuses };
      const result = await saveAttendance({ location, date, students: locationStudents, statuses: snapshot, user: auth.currentUser });
      setSavedStatuses(snapshot);
      setSessionExists(true);
      setMessage(`Đã lưu điểm danh ${result.count} võ sinh ngày ${formatDate(date)} thành công.`);
    } catch (e) {
      setError(`Lưu thất bại: ${e.message}. Hãy tải lại buổi này và đối chiếu trước khi lưu tiếp.`);
    } finally { setBusy(false); }
  };

  const personCard = (student) => {
    const current = cleanStatus(statuses[student.id]);
    const changed = cleanStatus(savedStatuses[student.id]) !== current;
    return (
      <Paper key={student.id} elevation={0} sx={{ border: "1px solid", borderColor: changed ? "#90c9a8" : "#dceae1", borderRadius: 3, overflow: "hidden", bgcolor: "white" }}>
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ px: 1.5, py: 1.3 }}>
          <Avatar sx={{ bgcolor: "#e2f3e9", color: "#087a4a", width: 39, height: 39, fontWeight: 900 }}>{initials(student.name)}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={800} fontSize={13.5} sx={{ overflowWrap: "anywhere" }}>{student.name || "Chưa có tên"}</Typography>
            <Typography color="text.secondary" fontSize={10.5} sx={{ overflowWrap: "anywhere" }}>{student.maHoiVienNoiBo || "Chưa có mã"} · VTF: {student.maHV || "Chưa cấp"}</Typography>
          </Box>
          <Tooltip title={current}>
            <Box sx={{ display: "flex", color: STATUS_STYLE[current].main }}>{STATUS_STYLE[current].icon}</Box>
          </Tooltip>
        </Stack>
        {leaveByMember.has(student.id) && <Typography sx={{px:1.5,pt:1,fontSize:11,color:"#a36a04",fontWeight:700}}>Có đơn xin nghỉ đã duyệt trong ngày này</Typography>}
        <Divider />
        <Stack direction="row" sx={{ px: 1, py: 1 }} gap={0.6}>
          <Box sx={{ flex: 1, minWidth: 0 }}><StatusAction small label="Có mặt" value={STATUS.present} current={current} disabled={!editable} onClick={() => setStatus(student.id, STATUS.present)} /></Box>
          <Box sx={{ flex: 1, minWidth: 0 }}><StatusAction small label="Vắng phép" value={STATUS.excused} current={current} disabled={!editable} onClick={() => setStatus(student.id, STATUS.excused)} /></Box>
          <Box sx={{ flex: 1, minWidth: 0 }}><StatusAction small label="Vắng KP" value={STATUS.absent} current={current} disabled={!editable} onClick={() => setStatus(student.id, STATUS.absent)} /></Box>
          {current !== STATUS.pending && <Tooltip title="Trả về chưa điểm danh"><span><Button disabled={!editable} onClick={() => setStatus(student.id, STATUS.pending)} size="small" sx={{ minWidth: 30, px: 0.4 }}><CloseRounded fontSize="small" /></Button></span></Tooltip>}
        </Stack>
      </Paper>
    );
  };

  return (
    <Box sx={{ width: "100%", minWidth: 0, mx: "auto", maxWidth: 1650, pb: 10, mt: 1.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={2} sx={{ mb: 2.5 }}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box sx={{ bgcolor: "#e2f3e9", color: "#087a4a", width: 48, height: 48, borderRadius: 3, display: "grid", placeItems: "center" }}><AssignmentTurnedInRounded /></Box>
          <Box>
            <Typography variant="h5" fontWeight={900} sx={{ color: "#173f2d", lineHeight: 1.3 }}>Điểm danh võ sinh</Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>TKD GREEN · ATTENDANCE PRO 2.0</Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" size="small" startIcon={<FileDownloadRounded />} disabled={!location || !date || !locationStudents.length || loadingRecords} onClick={() => exportCsv(locationStudents, statuses, location, date)}>Xuất CSV</Button>
          <Button variant="outlined" size="small" startIcon={<RefreshRounded />} disabled={busy || loadingRecords || !location} onClick={reload}>Tải lại</Button>
        </Stack>
      </Stack>

      <Paper elevation={0} sx={{ p: { xs: 1.5, md: 2.2 }, border: "1px solid #dceae1", borderRadius: 4, mb: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "minmax(150px,1fr) minmax(155px,1fr) minmax(230px,2fr) minmax(155px,1fr)" }, gap: 1.5 }}>
          <TextField fullWidth select size="small" label="Điểm tập" value={location} disabled={busy || loadingRecords} onChange={e => safeChangeContext(setLocation, e.target.value)}>
            {permitted.map(loc => <MenuItem key={loc} value={loc}>{loc}</MenuItem>)}
          </TextField>
          <TextField fullWidth size="small" type="date" label="Ngày tập" value={date} disabled={busy || loadingRecords} onChange={e => safeChangeContext(setDate, e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField fullWidth size="small" label="Tìm võ sinh" placeholder="Tên, mã nội bộ, VTF..." value={search} onChange={e => setSearch(e.target.value)} slotProps={{ input: { startAdornment: <SearchRounded sx={{ mr: 1, color: "#718b7c", fontSize: 19 }} /> } }} />
          <TextField fullWidth select size="small" label="Lọc trạng thái" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {["Tất cả", ...ATTENDANCE_STATUSES].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
        </Box>
        <Stack direction="row" alignItems="center" gap={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.3 }}>
          <LocationOnRounded fontSize="inherit" sx={{ color: "#087a4a" }} />
          <Typography color="text.secondary" variant="caption">{location || "Chưa chọn điểm tập"} · {formatDate(date)}</Typography>
          <Chip size="small" label={sessionExists ? "Buổi đã có dữ liệu" : "Buổi chưa được lưu"} sx={{ fontSize: 11, height: 24 }} />
          {dirty > 0 && <Chip size="small" color="warning" label={`${dirty} thay đổi chưa lưu`} />}
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {leaveError && <Alert severity="warning" sx={{ mb: 2 }}>{leaveError} · Vẫn có thể điểm danh thủ công.</Alert>}
      {leaveLoading && <Typography variant="caption" color="text.secondary">Đang kiểm tra đơn xin nghỉ đã duyệt...</Typography>}
      {leaveSuggestions.length > 0 && <Alert severity="info" sx={{ mb: 2 }} action={<Button size="small" variant="outlined" disabled={!editable || leaveLoading} onClick={applyApprovedLeave}>Áp dụng {leaveSuggestions.length} gợi ý</Button>}>Có {leaveSuggestions.length} võ sinh có đơn nghỉ đã duyệt nhưng chưa được điểm danh. Chỉ áp dụng sau khi kiểm tra; chưa lưu lên Firebase.</Alert>}

      {message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage("")}>{message}</Alert>}
      {!permitted.length && <Alert severity="warning" sx={{ mb: 2 }}>Tài khoản chưa được gán điểm tập phù hợp với cấu hình điểm danh hiện có.</Alert>}
      {!canManage && <Alert severity="info" sx={{ mb: 2 }}>Bạn chỉ có quyền xem điểm danh. Liên hệ Admin để được cấp quyền quản lý.</Alert>}
      {(loading || loadingRecords) && <LinearProgress sx={{ mb: 2, borderRadius: 2 }} />}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", md: "repeat(4,minmax(0,1fr))" }, gap: 1.5, mb: 2 }}>
        <Stat label="Có mặt" count={counts[STATUS.present]} color="#087a4a" icon={<CheckCircleRounded />} />
        <Stat label="Vắng có phép" count={counts[STATUS.excused]} color="#b76c00" icon={<EventBusyRounded />} />
        <Stat label="Vắng không phép" count={counts[STATUS.absent]} color="#cb3447" icon={<WarningAmberRounded />} />
        <Stat label="Chưa điểm danh" count={counts[STATUS.pending]} color="#607a70" icon={<HistoryRounded />} />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 265px" }, gap: 2, alignItems: "start" }}>
        <Box sx={{ minWidth: 0 }}>
          <Paper elevation={0} sx={{ p: { xs: 1.4, md: 2 }, borderRadius: 3.5, border: "1px solid #dceae1", mb: 1.5 }}>
            <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" gap={1.2}>
              <Box>
                <Typography fontWeight={900} sx={{ color: "#173f2d" }}>Danh sách võ sinh ({filtered.length}/{locationStudents.length})</Typography>
                <Typography color="text.secondary" variant="caption">Chạm vào trạng thái để cập nhật. Chỉ lưu khi nhấn “Lưu điểm danh”.</Typography>
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button size="small" variant="contained" color="success" startIcon={<HowToRegRounded />} disabled={!editable || !locationStudents.length} onClick={markAllPresent}>Có mặt tất cả</Button>
                <Button size="small" variant="outlined" startIcon={<FilterAltOffRounded />} onClick={() => { setSearch(""); setStatusFilter("Tất cả"); }}>Xóa lọc</Button>
              </Stack>
            </Stack>
          </Paper>
          {rows.length ? (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))", lg: "1fr", xl: "repeat(2,minmax(0,1fr))" }, gap: 1.2 }}>
              {rows.map(personCard)}
            </Box>
          ) : <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: "1px solid #dceae1", textAlign: "center" }}><GroupsRounded sx={{ fontSize: 38, color: "#b6c8bd" }} /><Typography color="text.secondary">Không có võ sinh phù hợp với bộ lọc.</Typography></Paper>}
          {maxPage > 1 && <Stack direction="row" alignItems="center" justifyContent="center" spacing={2} sx={{ mt: 2 }}>
            <Button size="small" variant="outlined" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Trước</Button>
            <Typography variant="caption">Trang {currentPage}/{maxPage}</Typography>
            <Button size="small" variant="outlined" disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)}>Sau</Button>
          </Stack>}
        </Box>
        <Paper elevation={0} sx={{ p: 2.2, border: "1px solid #dceae1", borderRadius: 3.5, position: { lg: "sticky" }, top: { lg: 85 } }}>
          <Stack direction="row" alignItems="center" spacing={1}><FactCheckRounded sx={{ color: "#087a4a" }} /><Typography fontWeight={900}>Tổng quan buổi tập</Typography></Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}><CalendarMonthRounded sx={{ fontSize: 14, verticalAlign: "middle", mr: .5 }} />{formatDate(date)} · {location}</Typography>
          <Divider sx={{ my: 2 }} />
          <Typography color="text.secondary" fontSize={12}>Tổng võ sinh đang học</Typography>
          <Typography sx={{ fontSize: 31, fontWeight: 900, color: "#173f2d" }}>{locationStudents.length}</Typography>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5, mb: .7 }}><Typography fontWeight={800} fontSize={12}>Tiến độ điểm danh</Typography><Typography fontSize={12} fontWeight={800}>{done}/{locationStudents.length} · {progress}%</Typography></Stack>
          <LinearProgress variant="determinate" value={progress} sx={{ height: 9, borderRadius: 5, bgcolor: "#e5eee8", "& .MuiLinearProgress-bar": { bgcolor: "#0a8b55", borderRadius: 5 } }} />
          <Stack spacing={1.2} sx={{ mt: 2 }}>
            {[STATUS.present, STATUS.excused, STATUS.absent, STATUS.pending].map(s => <Stack key={s} direction="row" justifyContent="space-between" alignItems="center"><Typography fontSize={12} sx={{ color: STATUS_STYLE[s].main }}>{s}</Typography><Typography fontSize={13} fontWeight={900}>{counts[s]}</Typography></Stack>)}
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Typography color="text.secondary" variant="caption">Có {dirty} thay đổi chưa lưu. Bộ lọc không ảnh hưởng tới danh sách lưu điểm danh của buổi tập.</Typography>
        </Paper>
      </Box>

      <Paper elevation={4} sx={{ position: "sticky", bottom: 8, zIndex: 8, mt: 2, px: 2, py: 1.4, borderRadius: 4, border: "1px solid #cfe4d5", bgcolor: "#fff" }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1.25}>
          <Box><Typography fontSize={12} fontWeight={900} color={dirty ? "warning.main" : "success.main"}>{dirty ? `${dirty} thay đổi chưa lưu` : "Đã đồng bộ"}</Typography><Typography variant="caption" color="text.secondary">{location || "Chưa chọn điểm tập"} · {formatDate(date)}</Typography></Box>
          <Stack direction="row" spacing={1}>
            <Button startIcon={<CloseRounded />} variant="outlined" disabled={!dirty || busy || loadingRecords} onClick={discard}>Bỏ thay đổi</Button>
            <Button startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SaveRounded />} variant="contained" color="success" disabled={!editable || !dirty || !locationStudents.length} onClick={handleSave} sx={{ minWidth: 170, fontWeight: 900 }}>Lưu điểm danh ({dirty})</Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
