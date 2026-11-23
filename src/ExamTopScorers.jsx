import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { EmojiEventsRounded, AddRounded, DeleteOutlineRounded } from '@mui/icons-material';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const clean = x => String(x ?? '').trim();
const getMemberId = r => clean(r.memberDocId || r.memberId || '');
const positiveResult = r => ['đạt','pass','passed'].includes(clean(r.ketQua || r.result).toLocaleLowerCase('vi'));

/** Keeps winners in examPeriods/{periodId}.topScorers; no new collection or auto-promotion. */
export default function ExamTopScorers({ period, registrations = [], profile }) {
  const isAdmin = profile?.role === 'admin';
  const winners = Array.isArray(period?.topScorers) ? period.topScorers : [];
  const [open,setOpen] = useState(false);
  const [selected,setSelected] = useState('');
  const [score,setScore] = useState('');
  const [category,setCategory] = useState('Thủ khoa kỳ thi');
  const [note,setNote] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  useEffect(()=>{setOpen(false);setError('');setSelected('');},[period?.id]);
  const candidates = useMemo(()=>registrations.filter(r => getMemberId(r) && r.status !== 'Không dự thi' && r.status !== 'Đã hủy').sort((a,b)=>clean(a.hoTen).localeCompare(clean(b.hoTen),'vi')), [registrations]);
  const persist = async next => {
    if (!isAdmin || !period?.id) return;
    setBusy(true);setError('');
    try { await updateDoc(doc(db,'examPeriods',period.id), {topScorers:next, topScorersUpdatedAt:serverTimestamp()}); setOpen(false); }
    catch(e){setError(`Không lưu được danh hiệu: ${e.message}`);}
    finally{setBusy(false);}
  };
  const add = () => {
    const r = candidates.find(x=>x.id===selected);
    if(!r){setError('Hãy chọn võ sinh trong danh sách dự thi.');return;}
    const memberId = getMemberId(r);
    if(winners.some(w=>w.memberId===memberId && w.category===category.trim())){setError('Võ sinh đã được ghi nhận ở danh hiệu này.');return;}
    if(score.trim() && (!Number.isFinite(Number(score)) || Number(score)<0)){setError('Điểm phải là số không âm.');return;}
    persist([...winners,{memberId, registrationId:r.id, name:clean(r.hoTen || r.name), location:clean(r.diemTap), category:category.trim()||'Thủ khoa kỳ thi', score:score.trim(), note:note.trim()}]);
  };
  if(!period) return null;
  return <Paper variant="outlined" sx={{p:{xs:2,md:2.5},mb:2.5,borderRadius:3,borderColor:'#D4E5DA',bgcolor:'#FBFEFC'}}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} spacing={1.5}>
      <Box><Stack direction="row" spacing={1} alignItems="center"><EmojiEventsRounded sx={{color:'#D29A13'}}/><Typography fontWeight={850} sx={{color:'#18513B',fontSize:18}}>Thủ khoa kỳ thi</Typography></Stack><Typography variant="body2" color="text.secondary">{period.name || 'Đợt thi'} · Công bố danh hiệu theo kết quả đã xác nhận</Typography></Box>
      {isAdmin && <Button startIcon={<AddRounded/>} variant="contained" onClick={()=>{setSelected('');setScore('');setNote('');setCategory('Thủ khoa kỳ thi');setError('');setOpen(true);}} sx={{bgcolor:'#087B50'}}>Ghi nhận thủ khoa</Button>}
    </Stack>
    <Divider sx={{my:2}}/>
    {!winners.length ? <Typography color="text.secondary" variant="body2">Chưa công bố thủ khoa cho kỳ thi này.</Typography> :
      <Stack spacing={1.25}>{winners.map((w,i)=><Box key={`${w.memberId}-${w.category}-${i}`} sx={{bgcolor:'#FFF',border:'1px solid #E3EDE6',borderRadius:2,p:1.6}}>
        <Stack direction={{xs:'column',sm:'row'}} alignItems={{sm:'center'}} justifyContent="space-between" spacing={1}>
          <Box><Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap"><Typography fontWeight={800}>{w.name}</Typography><Chip size="small" label={w.category || 'Thủ khoa'} sx={{bgcolor:'#FFF3CD',color:'#805C08',fontWeight:750}}/></Stack><Typography variant="caption" color="text.secondary">{w.location || 'Chưa có điểm tập'}{w.score!=='' && w.score!=null ? ` · Điểm: ${w.score}`:''}{w.note?` · ${w.note}`:''}</Typography></Box>
          {isAdmin && <Button color="error" size="small" disabled={busy} startIcon={<DeleteOutlineRounded/>} onClick={()=>{if(window.confirm(`Gỡ danh hiệu của ${w.name}?`)) persist(winners.filter((_,j)=>i!==j));}}>Gỡ</Button>}
        </Stack>
      </Box>)}</Stack>}
    <Dialog open={open} onClose={()=>!busy&&setOpen(false)} fullWidth maxWidth="sm"><DialogTitle fontWeight={800}>Ghi nhận thủ khoa – {period.name}</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:1}}>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField select fullWidth label="Võ sinh dự thi" value={selected} onChange={e=>setSelected(e.target.value)}><MenuItem value="">Chọn võ sinh...</MenuItem>{candidates.map(r=><MenuItem key={r.id} value={r.id}>{r.hoTen || r.name} — {r.diemTap || ''} {positiveResult(r)?'· Đạt':''}</MenuItem>)}</TextField>
      <TextField label="Danh hiệu" value={category} onChange={e=>setCategory(e.target.value)} helperText="Có thể nhập Thủ khoa kỳ thi, Thủ khoa cấp đai..."/>
      <TextField label="Điểm thi (nếu có)" type="number" value={score} onChange={e=>setScore(e.target.value)} inputProps={{min:0,step:'any'}}/>
      <TextField label="Ghi chú / căn cứ xác nhận" multiline minRows={2} value={note} onChange={e=>setNote(e.target.value)}/>
      <Alert severity="info">Chỉ ghi nhận danh hiệu do Ban tổ chức xác nhận. Có thể ghi nhận nhiều võ sinh đồng thủ khoa; chức năng này không tự nâng cấp đai.</Alert>
    </Stack></DialogContent><DialogActions><Button onClick={()=>setOpen(false)} disabled={busy}>Hủy</Button><Button variant="contained" onClick={add} disabled={busy||!selected}>{busy?'Đang lưu...':'Lưu danh hiệu'}</Button></DialogActions></Dialog>
  </Paper>;
}
