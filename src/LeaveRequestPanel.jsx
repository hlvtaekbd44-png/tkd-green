import { useEffect, useState } from 'react';
import { addDoc, collection, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { CalendarMonthRounded, SendRounded } from '@mui/icons-material';
import { auth, db } from './firebase';

const dateText = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s.split('-').reverse().join('/') : '—';
const statusColor = s => s === 'Đã duyệt' ? 'success' : s === 'Từ chối' ? 'error' : 'warning';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

/** Self-service: member identity is bound to Auth UID by Firestore Rules. */
export default function LeaveRequestPanel({ profile, member, enabled = true, locationId: locationIdFromParent = "" }) {
  const memberId = profile?.memberDocId || profile?.memberId || member?.id;
  const resolvedLocationId = member?.locationId || locationIdFromParent;
  const [day, setDay] = useState(today);
  const [endDay, setEndDay] = useState(today);
  const [reason, setReason] = useState('');
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!memberId) { setLoading(false); return; }
    setLoading(true);
    // Rules only allow member's own documents; where memberDocId is essential.
    return onSnapshot(query(collection(db,'leaveRequests'),where('memberDocId','==',memberId)), snap => {
      setRequests(snap.docs.map(d=>({ id:d.id, ...d.data() })).sort((a,b)=>String(b.createdAt?.seconds||0).localeCompare(String(a.createdAt?.seconds||0))));
      setLoading(false);
    }, e=>{setError(`Không tải được đơn xin phép: ${e.message}`);setLoading(false);});
  }, [memberId]);

  async function submit() {
    setError('');setSuccess('');
    if (!enabled) { setError('Điểm tập chưa bật chức năng Xin phép nghỉ.'); return; }
    if (!memberId || !resolvedLocationId || !member?.diemTap || !auth.currentUser) { setError('Hồ sơ chưa liên kết điểm tập hợp lệ hoặc chưa đăng nhập.'); return; }
    if (!day || !endDay || endDay < day) { setError('Ngày nghỉ không hợp lệ.'); return; }
    const span = Math.round((new Date(`${endDay}T12:00:00`)-new Date(`${day}T12:00:00`))/86400000);
    if (span > 14) { setError('Mỗi đơn tối đa 15 ngày.'); return; }
    const clean = reason.trim();
    if (!clean || clean.length > 500) { setError('Nhập lý do từ 1 đến 500 ký tự.'); return; }
    if (requests.some(r=>r.trangThai !== 'Từ chối' && day <= r.denNgay && endDay >= r.tuNgay)) {setError('Đã có đơn đang chờ hoặc đã duyệt trùng ngày.');return;}
    setBusy(true);
    try {
      await addDoc(collection(db,'leaveRequests'), {
        memberDocId:memberId,diemTap:member.diemTap,locationId:resolvedLocationId,
        tuNgay:day,denNgay:endDay,lyDo:clean,trangThai:'Chờ duyệt',
        createdBy:auth.currentUser.uid,createdAt:serverTimestamp(),
      });
      setReason('');setSuccess('Đã gửi đơn. Huấn luyện viên sẽ xem và xác nhận.');
    } catch(e) {setError(`Gửi đơn thất bại: ${e.message}`);} finally {setBusy(false);}
  }

  return <Stack spacing={2.5} sx={{minWidth:0}}>
    <Box sx={{bgcolor:'#075e3e',color:'#fff',borderRadius:3,p:{xs:2.5,md:3}}}>
      <Typography variant="h5" sx={{fontWeight:800,color:'#fff'}}>Xin phép nghỉ tập</Typography>
      <Typography sx={{color:'#d9f3e6',mt:1}}>Chọn ngày nghỉ, ghi lý do và gửi đến huấn luyện viên phụ trách.</Typography>
    </Box>
    <Paper sx={{p:{xs:2,md:3},borderRadius:3}}>
      <Stack spacing={2}>
        <Typography fontWeight={800}>Đơn xin phép mới</Typography>
        <Typography color="text.secondary" variant="body2">Võ sinh: {member?.hoTen || 'Chưa cập nhật'} · {member?.diemTap || 'Chưa có điểm tập'}</Typography>
        {!enabled && <Alert severity="warning">Điểm tập chưa kích hoạt quyền Xin phép nghỉ. Admin cần bật chức năng này.</Alert>}
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:2}}>
          <Box><Typography component="label" variant="body2" fontWeight={700}>Từ ngày nghỉ</Typography><TextField fullWidth type="date" value={day} onChange={e=>setDay(e.target.value)} size="small" inputProps={{'aria-label':'Từ ngày nghỉ'}} sx={{mt:1}}/></Box>
          <Box><Typography component="label" variant="body2" fontWeight={700}>Đến ngày nghỉ</Typography><TextField fullWidth type="date" value={endDay} onChange={e=>setEndDay(e.target.value)} size="small" inputProps={{'aria-label':'Đến ngày nghỉ'}} sx={{mt:1}}/></Box>
        </Box>
        <TextField label="Lý do xin nghỉ" placeholder="Ví dụ: Gia đình có việc, sức khỏe..." multiline minRows={3} value={reason} onChange={e=>setReason(e.target.value)} inputProps={{maxLength:500}} fullWidth />
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        <Button variant="contained" startIcon={<SendRounded/>} disabled={busy || !enabled || !resolvedLocationId} onClick={submit} sx={{alignSelf:{sm:'flex-end'}}}>{busy?'Đang gửi...':'Gửi đơn xin nghỉ'}</Button>
      </Stack>
    </Paper>
    <Paper sx={{p:{xs:2,md:3},borderRadius:3}}>
      <Typography fontWeight={800} sx={{mb:2}}>Lịch sử đơn xin phép</Typography>
      {loading?<CircularProgress size={22}/>:requests.length===0?<Alert severity="info">Chưa gửi đơn xin phép nào.</Alert>:<Stack spacing={1.5}>{requests.map(r=><Box key={r.id} sx={{border:'1px solid #e1ebe4',borderRadius:2,p:2}}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap"><Typography fontWeight={700}><CalendarMonthRounded sx={{verticalAlign:'middle',fontSize:18,mr:0.5}}/>{dateText(r.tuNgay)}{r.denNgay!==r.tuNgay?` – ${dateText(r.denNgay)}`:''}</Typography><Chip size="small" label={r.trangThai||'Chờ duyệt'} color={statusColor(r.trangThai)}/></Stack>
        <Typography variant="body2" sx={{mt:1,whiteSpace:'pre-wrap'}}>{r.lyDo}</Typography>
        {r.trangThai==='Đã duyệt'&&<Typography variant="caption" color="success.main">Đã xác nhận. Khi điểm danh buổi tương ứng, hệ thống sẽ ghi Vắng có phép.</Typography>}
      </Box>)}</Stack>}
    </Paper>
  </Stack>;
}
