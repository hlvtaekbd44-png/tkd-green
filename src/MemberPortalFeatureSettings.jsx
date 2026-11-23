import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Stack, TextField, Typography, CircularProgress } from '@mui/material';
import { db } from './firebase';

// Embed in Admin SettingsManagement: <MemberPortalFeatureSettings profile={profile} />
// This component only writes the 3 new location feature flags, preserving other settings.
const OPTIONS = [
  ['events','Sự kiện'], ['training','Đào tạo'], ['achievements','Thành tích'],
];
export default function MemberPortalFeatureSettings({ profile }) {
  const [locations,setLocations] = useState([]);
  const [selected,setSelected] = useState('');
  const [flags,setFlags] = useState({events:false, training:false, achievements:false});
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');
  useEffect(()=>{
    if(profile?.role!=='admin')return undefined;
    return onSnapshot(collection(db,'locations'),snap=>setLocations(snap.docs.map(d=>({id:d.id,...d.data()}))),err=>setError('Không tải được điểm tập: '+err.message));
  },[profile?.role]);
  const current=useMemo(()=>locations.find(x=>x.id===selected),[locations,selected]);
  useEffect(()=>{
    setFlags(Object.fromEntries(OPTIONS.map(([k])=>[k,current?.features?.[k]===true])));
    setError('');setSuccess('');
  },[current?.id, current?.features?.events,current?.features?.training,current?.features?.achievements]);
  const save=async()=>{
    if(!current||profile?.role!=='admin'||busy)return;
    setBusy(true);setError('');setSuccess('');
    try{
      // The complete features object is merged, so existing flags are preserved.
      await updateDoc(doc(db,'locations',current.id),{features:{...(current.features||{}),...flags}});
      setSuccess('Đã lưu quyền hiển thị cổng Hội viên cho '+current.name+'.');
    }catch(e){setError('Không lưu được: '+e.message)}finally{setBusy(false)}
  };
  if(profile?.role!=='admin')return null;
  return <Paper variant="outlined" sx={{p:3,borderRadius:3,mt:3}}>
    <Typography variant="h6" fontWeight={900}>Chức năng cổng Hội viên / Phụ huynh theo điểm tập</Typography>
    <Typography variant="body2" color="text.secondary" sx={{mb:2}}>Bật các chức năng mở rộng cho riêng từng điểm tập. Các chức năng Hội viên, Học phí, Thi cấp, Điểm danh, Xin phép nghỉ vẫn được cấu hình bằng bộ cờ hiện có.</Typography>
    {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
    {success&&<Alert severity="success" sx={{mb:2}}>{success}</Alert>}
    <TextField select fullWidth label="Chọn điểm tập" value={selected} onChange={e=>setSelected(e.target.value)} SelectProps={{native:true}} sx={{mb:2}}>
      <option value="">-- Chọn điểm tập --</option>
      {locations.map(l=><option value={l.id} key={l.id}>{l.name||l.id}</option>)}
    </TextField>
    {!!current&&<Stack spacing={0.5}>{OPTIONS.map(([key,label])=><FormControlLabel key={key} control={<Checkbox checked={!!flags[key]} onChange={e=>setFlags(f=>({...f,[key]:e.target.checked}))}/>} label={label}/>)}</Stack>}
    <Button variant="contained" disabled={!current||busy} onClick={save} sx={{mt:2}}>{busy?<CircularProgress size={19} color="inherit"/>:'Lưu cấu hình điểm tập'}</Button>
  </Paper>;
}
