import { Box, Typography } from '@mui/material';
import { CalendarMonthRounded, EmojiEventsRounded, PublicRounded, SchoolRounded } from '@mui/icons-material';
const SETUP={
  'Sự kiện':{subtitle:'Lịch hoạt động, giải đấu, giao lưu và sự kiện của CLB.', icon:<CalendarMonthRounded sx={{fontSize:52}}/>},
  'Đào tạo':{subtitle:'Chuyên đề kỹ thuật, khóa bồi dưỡng và thông tin đào tạo.', icon:<SchoolRounded sx={{fontSize:52}}/>},
  'Thành tích':{subtitle:'Danh hiệu, kết quả thi đấu và thành tích đã được xác nhận.',icon:<EmojiEventsRounded sx={{fontSize:52}}/>},
  'Giới thiệu':{subtitle:'Giới thiệu CLB Taekwondo Green và cơ sở tập luyện.',icon:<PublicRounded sx={{fontSize:52}}/>}
};
export default function MemberContentFrame({title,children}){
 const item=SETUP[title]||SETUP['Giới thiệu'];
 return <Box className="tkdp-content-frame"><Box className="tkdp-hero"><Box><Typography className="tkdp-eyebrow">TKD GREEN · HỘI VIÊN / PHỤ HUYNH</Typography><Typography component="h1" className="tkdp-title">{title}</Typography><Typography className="tkdp-subtitle">{item.subtitle}</Typography></Box><Box className="tkdp-hero-right">{item.icon}</Box></Box><Box className="tkdp-content-body">{children}</Box></Box>;
}
