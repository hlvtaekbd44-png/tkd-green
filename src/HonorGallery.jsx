import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { ArrowBackRounded, EmojiEventsRounded, SearchRounded } from '@mui/icons-material';
import { activeHonor, sortHonors, subscribePublicHonors } from './HonorService';
import './HonorWall.css';

const getSelection = () => decodeURIComponent(window.location.hash.split('/')[1] || '');
export default function HonorGallery() {
  const [items,setItems] = useState([]);
  const [error,setError] = useState('');
  const [search,setSearch] = useState('');
  const [category,setCategory] = useState('');
  const [selectedId,setSelectedId] = useState(getSelection);
  useEffect(()=>subscribePublicHonors(setItems,e=>setError(e.message)),[]);
  useEffect(()=>{ const fn=()=>setSelectedId(getSelection());window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn);},[]);
  const active=useMemo(()=>sortHonors(items.filter(activeHonor)),[items]);
  const selected=active.find(x=>x.id===selectedId);
  const visible=useMemo(()=>active.filter(x=>(!category || x.category===category) && [x.title,x.description,x.eventName].join(' ').toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))),[active,search,category]);
  const categories=[...new Set(active.map(x=>x.category).filter(Boolean))];
  return <main className="honor-gallery-page" aria-label="Trang Thành tích và Vinh danh">
    <div className="honor-gallery-page-hero"><Button className="honor-gallery-back" startIcon={<ArrowBackRounded/>} onClick={()=>{window.location.hash='';}}>Về trang chủ</Button><div className="honor-overline"><EmojiEventsRounded/> THÀNH TÍCH & VINH DANH</div><Typography component="h1" variant="h3" fontWeight={950}>HÀNH TRÌNH VINH QUANG</Typography><Typography>CLB TAEKWONDO GREEN · Ghi nhận nỗ lực và những thành tích đáng tự hào.</Typography></div>
    {error && <Typography role="alert" color="error" sx={{p:2}}>Không tải được thành tích công khai: {error}</Typography>}
    {selected ? <div className="honor-gallery-page-detail"><img src={selected.imageUrl} alt={selected.imageAlt||selected.title}/><div className="honor-gallery-page-detail-body"><Chip color="success" label={selected.category||'Vinh danh'}/><Typography variant="h4" fontWeight={900} sx={{mt:2}}>{selected.title}</Typography>{selected.eventName&&<Typography fontWeight={750} sx={{mt:1}}>{selected.eventName}</Typography>}<Typography sx={{mt:2,whiteSpace:'pre-line',lineHeight:1.8}}>{selected.description}</Typography><Button onClick={()=>{window.location.hash='vinh-danh'}} sx={{mt:2}}>← Xem tất cả bài tuyên dương</Button></div></div> : <>
      <Stack direction={{xs:'column',sm:'row'}} spacing={2} sx={{mb:2}}><TextField size="small" label="Tìm kiếm thành tích" placeholder="Tên giải, vận động viên..." value={search} onChange={e=>setSearch(e.target.value)} InputProps={{startAdornment:<SearchRounded sx={{mr:1,color:'#668974'}}/>}} sx={{flex:1}}/><TextField select size="small" label="Loại vinh danh" value={category} onChange={e=>setCategory(e.target.value)} sx={{minWidth:{sm:220}}}><MenuItem value="">Tất cả</MenuItem>{categories.map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField></Stack>
      {visible.length===0?<Paper sx={{p:4,textAlign:'center'}}><EmojiEventsRounded color="success" sx={{fontSize:42}}/><Typography>Chưa có bài tuyên dương phù hợp.</Typography></Paper> : <div className="honor-gallery-page-grid">{visible.map(post=><button type="button" className="honor-gallery-card" key={post.id} onClick={()=>{window.location.hash='vinh-danh/'+encodeURIComponent(post.id)}}><img className="honor-image" src={post.imageUrl} alt={post.imageAlt||post.title}/><div><span>{post.category||'Vinh danh'}</span><h3>{post.title}</h3><p>{post.eventName||post.description}</p></div></button>)}</div>}
    </>}
  </main>;
}
