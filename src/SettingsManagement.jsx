import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { Alert, Box, Button, Checkbox, CircularProgress, Divider, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { db, auth } from "./firebase";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";

const LOCATIONS = ["Lê Văn Tám", "Nghĩa Trung", "Đồng Tâm", "Thôn 6", "Phước Sơn", "Minh Hưng"];
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
  const [selectedUid, setSelectedUid] = useState("");
  const [permissions, setPermissions] = useState(blankPermissions);
  const [locationPermissions, setLocationPermissions] = useState(blankLocations);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dirty, setDirty] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newCoach, setNewCoach] = useState({ name: "", email: "", password: "" });
  const [creating, setCreating] = useState(false);

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

  const coach = useMemo(() => coaches.find(c => c.uid === selectedUid), [coaches, selectedUid]);
  useEffect(() => {
    const p = blankPermissions();
    const l = blankLocations();
    if (coach) {
      for (const m of MODULES) for (const [action] of m.actions) p[m.key][action] = coach.permissions?.[m.key]?.[action] === true;
      for (const key of LOCATION_MODULES) l[key] = LOCATIONS.filter(x => (coach.locationPermissions?.[key] || []).includes(x));
    }
    setPermissions(p);
    setLocationPermissions(l);
    setDirty(false);
    setSuccess("");
  }, [coach]);

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
    const email = newCoach.email.trim().toLowerCase();
    if (!name || !email || newCoach.password.length < 8) {
      setError("Nhập họ tên, email và mật khẩu ít nhất 8 ký tự.");
      return;
    }
    if (busy || creating) return;
    setCreating(true); setError(""); setSuccess("");
    let secondaryApp = null;
    let createdUid = "";
    try {
      // Phiên Auth phụ không làm thay đổi phiên đăng nhập Admin.
      secondaryApp = initializeApp(auth.app.options, `coach-creation-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      const credential = await createUserWithEmailAndPassword(secondaryAuth, email, newCoach.password);
      createdUid = credential.user.uid;
      await signOut(secondaryAuth);
      const emptyPermissions = blankPermissions();
      const emptyLocations = blankLocations();
      await setDoc(doc(db, "users", createdUid), {
        role: "hlv", active: true,
        tenHienThi: name, email,
        diemTap: [],
        permissions: emptyPermissions,
        locationPermissions: emptyLocations,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid,
      });
      setSelectedUid(createdUid);
      setNewCoach({ name: "", email: "", password: "" });
      setCreateOpen(false);
      setSuccess("Đã tạo tài khoản HLV. Hãy chọn các quyền và điểm tập rồi bấm Lưu phân quyền.");
    } catch (err) {
      const explanation = createdUid
        ? ` Tài khoản Authentication đã được tạo (UID: ${createdUid}) nhưng chưa lưu được hồ sơ Firestore. Hãy giữ UID để xử lý, không tạo lại email này.`
        : "";
      setError(`Tạo tài khoản thất bại: ${err.message}.${explanation}`);
    } finally {
      if (secondaryApp) {
        try { await deleteApp(secondaryApp); } catch (e) { console.warn("Không thể đóng phiên phụ", e); }
      }
      setCreating(false);
    }
  };

  const save = async () => {
    if (!coach || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const allowed = Object.fromEntries(LOCATION_MODULES.map(key => [key, locationPermissions[key].filter(x => LOCATIONS.includes(x))]));
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
    <Typography variant="h5" fontWeight={800}>Cài đặt · Phân quyền HLV</Typography>
    <Alert severity="info">Tạo HLV bằng email và mật khẩu; tài khoản mới chưa có quyền nào cho đến khi Admin cấp. Chức năng phân quyền cần được bảo vệ bằng Firestore Rules.</Alert>
    <Paper sx={{ p: 3, borderRadius: 3 }}>
      <Button variant="outlined" onClick={() => setCreateOpen(v => !v)} disabled={creating}>
        {createOpen ? "Đóng form tạo HLV" : "+ Tạo tài khoản HLV"}
      </Button>
      {createOpen && <Stack spacing={2} sx={{ mt: 2 }}>
        <TextField label="Họ và tên HLV" fullWidth value={newCoach.name} onChange={e => setNewCoach(v => ({...v, name: e.target.value}))} />
        <TextField label="Email đăng nhập" type="email" fullWidth value={newCoach.email} onChange={e => setNewCoach(v => ({...v, email: e.target.value}))} />
        <TextField label="Mật khẩu khởi tạo (ít nhất 8 ký tự)" type="password" fullWidth value={newCoach.password} onChange={e => setNewCoach(v => ({...v, password: e.target.value}))} />
        <Button variant="contained" disabled={creating} onClick={createCoach}>
          {creating ? "Đang tạo tài khoản..." : "Xác nhận tạo HLV"}
        </Button>
      </Stack>}
    </Paper>
    {error && <Alert severity="error">{error}</Alert>}
    {success && <Alert severity="success">{success}</Alert>}
    <Paper sx={{ p: 3, borderRadius: 3 }}>
      {loading ? <CircularProgress size={24} /> : <TextField select fullWidth label="Chọn tài khoản HLV" value={selectedUid} onChange={e => { if (dirty && !window.confirm("Bỏ các thay đổi chưa lưu?")) return; setSelectedUid(e.target.value); }}>
        {coaches.map(c => <MenuItem key={c.uid} value={c.uid}>{c.tenHienThi || c.displayName || c.email || c.uid} {c.active === false ? "(Đã khóa)" : ""}</MenuItem>)}
      </TextField>}
      {!loading && coaches.length === 0 && <Typography sx={{ mt: 2 }}>Chưa tìm thấy tài khoản HLV trong collection users.</Typography>}
    </Paper>
    {coach && <>
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
        {LOCATION_MODULES.map(key => <Box key={key} sx={{ py: 1.5 }}>
          <Typography fontWeight={700}>{MODULES.find(m => m.key === key)?.label}</Typography>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {LOCATIONS.map(location => <FormControlLabel key={location} control={<Checkbox checked={locationPermissions[key]?.includes(location) || false} onChange={e => toggleLocation(key, location, e.target.checked)} />} label={location} />)}
          </Stack><Divider />
        </Box>)}
      </Paper>
      <Button variant="contained" size="large" disabled={!dirty || busy} onClick={save}>{busy ? "Đang lưu..." : "Lưu phân quyền"}</Button>
    </>}
  </Stack>;
}
