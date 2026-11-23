import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { EmojiEventsRounded, AddRounded, EditRounded, DeleteOutlineRounded, OpenInNewRounded } from '@mui/icons-material';

const empty = {memberDocId:'', competition:'', event:'', award:'Huy chương Vàng', level:'Cấp CLB', date:'', organizer:'', description:'', evidenceUrl:''};
const awards=['Huy chương Vàng','Huy chương Bạc','Huy chương Đồng','Giải Nhất','Giải Nhì','Giải Ba','Giải Khuyến khích','Chứng nhận','Khác'];
const levels=['Cấp CLB','Cấp huyện / thị xã','Cấp tỉnh / thành phố','Cấp quốc gia','Quốc tế','Khác'];
const fmt = s => /^\d{4}-\d{2}-\d{2}$/.test(s||'') ? s.split('-').reverse().join('/') : 'Chưa cập nhật';
const safeUrl = input => { try { const u=new URL(String(input||'')); return u.protocol==='https:' ? u.toString():''; } catch {return '';} };
const badgeColor = award => award?.includes('Vàng') || award==='Giải Nhất' ? 'warning' : award?.includes('Bạc') ? 'default' : award?.includes('Đồng') ? 'secondary' : 'success';

export default function AchievementManagement({profile, students=[]}) {
  const admin = profile?.role==='admin';
  const coach = profile?.role==='hlv';
  const canWrite = admin || (coach && profile?.permissions?.members?.view === true);
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [search,setSearch]=useState('');
  const [chosenMember,setChosenMember]=useState('');
  const [dialog,setDialog]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState(empty);
  const [busy,setBusy]=useState(false);
  const members=useMemo(()=>[...students].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'vi')),[students]);
  const memberById=useMemo(()=>new Map(members.map(m=>[m.id,m])),[members]);
  useEffect(()=>{
    if(profile?.role!=='admin' && profile?.role!=='hlv') return undefined;
    const assigned=profile?.locationPermissions?.members || [];
    if(profile.role==='hlv' && (!profile?.permissions?.members?.view || !assigned.length)) {setRows([]);setLoading(false);return undefined;}
    const qs=profile.role==='admin' ? [collection(db,'memberAchievements')] :
      Array.from({length:Math.ceil(assigned.length/30)},(_,i)=>query(collection(db,'memberAchievements'),where('diemTap','in',assigned.slice(i*30,(i+1)*30))));
    const results=new Map();setLoading(true);
    const off=qs.map((q,i)=>onSnapshot(q,s=>{results.set(i,s.docs);const all=new Map();for(const group of results.values())for(const d of group) all.set(d.id,{id:d.id,...d.data()});setRows([...all.values()]);if(results.size===qs.length)setLoading(false);},e=>{setError(`Không đọc được thành tích: ${e.message}`);setLoading(false);}));
    return ()=>off.forEach(f=>f());
  },[profile?.role,profile?.uid,profile?.permissions?.members?.view,JSON.stringify(profile?.locationPermissions?.members||[])]);
  const filtered=useMemo(()=>rows.filter(r=>{
    if(chosenMember && r.memberDocId!==chosenMember)return false;
    const hay=`${r.memberName||''} ${r.competition||''} ${r.event||''} ${r.award||''} ${r.diemTap||''}`.toLocaleLowerCase('vi');
    return hay.includes(search.trim().toLocaleLowerCase('vi'));
  }).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))),[rows,search,chosenMember]);
  const begin=(row)=>{setEditing(row?.id||null);setForm(row ? Object.fromEntries(Object.keys(empty).map(k=>[k,row[k]??empty[k]])) : {...empty,memberDocId:chosenMember});setError('');setDialog(true);};
  const save=async()=>{
    if(!canWrite||busy)return;
    const member=memberById.get(form.memberDocId);
    if (coach && editing) {
      const original = rows.find(r => r.id === editing);
      if (!original || original.memberDocId !== form.memberDocId || original.diemTap !== member?.location) {
        setError('HLV không thể chuyển thành tích sang hội viên hoặc điểm tập khác.'); return;
      }
    }
    if(!member){setError('Hãy chọn hội viên hợp lệ từ danh sách.');return;}
    if(!form.competition.trim()||!form.event.trim()||!form.date){setError('Cần nhập tên giải đấu, nội dung thi và ngày đạt thành tích.');return;}
    if(form.evidenceUrl.trim()&&!safeUrl(form.evidenceUrl.trim())){setError('Liên kết minh chứng phải bắt đầu bằng https://');return;}
    if(form.date > new Date().toISOString().slice(0,10)){setError('Ngày đạt thành tích không được ở tương lai.');return;}
    const payload={...form,competition:form.competition.trim(),event:form.event.trim(),organizer:form.organizer.trim(),description:form.description.trim(),evidenceUrl:form.evidenceUrl.trim(),memberName:member.name||'',diemTap:member.location||'',updatedAt:serverTimestamp()};
    setBusy(true);setError('');
    try {if(editing)await updateDoc(doc(db,'memberAchievements',editing),payload);else await addDoc(collection(db,'memberAchievements'),{...payload,createdAt:serverTimestamp()});setDialog(false);setNotice('Đã lưu thành tích vào hồ sơ hội viên.');}catch(e){setError(`Lưu thất bại: ${e.message}`);}finally{setBusy(false);}
  };
  const remove=async row=>{if(!admin||busy||!window.confirm(`Xóa thành tích “${row.competition}” của ${row.memberName}?`))return;setBusy(true);try{await deleteDoc(doc(db,'memberAchievements',row.id));setNotice('Đã xóa thành tích.');}catch(e){setError(e.message);}finally{setBusy(false);}};
  return <Stack spacing={2.5} sx={{minWidth:0,fontFamily:'"Segoe UI",Arial,sans-serif'}}>
    <Paper sx={{p:{xs:2.5,md:3},borderRadius:3,background:'linear-gradient(115deg,#075d3d,#098354)',color:'#fff !important','& .MuiTypography-root':{color:'#fff !important'}}}>
      <Stack direction="row" alignItems="center" spacing={2}><EmojiEventsRounded sx={{fontSize:42,color:'#fff'}}/><Box><Typography variant="h5" fontWeight={800}>Bảng thành tích võ sinh</Typography><Typography>Ghi nhận thành tích thi đấu và lưu vào từng hồ sơ hội viên.</Typography></Box></Stack>
    </Paper>
    {error&&!dialog&&<Alert severity="error">{error}</Alert>}{notice&&<Alert severity="success" onClose={()=>setNotice('')}>{notice}</Alert>}
    <Paper sx={{p:2,borderRadius:3}}><Stack direction={{xs:'column',md:'row'}} spacing={1.5}>
      <TextField select label="Lọc theo hội viên" value={chosenMember} onChange={e=>setChosenMember(e.target.value)} sx={{minWidth:{md:250},flex:1}}><MenuItem value="">Tất cả hội viên</MenuItem>{members.map(m=><MenuItem key={m.id} value={m.id}>{m.name||'Chưa có tên'} · {m.maHV||m.maHoiVienNoiBo||m.id}</MenuItem>)}</TextField>
      <TextField label="Tìm giải đấu, huy chương, nội dung..." value={search} onChange={e=>setSearch(e.target.value)} sx={{flex:1.3}}/>
      {canWrite&&<Button variant="contained" startIcon={<AddRounded/>} onClick={()=>begin(null)} sx={{whiteSpace:'nowrap'}}>Ghi nhận thành tích</Button>}
    </Stack></Paper>
    {loading ? <Typography color="text.secondary">Đang tải thành tích...</Typography> : filtered.length===0 ? <Paper sx={{p:4,borderRadius:3,textAlign:'center'}}><EmojiEventsRounded sx={{fontSize:42,color:'#9aac9c'}}/><Typography fontWeight={700}>Chưa có thành tích được ghi nhận</Typography><Typography color="text.secondary">Thành tích mới sẽ xuất hiện sau khi Admin hoặc HLV phụ trách lưu.</Typography></Paper> : <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(2,minmax(0,1fr))'},gap:2}}>{filtered.map(r=><Paper key={r.id} sx={{p:2.5,borderRadius:3}}><Stack spacing={1.3}><Stack direction="row" justifyContent="space-between" alignItems="start" gap={1}><Box><Typography variant="caption" color="text.secondary">{r.memberName||memberById.get(r.memberDocId)?.name||'Hội viên'} · {r.diemTap||''}</Typography><Typography variant="h6" fontWeight={800}>{r.competition}</Typography></Box><Chip color={badgeColor(r.award)} size="small" label={r.award||'Thành tích'}/></Stack><Divider/><Typography><b>Nội dung:</b> {r.event}</Typography><Typography variant="body2"><b>Cấp giải:</b> {r.level} · <b>Ngày:</b> {fmt(r.date)}</Typography>{r.organizer&&<Typography variant="body2">Đơn vị tổ chức: {r.organizer}</Typography>}{r.description&&<Typography variant="body2" sx={{whiteSpace:'pre-wrap'}}>{r.description}</Typography>}{safeUrl(r.evidenceUrl)&&<Button component="a" href={safeUrl(r.evidenceUrl)} target="_blank" rel="noopener noreferrer" startIcon={<OpenInNewRounded/>} sx={{alignSelf:'start'}}>Xem minh chứng</Button>}{canWrite&&<Stack direction="row" justifyContent="end"><Button startIcon={<EditRounded/>} onClick={()=>begin(r)}>Sửa</Button>{admin && <Button color="error" startIcon={<DeleteOutlineRounded/>} onClick={()=>remove(r)} disabled={busy}>Xóa</Button>}</Stack>}</Stack></Paper>)}</Box>}
    <Dialog open={dialog} onClose={busy?undefined:()=>setDialog(false)} fullWidth maxWidth="md" scroll="paper"><DialogTitle sx={{fontWeight:800}}>{editing?'Sửa':'Ghi nhận'} thành tích hội viên</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:1}}>{error&&<Alert severity="error">{error}</Alert>}
      <TextField select required label="Hội viên" disabled={Boolean(editing)} value={form.memberDocId} onChange={e=>setForm(p=>({...p,memberDocId:e.target.value}))}>{members.map(m=><MenuItem key={m.id} value={m.id}>{m.name} · {m.maHV||m.maHoiVienNoiBo||m.id} · {m.location||''}</MenuItem>)}</TextField>
      <TextField required label="Tên giải đấu / sự kiện" value={form.competition} onChange={e=>setForm(p=>({...p,competition:e.target.value}))} inputProps={{maxLength:180}}/>
      <TextField required label="Nội dung thi đấu" value={form.event} onChange={e=>setForm(p=>({...p,event:e.target.value}))} inputProps={{maxLength:180}}/>
      <Stack direction={{xs:'column',sm:'row'}} spacing={2}><TextField select fullWidth label="Thành tích" value={form.award} onChange={e=>setForm(p=>({...p,award:e.target.value}))}>{awards.map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField><TextField select fullWidth label="Quy mô giải" value={form.level} onChange={e=>setForm(p=>({...p,level:e.target.value}))}>{levels.map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField></Stack>
      <Box><Typography variant="caption" component="label" sx={{display:'block',mb:0.6,fontWeight:700}}>Ngày đạt thành tích *</Typography><TextField type="date" fullWidth value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} inputProps={{'aria-label':'Ngày đạt thành tích'}}/></Box>
      <TextField label="Đơn vị tổ chức" value={form.organizer} onChange={e=>setForm(p=>({...p,organizer:e.target.value}))}/>
      <TextField label="Ghi chú thành tích" multiline minRows={3} value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))}/>
      <TextField label="Liên kết minh chứng Google Drive (https://)" value={form.evidenceUrl} onChange={e=>setForm(p=>({...p,evidenceUrl:e.target.value}))} helperText="Chỉ lưu liên kết, không tải file lên Firebase Storage."/>
    </Stack></DialogContent><DialogActions sx={{p:2}}><Button onClick={()=>setDialog(false)} disabled={busy}>Hủy</Button><Button variant="contained" onClick={save} disabled={busy}>{busy?'Đang lưu...':'Lưu thành tích'}</Button></DialogActions></Dialog>
  </Stack>;
}
