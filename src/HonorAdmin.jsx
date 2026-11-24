import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Box, Alert, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import { AddRounded, DeleteOutlineRounded, EditRounded, ImageRounded, PreviewRounded } from '@mui/icons-material';
import { db } from './firebase';
import { uploadHonorImage } from './HonorCloudinary';
import { HONOR_COLLECTION, HONOR_CONFIG, defaultHonorConfig } from './HonorService';
import './HonorWall.css';

const empty = { title:'', description:'', eventName:'', imageUrl:'', imageAlt:'', category:'Cá nhân', startDate:new Date().toISOString().slice(0,10), endDate:'', status:'draft', priority:0, showPopup:true, showBanner:true, consentConfirmed:false };
const fmtDate = value => value ? value.split('-').reverse().join('/') : 'Không giới hạn';
const validImageUrl = value => { try { const u=new URL(value); return u.protocol==='https:'; } catch {return false;} };
export default function HonorAdmin({profile}) {
  const [items,setItems] = useState([]);
  const [config,setConfig] = useState(defaultHonorConfig);
  const [open,setOpen] = useState(false);
  const [editing,setEditing] = useState(null);
  const [form,setForm] = useState(empty);
  const [file,setFile] = useState(null);
  const [filePreview,setFilePreview] = useState('');
  const [busy,setBusy] = useState(false);
  const [saveStage,setSaveStage] = useState('');
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [preview,setPreview] = useState(false);
  useEffect(() => {
    if(profile?.role !== 'admin') return undefined;
    return onSnapshot(collection(db,HONOR_COLLECTION),snap=>setItems(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0))), e=>setError('Không tải được bài tuyên dương: '+e.message));
  },[profile?.role]);
  useEffect(()=>{
    if(profile?.role !== 'admin') return undefined;
    return onSnapshot(HONOR_CONFIG,snap=>setConfig(snap.exists()?{...defaultHonorConfig,...snap.data()}:defaultHonorConfig),e=>setError('Không đọc được cấu hình: '+e.message));
  },[profile?.role]);
  useEffect(()=>()=>{if(filePreview)URL.revokeObjectURL(filePreview)},[filePreview]);
  if(profile?.role !== 'admin') return <Alert severity="error">Chỉ Admin có quyền quản lý tuyên dương.</Alert>;
  const start = item => {setEditing(item?.id||null);setForm(item?{...empty,...item, consentConfirmed:item.consentConfirmed===true}:{...empty});setFile(null);setFilePreview('');setError('');setOpen(true)};
  const change = (key,value) => setForm(prev=>({...prev,[key]:value}));
  const chooseFile = event => {
    const f=event.target.files?.[0]; if(!f)return;
    if(!['image/jpeg','image/png','image/webp'].includes(f.type)){setError('Chỉ chấp nhận JPG, PNG hoặc WebP.');return;}
    if(f.size>5*1024*1024){setError('Ảnh tối đa 5 MB. Vui lòng nén ảnh trước khi tải.');return;}
    setError('');setFile(f);setFilePreview(URL.createObjectURL(f));
  };
  const save = async () => {
    if(busy)return;
    if(!form.title.trim() || form.title.trim().length>150){setError('Tiêu đề phải có nội dung, tối đa 150 ký tự.');return;}
    if(form.startDate && form.endDate && form.endDate<form.startDate){setError('Ngày kết thúc không được trước ngày bắt đầu.');return;}
    if(form.status==='published' && !form.consentConfirmed){setError('Hãy xác nhận đã có quyền công bố hình ảnh và thông tin người được vinh danh.');return;}
    if(form.status==='published' && !file && !validImageUrl(form.imageUrl)){setError('Bài xuất bản cần có ảnh bìa.');return;}
    setBusy(true);setError('');setSaveStage('Đang chuẩn bị dữ liệu...');
    try {
      let imageUrl=form.imageUrl;
      let imagePath=form.imagePath||'';
      if(file){
        setSaveStage('Đang xác thực Admin và tải ảnh lên Cloudinary...');
        const uploaded=await uploadHonorImage(file);
        imageUrl=uploaded.secure_url;
        imagePath=uploaded.public_id;
      }
      setSaveStage('Đang lưu bài viết vào Firestore...');
      const payload={title:form.title.trim(),description:form.description.trim().slice(0,1500),eventName:form.eventName.trim().slice(0,180),category:form.category,imageUrl:imageUrl||'',imagePath,imageAlt:(form.imageAlt||form.title).trim().slice(0,160),startDate:form.startDate||'',endDate:form.endDate||'',status:form.status,priority:Number(form.priority)||0,showPopup:Boolean(form.showPopup),showBanner:Boolean(form.showBanner),consentConfirmed:Boolean(form.consentConfirmed),updatedAt:serverTimestamp()};
      if(editing) await updateDoc(doc(db,HONOR_COLLECTION,editing),payload);
      else await addDoc(collection(db,HONOR_COLLECTION),{...payload,createdAt:serverTimestamp()});
      setOpen(false);setNotice('Đã lưu bài tuyên dương vào Firestore thành công.');setFile(null);
    } catch(e) {
      setError(`Không hoàn tất thao tác: ${e?.message||String(e)}. Nếu ảnh đã tải lên nhưng Firestore lỗi, hãy kiểm tra bài viết trước khi thử lại.`);
    } finally {setBusy(false);setSaveStage('')}
  };
  const remove = async item => {
    if(busy || !window.confirm(`Xóa bài tuyên dương “${item.title}”? Ảnh Cloudinary không tự bị xóa.`))return;
    setBusy(true);setError('');
    try{await deleteDoc(doc(db,HONOR_COLLECTION,item.id));setNotice('Đã xóa bài viết. Ảnh Cloudinary chưa được xóa tự động.')}catch(e){setError('Không xóa được bài: '+e.message)}finally{setBusy(false)}
  };
  const updateSetting = async (key, checked) => {
    setBusy(true);setError('');
    try{await setDoc(HONOR_CONFIG,{[key]:checked,updatedAt:serverTimestamp()},{merge:true});}
    catch(e){setError('Không cập nhật được cấu hình: '+e.message)}finally{setBusy(false)}
  };
  return <Stack className="honor-admin" spacing={2.5}>
    <Box className="honor-admin-header"><Box><Typography variant="overline">CLB TAEKWONDO GREEN · PREMIUM SPORTS</Typography><Typography variant="h5" fontWeight={900}>Quản lý Vinh danh & Tuyên dương</Typography><Typography>Ảnh lưu trên Cloudinary; bài viết và phân quyền vẫn quản lý bằng Firebase.</Typography></Box><Button variant="contained" startIcon={<AddRounded/>} onClick={()=>start(null)}>Thêm bài tuyên dương</Button></Box>
    {error&&<Alert severity="error" onClose={()=>setError('')}>{error}</Alert>}{notice&&<Alert severity="success" onClose={()=>setNotice('')}>{notice}</Alert>}
    <Paper className="honor-admin-options" elevation={0}><Typography variant="h6" fontWeight={850}>Cấu hình hiển thị</Typography><Typography color="text.secondary" variant="body2">Popup chỉ xuất hiện một lần mỗi phiên. Banner chỉ hiển thị trên trang chủ công khai.</Typography>
      <Stack direction={{xs:'column',md:'row'}} gap={2} sx={{mt:1.5}}><FormControlLabel control={<Switch checked={config.popupEnabled!==false} disabled={busy} onChange={e=>updateSetting('popupEnabled',e.target.checked)}/>} label="Popup khi truy cập"/><FormControlLabel control={<Switch checked={config.bannerEnabled!==false} disabled={busy} onChange={e=>updateSetting('bannerEnabled',e.target.checked)}/>} label="Banner trang chủ công khai"/></Stack>
    </Paper>
    <Stack direction="row" flexWrap="wrap" gap={1}><Chip label={`${items.length} bài viết`} /><Chip color="success" label={`${items.filter(x=>x.status==='published').length} đã xuất bản`}/><Chip label={`${items.filter(x=>x.status!=='published').length} bản nháp`}/></Stack>
    {!items.length?<Paper sx={{p:4,textAlign:'center'}}><ImageRounded sx={{fontSize:48,color:'#8cae9a'}}/><Typography fontWeight={800}>Chưa có bài tuyên dương</Typography><Typography color="text.secondary">Thêm bài đầu tiên để xuất hiện trên trang chủ.</Typography></Paper>:
    <div className="honor-admin-list">{items.map(item=><Paper key={item.id} className="honor-admin-row" elevation={0}><div className="honor-admin-thumb">{item.imageUrl?<img src={item.imageUrl} alt={item.title}/>:<ImageRounded/>}</div><Box sx={{flex:1,minWidth:0}}><Typography fontWeight={850}>{item.title}</Typography><Typography variant="caption" color="text.secondary">{item.eventName||item.category} · {fmtDate(item.startDate)} – {fmtDate(item.endDate)}</Typography><Stack direction="row" flexWrap="wrap" gap={.7} sx={{mt:.7}}><Chip size="small" color={item.status==='published'?'success':'default'} label={item.status==='published'?'Đã xuất bản':'Bản nháp'}/>{item.showPopup&&<Chip size="small" label="Popup"/>}{item.showBanner&&<Chip size="small" label="Banner"/>}</Stack></Box><Stack direction="row"><IconButton aria-label={'Xem trước '+item.title} onClick={()=>{setForm({...empty,...item});setPreview(true)}}><PreviewRounded/></IconButton><IconButton aria-label={'Sửa '+item.title} onClick={()=>start(item)}><EditRounded/></IconButton><IconButton aria-label={'Xóa '+item.title} color="error" onClick={()=>remove(item)}><DeleteOutlineRounded/></IconButton></Stack></Paper>)}</div>}
    <Dialog open={open} onClose={busy?undefined:()=>setOpen(false)} fullWidth maxWidth="md" scroll="paper"><DialogTitle sx={{fontWeight:850}}>{editing?'Chỉnh sửa':'Thêm'} bài tuyên dương</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:1}}>{error&&<Alert severity="error">{error}</Alert>}{busy&&<Alert severity="info">{saveStage}</Alert>}
      <Box className="honor-upload-box">{filePreview||form.imageUrl?<img src={filePreview||form.imageUrl} alt="Xem trước ảnh"/>:<ImageRounded sx={{fontSize:48,color:'#598c75'}}/>}<Button variant="outlined" component="label">{file||form.imageUrl?'Đổi ảnh bìa':'Tải ảnh lên'}<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile}/></Button><Typography variant="caption">Một ảnh responsive cho Desktop & Mobile · JPG/PNG/WebP · tối đa 5 MB. Kiểm tra vùng cắt ở bản xem trước.</Typography></Box>
      <TextField required label="Tiêu đề tuyên dương" value={form.title} onChange={e=>change('title',e.target.value)} inputProps={{maxLength:150}}/>
      <TextField label="Giải đấu / sự kiện" value={form.eventName} onChange={e=>change('eventName',e.target.value)} inputProps={{maxLength:180}}/>
      <TextField label="Nội dung giới thiệu" multiline minRows={3} value={form.description} onChange={e=>change('description',e.target.value)} inputProps={{maxLength:1500}}/>
      <TextField label="Mô tả ảnh (hỗ trợ truy cập)" value={form.imageAlt} onChange={e=>change('imageAlt',e.target.value)} inputProps={{maxLength:160}}/>
      <Stack direction={{xs:'column',sm:'row'}} gap={2}><TextField select fullWidth label="Loại vinh danh" value={form.category} onChange={e=>change('category',e.target.value)}>{['Cá nhân','Đôi','Đồng đội','Tập thể CLB','Huấn luyện viên','Khác'].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField><TextField type="number" fullWidth label="Độ ưu tiên" value={form.priority} onChange={e=>change('priority',e.target.value)}/></Stack>
      <Stack direction={{xs:'column',sm:'row'}} gap={2}><TextField type="date" fullWidth label="Bắt đầu" value={form.startDate} onChange={e=>change('startDate',e.target.value)} InputLabelProps={{shrink:true}}/><TextField type="date" fullWidth label="Kết thúc (để trống nếu không giới hạn)" value={form.endDate} onChange={e=>change('endDate',e.target.value)} InputLabelProps={{shrink:true}}/></Stack>
      <Stack direction={{xs:'column',sm:'row'}} gap={1}><FormControlLabel control={<Checkbox checked={form.showPopup} onChange={e=>change('showPopup',e.target.checked)}/>} label="Hiển thị Popup"/><FormControlLabel control={<Checkbox checked={form.showBanner} onChange={e=>change('showBanner',e.target.checked)}/>} label="Hiển thị Banner"/></Stack>
      <FormControlLabel control={<Checkbox checked={form.consentConfirmed} onChange={e=>change('consentConfirmed',e.target.checked)}/>} label="Tôi xác nhận CLB có quyền sử dụng ảnh và được phép công khai thông tin người được vinh danh (đối với trẻ em cần sự đồng ý phù hợp)."/>
      <TextField select label="Trạng thái" value={form.status} onChange={e=>change('status',e.target.value)}><MenuItem value="draft">Lưu bản nháp (không công khai)</MenuItem><MenuItem value="published">Xuất bản công khai</MenuItem></TextField>
    </Stack></DialogContent><DialogActions sx={{p:2}}><Button disabled={busy} onClick={()=>setOpen(false)}>Hủy</Button><Button variant="contained" disabled={busy} onClick={save}>{busy?<><CircularProgress size={16}/> {saveStage||'Đang lưu...'}</>:'Lưu bài tuyên dương'}</Button></DialogActions></Dialog>
    <Dialog open={preview} onClose={()=>setPreview(false)} fullWidth maxWidth="sm"><DialogTitle>Xem trước bài tuyên dương</DialogTitle><DialogContent><Box className="honor-admin-preview">{form.imageUrl&&<img src={form.imageUrl} alt={form.imageAlt||form.title}/>}<Typography variant="h5" sx={{mt:2,fontWeight:900}}>{form.title}</Typography><Typography>{form.eventName}</Typography><Typography sx={{mt:1,whiteSpace:'pre-line'}}>{form.description}</Typography></Box></DialogContent><DialogActions><Button onClick={()=>setPreview(false)}>Đóng</Button></DialogActions></Dialog>
  </Stack>;
}
