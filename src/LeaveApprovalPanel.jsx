import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { attendanceSessionId } from './attendanceService';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { CheckCircleOutlineRounded, HighlightOffRounded } from '@mui/icons-material';
import { auth, db } from './firebase';

const fmt = s => /^\d{4}-\d{2}-\d{2}$/.test(s||'') ? s.split('-').reverse().join('/') : '—';
export default function LeaveApprovalPanel({ profile, students=[] }) {
  const isAdmin=profile?.role==='admin';
  const assigned = Array.isArray(profile?.locationPermissions?.attendance) ? profile.locationPermissions.attendance : [];
  const memberLocations = Array.isArray(profile?.locationPermissions?.members) ? profile.locationPermissions.members : [];
  const allowed = isAdmin ? null : [...new Set([...assigned,...memberLocations])].filter(Boolean);
  const canApprove = isAdmin || (profile?.role==='hlv' && (profile?.permissions?.attendance?.manage===true || profile?.permissions?.members?.edit===true));
  const [requests,setRequests]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[success,setSuccess]=useState('');

  useEffect(()=>{
    if(!canApprove){setLoading(false);return;}
    const targets=isAdmin?[null]:(allowed||[]);
    if(!targets.length){setRequests([]);setLoading(false);return;}
    const snapshots=new Map();const unsub=targets.map((loc,i)=>onSnapshot(loc?query(collection(db,'leaveRequests'),where('diemTap','==',loc)):collection(db,'leaveRequests'),s=>{
      snapshots.set(i,s.docs);
      setRequests([...new Map([...snapshots.values()].flat().map(d=>[d.id,{id:d.id,...d.data()}])).values()].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
      setLoading(false);
    },e=>{setError(`Không đọc được đơn: ${e.message}`);setLoading(false);}));
    return()=>unsub.forEach(fn=>fn());
  },[isAdmin,canApprove,JSON.stringify(allowed)]);
  const byId=useMemo(()=>new Map(students.map(s=>[s.id,s])),[students]);
  async function decide(r,status){
    if(!canApprove||r.trangThai!=='Chờ duyệt'||busy)return;
    setBusy(r.id);setError('');setSuccess('');
    try{
      await updateDoc(doc(db,'leaveRequests',r.id),{trangThai:status,reviewedBy:auth.currentUser.uid,reviewedAt:serverTimestamp()});
      if (status === 'Đã duyệt') {
        // Nếu buổi điểm danh đã tồn tại, cập nhật ngay bản ghi của võ sinh.
        // Không tạo buổi tập mới từ đơn xin nghỉ, không ghi đè trạng thái Có mặt.
        let updated=0, warning='';
        const canManageAttendance = isAdmin || (profile?.permissions?.attendance?.manage === true && assigned.includes(r.diemTap));
        if (canManageAttendance) {
          try {
            const start=new Date(`${r.tuNgay}T12:00:00`), end=new Date(`${r.denNgay}T12:00:00`);
            const batch=writeBatch(db);
            for(let date=new Date(start);date<=end;date.setDate(date.getDate()+1)) {
              const day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
              let sessionId;try { sessionId=attendanceSessionId(r.diemTap,day); } catch { warning='Điểm tập mới chưa có mã điểm danh; cần cấu hình mã trong attendanceService.js.';break; }
              const sessionRef=doc(db,'attendanceSessions',sessionId),recordRef=doc(sessionRef,'records',r.memberDocId);
              const session=await getDoc(sessionRef);
              if (!session.exists()) continue;
              const record=await getDoc(recordRef);
              if (record.exists() && record.data().trangThai === 'Có mặt') continue;
              batch.set(recordRef,{memberId:r.memberDocId,trangThai:'Vắng có phép',ghiChu:record.exists()?String(record.data().ghiChu||''):'',updatedBy:auth.currentUser.uid,updatedAt:serverTimestamp()},{merge:true});
              updated++;
            }
            if(updated) await batch.commit();
          } catch(e) {warning=`Chưa ghi được vào điểm danh đã lưu (${e.message}). Hãy mở Điểm danh và lưu lại ngày nghỉ.`;}
        }
        setSuccess(`Đã duyệt đơn.${updated?` Đã cập nhật ${updated} bản ghi điểm danh.`:''} ${warning || 'Các buổi chưa được tạo sẽ nhận “Vắng có phép” khi điểm danh.'}`);
      } else setSuccess('Đã từ chối đơn.');
    }catch(e){setError(`Không xác nhận được: ${e.message}`);}finally{setBusy('');}
  }
  if(!canApprove)return <Alert severity="warning">Tài khoản chưa có quyền xác nhận đơn xin nghỉ.</Alert>;
  return <Stack spacing={2}>
    <Box sx={{bgcolor:'#075e3e',borderRadius:3,p:3}}><Typography variant="h5" sx={{fontWeight:800,color:'#fff'}}>Duyệt đơn xin nghỉ</Typography><Typography sx={{color:'#dcf5e7',mt:1}}>Xem đơn theo điểm tập, xác nhận hoặc từ chối để liên kết với điểm danh.</Typography></Box>
    {error&&<Alert severity="error">{error}</Alert>}{success&&<Alert severity="success">{success}</Alert>}
    {loading&&<CircularProgress size={22}/>}
    {!loading&&requests.length===0&&<Alert severity="info">Chưa có đơn xin nghỉ tại điểm tập được phân quyền.</Alert>}
    {requests.map(r=><Paper key={r.id} sx={{p:2.5,borderRadius:3}}><Stack spacing={1.5}>
      <Stack direction="row" flexWrap="wrap" gap={1} justifyContent="space-between"><Box><Typography fontWeight={800}>{byId.get(r.memberDocId)?.name||`Hồ sơ ${r.memberDocId}`}</Typography><Typography variant="body2" color="text.secondary">{r.diemTap} · {fmt(r.tuNgay)}{r.denNgay!==r.tuNgay?` – ${fmt(r.denNgay)}`:''}</Typography></Box><Chip label={r.trangThai} size="small" color={r.trangThai==='Đã duyệt'?'success':r.trangThai==='Từ chối'?'error':'warning'}/></Stack>
      <Typography sx={{whiteSpace:'pre-wrap'}}>{r.lyDo}</Typography>
      {r.trangThai==='Chờ duyệt'&&<Stack direction="row" justifyContent="flex-end" gap={1}><Button disabled={!!busy} variant="outlined" color="error" startIcon={<HighlightOffRounded/>} onClick={()=>decide(r,'Từ chối')}>Từ chối</Button><Button disabled={!!busy} variant="contained" startIcon={<CheckCircleOutlineRounded/>} onClick={()=>decide(r,'Đã duyệt')}>Xác nhận</Button></Stack>}
    </Stack></Paper>)}
  </Stack>;
}
