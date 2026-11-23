import { useMemo, useState } from "react";
import { Alert, Badge, Box, Button, Divider, IconButton, Menu, Stack, Typography } from "@mui/material";
import NotificationsNoneRounded from "@mui/icons-material/NotificationsNoneRounded";
import EventBusyRounded from "@mui/icons-material/EventBusyRounded";

function dateOf(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "string") {
    const v = value.trim();
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
    const d = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (d) return new Date(Number(d[3]),Number(d[2])-1,Number(d[1]));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Các thông báo là lời nhắc tính từ dữ liệu đã được App lọc theo quyền.
// Chưa phải hệ thống push notification hay thông báo lưu vào Firestore.
export default function NotificationCenter({ students = [], profile }) {
  const [anchor, setAnchor] = useState(null);
  const [hidden, setHidden] = useState([]);
  const reminders = useMemo(() => {
    if (!profile || !["admin", "hlv"].includes(profile.role)) return [];
    const today = new Date(); today.setHours(0,0,0,0);
    return students.flatMap(s => {
      if ((s.status || "").trim() !== "Đang học") return [];
      const expiry = dateOf(s.ngayHetHan);
      if (!expiry) return [];
      expiry.setHours(0,0,0,0);
      const days = Math.round((expiry-today)/86400000);
      if (days > 5) return [];
      return [{ id: `${s.id}-tuition-${expiry.getTime()}`, name: s.name || s.maHoiVienNoiBo || "Hội viên", location: s.location || "", days, date: expiry.toLocaleDateString("vi-VN") }];
    }).sort((a,b) => a.days-b.days);
  }, [students,profile]);
  const visible = reminders.filter(x => !hidden.includes(x.id));
  return <>
    <IconButton aria-label={`Thông báo: ${visible.length} nhắc việc`} title="Thông báo học phí" onClick={e=>setAnchor(e.currentTarget)} sx={{border:"1px solid #e1ebe4",borderRadius:2,ml:1,color:"#176444"}}>
      <Badge badgeContent={visible.length} color="error" max={99}><NotificationsNoneRounded /></Badge>
    </IconButton>
    <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={()=>setAnchor(null)} anchorOrigin={{vertical:"bottom",horizontal:"right"}} transformOrigin={{vertical:"top",horizontal:"right"}}
      slotProps={{paper:{sx:{width:{xs:"min(92vw,380px)",sm:380},maxHeight:460,mt:1,borderRadius:3}}}}>
      <Box sx={{px:2,py:1.5}}><Typography fontWeight={800}>Thông báo học phí</Typography><Typography variant="caption" color="text.secondary">Đến hạn trong 5 ngày hoặc đã quá hạn · {visible.length} nhắc việc</Typography></Box><Divider />
      {!visible.length ? <Box sx={{p:2}}><Alert severity="success">Không có nhắc việc học phí mới trong dữ liệu đang xem.</Alert></Box> : visible.slice(0,50).map(item =>
        <Box key={item.id} sx={{px:2,py:1.1,borderBottom:"1px solid #edf1ed"}}>
          <Stack direction="row" spacing={1} alignItems="flex-start"><EventBusyRounded color={item.days<0?"error":"warning"} fontSize="small"/><Box sx={{flex:1,minWidth:0}}>
            <Typography variant="body2" fontWeight={700}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.location} · Hết hạn {item.date}</Typography>
            <Typography variant="caption" sx={{display:"block",color:item.days<0?"error.main":"warning.dark"}}>{item.days<0?`Quá hạn ${-item.days} ngày`:item.days===0?"Đến hạn hôm nay":`Còn ${item.days} ngày`}</Typography>
          </Box><Button size="small" onClick={()=>setHidden(old=>[...old,item.id])}>Ẩn</Button></Stack>
        </Box>)}
      <Box sx={{px:2,py:1}}><Typography variant="caption" color="text.secondary">“Ẩn” chỉ áp dụng trong phiên đang mở; thông báo được tính lại khi tải trang. Chưa gửi SMS, email hoặc push.</Typography></Box>
    </Menu>
  </>;
}
