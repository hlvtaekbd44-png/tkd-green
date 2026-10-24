import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography, Divider } from "@mui/material";
import { db } from "./firebase";
import { accountRequest } from "./accountApi";

const LEGACY_LOCATIONS = [
  ["LVTA", "Lê Văn Tám"], ["NGTR", "Nghĩa Trung"], ["DOTM", "Đồng Tâm"],
  ["T6", "Thôn 6"], ["PHSo", "Phước Sơn"], ["MIHU", "Minh Hưng"],
];
const DEFAULT_FEATURES = { members: true, tuition: true, exams: true, attendance: true, reports: true, leaveRequests: false };
const EMPTY_FORM = { name: "", code: "", address: "", active: true, features: { ...DEFAULT_FEATURES }, fees: { daily: "", monthly: "", quarterly: "", exam: "" } };
const FEATURE_LABELS = { members: "Hội viên", tuition: "Học phí", exams: "Thi cấp", attendance: "Điểm danh", reports: "Báo cáo", leaveRequests: "Xin phép nghỉ" };
const FEE_LABELS = { daily: "Học phí ngày", monthly: "Học phí tháng", quarterly: "Học phí quý", exam: "Lệ phí thi cấp" };

export default function LocationManagement() {
  const [locations, setLocations] = useState([]);
  const [retiredNames, setRetiredNames] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteLocationOpen, setDeleteLocationOpen] = useState(false);
  const [deleteLocationChecked, setDeleteLocationChecked] = useState(false);

  useEffect(() => onSnapshot(collection(db, "locations"), snapshot => {
    setLocations(snapshot.docs.filter(d => d.data().deleted !== true).map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi")));
    setRetiredNames(snapshot.docs.filter(d => d.data().deleted === true).map(d => d.data().name).filter(Boolean));
    setLoading(false);
  }, err => { setError(`Không đọc được điểm tập: ${err.message}`); setLoading(false); }), []);

  const selectLocation = (id) => {
    setSelectedId(id); setCreating(false); setError(""); setSuccess("");
    const item = locations.find(x => x.id === id);
    if (item) setForm({ name: item.name || "", code: item.code || id, address: item.address || "", active: item.active !== false,
      features: { ...DEFAULT_FEATURES, ...(item.features || {}) },
      fees: { daily: item.fees?.daily ?? "", monthly: item.fees?.monthly ?? "", quarterly: item.fees?.quarterly ?? "", exam: item.fees?.exam ?? "" } });
  };
  const startCreate = () => { setCreating(true); setSelectedId(""); setForm({ ...EMPTY_FORM, features: { ...DEFAULT_FEATURES }, fees: { ...EMPTY_FORM.fees } }); setError(""); setSuccess(""); };
  // Tạo thủ công tài liệu cho điểm tập cũ còn thiếu; không ghi đè điểm đã cấu hình.
  const missingLegacy = LEGACY_LOCATIONS.filter(([, name]) => !locations.some(x => x.name === name) && !retiredNames.includes(name));
  const seedLegacy = async () => {
    if (!missingLegacy.length || saving) return;
    if (!window.confirm(`Tạo ${missingLegacy.length} điểm tập cũ chưa có trong Firestore? Các mức thu để trống và cần kiểm tra lại.`)) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const { runTransaction } = await import("firebase/firestore");
      for (const [code, name] of missingLegacy) {
        await runTransaction(db, async tx => {
          const ref = doc(db, "locations", code);
          const snap = await tx.get(ref);
          if (!snap.exists()) tx.set(ref, {
            name, code, address: "", active: true, features: {...DEFAULT_FEATURES},
            fees: {daily:null,monthly:null,quarterly:null,exam:null},
            createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
          });
        });
      }
      setSuccess("Đã khởi tạo điểm tập còn thiếu. Hãy kiểm tra học phí và cấu hình từng điểm tập.");
    } catch (e) { setError(`Không khởi tạo được: ${e.message}`); }
    finally { setSaving(false); }
  };

  const deleteLocation = async () => {
    const item = locations.find(x => x.id === selectedId);
    if (!item || saving) return;
    const name = item.name;
    if (!deleteLocationOpen || !deleteLocationChecked) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const result = await accountRequest("deleteLocation", { locationId: item.id, confirmName: name });
      setSelectedId(""); setCreating(false);
      setDeleteLocationOpen(false); setDeleteLocationChecked(false);
      setSuccess(`Đã xóa ${name}; chuyển ${result.updatedMembers || 0} hội viên về Chưa xác định và cập nhật ${result.updatedCoaches || 0} tài khoản HLV.`);
    } catch (e) { setError(`Xóa điểm tập thất bại: ${e.message}`); }
    finally { setSaving(false); }
  };

  const save = async () => {
    const name = form.name.trim();
    const code = form.code.trim().toUpperCase();
    if (!name || !code || !/^[A-Z0-9_-]{2,20}$/.test(code)) { setError("Nhập tên và mã điểm tập gồm 2–20 ký tự A-Z, 0-9, _ hoặc -."); return; }
    if (locations.some(x => x.name?.trim().toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi") && x.id !== selectedId)) { setError("Tên điểm tập đã tồn tại."); return; }
    const fees = {};
    for (const key of Object.keys(FEE_LABELS)) {
      const raw = String(form.fees[key] ?? "").trim();
      if (raw === "") { fees[key] = null; continue; }
      const amount = Number(raw);
      if (!Number.isSafeInteger(amount) || amount < 0) { setError(`${FEE_LABELS[key]} phải là số nguyên không âm (VNĐ).`); return; }
      fees[key] = amount;
    }
    setSaving(true); setError(""); setSuccess("");
    try {
      if (creating) {
        if (locations.some(x => x.id === code || x.code === code)) { setError("Mã điểm tập đã tồn tại."); return; }
        await setDoc(doc(db, "locations", code), { name, code, address: form.address.trim(), active: form.active,
          features: form.features, fees, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        setSuccess("Đã tạo điểm tập mới trong Firestore."); setCreating(false); setSelectedId(code);
      } else if (selectedId) {
        await updateDoc(doc(db, "locations", selectedId), { name, address: form.address.trim(), active: form.active,
          features: form.features, fees, updatedAt: serverTimestamp() });
        setSuccess("Đã lưu cấu hình điểm tập.");
      }
    } catch (e) { setError(`Lưu điểm tập thất bại: ${e.message}`); }
    finally { setSaving(false); }
  };

  return <Stack spacing={2}>
    <Typography variant="h6" fontWeight={800}>Quản lý điểm tập</Typography>
    <Alert severity="info">Danh sách điểm tập trong mục này và mục Phân quyền HLV đều đọc từ Firestore collection locations. Xóa điểm tập không xóa lịch sử học phí, thi cấp hay điểm danh.</Alert>
    {missingLegacy.length > 0 && <Alert severity="warning" action={<Button onClick={seedLegacy} disabled={saving} color="inherit">Khởi tạo điểm cũ</Button>}>
      Còn {missingLegacy.length} điểm tập cũ chưa có bản ghi trong Firestore. Khởi tạo trước khi phân quyền hoặc xóa điểm tập.
    </Alert>}
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
      <TextField select fullWidth label="Chọn điểm tập" value={creating ? "" : selectedId} onChange={e => selectLocation(e.target.value)} disabled={loading || saving}>
        <MenuItem value="">-- Chọn điểm tập --</MenuItem>
        {locations.map(x => <MenuItem key={x.id} value={x.id}>{x.name || x.id}{x.active === false ? " (Tạm ngừng)" : ""}</MenuItem>)}
      </TextField>
      <Button variant="outlined" onClick={startCreate} disabled={saving} sx={{ minWidth: 160 }}>+ Thêm điểm tập</Button>
    </Stack>
    {loading && <CircularProgress size={24} />}
    {!loading && locations.length === 0 && <Alert severity="warning">Collection locations chưa có dữ liệu. Hãy tạo mới hoặc dùng nút Khởi tạo điểm cũ ở trên.</Alert>}
    {error && <Alert severity="error">{error}</Alert>}
    {success && <Alert severity="success">{success}</Alert>}
    {(creating || selectedId) && <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      <Stack spacing={2}>
        <Typography fontWeight={700}>{creating ? "Tạo điểm tập" : "Cấu hình điểm tập"}</Typography>
        <TextField label="Tên điểm tập" required fullWidth value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        <TextField label="Mã điểm tập" required fullWidth value={form.code} disabled={!creating} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} helperText="Mã duy nhất, không đổi sau khi tạo. Ví dụ: DOTM, T6, TANPHU." />
        <TextField label="Địa chỉ" fullWidth value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
        <FormControlLabel control={<Checkbox checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} />} label="Điểm tập đang hoạt động" />
        <Divider />
        <Typography fontWeight={700}>Chức năng sử dụng tại điểm tập</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {Object.entries(FEATURE_LABELS).map(([key, label]) => <FormControlLabel key={key} control={<Checkbox checked={form.features[key] !== false} onChange={e => setForm(p => ({ ...p, features: { ...p.features, [key]: e.target.checked } }))} />} label={label} />)}
        </Box>
        <Divider />
        <Typography fontWeight={700}>Mức thu (VNĐ)</Typography>
        <Alert severity="warning">Để trống mức thu nếu chưa cấu hình. Không nhập số 0 trừ khi mức thu thực sự bằng 0 đồng.</Alert>
        {Object.entries(FEE_LABELS).map(([key, label]) => <TextField key={key} fullWidth type="number" label={label} value={form.fees[key] ?? ""} onChange={e => setForm(p => ({ ...p, fees: { ...p.fees, [key]: e.target.value } }))} inputProps={{ min: 0, step: 1000 }} />)}
        <Stack direction={{xs:"column",sm:"row"}} spacing={1}>
          <Button variant="contained" onClick={save} disabled={saving}>{saving ? "Đang xử lý..." : creating ? "Tạo điểm tập" : "Lưu cấu hình điểm tập"}</Button>
          {!creating && selectedId && <Button variant="outlined" color="error" disabled={saving} onClick={() => { setDeleteLocationChecked(false); setDeleteLocationOpen(true); }}>Xóa điểm tập</Button>}
        </Stack>
      </Stack>
    </Paper>}
    <Dialog open={deleteLocationOpen && Boolean(selectedId) && !creating} onClose={saving ? undefined : () => setDeleteLocationOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Xóa điểm tập</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>Điểm tập: <strong>{locations.find(x => x.id === selectedId)?.name || ""}</strong></Typography>
          <Alert severity="warning">Hội viên của điểm tập này sẽ chuyển về Chưa xác định; quyền điểm tập của HLV sẽ được gỡ. Lịch sử học phí và thi cấp được giữ nguyên theo xử lý hiện tại. Không thể hoàn tác.</Alert>
          <FormControlLabel control={<Checkbox checked={deleteLocationChecked} disabled={saving} onChange={e => setDeleteLocationChecked(e.target.checked)} />} label="Tôi đã kiểm tra dữ liệu và xác nhận muốn xóa điểm tập này." />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button disabled={saving} onClick={() => setDeleteLocationOpen(false)}>Hủy</Button>
        <Button variant="contained" color="error" disabled={saving || !deleteLocationChecked} onClick={deleteLocation}>{saving ? <CircularProgress size={20} color="inherit" /> : "Xóa điểm tập"}</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
