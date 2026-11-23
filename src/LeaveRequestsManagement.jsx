import { useEffect, useMemo, useState } from "react";
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, MenuItem, Paper, Stack, TextField, Typography,
} from "@mui/material";
import {
  AssignmentTurnedInRounded, CheckCircleRounded, CloseRounded,
  EventBusyRounded, RefreshRounded, SearchRounded,
} from "@mui/icons-material";
import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { auth, db } from "./firebase";

const PENDING = "Chờ duyệt";
const APPROVED = "Đã duyệt";
const REJECTED = "Từ chối";
const dateVN = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? s.split("-").reverse().join("/") : (s || "—");
const pretty = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi");
const pill = (status) => status === APPROVED ? "success" : status === REJECTED ? "error" : "warning";

export default function LeaveRequestsManagement({ profile, students = [] }) {
  const admin = profile?.role === "admin";
  const coach = profile?.role === "hlv";
  const canReview = admin || (coach && (
    profile?.permissions?.attendance?.manage === true ||
    profile?.permissions?.members?.edit === true
  ));
  const assigned = Array.isArray(profile?.diemTap) ? profile.diemTap : (profile?.diemTap ? [profile.diemTap] : []);
  const allowedLocations = useMemo(() => {
    if (admin) return [];
    const attendance = profile?.permissions?.attendance?.manage ? profile?.locationPermissions?.attendance : [];
    const members = profile?.permissions?.members?.edit ? profile?.locationPermissions?.members : [];
    const scoped = [...new Set([...(Array.isArray(attendance) ? attendance : []), ...(Array.isArray(members) ? members : [])])];
    return scoped.filter(name => assigned.includes(name));
  }, [admin, profile]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [location, setLocation] = useState("Tất cả điểm tập");
  const [filter, setFilter] = useState(PENDING);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [decision, setDecision] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!canReview || (!admin && !allowedLocations.length)) { setRequests([]); setLoading(false); return undefined; }
    setLoading(true); setError("");
    const chunks = admin ? [null] : Array.from({ length: Math.ceil(allowedLocations.length / 30) }, (_, i) => allowedLocations.slice(i * 30, i * 30 + 30));
    const snapshots = new Map();
    const cancels = chunks.map((names, index) => onSnapshot(
      names ? query(collection(db, "leaveRequests"), where("diemTap", "in", names)) : collection(db, "leaveRequests"),
      snap => {
        snapshots.set(index, snap.docs);
        const merged = new Map();
        for (const docs of snapshots.values()) docs.forEach(d => merged.set(d.id, { id: d.id, ...d.data() }));
        setRequests([...merged.values()]);
        if (snapshots.size === chunks.length) setLoading(false);
      }, e => { setError(`Không đọc được đơn nghỉ: ${e.message}. Kiểm tra Firestore Rules.`); setLoading(false); }
    ));
    return () => cancels.forEach(fn => fn());
  }, [admin, canReview, allowedLocations.join("\u001f"), refresh]);

  const byId = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);
  const points = useMemo(() => admin
    ? [...new Set(requests.map(r => r.diemTap).filter(Boolean))].sort((a,b) => a.localeCompare(b,"vi"))
    : allowedLocations, [admin, requests, allowedLocations]);
  const visible = useMemo(() => requests.filter(r => {
    if (!admin && !allowedLocations.includes(r.diemTap)) return false;
    if (location !== "Tất cả điểm tập" && r.diemTap !== location) return false;
    if (filter !== "Tất cả" && (r.trangThai || PENDING) !== filter) return false;
    const member = byId.get(r.memberDocId);
    const needle = pretty(search);
    return !needle || pretty([member?.name, member?.maHV, member?.maHoiVienNoiBo, r.memberDocId, r.lyDo, r.diemTap].join(" ")).includes(needle);
  }).sort((a,b) => (b.createdAt?.seconds || 0)-(a.createdAt?.seconds || 0)), [requests, admin, allowedLocations, location, filter, search, byId]);
  const totals = useMemo(() => Object.fromEntries([PENDING,APPROVED,REJECTED].map(s => [s,requests.filter(r => r.trangThai === s && (admin || allowedLocations.includes(r.diemTap))).length])), [requests, admin, allowedLocations]);

  const review = async () => {
    if (!selected || ![APPROVED,REJECTED].includes(decision) || !canReview || busy) return;
    if (!auth.currentUser?.uid) { setError("Phiên đăng nhập không hợp lệ."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await runTransaction(db, async tx => {
        const ref = doc(db,"leaveRequests",selected.id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Đơn không còn tồn tại.");
        const data = snap.data();
        if (data.trangThai !== PENDING) throw new Error("Đơn đã được xử lý bởi tài khoản khác.");
        if (!admin && !allowedLocations.includes(data.diemTap)) throw new Error("Điểm tập ngoài phạm vi phân quyền.");
        tx.update(ref, { trangThai: decision, reviewedBy: auth.currentUser.uid, reviewedAt: serverTimestamp() });
      });
      setNotice(`Đã ${decision === APPROVED ? "duyệt" : "từ chối"} đơn xin nghỉ.`);
      setSelected(null); setDecision("");
    } catch(e) { setError(`Xử lý đơn thất bại: ${e.message}`); }
    finally { setBusy(false); }
  };

  return <Box sx={{maxWidth:1500,mx:"auto",mt:2,pb:5}}>
    <Stack direction={{xs:"column",sm:"row"}} justifyContent="space-between" alignItems={{sm:"center"}} gap={1.5} sx={{mb:2.5}}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{display:"grid",placeItems:"center",width:46,height:46,bgcolor:"#e1f3e9",color:"#087d4b",borderRadius:3}}><AssignmentTurnedInRounded/></Box>
        <Box><Typography variant="h5" fontWeight={900}>Quản lý xin phép nghỉ</Typography><Typography variant="caption" color="text.secondary">TKD GREEN · LEAVE REQUEST CONTROL</Typography></Box>
      </Stack>
      <Button variant="outlined" startIcon={<RefreshRounded/>} disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Tải lại</Button>
    </Stack>
    {!canReview && <Alert severity="warning" sx={{mb:2}}>Tài khoản chưa được cấp quyền xét duyệt đơn nghỉ.</Alert>}
    {canReview && !admin && !allowedLocations.length && <Alert severity="warning" sx={{mb:2}}>HLV chưa có điểm tập phù hợp để xét duyệt đơn.</Alert>}
    {error && <Alert severity="error" sx={{mb:2}}>{error}</Alert>}
    {notice && <Alert severity="success" sx={{mb:2}} onClose={()=>setNotice("")}>{notice}</Alert>}
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"repeat(3,minmax(0,1fr))"},gap:1.2,mb:2}}>
      {[{s:PENDING,label:"Chờ duyệt",c:"#b76c00"},{s:APPROVED,label:"Đã duyệt",c:"#087d4b"},{s:REJECTED,label:"Từ chối",c:"#c33e4b"}].map(x=><Paper key={x.s} elevation={0} sx={{p:{xs:1.3,md:2},border:"1px solid #dfebe3",borderRadius:3,cursor:"pointer"}} onClick={()=>setFilter(x.s)}><Typography variant="caption" color="text.secondary">{x.label}</Typography><Typography fontSize={{xs:23,md:32}} color={x.c} fontWeight={900}>{totals[x.s]||0}</Typography></Paper>)}
    </Box>
    <Paper elevation={0} sx={{p:2,border:"1px solid #dfebe3",borderRadius:3,mb:2}}><Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"1fr 1fr 2fr"},gap:1.5}}>
      <TextField select label="Điểm tập" size="small" value={points.includes(location) ? location : "Tất cả điểm tập"} onChange={e=>setLocation(e.target.value)}><MenuItem value="Tất cả điểm tập">Tất cả điểm tập</MenuItem>{points.map(x=><MenuItem value={x} key={x}>{x}</MenuItem>)}</TextField>
      <TextField select label="Trạng thái đơn" size="small" value={filter} onChange={e=>setFilter(e.target.value)}>{["Tất cả",PENDING,APPROVED,REJECTED].map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
      <TextField size="small" label="Tìm đơn nghỉ" placeholder="Tên, mã hội viên, điểm tập, lý do" value={search} onChange={e=>setSearch(e.target.value)} InputProps={{startAdornment:<SearchRounded sx={{fontSize:19,mr:1,color:"#8ca197"}}/>}} />
    </Box></Paper>
    {loading && <CircularProgress size={25}/>}
    {!loading && !visible.length && <Paper sx={{p:4,textAlign:"center",borderRadius:3}}><Typography color="text.secondary">Không có đơn phù hợp.</Typography></Paper>}
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"repeat(2,minmax(0,1fr))"},gap:1.5}}>
      {visible.map(r=>{const member=byId.get(r.memberDocId);return <Paper key={r.id} elevation={0} sx={{p:2,border:"1px solid #dfebe3",borderRadius:3}}>
        <Stack direction="row" alignItems="center" spacing={1.2}><Avatar sx={{bgcolor:"#e4f3ea",color:"#087d4b"}}>{(member?.name||"V").slice(0,1)}</Avatar><Box sx={{flex:1,minWidth:0}}><Typography fontWeight={800}>{member?.name || `Mã hồ sơ: ${r.memberDocId}`}</Typography><Typography variant="caption" color="text.secondary">{member?.maHoiVienNoiBo || ""} · {r.diemTap || "Chưa có điểm tập"}</Typography></Box><Chip label={r.trangThai || PENDING} color={pill(r.trangThai)} size="small"/></Stack>
        <Divider sx={{my:1.5}}/><Typography fontWeight={700}>{dateVN(r.tuNgay)} – {dateVN(r.denNgay)}</Typography><Typography variant="body2" sx={{mt:.7,overflowWrap:"anywhere"}}>Lý do: {r.lyDo || "—"}</Typography>
        {r.trangThai === PENDING && canReview && <Stack direction="row" spacing={1} sx={{mt:2}}><Button color="success" variant="contained" size="small" startIcon={<CheckCircleRounded/>} onClick={()=>{setSelected(r);setDecision(APPROVED);}}>Duyệt</Button><Button color="error" variant="outlined" size="small" startIcon={<EventBusyRounded/>} onClick={()=>{setSelected(r);setDecision(REJECTED);}}>Từ chối</Button></Stack>}
        {r.trangThai !== PENDING && <Typography variant="caption" color="text.secondary" display="block" sx={{mt:1}}>Đã xử lý · không thay đổi lịch sử đơn.</Typography>}
      </Paper>;})}
    </Box>
    <Dialog open={Boolean(selected)} onClose={busy?undefined:()=>setSelected(null)} maxWidth="xs" fullWidth><DialogTitle>Xác nhận {decision === APPROVED ? "duyệt" : "từ chối"} đơn</DialogTitle><DialogContent><Typography>Hội viên: <strong>{byId.get(selected?.memberDocId)?.name || selected?.memberDocId}</strong></Typography><Typography sx={{mt:1}}>Ngày nghỉ: {dateVN(selected?.tuNgay)} – {dateVN(selected?.denNgay)}</Typography><Alert severity="info" sx={{mt:2}}>Duyệt đơn không tự sửa điểm danh đã lưu. HLV sẽ thấy gợi ý “Vắng có phép” khi mở ngày tập phù hợp.</Alert></DialogContent><DialogActions><Button disabled={busy} onClick={()=>setSelected(null)}>Hủy</Button><Button disabled={busy} variant="contained" color={decision === APPROVED ? "success" : "error"} onClick={review}>{busy?"Đang xử lý...":"Xác nhận"}</Button></DialogActions></Dialog>
  </Box>;
}
