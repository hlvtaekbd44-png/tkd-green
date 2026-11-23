import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Alert, Box, Button, CircularProgress, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { db } from './firebase';

const empty = {coachName:'',coachPhone:'',bankName:'',bankAccount:'',bankHolder:'',transferNote:'',qrUrl:''};
const normalize = value => String(value ?? '').trim();

export default function PrintNoticeSettings({profile}) {
  const [locations,setLocations] = useState([]);
  const [selected,setSelected] = useState('');
  const [form,setForm] = useState(empty);
  const [working,setWorking] = useState(false);
  const [loading,setLoading] = useState(true);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [dirty,setDirty] = useState(false);
  const current = useMemo(() => locations.find(x=>x.id===selected),[locations,selected]);
  useEffect(()=>{
    if(profile?.role!=='admin') return;
    return onSnapshot(collection(db,'locations'),snapshot=>{
      setLocations(snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(d=>d.deleted!==true).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'vi')));
      setLoading(false);
    },err=>{setError('Không tải được điểm tập: '+err.message);setLoading(false);});
  },[profile?.role]);
  useEffect(()=>{
    if(!locations.some(x=>x.id===selected)) setSelected(locations[0]?.id||'');
  },[locations,selected]);
  useEffect(()=>{
    if(current && !dirty) setForm({...empty,...current.printNotice});
  },[current,dirty]);
  if(profile?.role!=='admin') return <Alert severity="error">Chỉ Admin được thay đổi mẫu phiếu in.</Alert>;
  const switchLocation=id=>{
    if(dirty && !window.confirm('Bỏ thông tin phiếu in chưa lưu của điểm tập này?')) return;
    setDirty(false);setMessage('');setError('');setSelected(id);
    const loc=locations.find(x=>x.id===id);
    setForm({...empty,...loc?.printNotice});
  };
  const edit=(key,value)=>{setForm(old=>({...old,[key]:value}));setDirty(true);setMessage('');};
  const chooseQR=async event=>{
    const file=event.target.files?.[0];event.target.value='';
    if(!file) return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)) {setError('Chỉ nhận PNG, JPG hoặc WebP.');return;}
    // Nhúng hình QR nhỏ để không phải cấu hình Storage. Giới hạn bảo vệ Firestore 1 MiB/document.
    if(file.size>70000){setError('Ảnh QR tối đa 70 KB. Hãy giảm kích thước ảnh QR trước khi chọn.');return;}
    const result=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Không đọc được ảnh.'));reader.readAsDataURL(file);}).catch(e=>{setError(e.message);return '';});
    if(result) {edit('qrUrl',result);setError('');}
  };
  const save=async()=>{
    if(!current?.id || working) return;
    const clean=Object.fromEntries(Object.keys(empty).map(k=>[k,normalize(form[k])]));
    if(!clean.coachName || !clean.coachPhone || !clean.bankName || !clean.bankAccount || !clean.bankHolder) {setError('Nhập đủ tên HLV, điện thoại, tên ngân hàng, số tài khoản và chủ tài khoản.');return;}
    if(clean.coachPhone.length>25 || clean.coachName.length>100 || clean.bankName.length>100 || clean.bankAccount.length>60 || clean.bankHolder.length>100 || clean.transferNote.length>150) {setError('Một hoặc nhiều trường thông tin dài quá giới hạn.');return;}
    if(clean.qrUrl && !(/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(clean.qrUrl) || /^https:\/\//i.test(clean.qrUrl))) {setError('Ảnh QR không hợp lệ.');return;}
    setWorking(true);setError('');setMessage('');
    try {
      await updateDoc(doc(db,'locations',current.id),{printNotice:clean});
      setDirty(false);setMessage(`Đã lưu thông tin in phiếu cho điểm tập ${current.name}.`);
    }catch(e){setError('Không lưu được cấu hình: '+e.message);}finally{setWorking(false);}
  };
  return <Stack spacing={2}>
    <Box><Typography variant="h6" fontWeight={800}>Thông tin phiếu in theo điểm tập</Typography><Typography variant="body2" color="text.secondary">Dùng cho phiếu A5 đen trắng, không thay đổi giá học phí và dữ liệu hội viên.</Typography></Box>
    {error && <Alert severity="error">{error}</Alert>}{message && <Alert severity="success">{message}</Alert>}
    {loading ? <CircularProgress size={24}/> : <Paper variant="outlined" sx={{p:2,borderRadius:3}}><Stack spacing={2}>
      <TextField select label="Chọn điểm tập" value={selected} onChange={e=>switchLocation(e.target.value)} fullWidth>{locations.map(l=><MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}</TextField>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'1fr 1fr'},gap:2}}>
        {[['coachName','Tên HLV phụ trách'],['coachPhone','SĐT HLV'],['bankName','Tên ngân hàng'],['bankAccount','Số tài khoản'],['bankHolder','Tên chủ tài khoản'],['transferNote','Nội dung chuyển khoản gợi ý']].map(([key,label])=><TextField key={key} label={label} value={form[key]||''} onChange={e=>edit(key,e.target.value)} fullWidth size="small"/>)}
      </Box>
      <Box sx={{p:2,border:'1px dashed',borderColor:'divider',borderRadius:2}}>
        <Typography fontWeight={700}>Mã QR chuyển khoản riêng của điểm tập</Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{mb:1}}>Chọn hình QR PNG/JPG/WebP không quá 70 KB. QR phải tương ứng với ngân hàng và số tài khoản ở trên.</Typography>
        <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
          <Button component="label" variant="outlined">Chọn ảnh QR<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseQR}/></Button>
          {form.qrUrl && <><img src={form.qrUrl} alt="QR đã chọn" style={{width:92,height:92,objectFit:'contain',border:'1px solid #ccc'}}/><Button color="error" variant="outlined" onClick={()=>edit('qrUrl','')}>Xóa QR</Button></>}
        </Stack>
      </Box>
      <Alert severity="info">Hệ thống không tự tạo QR theo số tài khoản. Admin phải kiểm tra bằng ứng dụng ngân hàng trước khi sử dụng chính thức.</Alert>
      <Stack direction="row" justifyContent="flex-end"><Button variant="contained" disabled={!selected || !dirty || working} onClick={save}>{working?'Đang lưu...':'Lưu thông tin phiếu in'}</Button></Stack>
    </Stack></Paper>}
  </Stack>;
}
