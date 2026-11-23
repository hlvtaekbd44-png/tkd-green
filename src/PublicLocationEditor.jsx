import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { Alert, Button, Checkbox, Divider, FormControlLabel, IconButton, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { db } from './firebase';
const days=['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'];
const blank={description:'',trainingHours:'',mapQuery:'',mapUrl:'',schedule:[],coaches:[],published:false};
function validMapUrl(value) {
  if (!value) return true;
  try {const u=new URL(value);return u.protocol==='https:'&&( ['maps.app.goo.gl','maps.google.com','goo.gl'].includes(u.hostname) || ['www.google.com','google.com'].includes(u.hostname)&&u.pathname.startsWith('/maps'));}catch{return false;}
}
export default function PublicLocationEditor({location}) {
  const [form,setForm]=useState(blank),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(''),[loadError,setLoadError]=useState('');
  useEffect(()=>{
    if(!location?.id)return;
    setLoadError('');
    const stop=onSnapshot(doc(db,'publicLocations',location.id),snap=>{
      const d=snap.exists()?snap.data():location.introduction||{};
      setForm({description:d.description||'',trainingHours:d.trainingHours||'',mapQuery:d.mapQuery||'',mapUrl:d.mapUrl||'',schedule:Array.isArray(d.schedule)?d.schedule:[],coaches:Array.isArray(d.coaches)?d.coaches.map(x=>typeof x==='string'?{name:x,role:''}:x):[],published:d.published===true});
    },err=>setLoadError(err.code === 'permission-denied' ? 'Firestore từ chối đọc publicLocations. Admin cần Publish Rules mới trong Firebase Console; kiểm tra tài khoản hiện tại có role=admin và active=true.' : `Không tải được bản giới thiệu: ${err.message}`));
    return stop;
  },[location?.id]);
  if(!location?.id)return null;
  const change=(key,value)=>setForm(p=>({...p,[key]:value}));
  const changeRow=(key,index,field,value)=>setForm(p=>({...p,[key]:p[key].map((x,i)=>i===index?{...x,[field]:value}:x)}));
  const save=async()=>{
    if(busy)return;
    if(!validMapUrl(form.mapUrl)){setError('Liên kết chỉ đường không hợp lệ. Hãy dùng liên kết Google Maps HTTPS hoặc để trống.');return;}
    if(form.description.length>1200||form.trainingHours.length>700||form.mapQuery.length>500){setError('Mô tả hoặc vị trí quá dài.');return;}
    const schedule=form.schedule.map(x=>({day:String(x.day||'').trim(),time:String(x.time||'').trim(),note:String(x.note||'').trim()})).filter(x=>x.day||x.time);
    if(schedule.some(x=>!days.includes(x.day)||!x.time||x.time.length>100||x.note.length>120)){setError('Lịch học chưa hợp lệ: mỗi dòng phải có Thứ và Giờ học; nếu không dùng, bấm biểu tượng thùng rác để xóa dòng.');return;}
    const coaches=form.coaches.map(x=>({name:String(x.name||'').trim(),role:String(x.role||'').trim()})).filter(x=>x.name);
    if(coaches.some(x=>x.name.length>100||x.role.length>100)){setError('Tên và vai trò HLV không được vượt quá 100 ký tự.');return;}
    setBusy(true);setError('');setSuccess('');
    try {
      await setDoc(doc(db,'publicLocations',location.id),{
        name:String(location.name||'').trim(),address:String(location.address||'').trim(),active:location.active!==false && location.deleted!==true,
        description:form.description.trim(),trainingHours:form.trainingHours.trim(),mapQuery:form.mapQuery.trim(),mapUrl:form.mapUrl.trim(),
        schedule,coaches,published:form.published===true && location.active!==false && location.deleted!==true,updatedAt:serverTimestamp()
      });
      setSuccess('Đã lưu thông tin giới thiệu công khai.');
    } catch(e) {setError(e.code === 'permission-denied' ? 'Không có quyền ghi publicLocations (permission-denied). Mở Firebase Console → Firestore Database → Rules, thêm match publicLocations như hướng dẫn, nhấn Publish; đăng nhập bằng Admin đang hoạt động rồi thử lại.' : `Lưu thất bại (${e.code || 'unknown'}): ${e.message}`);}
    finally {setBusy(false);}
  };
  return <Paper variant="outlined" sx={{p:2.5,mt:2,borderRadius:3}}><Stack spacing={2}>
    <Typography variant="h6" fontWeight={800}>Giới thiệu công khai: {location.name}</Typography>
    <Alert severity="info">Thông tin chỉ xuất hiện trên trang công khai khi bật “Xuất bản”. Không công khai dữ liệu hội viên, học phí hay tài khoản.</Alert>
    {loadError&&<Alert severity="warning">{loadError} Bạn vẫn có thể điền và thử lưu sau khi cập nhật Rules.</Alert>}{error&&<Alert severity="error">{error}</Alert>}{success&&<Alert severity="success">{success}</Alert>}
    <TextField label="Giới thiệu ngắn" fullWidth multiline minRows={2} value={form.description} onChange={e=>change('description',e.target.value)}/>
    <TextField label="Thời gian tập luyện chung" fullWidth multiline minRows={2} value={form.trainingHours} onChange={e=>change('trainingHours',e.target.value)}/>
    <TextField label="Địa chỉ hoặc tọa độ bản đồ" fullWidth value={form.mapQuery} onChange={e=>change('mapQuery',e.target.value)} helperText="Ưu tiên tọa độ lat,long để ghim chính xác. Nếu trống sẽ dùng địa chỉ điểm tập."/>
    <TextField label="Liên kết chỉ đường Google Maps (tùy chọn)" fullWidth value={form.mapUrl} onChange={e=>change('mapUrl',e.target.value)}/>
    <Divider/><Typography fontWeight={800}>Lịch học</Typography>
    {form.schedule.map((x,i)=><Stack key={i} direction={{xs:'column',sm:'row'}} spacing={1} alignItems="center"><TextField select label="Thứ" value={x.day||''} onChange={e=>changeRow('schedule',i,'day',e.target.value)} sx={{minWidth:150}}>{days.map(d=><MenuItem key={d} value={d}>{d}</MenuItem>)}</TextField><TextField fullWidth label="Giờ học" value={x.time||''} onChange={e=>changeRow('schedule',i,'time',e.target.value)}/><TextField fullWidth label="Lớp / Ghi chú" value={x.note||''} onChange={e=>changeRow('schedule',i,'note',e.target.value)}/><IconButton color="error" onClick={()=>change('schedule',form.schedule.filter((_,j)=>i!==j))}><Delete/></IconButton></Stack>)}
    <Button startIcon={<Add/>} onClick={()=>change('schedule',[...form.schedule,{day:'Thứ 2',time:'',note:''}])}>Thêm buổi học</Button>
    <Divider/><Typography fontWeight={800}>Huấn luyện viên giảng dạy</Typography>
    {form.coaches.map((x,i)=><Stack key={i} direction={{xs:'column',sm:'row'}} spacing={1} alignItems="center"><TextField fullWidth label="Tên HLV" value={x.name||''} onChange={e=>changeRow('coaches',i,'name',e.target.value)}/><TextField fullWidth label="Vai trò / Cấp đai" value={x.role||''} onChange={e=>changeRow('coaches',i,'role',e.target.value)}/><IconButton color="error" onClick={()=>change('coaches',form.coaches.filter((_,j)=>i!==j))}><Delete/></IconButton></Stack>)}
    <Button startIcon={<Add/>} onClick={()=>change('coaches',[...form.coaches,{name:'',role:''}])}>Thêm HLV</Button>
    <FormControlLabel control={<Checkbox checked={form.published} onChange={e=>change('published',e.target.checked)} />} label="Xuất bản công khai cho tất cả mọi người (không cần đăng nhập)"/>
    <Button variant="contained" disabled={busy} onClick={save}>{busy?'Đang lưu...':'Lưu / Xuất bản giới thiệu'}</Button>
  </Stack></Paper>;
}
