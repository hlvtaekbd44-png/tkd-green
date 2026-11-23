import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { EditRounded, MenuBookRounded, OpenInNewRounded, PictureAsPdfRounded, PlayCircleOutlineRounded, ImageRounded, CheckCircleOutlineRounded, ChevronRightRounded } from '@mui/icons-material';

// Danh sách cấp/đẳng CLB; không tự tạo nội dung thi khi Admin chưa cung cấp.
export const BELT_LEVELS = [
  ['cap-10','Cấp 10','Trắng'],['cap-9','Cấp 9','Trắng / 1 vạch xanh'],
  ['cap-8','Cấp 8','Trắng / 2 vạch xanh'],['cap-7','Cấp 7','Vàng'],
  ['cap-6','Cấp 6','Xanh lá'],['cap-5','Cấp 5','Xanh dương'],
  ['cap-4','Cấp 4','Đỏ'],['cap-3','Cấp 3','Đỏ / 1 vạch vàng'],
  ['cap-2','Cấp 2','Đỏ / 2 vạch vàng'],['cap-1','Cấp 1','Đỏ / 3 vạch vàng'],
  ['dang-1','1 Đẳng','Đen / 1 vạch trắng'],['dang-2','2 Đẳng','Đen / 2 vạch trắng'],
  ['dang-3','3 Đẳng','Đen / 3 vạch vàng'],['dang-4','4 Đẳng','Đen / 4 vạch vàng'],
  ['dang-5','5 Đẳng','Đen / 5 vạch đỏ'],['dang-6','6 Đẳng','Đen / 6 vạch đỏ'],
  ['dang-7','7 Đẳng','Đen / 7 vạch trắng'],
];

const EMPTY = { title:'', introduction:'', requirements:'', steps:'', evaluation:'', notes:'', media:[], published:false };
const TYPE_NAMES = {image:'Hình ảnh',pdf:'PDF',video:'Video'};
function parseUrl(raw) {
  try { const u = new URL(String(raw || '').trim()); return u.protocol === 'https:' ? u : null; } catch { return null; }
}
function embedUrl(item) {
  const u = parseUrl(item?.url);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'www.youtube-nocookie.com') {
    let id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v');
    if (!id && (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/'))) id = u.pathname.split('/')[2];
    return item.type === 'video' && /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === 'drive.google.com') {
    const id = u.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1];
    return id ? `https://drive.google.com/file/d/${id}/preview` : null;
  }
  // Cho phép hình ảnh/PDF trực tiếp qua HTTPS, nếu nguồn cho phép nhúng.
  if (item.type === 'image' || item.type === 'pdf' || item.type === 'video') return u.toString();
  return null;
}
function MediaViewer({media}) {
  const url = embedUrl(media);
  if (!url) return <Alert severity="warning">Liên kết không hỗ trợ xem trực tiếp. Hãy sử dụng link Google Drive dạng /file/d/.../view hoặc link YouTube.</Alert>;
  const drive = url.includes('drive.google.com/file/d/');
  if (media.type === 'image' && !drive) return <Box component="img" src={url} alt={media.name || 'Hình ảnh'} sx={{display:'block',maxWidth:'100%',maxHeight:'72vh',objectFit:'contain',mx:'auto'}} />;
  if (drive || url.includes('youtube-nocookie.com/embed/') || media.type === 'pdf') return <Box component="iframe" src={url} title={media.name || 'Tài liệu'} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen sx={{width:'100%',height:{xs:'62vh',md:'72vh'},border:0}} />;
  return <Box component="video" src={url} controls playsInline sx={{width:'100%',maxHeight:'70vh',background:'#111'}} />;
}

export default function BeltExamProcedures({profile}) {
  const admin = profile?.role === 'admin';
  const [records,setRecords] = useState({});
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [active,setActive] = useState(BELT_LEVELS[0][0]);
  const [editing,setEditing] = useState(false);
  const [form,setForm] = useState(EMPTY);
  const [busy,setBusy] = useState(false);
  const [mediaType,setMediaType] = useState('pdf');
  const [mediaName,setMediaName] = useState('');
  const [mediaUrl,setMediaUrl] = useState('');
  const [preview,setPreview] = useState(null);
  const [filter,setFilter] = useState('');
  useEffect(()=> onSnapshot(admin ? collection(db,'beltExamProcedures') : query(collection(db,'beltExamProcedures'), where('published','==',true)), snap=>{
    setRecords(Object.fromEntries(snap.docs.map(d=>[d.id,d.data()])));
    setLoading(false);
  },err=>{setError(`Không tải được quy trình thi cấp: ${err.message}. Kiểm tra Firestore Rules.`);setLoading(false);}),[admin]);
  const selectedLevel = BELT_LEVELS.find(b=>b[0]===active) || BELT_LEVELS[0];
  const current = records[active];
  const published = current?.published === true;
  const searchable = useMemo(()=>BELT_LEVELS.filter(b=>b.slice(1).join(' ').toLocaleLowerCase('vi').includes(filter.toLocaleLowerCase('vi'))),[filter]);
  const edit = ()=> {setForm({...EMPTY,...(current||{}),media:Array.isArray(current?.media)?current.media:[]});setError('');setEditing(true);};
  const addLink = ()=> {
    const url=parseUrl(mediaUrl);
    if (!url) {setError('Vui lòng nhập liên kết HTTPS hợp lệ.');return;}
    const candidate={type:mediaType,name:mediaName.trim() || TYPE_NAMES[mediaType],url:url.toString()};
    if (!embedUrl(candidate)) {setError('Liên kết này không thể nhúng. Hãy dùng liên kết file Google Drive hoặc YouTube hợp lệ.');return;}
    setForm(p=>({...p,media:[...p.media,candidate]}));setMediaName('');setMediaUrl('');setError('');
  };
  const save = async ()=> {
    if (!admin || busy) return;
    if (form.published && ![form.introduction,form.requirements,form.steps,form.evaluation,form.notes].some(x=>String(x||'').trim()) && form.media.length===0) {setError('Cần nhập ít nhất một nội dung hoặc tài liệu trước khi xuất bản.');return;}
    setBusy(true);setError('');
    try {
      const payload={title:String(form.title||'').trim(),introduction:String(form.introduction||'').trim(),requirements:String(form.requirements||'').trim(),steps:String(form.steps||'').trim(),evaluation:String(form.evaluation||'').trim(),notes:String(form.notes||'').trim(),media:form.media.map(m=>({type:m.type,name:m.name,url:m.url})),published:form.published===true,updatedAt:serverTimestamp()};
      await setDoc(doc(db,'beltExamProcedures',active),payload,{merge:true});
      setEditing(false);setNotice(`Đã lưu quy trình ${selectedLevel[1]}.`);
    } catch(e) {setError(`Không lưu được: ${e.message}`);} finally {setBusy(false);}
  };
  const sections = [ ['Giới thiệu',current?.introduction],['Yêu cầu dự thi',current?.requirements],['Trình tự / nội dung thi',current?.steps],['Tiêu chí đánh giá',current?.evaluation],['Lưu ý',current?.notes] ];
  return <Stack spacing={2} sx={{minWidth:0, fontFamily:'"Segoe UI",Arial,sans-serif'}}>
    <Paper elevation={0} sx={{px:{xs:2,md:2.5},py:2,borderRadius:3,border:'1px solid #dce9e0',bgcolor:'#fff'}}>
      <Stack direction={{xs:'column',sm:'row'}} alignItems={{sm:'center'}} justifyContent="space-between" spacing={1.5}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{width:44,height:44,flexShrink:0,display:'grid',placeItems:'center',borderRadius:2,bgcolor:'#e8f5ee',color:'#087d4b'}}>
            <MenuBookRounded sx={{fontSize:25}}/>
          </Box>
          <Box>
            <Typography component="h2" sx={{fontSize:{xs:17,md:21},fontWeight:800,color:'#173d2c',lineHeight:1.35}}>
              Quy trình thi cấp Taekwondo
            </Typography>
            <Typography sx={{fontSize:13,color:'#617a6b',lineHeight:1.5}}>
              Chọn cấp đai để xem nội dung thi và tài liệu hướng dẫn.
            </Typography>
          </Box>
        </Stack>
        <Chip variant="outlined" color="success" size="small" label="17 cấp / đẳng" sx={{alignSelf:{xs:'flex-start',sm:'center'},fontWeight:700}}/>
      </Stack>
    </Paper>
    {notice && <Alert severity="success" onClose={()=>setNotice('')}>{notice}</Alert>}
    {error && !editing && <Alert severity="error">{error}</Alert>}
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'290px minmax(0,1fr)'},gap:2,alignItems:'stretch',minWidth:0}}>
      <Paper elevation={0} sx={{p:1.5,border:'1px solid #dce9e0',borderRadius:3,minWidth:0,display:'flex',flexDirection:'column',height:{xs:'auto',md:'min(60vh,590px)'},maxHeight:{xs:350,md:'none'}}}>
        <Typography sx={{fontSize:12,fontWeight:800,color:'#587361',letterSpacing:'.06em',px:1,mb:1}}>DANH SÁCH CẤP ĐAI</Typography>
        <TextField fullWidth size="small" placeholder="Tìm cấp đai..." value={filter} onChange={e=>setFilter(e.target.value)} inputProps={{'aria-label':'Tìm cấp đai'}} sx={{mb:1.5}}/>
        <Box sx={{overflowY:'auto',flex:1,minHeight:0,pr:.5}}>
          <Stack spacing={.5}>
            {searchable.map(([id,label,belt])=>{
              const chosen=active===id;
              return <Button key={id} onClick={()=>{setActive(id);setError('');}} variant="text" fullWidth
                sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:1,textAlign:'left',minHeight:49,py:.8,px:1.25,borderRadius:2,bgcolor:chosen?'#e7f5eb':'transparent',border:chosen?'1px solid #a5d7b8':'1px solid transparent',color:chosen?'#075d3d':'#344f40',textTransform:'none','&:hover':{bgcolor:'#edf7ef'}}}>
                <Box sx={{minWidth:0,flex:1}}>
                  <Typography sx={{fontSize:13,fontWeight:chosen?800:700,color:'inherit',lineHeight:1.3}}>{label}</Typography>
                  <Typography sx={{fontSize:11,color:'#668070',lineHeight:1.4,whiteSpace:'normal'}}>{belt}</Typography>
                </Box>
                {chosen?<CheckCircleOutlineRounded sx={{fontSize:19,color:'#087d4b',flexShrink:0}}/>:<ChevronRightRounded sx={{fontSize:17,color:'#90a99a',flexShrink:0}}/>}
              </Button>;
            })}
            {searchable.length===0 && <Typography sx={{p:2,fontSize:13,color:'text.secondary'}}>Không tìm thấy cấp đai.</Typography>}
          </Stack>
        </Box>
      </Paper>
      <Paper elevation={0} sx={{p:{xs:2,md:3},border:'1px solid #dce9e0',borderRadius:3,minWidth:0,height:{xs:'auto',md:'min(60vh,590px)'},minHeight:{xs:290,md:0},display:'flex',flexDirection:'column'}}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} gap={1.5} sx={{mb:2}}>
          <Box sx={{minWidth:0}}>
            <Typography sx={{fontSize:11,fontWeight:800,color:'#087d4b',letterSpacing:'.09em',mb:.5}}>NỘI DUNG QUY TRÌNH</Typography>
            <Typography component="h3" sx={{fontSize:{xs:21,md:25},fontWeight:800,color:'#173d2c',lineHeight:1.2}}>{selectedLevel[1]}</Typography>
            <Typography sx={{color:'#668070',fontSize:13,mt:.5}}>Đai {selectedLevel[2]}</Typography>
          </Box>
          {admin && <Button variant="outlined" startIcon={<EditRounded/>} onClick={edit} sx={{alignSelf:{xs:'flex-start',sm:'center'},fontWeight:700,flexShrink:0}}>Chỉnh sửa quy trình</Button>}
        </Stack>
        <Divider sx={{mb:2,borderColor:'#e4eee7'}}/>
        <Box sx={{overflowY:'auto',flex:1,minHeight:0,pr:{md:1}}}>
          {loading ? <Typography sx={{color:'text.secondary'}}>Đang tải dữ liệu...</Typography>
          : !published && !admin ? <Alert severity="info" sx={{fontWeight:600}}>Admin chưa cập nhật</Alert>
          : !published && !sections.some(([,v])=>v) && !(current?.media?.length) ? <Alert severity="info" sx={{fontWeight:600}}>Admin chưa cập nhật</Alert>
          : <Stack spacing={2.5}>
            {!published && admin && <Alert severity="warning">Bản nháp chỉ Admin xem được. Người dùng thấy: “Admin chưa cập nhật”.</Alert>}
            {sections.filter(([,value])=>String(value||'').trim()).map(([label,value])=><Box key={label}>
              <Typography sx={{fontSize:14,fontWeight:800,color:'#087d4b',mb:.75}}>{label}</Typography>
              <Typography sx={{fontSize:14,lineHeight:1.7,color:'#2c4336',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{value}</Typography>
            </Box>)}
            {Array.isArray(current?.media) && current.media.length>0 && <Box>
              <Typography sx={{fontSize:14,fontWeight:800,color:'#087d4b',mb:1}}>Tài liệu minh họa</Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>{current.media.map((m,i)=><Button key={`${m.url}-${i}`} variant="outlined" size="small" startIcon={m.type==='image'?<ImageRounded/>:m.type==='pdf'?<PictureAsPdfRounded/>:<PlayCircleOutlineRounded/>} onClick={()=>setPreview(m)}>{m.name || TYPE_NAMES[m.type] || 'Tài liệu'}</Button>)}</Stack>
            </Box>}
            {!sections.some(([,v])=>String(v||'').trim()) && !(current?.media?.length) && <Alert severity="info">Admin chưa cập nhật</Alert>}
          </Stack>}
        </Box>
      </Paper>
    </Box>
    <Dialog open={editing} onClose={busy?undefined:()=>setEditing(false)} maxWidth="md" fullWidth><DialogTitle fontWeight={800}>Biên tập quy trình – {selectedLevel[1]}</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:1}}>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField label="Tên quy trình (không bắt buộc)" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))}/>
      {[["introduction","Giới thiệu"],["requirements","Yêu cầu dự thi"],["steps","Trình tự / nội dung thi"],["evaluation","Tiêu chí đánh giá"],["notes","Lưu ý"]].map(([key,label])=><TextField key={key} multiline minRows={key==='steps'?4:2} label={label} value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} inputProps={{maxLength:10000}}/>)}
      <Typography fontWeight={800}>Ảnh, PDF, video qua Google Drive / YouTube</Typography>
      <Stack direction={{xs:'column',md:'row'}} gap={1}><TextField select label="Loại" value={mediaType} onChange={e=>setMediaType(e.target.value)} sx={{minWidth:120}}>{Object.entries(TYPE_NAMES).map(([k,v])=><MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField><TextField label="Tên tài liệu" value={mediaName} onChange={e=>setMediaName(e.target.value)} fullWidth/><TextField label="Link HTTPS" value={mediaUrl} onChange={e=>setMediaUrl(e.target.value)} fullWidth/><Button variant="outlined" onClick={addLink}>Thêm</Button></Stack>
      {form.media.map((m,i)=><Stack key={`${m.url}-${i}`} direction="row" alignItems="center" gap={1}><Typography variant="body2" sx={{flex:1,overflowWrap:'anywhere'}}>{m.name} ({TYPE_NAMES[m.type]})</Typography><Button size="small" onClick={()=>setPreview(m)}>Xem</Button><Button size="small" color="error" onClick={()=>setForm(p=>({...p,media:p.media.filter((_,j)=>j!==i)}))}>Bỏ</Button></Stack>)}
      <Button variant={form.published?'contained':'outlined'} color={form.published?'success':'inherit'} onClick={()=>setForm(p=>({...p,published:!p.published}))}>{form.published?'Đã chọn xuất bản · Nhấn để chuyển bản nháp':'Bản nháp · Nhấn để xuất bản'}</Button>
      <Alert severity="info">Chỉ nội dung đã xuất bản mới được HLV/Võ sinh/Phụ huynh xem. Không nhập quy trình giả để thay thế hướng dẫn chính thức.</Alert>
    </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={()=>setEditing(false)}>Hủy</Button><Button variant="contained" disabled={busy} onClick={save}>{busy?'Đang lưu...':'Lưu quy trình'}</Button></DialogActions></Dialog>
    <Dialog open={Boolean(preview)} onClose={()=>setPreview(null)} maxWidth="lg" fullWidth><DialogTitle>{preview?.name || 'Xem tài liệu'}</DialogTitle><DialogContent>{preview&&<MediaViewer media={preview}/>}</DialogContent><DialogActions><Button startIcon={<OpenInNewRounded/>} disabled={!parseUrl(preview?.url)} onClick={()=>{const u=parseUrl(preview?.url);if(u)window.open(u.toString(),'_blank','noopener,noreferrer')}}>Mở nguồn nếu không xem được</Button><Button onClick={()=>setPreview(null)}>Đóng</Button></DialogActions></Dialog>
  </Stack>;
}
