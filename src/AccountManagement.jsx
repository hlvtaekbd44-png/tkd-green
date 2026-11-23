import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { ContentCopyRounded, LockResetRounded, SearchRounded, VisibilityOffRounded, VisibilityRounded } from "@mui/icons-material";
import { db } from "./firebase";
import { accountRequest } from "./accountApi";

function labelOf(user) { return user.tenHienThi || user.displayName || user.username || user.email || user.uid; }
const valid = value => typeof value === 'string' && value.length >= 12 && value.length <= 128;
export default function AccountManagement({ profile }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [completedPassword, setCompletedPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (profile?.role !== 'admin') return undefined;
    setLoading(true);
    return onSnapshot(collection(db, 'users'), snap => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => ['hlv', 'member'].includes(u.role)));
      setLoading(false); setError('');
    }, err => {setLoading(false);setError(`Không đọc được danh sách tài khoản: ${err.message}`);});
  }, [profile?.role]);

  const filtered = useMemo(() => users.filter(u => (role === 'all' || u.role === role) &&
    [labelOf(u), u.username, u.email, u.memberDocId, u.uid].filter(Boolean).join(' ').toLocaleLowerCase('vi')
    .includes(search.trim().toLocaleLowerCase('vi'))), [users, role, search]);
  const close = () => { if (busy) return; setSelected(null); setPassword(''); setCompletedPassword(''); setShowPassword(false); setCopied(false);setError('');};
  const reset = async () => {
    if (!selected?.uid || busy || !valid(password)) return;
    setBusy(true); setError('');
    const newPassword = password;
    try {
      await accountRequest('resetPassword', { uid: selected.uid, password: newPassword });
      setCompletedPassword(newPassword); setPassword('');setShowPassword(false);
    } catch(e) {setError(`Đặt lại mật khẩu thất bại: ${e.message}`);} finally {setBusy(false);}
  };
  const copyCredentials = async () => {
    if (!completedPassword) return;
    try { await navigator.clipboard.writeText(`Tên đăng nhập: ${selected?.username || selected?.email || selected?.uid}\nMật khẩu mới: ${completedPassword}`); setCopied(true); }
    catch { setError('Không thể sao chép tự động. Hãy sao chép thủ công và bàn giao qua kênh riêng.'); }
  };
  if (profile?.role !== 'admin') return <Alert severity="error">Chỉ Admin được quản lý tài khoản.</Alert>;
  return <Stack spacing={2}>
    <Alert severity="info">Firebase không cho xem lại mật khẩu hiện tại. Admin có thể đặt mật khẩu mới, nhận mật khẩu đó một lần để bàn giao. Không lưu mật khẩu trong Firestore.</Alert>
    <Paper sx={{p:2,borderRadius:3}}><Stack direction={{xs:'column',md:'row'}} spacing={2}>
      <TextField fullWidth label="Tìm tên, tài khoản, UID..." value={search} onChange={e=>setSearch(e.target.value)} InputProps={{startAdornment:<InputAdornment position="start"><SearchRounded/></InputAdornment>}}/>
      <TextField select label="Loại tài khoản" value={role} onChange={e=>setRole(e.target.value)} sx={{minWidth:175}}>
        <MenuItem value="all">Tất cả</MenuItem><MenuItem value="hlv">Huấn luyện viên</MenuItem><MenuItem value="member">Hội viên</MenuItem>
      </TextField>
    </Stack></Paper>
    {loading && <CircularProgress size={24}/>}
    {error && !selected && <Alert severity="error">{error}</Alert>}
    <Typography variant="body2" color="text.secondary">{filtered.length} tài khoản HLV / võ sinh</Typography>
    <Stack spacing={1}>
      {filtered.map(u => <Paper key={u.uid} sx={{p:2,borderRadius:2}}><Stack direction={{xs:'column',sm:'row'}} alignItems={{sm:'center'}} spacing={2}>
        <Avatar sx={{bgcolor:'#0b774c'}}>{labelOf(u).charAt(0).toUpperCase()}</Avatar>
        <Box sx={{flex:1,minWidth:0}}><Typography fontWeight={800}>{labelOf(u)}</Typography>
          <Typography variant="body2" sx={{overflowWrap:'anywhere'}}>Tên đăng nhập: {u.username || u.email || 'Chưa cập nhật'}</Typography>
          <Typography variant="caption" color="text.secondary">{u.role === 'hlv' ? 'Huấn luyện viên' : 'Hội viên'}{u.memberDocId ? ` · Hồ sơ: ${u.memberDocId}` : ''}</Typography>
        </Box><Chip size="small" color={u.active === true ? 'success' : 'default'} label={u.active === true ? 'Đang hoạt động' : 'Đã khóa'}/>
        <Button size="small" startIcon={<LockResetRounded/>} variant="outlined" onClick={()=>{setSelected(u);setPassword('');setCompletedPassword('');setError('');setCopied(false);}}>Đặt lại mật khẩu</Button>
      </Stack></Paper>)}
    </Stack>
    <Dialog open={!!selected} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>Đặt lại mật khẩu tài khoản</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{pt:1}}>
        <Typography fontWeight={700}>{selected && labelOf(selected)}</Typography>
        <Typography variant="body2">Tài khoản: {selected?.username || selected?.email || selected?.uid}</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {!completedPassword ? <>
          <Alert severity="warning">Đổi mật khẩu sẽ làm mật khẩu cũ không dùng được. Hệ thống thu hồi refresh token; phiên đăng nhập hiện có có thể cần xác thực lại.</Alert>
          <TextField fullWidth label="Mật khẩu mới (12–128 ký tự)" type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} autoComplete="new-password" InputProps={{endAdornment:<IconButton aria-label="Hiện hoặc ẩn mật khẩu" onClick={()=>setShowPassword(v=>!v)}>{showPassword?<VisibilityOffRounded/>:<VisibilityRounded/>}</IconButton>}} />
        </> : <>
          <Alert severity="success">Đặt lại mật khẩu thành công. Đây là lần duy nhất mật khẩu mới được hiển thị; hãy bàn giao qua kênh riêng.</Alert>
          <TextField fullWidth label="Mật khẩu mới đã cấp" value={completedPassword} InputProps={{readOnly:true}} />
          <Button variant="outlined" startIcon={<ContentCopyRounded/>} onClick={copyCredentials}>{copied?'Đã sao chép':'Sao chép thông tin đăng nhập'}</Button>
        </>}
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={close}>{completedPassword?'Đóng':'Hủy'}</Button>
        {!completedPassword && <Button variant="contained" disabled={busy || !valid(password)} onClick={reset}>{busy?'Đang cập nhật...':'Xác nhận đặt lại'}</Button>}
      </DialogActions>
    </Dialog>
  </Stack>;
}
