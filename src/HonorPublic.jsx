import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Dialog, IconButton, Stack, Typography } from '@mui/material';
import { ArrowForwardRounded, CloseRounded, EmojiEventsRounded, NavigateBeforeRounded, NavigateNextRounded, WorkspacePremiumRounded } from '@mui/icons-material';
import { activeHonor, sortHonors, subscribeHonorConfig, subscribePublicHonors, defaultHonorConfig } from './HonorService';
import './HonorWall.css';

function HonorImage({ post, className = '' }) {
  return post?.imageUrl ? <img className={'honor-image ' + className} src={post.imageUrl} alt={post.imageAlt || post.title || 'Hình ảnh tuyên dương'} loading="lazy"/> : <div className="honor-image honor-image-empty"><EmojiEventsRounded sx={{fontSize:80}}/></div>;
}

function HonorSpotlight({ post, compact = false, onDetail }) {
  return <div className={'honor-spotlight'+(compact?' compact':'')}>
    <div className="honor-spotlight-copy">
      <div className="honor-overline"><WorkspacePremiumRounded fontSize="small"/> VINH DANH & TUYÊN DƯƠNG</div>
      <div className="honor-gold-rule"/>
      <Typography className="honor-spotlight-heading" component="h2">{post.title}</Typography>
      {post.eventName && <Typography className="honor-event">{post.eventName}</Typography>}
      {post.description && <Typography className="honor-spotlight-description">{post.description}</Typography>}
      <Button variant="contained" className="honor-gold-button" endIcon={<ArrowForwardRounded/>} onClick={onDetail}>Xem thành tích</Button>
    </div>
    <div className="honor-spotlight-media"><HonorImage post={post}/></div>
  </div>;
}

export default function HonorPublic() {
  const [posts,setPosts] = useState([]);
  const [config,setConfig] = useState(null);
  const [error,setError] = useState('');
  const [selected,setSelected] = useState(0);
  const [modalOpen,setModalOpen] = useState(false);
  useEffect(() => subscribePublicHonors(setPosts, e => setError(e.message)), []);
  useEffect(() => subscribeHonorConfig(setConfig, e => {setConfig({popupEnabled:false,bannerEnabled:false});setError(e.message)}), []);
  const active = useMemo(() => sortHonors(posts.filter(activeHonor)), [posts]);
  const banners = useMemo(() => active.filter(p=>p.showBanner!==false),[active]);
  const popups = useMemo(() => active.filter(p=>p.showPopup!==false && Boolean(p.imageUrl)),[active]);
  const selectedBanner = banners[Math.min(selected, banners.length-1)] || banners[0];
  useEffect(() => {
    if (!config?.popupEnabled || !popups.length) return;
    try { if(sessionStorage.getItem('tkdg_honor_popup_seen') === 'yes') return;
      sessionStorage.setItem('tkdg_honor_popup_seen','yes'); setModalOpen(true);
    } catch { setModalOpen(true); }
  },[config?.popupEnabled, popups.length]);
  const closePopup = () => setModalOpen(false);
  const goDetails = post => { setModalOpen(false); window.location.hash = `vinh-danh/${encodeURIComponent(post.id)}`; };
  if (!active.length) return null;
  return <section className="honor-public" aria-label="Vinh danh và tuyên dương">
    {config?.bannerEnabled && selectedBanner && <div className="honor-banner-wrap">
      <HonorSpotlight post={selectedBanner} compact onDetail={()=>goDetails(selectedBanner)}/>
      {banners.length > 1 && <div className="honor-slides" aria-label="Chuyển bài vinh danh">
        <IconButton aria-label="Ảnh trước" onClick={()=>setSelected(v=>(v-1+banners.length)%banners.length)}><NavigateBeforeRounded/></IconButton>
        <Typography variant="caption">{Math.min(selected,banners.length-1)+1} / {banners.length}</Typography>
        <IconButton aria-label="Ảnh tiếp theo" onClick={()=>setSelected(v=>(v+1)%banners.length)}><NavigateNextRounded/></IconButton>
      </div>}
    </div>}
    <div className="honor-public-linkbar"><Stack direction="row" gap={1} alignItems="center"><EmojiEventsRounded color="success"/><Typography fontWeight={850}>Thành tích & Vinh danh</Typography></Stack><Button onClick={()=>{window.location.hash="vinh-danh"}}>Xem tất cả bài tuyên dương <ArrowForwardRounded sx={{ml:0.5,fontSize:17}}/></Button></div>
    {error && <Typography role="alert" sx={{fontSize:12,color:'#a54632',px:2}}>Không tải được thông tin vinh danh: {error}</Typography>}
    <Dialog open={modalOpen && Boolean(popups[0])} onClose={closePopup} maxWidth="md" fullWidth aria-labelledby="honor-popup-title" PaperProps={{className:'honor-popup-paper'}}>
      {popups[0] && <div className="honor-popup-inner">
        <IconButton className="honor-close" aria-label="Đóng cửa sổ tuyên dương" onClick={closePopup}><CloseRounded/></IconButton>
        <div className="honor-popup-brand"><img src="/branding/green-emblem.png" alt="Logo CLB"/><div><b>CLB TAEKWONDO GREEN</b><small>VINH DANH · TUYÊN DƯƠNG</small></div></div>
        <HonorImage post={popups[0]} className="honor-popup-photo"/>
        <div className="honor-popup-text"><div className="honor-overline">✦ VINH DANH THÀNH TÍCH XUẤT SẮC ✦</div>
          <Typography id="honor-popup-title" component="h2" className="honor-popup-title">{popups[0].title}</Typography>
          {popups[0].eventName && <Typography className="honor-event">{popups[0].eventName}</Typography>}
          {popups[0].description && <Typography className="honor-popup-desc">{popups[0].description}</Typography>}
          <Stack direction={{xs:'column',sm:'row'}} spacing={1.5} justifyContent="center" sx={{mt:2}}><Button className="honor-gold-button" variant="contained" onClick={()=>goDetails(popups[0])} endIcon={<ArrowForwardRounded/>}>Xem thành tích chi tiết</Button><Button className="honor-later" variant="outlined" onClick={closePopup}>Đóng, xem sau</Button></Stack>
        </div>
      </div>}
    </Dialog>
  </section>;
}
