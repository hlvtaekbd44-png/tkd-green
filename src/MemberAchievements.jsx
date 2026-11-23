import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { Alert, Box, Chip, Paper, Stack, Typography, Button } from '@mui/material';
import { EmojiEventsRounded, OpenInNewRounded } from '@mui/icons-material';
const dateVN = v => /^\d{4}-\d{2}-\d{2}$/.test(v||'') ? v.split('-').reverse().join('/') : (v||'Chưa cập nhật');
function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.toString():'';}catch{return '';}}
export default function MemberAchievements({memberDocId,embedded=true}) {
  const [rows,setRows]=useState([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
  useEffect(()=>{
    if(!memberDocId){setLoading(false);setRows([]);return undefined;}
    setLoading(true);setRows([]);setError('');
    return onSnapshot(query(collection(db,'memberAchievements'),where('memberDocId','==',memberDocId)),snap=>{setRows(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))));setLoading(false);},err=>{setError(err.code==='permission-denied'?'Chưa có quyền đọc thành tích của hội viên. Kiểm tra Firestore Rules.':err.message);setLoading(false);});
  },[memberDocId]);
  return <Stack spacing={2} sx={{width:'100%',minWidth:0}}>
    <Stack direction="row" spacing={1.5} alignItems="center"><EmojiEventsRounded sx={{color:'#087D4B',fontSize:28}}/><Box><Typography variant="h6" fontWeight={800}>Thành tích đã đạt được</Typography><Typography variant="body2" color="text.secondary">Kết quả thi đấu được CLB ghi nhận</Typography></Box></Stack>
    {error&&<Alert severity="error">{error}</Alert>}{loading?<Typography>Đang tải thành tích...</Typography>:rows.length===0?<Alert severity="info">Chưa có thành tích được ghi nhận.</Alert>:<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:2}}>{rows.map(row=><Paper key={row.id} variant="outlined" sx={{p:2.5,borderRadius:3}}><Stack spacing={1}><Chip sx={{alignSelf:'flex-start'}} color="success" size="small" label={row.award||'Thành tích'}/><Typography fontWeight={800}>{row.competition}</Typography><Typography variant="body2"><b>Nội dung:</b> {row.event||'Chưa cập nhật'}</Typography><Typography variant="body2" color="text.secondary">{row.level||'Giải đấu'} · {dateVN(row.date)}</Typography>{row.organizer&&<Typography variant="body2">Tổ chức: {row.organizer}</Typography>}{safeUrl(row.evidenceUrl)&&<Button component="a" href={safeUrl(row.evidenceUrl)} target="_blank" rel="noopener noreferrer" startIcon={<OpenInNewRounded/>} sx={{alignSelf:'start'}}>Minh chứng</Button>}</Stack></Paper>)}</Box>}
  </Stack>;
}
