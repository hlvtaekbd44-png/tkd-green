import LocationManagement from "./LocationManagement";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { db, auth } from "./firebase";
import { accountRequest, normalizeUsername, validUsername } from "./accountApi";


const MODULES = [
  { key: "dashboard", label: "Tổng quan", actions: [["view", "Xem"]] },
  { key: "members", label: "Hội viên", actions: [["view", "Xem"], ["create", "Thêm"], ["edit", "Sửa"], ["delete", "Xóa"]] },
  { key: "tuition", label: "Học phí", actions: [["view", "Xem"], ["collect", "Thu học phí"]] },
  { key: "exams", label: "Thi cấp", actions: [["view", "Xem"], ["manage", "Quản lý"]] },
  { key: "attendance", label: "Điểm danh", actions: [["view", "Xem"], ["manage", "Điểm danh"]] },
  { key: "reports", label: "Báo cáo", actions: [["view", "Xem"]] },
];
const LOCATION_MODULES = ["members", "tuition", "exams", "attendance", "reports"];
const blankPermissions = () => Object.fromEntries(MODULES.map(m => [m.key, Object.fromEntries(m.actions.map(([action]) => [action, false]))]));
const blankLocations = () => Object.fromEntries(LOCATION_MODULES.map(key => [key, []]));

export default function SettingsManagement({ profile }) {
  const [coaches, setCoaches] = useState([]);
  const [locationNames, setLocationNames] = useState([]);
  const [settingsTab, setSettingsTab] = useState("locations");
  const [selectedUid, setSelectedUid] = useState("");
  const [permissions, setPermissions] = useState(blankPermissions);
  const [locationPermissions, setLocationPermissions] = useState(blankLocations);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dirty, setDirty] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newCoach, setNewCoach] = useState({ name: "", username: "", password: "" });
  const [creating, setCreating] = useState(false);
  const [deleteCoachOpen, setDeleteCoachOpen] = useState(false);
  const [deleteCoachChecked, setDeleteCoachChecked] = useState(false);

  useEffect(() => {
    if (profile?.role !== "admin") return;
    return onSnapshot(collection(db, "users"), snapshot => {
      setCoaches(snapshot.docs.filter(d => d.data().role === "hlv").map(d => ({ uid: d.id, ...d.data() })));
      setLoading(false);
    }, err => {
      setError(`Không tải được tài khoản: ${err.message}`);
      setLoading(false);
    });
  }, [profile?.role]);

  useEffect(() => {
    if (profile?.role !== "admin") return;
    return onSnapshot(collection(db, "locations"), snapshot => {
      const names = snapshot.docs.filter(d => d.data().deleted !== true).map(d => d.data().name).filter(Boolean);
      setLocationNames([...new Set(names)].sort((a, b) => a.localeCompare(b, "vi")));
    }, err => console.error("Không tải được danh sách điểm tập:", err));
  }, [profile?.role]);

  const coach = useMemo(() => coaches.find(c => c.uid === selectedUid), [coaches, selectedUid]);
  useEffect(() => {
    const p = blankPermissions();
    const l = blankLocations();
    if (coach) {
      for (const m of MODULES) for (const [action] of m.actions) p[m.key][action] = coach.permissions?.[m.key]?.[action] === true;
      for (const key of LOCATION_MODULES) l[key] = locationNames.filter(x => (coach.locationPermissions?.[key] || []).includes(x));
    }
    setPermissions(p);
    setLocationPermissions(l);
    setDirty(false);
    setSuccess("");
  }, [coach, locationNames]);

  if (profile?.role !== "admin") return <Alert severity="error">Chỉ Admin được truy cập Cài đặt.</Alert>;

  const togglePermission = (module, action, checked) => {
    setPermissions(prev => ({ ...prev, [module]: { ...prev[module], [action]: checked } }));
    setDirty(true);
    setSuccess("");
  };
  const toggleLocation = (module, location, checked) => {
    setLocationPermissions(prev => ({ ...prev, [module]: checked ? [...prev[module], location] : prev[module].filter(x => x !== location) }));
    setDirty(true);
    setSuccess("");
  };
  const createCoach = async () => {
    const name = newCoach.name.trim();
    const username = normalizeUsername(newCoach.username);
    if (!name || !validUsername(username) || newCoach.password.length < 12) {
      setError("Nhập họ tên, tên đăng nhập hợp lệ và mật khẩu ít nhất 12 ký tự."); return;
    }
    if (busy || creating) return;
    setCreating(true); setError(""); setSuccess("");
    try {
      const result = await accountRequest("createCoach", { name, username, password: newCoach.password });
      setSelectedUid(result.account.uid);
      setNewCoach({ name: "", username: "", password: "" });
      setCreateOpen(false);
      setSuccess("Đã cấp tài khoản HLV. Hãy chọn quyền và điểm tập rồi bấm Lưu phân quyền.");
    } catch (err) { setError(`Tạo tài khoản thất bại: ${err.message}`); }
    finally { setCreating(false); }
  };

  const changeCoachStatus = async () => {
    if (!coach || busy) return;
    const active = coach.active === false;
    if (!window.confirm(`Bạn chắc chắn muốn ${active ? "kích hoạt" : "ngừng kích hoạt"} HLV ${coach.tenHienThi || coach.username || coach.email}?`)) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await accountRequest("setActive", { uid: coach.uid, active });
      setSuccess(active ? "Đã kích hoạt HLV." : "Đã ngừng kích hoạt HLV.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const deleteCoach = async () => {
    if (!coach || busy) return;
    const label = coach.username || coach.email || coach.uid;
    if (!deleteCoachOpen || !deleteCoachChecked) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await accountRequest("deleteCoach", { uid: coach.uid, confirmUsername: label });
      setSelectedUid("");
      setDeleteCoachOpen(false);
      setDeleteCoachChecked(false);
      setSuccess(`Đã xóa tài khoản HLV ${label}. Lịch sử nghiệp vụ của HLV vẫn được giữ.`);
    } catch (e) { setError(`Không xóa được HLV: ${e.message}`); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!coach || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const allowed = Object.fromEntries(LOCATION_MODULES.map(key => [key, locationPermissions[key].filter(x => locationNames.includes(x))]));
      const p = structuredClone(permissions);
      // Quyền xem là điều kiện tiên quyết cho quyền thao tác.
      for (const m of MODULES) if (!p[m.key].view) for (const action of Object.keys(p[m.key])) p[m.key][action] = false;
      // App.jsx đọc profile.diemTap để truy vấn collection members.
      // Chỉ đồng bộ các điểm tập có quyền xem Hội viên, không lấy hợp
      // các điểm tập của Học phí / Thi cấp / Điểm danh để tránh mở rộng
      // phạm vi đọc hồ sơ hội viên ngoài quyền đã cấp.

      const memberLocations = p.members.view ? allowed.members : [];

        await updateDoc(doc(db, "users", coach.uid), {
        permissions: p,
        locationPermissions: allowed,
        diemTap: memberLocations,
        });
      setDirty(false);
      setSuccess("Đã lưu phân quyền và đồng bộ điểm tập Hội viên cho HLV.");
    } catch (err) {
      setError(`Lưu thất bại: ${err.message}`);
    } finally { setBusy(false); }
  };

  return <Stack spacing={3}>
    <Typography variant="h5" fontWeight={800}>Cài đặt hệ thống</Typography>
    <Stack direction="row" spacing={1}>
      <Button variant={settingsTab === "locations" ? "contained" : "outlined"} onClick={() => setSettingsTab("locations")}>Quản lý điểm tập</Button>
      <Button variant={settingsTab === "coaches" ? "contained" : "outlined"} onClick={() => setSettingsTab("coaches")}>Phân quyền HLV</Button>
    </Stack>
    {settingsTab === "locations" ? <LocationManagement /> : <>
    <Alert severity="info">Tạo HLV bằng tên đăng nhập và mật khẩu; tài khoản mới chưa có quyền nào cho đến khi Admin cấp. Chức năng phân quyền cần được bảo vệ bằng Firestore Rules.</Alert>
    <Paper sx={{ p: 3, borderRadius: 3 }}>
      <Button variant="outlined" onClick={() => setCreateOpen(v => !v)} disabled={creating}>
        {createOpen ? "Đóng form tạo HLV" : "+ Tạo tài khoản HLV"}
      </Button>
      {createOpen && <Stack spacing={2} sx={{ mt: 2 }}>
        <TextField label="Họ và tên HLV" fullWidth value={newCoach.name} onChange={e => setNewCoach(v => ({...v, name: e.target.value}))} />
        <TextField label="Tên đăng nhập HLV" fullWidth value={newCoach.username} onChange={e => setNewCoach(v => ({...v, username: e.target.value}))} />
        <TextField label="Mật khẩu khởi tạo (ít nhất 12 ký tự)" type="password" fullWidth value={newCoach.password} onChange={e => setNewCoach(v => ({...v, password: e.target.value}))} />
        <Button variant="contained" disabled={creating} onClick={createCoach}>
          {creating ? "Đang tạo tài khoản..." : "Xác nhận tạo HLV"}
        </Button>
      </Stack>}
    </Paper>
    {error && <Alert severity="error">{error}</Alert>}
    {success && <Alert severity="success">{success}</Alert>}
    <Paper sx={{ p: 3, borderRadius: 3 }}>
      {loading ? <CircularProgress size={24} /> : <TextField select fullWidth label="Chọn tài khoản HLV" value={selectedUid} onChange={e => { if (dirty && !window.confirm("Bỏ các thay đổi chưa lưu?")) return; setSelectedUid(e.target.value); }}>
        {coaches.map(c => <MenuItem key={c.uid} value={c.uid}>{c.tenHienThi || c.displayName || c.username || c.email || c.uid} {c.active === false ? "(Đã khóa)" : ""}</MenuItem>)}
      </TextField>}
      {!loading && coaches.length === 0 && <Typography sx={{ mt: 2 }}>Chưa tìm thấy tài khoản HLV trong collection users.</Typography>}
    </Paper>
    {coach && <>
      <Paper sx={{ p: 2, borderRadius: 3 }}>
        <Stack direction={{ xs:"column", sm:"row" }} alignItems={{ sm:"center" }} justifyContent="space-between" spacing={2}>
          <Typography fontWeight={700}>Tài khoản: {coach.username || coach.email || coach.uid} · {coach.active === false ? "Ngừng kích hoạt" : "Đã kích hoạt"}</Typography>
          <Button color={coach.active === false ? "success" : "error"} variant="outlined" disabled={busy} onClick={changeCoachStatus}>
            {coach.active === false ? "Kích hoạt lại" : "Ngừng kích hoạt"}
          </Button>
        </Stack>
      </Paper>
      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={700} gutterBottom>1. Quyền chức năng</Typography>
        {MODULES.map(m => <Box key={m.key} sx={{ py: 1.5 }}>
          <Typography fontWeight={700}>{m.label}</Typography>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {m.actions.map(([action, label]) => <FormControlLabel key={action} control={<Checkbox checked={!!permissions[m.key]?.[action]} onChange={e => togglePermission(m.key, action, e.target.checked)} />} label={label} />)}
          </Stack><Divider />
        </Box>)}
      </Paper>
      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={700} gutterBottom>2. Điểm tập được phép quản lý</Typography>
        {locationNames.length === 0 && <Alert severity="warning">Chưa có điểm tập trong collection locations. Vào Quản lý điểm tập để khởi tạo, sau đó mới phân quyền HLV.</Alert>}
        {LOCATION_MODULES.map(key => <Box key={key} sx={{ py: 1.5 }}>
          <Typography fontWeight={700}>{MODULES.find(m => m.key === key)?.label}</Typography>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {locationNames.map(location => <FormControlLabel key={location} control={<Checkbox checked={locationPermissions[key]?.includes(location) || false} onChange={e => toggleLocation(key, location, e.target.checked)} />} label={location} />)}
          </Stack><Divider />
        </Box>)}
      </Paper>
      <Button color="error" variant="outlined" disabled={busy} onClick={() => { setDeleteCoachChecked(false); setDeleteCoachOpen(true); }} sx={{ mr: 1 }}>Xóa vĩnh viễn tài khoản HLV</Button>
      <Button variant="contained" size="large" disabled={!dirty || busy} onClick={save}>{busy ? "Đang lưu..." : "Lưu phân quyền"}</Button>
    </>}
    </>}
    <Dialog open={deleteCoachOpen && Boolean(coach)} onClose={busy ? undefined : () => setDeleteCoachOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Xóa vĩnh viễn tài khoản HLV</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>HLV: <strong>{coach?.tenHienThi || coach?.displayName || coach?.username || coach?.email}</strong></Typography>
          <Typography variant="body2" color="text.secondary">Tài khoản: {coach?.username || coach?.email || coach?.uid}</Typography>
          <Alert severity="error">Tài khoản HLV sẽ bị xóa vĩnh viễn và không thể đăng nhập. Lịch sử nghiệp vụ được giữ lại theo xử lý hiện tại.</Alert>
          <FormControlLabel control={<Checkbox checked={deleteCoachChecked} disabled={busy} onChange={e => setDeleteCoachChecked(e.target.checked)} />} label="Tôi xác nhận muốn xóa vĩnh viễn tài khoản HLV này." />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={() => setDeleteCoachOpen(false)} disabled={busy}>Hủy</Button>
        <Button color="error" variant="contained" disabled={busy || !deleteCoachChecked} onClick={deleteCoach}>{busy ? <CircularProgress size={20} color="inherit" /> : "Xóa tài khoản"}</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
