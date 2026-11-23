import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Alert, Box, Button, CircularProgress, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import { AccessTimeRounded, CalendarMonthRounded, LocationOnRounded, MapRounded, OpenInNewRounded, PersonRounded, SearchRounded, SchoolRounded } from '@mui/icons-material';
import { db } from './firebase';

const GREEN = '#087d4b';
const VI_FONT = '"Segoe UI", Arial, sans-serif';
const typographySx = {
  fontFamily: VI_FONT,
  '& .MuiTypography-root, & .MuiButton-root, & .MuiInputBase-root, & .MuiInputBase-input': { fontFamily: VI_FONT },
  '& .MuiTypography-root': { letterSpacing: 'normal', overflowWrap: 'break-word' },
};
function safeMapsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase();
    if (['maps.google.com','maps.app.goo.gl'].includes(host)) return url.href;
    if (['google.com','www.google.com'].includes(host) && url.pathname.startsWith('/maps')) return url.href;
  } catch (_) { /* Link không hợp lệ */ }
  return '';
}
function mapTarget(value) {
  const text = String(value || '').trim();
  const coords = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(text);
  if (coords && Math.abs(+coords[1]) <= 90 && Math.abs(+coords[2]) <= 180) return `${+coords[1]},${+coords[2]}`;
  return text.slice(0,500);
}
const heading = { fontFamily: VI_FONT, fontWeight: 700, color:'#183d2a', fontSize:14, lineHeight:1.45 };

function Information({icon, title, children}) {
  return <Stack direction="row" spacing={1.25} sx={{minWidth:0}}>
    <Box sx={{color:GREEN,display:'flex',pt:.15}}>{icon}</Box>
    <Box sx={{minWidth:0,flex:1}}><Typography sx={heading}>{title}</Typography><Box sx={{mt:.45,color:'#5f7668',fontSize:13}}>{children}</Box></Box>
  </Stack>;
}
function DetailPanel({point}) {
  const schedule = Array.isArray(point.schedule) ? point.schedule.filter(x => x && (x.day || x.time)) : [];
  const coaches = Array.isArray(point.coaches) ? point.coaches.filter(x => typeof x === 'string' ? x.trim() : x?.name) : [];
  const target = mapTarget(point.mapQuery || point.address);
  const embedUrl = target ? `https://maps.google.com/maps?q=${encodeURIComponent(target)}&z=16&output=embed` : '';
  const directionsUrl = safeMapsUrl(point.mapUrl) || (target ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}` : '');
  return <Box key={point.id} sx={{height:'100%',minHeight:0,display:'flex',flexDirection:'column'}}>
    <Box sx={{px:{xs:2,md:3},py:1.8,borderBottom:'1px solid #e3ede5',bgcolor:'#edf7f0',flexShrink:0}}>
      <Typography variant="overline" sx={{fontWeight:800,color:GREEN,lineHeight:1.2}}>THÔNG TIN ĐIỂM TẬP</Typography>
      <Typography variant="h5" sx={{fontWeight:800,color:'#075d3d',fontFamily:VI_FONT,fontSize:{xs:21,md:25}}}>{point.name || 'Điểm tập'}</Typography>
      {point.description && <Typography variant="body2" sx={{mt:.5,color:'#54715f',whiteSpace:'pre-line',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{point.description}</Typography>}
    </Box>
    <Box sx={{p:{xs:2,md:2.5},flex:1,minHeight:0,overflowY:'auto',overscrollBehavior:'contain',display:'grid',gridTemplateColumns:{xs:'1fr',lg:'minmax(0,.9fr) minmax(0,1.1fr)'},alignContent:'start',gap:2.3}}>
      <Stack spacing={2.1} sx={{minWidth:0}}>
        <Information icon={<LocationOnRounded fontSize="small"/>} title="Địa chỉ">{point.address || 'Đang cập nhật'}</Information>
        <Information icon={<AccessTimeRounded fontSize="small"/>} title="Thời gian tập luyện"><Typography component="span" sx={{fontSize:13,whiteSpace:'pre-line'}}>{point.trainingHours || 'Đang cập nhật'}</Typography></Information>
        <Information icon={<CalendarMonthRounded fontSize="small"/>} title="Lịch học">{schedule.length ? <Stack spacing={.65}>{schedule.map((s,i)=><Box key={i} sx={{bgcolor:'#f2f8f4',borderRadius:1.5,p:1}}><Typography sx={{fontSize:13,fontWeight:700,color:'#28533a'}}>{s.day || 'Buổi tập'}</Typography><Typography sx={{fontSize:12,color:'#607668'}}>{s.time || 'Đang cập nhật'}{s.note ? ` · ${s.note}` : ''}</Typography></Box>)}</Stack> : 'Đang cập nhật'}</Information>
        <Information icon={<PersonRounded fontSize="small"/>} title="Huấn luyện viên giảng dạy">{coaches.length ? coaches.map((c,i)=><Typography key={i} sx={{fontSize:13}}>{typeof c === 'string' ? c : `${c.name}${c.role ? ` · ${c.role}` : ''}`}</Typography>) : 'Đang cập nhật'}</Information>
      </Stack>
      <Box sx={{minWidth:0,display:'flex',flexDirection:'column',gap:1}}>
        <Stack direction="row" spacing={1} alignItems="center"><MapRounded sx={{color:GREEN,fontSize:20}}/><Typography sx={heading}>Google Maps trực tiếp</Typography></Stack>
        {embedUrl ? <Box component="iframe" title={`Bản đồ ${point.name}`} src={embedUrl} loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" sx={{border:0,width:'100%',height:{xs:260,lg:'min(48vh,440px)'},minHeight:230,borderRadius:2,bgcolor:'#eef5ef'}}/> : <Alert severity="info">Chưa có vị trí bản đồ.</Alert>}
        {directionsUrl && <Button variant="contained" startIcon={<LocationOnRounded/>} endIcon={<OpenInNewRounded/>} href={directionsUrl} target="_blank" rel="noopener noreferrer" fullWidth sx={{bgcolor:GREEN,fontWeight:800}}>Chỉ đường bằng Google Maps</Button>}
      </Box>
    </Box>
  </Box>;
}

/** Danh sách trái + thông tin phải; đọc duy nhất publicLocations đã xuất bản. */
export default function PublicLocationIntroduction({embedded = false}) {
  const [points,setPoints] = useState([]);
  const [selectedId,setSelectedId] = useState('');
  const [search,setSearch] = useState('');
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  useEffect(() => onSnapshot(query(collection(db,'publicLocations'),where('published','==',true)), snap => {
    setPoints(snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.published===true && p.active!==false).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'vi')));
    setLoading(false);setError('');
  }, err=>{setLoading(false);setError(err.code==='permission-denied'?'Firestore từ chối đọc publicLocations. Kiểm tra Rules đã Publish.':`Không tải được điểm tập: ${err.message}`);}),[]);
  const visible=useMemo(()=>points.filter(p=>`${p.name||''} ${p.address||''}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))),[points,search]);
  const selected = points.find(p=>p.id===selectedId) || points[0];
  return <Box sx={{...typographySx,bgcolor:'#f4f8f5',p:{xs:1.5,md:2},height:{xs:'auto',md:embedded?'calc(100dvh - 78px)':'100dvh'},minHeight:{md:540},boxSizing:'border-box',display:'flex',flexDirection:'column',gap:1.5,overflow:{md:'hidden'}}}>
    <Box sx={{bgcolor:'#08603e',color:'#fff',borderRadius:2.5,px:{xs:2,md:2.5},py:1.4,display:'flex',alignItems:'center',justifyContent:'space-between',gap:2,flexShrink:0}}>
      <Box><Typography sx={{fontSize:11,fontWeight:800,color:'#bfe9d0'}}>CLB TAEKWONDO GREEN</Typography><Typography sx={{fontWeight:800,fontSize:{xs:19,md:23},fontFamily:VI_FONT,lineHeight:1.3}}>Hệ thống điểm tập & lịch học</Typography><Typography sx={{fontSize:12,color:'#d7efdf'}}>Chọn điểm tập bên trái để xem thông tin bên phải</Typography></Box>
      <Box component="img" src="/branding/green-emblem.png" alt="Logo TKD Green" sx={{width:{xs:47,md:60},height:{xs:47,md:60},objectFit:'contain',p:.7,bgcolor:'#fff',borderRadius:2,flexShrink:0}}/>
    </Box>
    {loading ? <Stack alignItems="center" justifyContent="center" sx={{flex:1}}><CircularProgress/><Typography sx={{mt:1}}>Đang tải điểm tập...</Typography></Stack> : error ? <Alert severity="error">{error}</Alert> : <Paper elevation={0} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'300px minmax(0,1fr)',lg:'340px minmax(0,1fr)'},gridTemplateRows:{xs:'auto auto',md:'minmax(0,1fr)'},flex:1,minHeight:0,border:'1px solid #dceade',borderRadius:3,overflow:'hidden',bgcolor:'#fff'}}>
      <Box component="nav" aria-label="Danh sách điểm tập" sx={{display:'flex',flexDirection:'column',minHeight:0,bgcolor:'#fbfdfb',borderRight:{md:'1px solid #dceade'},borderBottom:{xs:'1px solid #dceade',md:0}}}>
        <Box sx={{p:1.5,flexShrink:0}}><Stack direction="row" alignItems="center" justifyContent="space-between"><Typography fontWeight={900} sx={{color:'#16452d'}}>Danh sách điểm tập</Typography><Typography variant="caption" sx={{color:'#607668'}}>{points.length} điểm</Typography></Stack><TextField fullWidth size="small" sx={{mt:1.2,bgcolor:'#fff'}} placeholder="Tìm điểm tập..." value={search} onChange={e=>setSearch(e.target.value)} InputProps={{startAdornment:<SearchRounded sx={{mr:.7,color:'#6e8a79'}} fontSize="small"/>}}/></Box>
        <Divider/>
        <Box sx={{p:1,overflowY:'auto',overscrollBehavior:'contain',minHeight:0,maxHeight:{xs:240,md:'none'},flex:1}}>
          {visible.length===0 && <Typography sx={{p:2,fontSize:13,color:'text.secondary'}}>Không tìm thấy điểm tập phù hợp.</Typography>}
          {visible.map(p=><Box key={p.id} component="button" type="button" onClick={()=>setSelectedId(p.id)} aria-current={selected?.id===p.id?'true':undefined} sx={{display:'flex',textAlign:'left',width:'100%',alignItems:'center',gap:1.1,border:'1px solid',borderColor:selected?.id===p.id?'#91c9a6':'transparent',bgcolor:selected?.id===p.id?'#e3f4e9':'transparent',borderRadius:2,p:1.35,mb:.4,cursor:'pointer',font:'inherit','&:hover':{bgcolor:'#edf7f0'},'&:focus-visible':{outline:'2px solid #087d4b',outlineOffset:1}}}>
            <Box sx={{display:'flex',borderRadius:1.5,p:1,bgcolor:selected?.id===p.id?'#c3e7d1':'#edf4ee',color:GREEN}}><SchoolRounded fontSize="small"/></Box>
            <Box sx={{flex:1,minWidth:0}}><Typography sx={{fontSize:14,fontWeight:800,color:'#1a4b30'}} noWrap>{p.name || 'Điểm tập'}</Typography><Typography sx={{fontSize:11,color:'#6a8172',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.address || 'Đang cập nhật địa chỉ'}</Typography></Box>
            <Typography sx={{color:GREEN,fontSize:20,fontWeight:800}}>›</Typography>
          </Box>)}
        </Box>
      </Box>
      <Box component="section" aria-label="Chi tiết điểm tập" sx={{minWidth:0,minHeight:{md:0},height:{xs:'auto',md:'100%'}}}>
        {selected ? <DetailPanel point={selected}/> : <Stack justifyContent="center" alignItems="center" sx={{height:'100%',p:3}}><Typography color="text.secondary">Chưa có điểm tập nào được xuất bản công khai.</Typography></Stack>}
      </Box>
    </Paper>}
    <Box sx={{display:'flex',justifyContent:'center',flexShrink:0}}><Typography variant="caption" color="text.secondary" sx={{textAlign:'center'}}>CLB TAEKWONDO GREEN · Chủ nhiệm: Nguyễn Hữu Tài · 0984.44.94.04 · 0974.94.94.04</Typography></Box>
  </Box>;
}
