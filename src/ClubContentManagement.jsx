import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import BeltExamProcedures from './BeltExamProcedures';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { CalendarMonthRounded, SchoolRounded, AddRounded, EditRounded, DeleteOutlineRounded, PlaceRounded, CollectionsRounded, PictureAsPdfRounded, PlayCircleOutlineRounded, VisibilityRounded }  from '@mui/icons-material';

const config = {
  events: { collection: 'clubEvents', title: 'Sự kiện', intro: 'Lịch hoạt động, giải đấu, giao lưu và sự kiện của CLB.', icon: CalendarMonthRounded, categories: ['Giải đấu', 'Giao lưu', 'Sinh hoạt CLB', 'Biểu diễn', 'Khác'] },
  training: { collection: 'clubTraining', title: 'Đào tạo', intro: 'Chương trình đào tạo, chuyên đề kỹ thuật và các khóa bồi dưỡng.', icon: SchoolRounded, categories: ['Kỹ thuật', 'Quyền', 'Đối kháng', 'Tự vệ', 'HLV / Trọng tài', 'Khác'] },
};
const blank = { title: '', category: '', startDate: '', endDate: '', startTime: '', endTime: '', location: '', description: '', status: 'Sắp diễn ra' };
const statusColors = { 'Sắp diễn ra': 'info', 'Đang diễn ra': 'success', 'Đã kết thúc': 'default', 'Tạm hoãn': 'warning' };
const displayDate = value => value ? String(value).split('-').reverse().join('/') : 'Chưa cập nhật';


const mediaKinds = ['image', 'pdf', 'video'];
function normalizeMediaUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.toString() : ''; }
  catch { return ''; }
}
function embeddableUrl(url, type) {
  const parsed = normalizeMediaUrl(url);
  if (!parsed) return '';
  const u = new URL(parsed);
  const youtube = u.hostname === 'youtu.be' ? u.pathname.slice(1) : (u.hostname.endsWith('youtube.com') ? u.searchParams.get('v') : '');
  if (type === 'video' && youtube && /^[A-Za-z0-9_-]{11}$/.test(youtube)) return `https://www.youtube-nocookie.com/embed/${youtube}`;
  if (u.hostname === 'drive.google.com') {
    const id = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1];
    if (id) return `https://drive.google.com/file/d/${id}/preview`;
  }
  return parsed;
}
function MediaPreview({ item }) {
  const uri = embeddableUrl(item.url, item.type);
  const isFrameVideo = item.type === 'video' && (uri.includes('youtube-nocookie.com/embed/') || uri.includes('drive.google.com/file/d/'));
  const isFramePdf = item.type === 'pdf' || uri.includes('drive.google.com/file/d/');
  if (!uri) return <Alert severity="warning">Liên kết tài liệu không hợp lệ.</Alert>;
  if (item.type === 'image' && !isFramePdf) return <Box component="img" src={uri} alt={item.name || 'Hình ảnh đào tạo'} sx={{maxWidth:'100%',maxHeight:'70vh',objectFit:'contain',borderRadius:2}}/>;
  if (isFrameVideo || isFramePdf) return <Box component="iframe" title={item.name || 'Tài liệu đào tạo'} src={uri} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen sx={{border:0,width:'100%',height:{xs:'65vh',md:'72vh'}}}/>;
  if (item.type === 'video') return <Box component="video" src={uri} controls playsInline sx={{width:'100%',maxHeight:'72vh',background:'#111'}}/>;
  return <Alert severity="info">Định dạng không hỗ trợ xem trực tiếp.</Alert>;
}

export default function ClubContentManagement({ kind = 'events', profile }) {
  const cfg = config[kind] || config.events;
  const isAdmin = profile?.role === 'admin';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState([]);
  const [newUrl, setNewUrl] = useState('');
  const [newType, setNewType] = useState('video');
  const [preview, setPreview] = useState(null);
  const [trainingTab, setTrainingTab] = useState('lessons');
  const Icon = cfg.icon;

  useEffect(() => {
    setRows([]); setLoading(true); setError('');
    return onSnapshot(collection(db, cfg.collection), snap => {
      setRows(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      setLoading(false);
    }, e => { setError(`Không đọc được dữ liệu ${cfg.title.toLowerCase()}: ${e.message}. Kiểm tra Firestore Rules.`); setLoading(false); });
  }, [cfg.collection, cfg.title]);

  const filtered = useMemo(() => rows.filter(r => [r.title, r.category, r.location, r.description].some(v => String(v || '').toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')))).sort((a,b) => String(b.startDate || '').localeCompare(String(a.startDate || '')) || String(a.title || '').localeCompare(String(b.title || ''), 'vi')), [rows,search]);
  const showForm = row => { setEditing(row?.id || null); setForm(row ? Object.fromEntries(Object.keys(blank).map(k => [k,row[k] || (k === 'status' ? 'Sắp diễn ra' : '')])) : {...blank, category:cfg.categories[0]}); setError(''); setMedia(Array.isArray(row?.media) ? row.media : []); setNewUrl(''); setOpen(true); };
  const save = async () => {
    if (!isAdmin || busy) return;
    const title = form.title.trim();
    if (!title || (kind === 'events' && !form.startDate)) { setError(kind === 'events' ? 'Cần nhập tên sự kiện và ngày bắt đầu.' : 'Cần nhập tên chuyên đề đào tạo.'); return; }
    if (form.endDate && form.endDate < form.startDate) { setError('Ngày kết thúc không được trước ngày bắt đầu.'); return; }
    if (form.endTime && form.startTime && (!form.endDate || form.endDate === form.startDate) && form.endTime < form.startTime) { setError('Giờ kết thúc không được trước giờ bắt đầu trong cùng ngày.'); return; }
    const payload = { ...form, ...(kind === 'training' ? { media } : {}), title, description:form.description.trim(), location:form.location.trim(), category:form.category || cfg.categories[0], updatedAt:serverTimestamp() };
    setBusy(true);setError('');setNotice('');
    try {
      if (editing) await updateDoc(doc(db,cfg.collection,editing),payload);
      else await addDoc(collection(db,cfg.collection),{...payload,createdAt:serverTimestamp()});
      setOpen(false);setNotice(editing ? 'Đã cập nhật nội dung.' : 'Đã thêm nội dung mới.');
    } catch(e) { setError(`Không lưu được: ${e.message}. Kiểm tra quyền Admin và Firestore Rules.`); }
    finally { setBusy(false); }
  };
  const addMediaLink = () => {
    const url = normalizeMediaUrl(newUrl.trim());
    if (!url) {setError('Liên kết phải bắt đầu bằng https:// hoặc http://');return;}
    setMedia(items => [...items, {type:newType, name:`${newType === 'image' ? 'Hình ảnh' : newType === 'pdf' ? 'Tài liệu PDF' : 'Video'} ${items.length+1}`, url, source:'link'}]);
    setNewUrl('');setError('');
  };
  const remove = async row => {
    if (!isAdmin || busy || !window.confirm(`Xóa ${cfg.title.toLowerCase()} “${row.title}”?`)) return;
    setBusy(true);setError('');setNotice('');
    try { await deleteDoc(doc(db,cfg.collection,row.id)); setNotice('Đã xóa nội dung.'); }
    catch(e) { setError(`Không xóa được: ${e.message}`); }
    finally { setBusy(false); }
  };

  return <Stack spacing={2.5} sx={{fontFamily:'"Segoe UI", Arial, sans-serif',minWidth:0, width:'100%', '& .MuiTypography-root, & .MuiButton-root, & .MuiInputBase-root, & .MuiInputLabel-root':{fontFamily:'"Segoe UI", Arial, sans-serif'}}}>
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2.5, md: 3 },
        borderRadius: 3,
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(120deg, #075c3c 0%, #087b4e 55%, #0b955c 100%)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 12px 30px rgba(4, 83, 51, 0.14)',
        // Đặt màu chữ trực tiếp ở từng phần tử: tránh App.css/TKDPro.css ghi đè.
        '& .tkd-content-hero-text': { color: '#ffffff !important' },
        '& .tkd-content-hero-subtitle': { color: '#e0f7eb !important' },
        '& .tkd-content-hero-icon': { color: '#ffffff !important' },
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            className="tkd-content-hero-subtitle"
            sx={{ fontSize: { xs: 11, sm: 12 }, fontWeight: 800, letterSpacing: '0.11em', textTransform: 'uppercase', mb: 0.75, lineHeight: 1.5, color: '#e0f7eb !important' }}
          >
            TKD GREEN · HOẠT ĐỘNG CLB
          </Typography>
          <Typography
            className="tkd-content-hero-text"
            component="h1"
            sx={{ fontSize: { xs: 24, sm: 29 }, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.18, color: '#ffffff !important' }}
          >
            {cfg.title}
          </Typography>
          <Typography
            className="tkd-content-hero-subtitle"
            sx={{ mt: 1, maxWidth: 720, fontSize: { xs: 13, sm: 15 }, fontWeight: 500, lineHeight: 1.6, color: '#e0f7eb !important' }}
          >
            {cfg.intro}
          </Typography>
        </Box>
        <Box sx={{ width: { xs: 48, sm: 54 }, height: { xs: 48, sm: 54 }, flexShrink: 0, borderRadius: 2.5, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.24)' }}>
          <Icon className="tkd-content-hero-icon" sx={{ fontSize: { xs: 30, sm: 40 }, color: '#ffffff !important' }} />
        </Box>
      </Stack>
    </Paper>
    {kind === 'training' && <Paper variant="outlined" sx={{borderRadius:2, overflow:'hidden'}}>
      <Tabs value={trainingTab} onChange={(_,value)=>setTrainingTab(value)} variant="fullWidth" aria-label="Chọn nội dung đào tạo" sx={{'& .MuiTab-root':{fontWeight:750, fontSize:{xs:12,sm:14},minHeight:52,textTransform:'none'}}}>
        <Tab value="lessons" label="Chuyên đề đào tạo" />
        <Tab value="belts" label="Quy trình thi cấp" />
      </Tabs>
    </Paper>}
    {(kind === 'events' || trainingTab === 'lessons') && <>
    <Stack direction={{xs:'column',sm:'row'}} spacing={1.5} alignItems={{sm:'center'}}>
      <TextField fullWidth label={`Tìm kiếm ${cfg.title.toLowerCase()}`} value={search} onChange={e=>setSearch(e.target.value)}/>
      {isAdmin && <Button variant="contained" startIcon={<AddRounded/>} onClick={()=>showForm(null)} sx={{whiteSpace:'nowrap'}}>Thêm {cfg.title.toLowerCase()}</Button>}
    </Stack>
    {notice && <Alert severity="success" onClose={()=>setNotice('')}>{notice}</Alert>}
    {error && !open && <Alert severity="error">{error}</Alert>}
    {loading ? <Typography color="text.secondary">Đang tải danh sách...</Typography> : filtered.length === 0 ? <Paper sx={{p:4,textAlign:'center'}}><Icon sx={{fontSize:40,color:'text.disabled'}}/><Typography fontWeight={700}>Chưa có nội dung phù hợp</Typography><Typography color="text.secondary">{isAdmin?'Nhấn Thêm để đăng nội dung đầu tiên.':'CLB sẽ cập nhật thông tin tại đây.'}</Typography></Paper> : <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(2,minmax(0,1fr))'},gap:2,minWidth:0}}>
      {filtered.map(row=><Paper key={row.id} sx={{p:{xs:2,md:2.5},borderRadius:3,minWidth:0,overflow:'hidden',boxShadow:'0 4px 18px rgba(9,80,49,.045)'}}>
        <Stack spacing={1.5}>
          <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} alignItems={{sm:'flex-start'}}><Box sx={{minWidth:0,flex:1}}><Typography variant="caption" color="primary.main" fontWeight={800}>{row.category || cfg.title}</Typography><Typography variant="h6" fontWeight={800} sx={{overflowWrap:'anywhere',fontSize:{xs:17,sm:19}}}>{row.title || 'Không có tiêu đề'}</Typography></Box><Chip size="small" sx={{alignSelf:'flex-start',flexShrink:0}} color={statusColors[row.status] || 'default'} label={row.status || 'Chưa cập nhật'} /></Stack>
          <Divider/>
          <Typography variant="body2"><CalendarMonthRounded sx={{fontSize:16,verticalAlign:'middle',mr:.7,color:'primary.main'}}/>{displayDate(row.startDate)}{row.endDate && row.endDate !== row.startDate ? ` – ${displayDate(row.endDate)}` : ''}{row.startTime ? ` · ${row.startTime}${row.endTime ? ' – '+row.endTime : ''}` : ''}</Typography>
          {row.location && <Typography variant="body2"><PlaceRounded sx={{fontSize:16,verticalAlign:'middle',mr:.7,color:'primary.main'}}/>{row.location}</Typography>}
          {row.description && <Typography variant="body2" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',display:'-webkit-box',WebkitLineClamp:5,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{row.description}</Typography>}
          {kind === 'training' && Array.isArray(row.media) && row.media.length > 0 && <Stack spacing={1}>
            <Typography fontWeight={700} color="primary.main">Thư viện tài liệu ({row.media.length})</Typography>
            {row.media.map((item,i) => <Button key={`${item.url}-${i}`} variant="outlined" size="small" startIcon={item.type==='image'?<CollectionsRounded/>:item.type==='pdf'?<PictureAsPdfRounded/>:<PlayCircleOutlineRounded/>} endIcon={<VisibilityRounded/>} sx={{justifyContent:'flex-start',textAlign:'left',overflowWrap:'anywhere'}} onClick={()=>setPreview(item)}>{item.name || `Tài liệu ${i+1}`}</Button>)}
          </Stack>}
          {isAdmin && <Stack direction="row" justifyContent="flex-end"><Button size="small" startIcon={<EditRounded/>} onClick={()=>showForm(row)}>Sửa</Button><Button size="small" color="error" startIcon={<DeleteOutlineRounded/>} disabled={busy} onClick={()=>remove(row)}>Xóa</Button></Stack>}
        </Stack>
      </Paper>)}
    </Box>}
    </>}
    {kind === 'training' && trainingTab === 'belts' && <BeltExamProcedures profile={profile}/> }
    <Dialog open={open} onClose={busy?undefined:()=>setOpen(false)} maxWidth="md" fullWidth scroll="paper" PaperProps={{sx:{maxHeight:'min(92vh,900px)',borderRadius:3}}}>
      <DialogTitle sx={{fontWeight:800}}>{editing?'Cập nhật':'Thêm'} {cfg.title.toLowerCase()}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{pt:1}}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Tên / tiêu đề" required value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} inputProps={{maxLength:150}}/>
        <TextField select label="Nhóm nội dung" value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}>{cfg.categories.map(c=><MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField>
        {/* Date/time fields use external labels to avoid floating-label collisions from global CSS. */}
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))'},gap:2}}>
          {[
            {key:'startDate',label:kind === 'events' ? 'Ngày bắt đầu *' : 'Ngày bắt đầu (không bắt buộc)',type:'date'},
            {key:'endDate',label:'Ngày kết thúc',type:'date'},
            {key:'startTime',label:'Giờ bắt đầu',type:'time'},
            {key:'endTime',label:'Giờ kết thúc',type:'time'},
          ].map(field => <Box key={field.key} sx={{minWidth:0}}>
            <Typography component="label" htmlFor={`tkd-${kind}-${field.key}`} sx={{display:'block',mb:0.75,fontSize:13,fontWeight:700,color:'#315847',lineHeight:1.5}}>{field.label}</Typography>
            <TextField
              id={`tkd-${kind}-${field.key}`}
              type={field.type}
              value={form[field.key] || ''}
              onChange={e=>setForm(p=>({...p,[field.key]:e.target.value}))}
              fullWidth
              size="small"
              required={kind === 'events' && field.key === 'startDate'}
              slotProps={{htmlInput:{'aria-label':field.label}}}
              sx={{'& .MuiOutlinedInput-root':{minHeight:42},'& input':{fontSize:14,color:'#18362a'}}}
            />
          </Box>)}
        </Box>
        <TextField label="Địa điểm" value={form.location} onChange={e=>setForm(p=>({...p,location:e.target.value}))} inputProps={{maxLength:200}}/>
        <TextField select label="Trạng thái" value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>{Object.keys(statusColors).map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField>
        <TextField label="Nội dung chi tiết" multiline minRows={4} value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} inputProps={{maxLength:5000}}/>
        {kind === 'training' && <Paper variant="outlined" sx={{p:2,borderRadius:2}}><Stack spacing={1.5}>
          <Typography fontWeight={800}>Hình ảnh · PDF · Video hướng dẫn</Typography>
          <Alert severity="info">Phương án miễn phí: lưu tài liệu trên Google Drive và video trên YouTube, sau đó dán liên kết. Hãy cấp quyền xem cho đối tượng sử dụng. Không cần Firebase Storage.</Alert>
          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'160px minmax(0,1fr) auto'},gap:1.5,alignItems:'end'}}>
            <Box sx={{minWidth:0}}>
              <Typography component="label" sx={{display:'block',mb:0.75,fontSize:13,fontWeight:700,color:'#315847'}}>Loại tài liệu</Typography>
              <TextField select fullWidth value={newType} onChange={e=>setNewType(e.target.value)} size="small" slotProps={{htmlInput:{'aria-label':'Loại tài liệu'}}}>{mediaKinds.map(t=><MenuItem key={t} value={t}>{t==='image'?'Hình ảnh':t==='pdf'?'PDF':'Video'}</MenuItem>)}</TextField>
            </Box>
            <Box sx={{minWidth:0}}>
              <Typography component="label" sx={{display:'block',mb:0.75,fontSize:13,fontWeight:700,color:'#315847'}}>Liên kết tài liệu</Typography>
              <TextField fullWidth size="small" placeholder="Dán liên kết Google Drive hoặc YouTube" value={newUrl} onChange={e=>setNewUrl(e.target.value)} slotProps={{htmlInput:{'aria-label':'Liên kết tài liệu'}}}/>
            </Box>
            <Button variant="outlined" onClick={addMediaLink} sx={{minHeight:40,whiteSpace:'nowrap',width:{xs:'100%',sm:'auto'}}}>Thêm liên kết</Button>
          </Box>
          {media.map((item,i)=><Stack key={i} direction="row" alignItems="center" gap={1} sx={{overflow:'hidden'}}>
            <Typography variant="body2" sx={{flex:1,overflow:'hidden',textOverflow:'ellipsis'}}>{i+1}. {item.name} ({item.type})</Typography>
            <Button size="small" onClick={()=>setPreview(item)}>Xem</Button>
            <Button size="small" color="error" disabled={busy} onClick={()=>setMedia(m=>m.filter((_,j)=>j!==i))}>Bỏ</Button>
          </Stack>)}
          <Typography variant="caption" color="text.secondary">“Bỏ” chỉ gỡ liên kết khỏi bài. Nguồn Google Drive/YouTube không bị xóa.</Typography>
        </Stack></Paper>}
      </Stack></DialogContent>
      <DialogActions sx={{p:2}}><Button disabled={busy} onClick={()=>setOpen(false)}>Hủy</Button><Button disabled={busy} variant="contained" onClick={save}>{busy?'Đang lưu...':'Lưu nội dung'}</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(preview)} onClose={()=>setPreview(null)} fullWidth maxWidth="lg" PaperProps={{sx:{maxHeight:'95vh'}}}>
      <DialogTitle sx={{fontWeight:800,overflowWrap:'anywhere'}}>{preview?.name || 'Xem tài liệu đào tạo'}</DialogTitle>
      <DialogContent sx={{px:{xs:1,md:2},pt:1,overflow:'auto'}}> {preview && <MediaPreview item={preview}/>}</DialogContent>
      <DialogActions><Button onClick={()=>setPreview(null)}>Đóng</Button></DialogActions>
    </Dialog>
  </Stack>;
}
