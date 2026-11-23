import React, { useState } from 'react';
import { Alert, Box, Button, LinearProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { AssessmentRounded } from '@mui/icons-material';
import { loadAttendance } from './attendanceService';

const firstMonth = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
const statuses = ['Có mặt','Vắng có phép','Vắng không phép','Chưa điểm danh'];
/** Read-only monthly summary. Does not create sessions or change leave requests. */
export default function AttendanceMonthlyReport({ location, members=[] }) {
 const [month,setMonth]=useState(firstMonth);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [report,setReport]=useState(null);
 const calculate=async()=>{
  if(!location||!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month))return;
  setLoading(true);setError('');setReport(null);
  try {
   const [year,mon]=month.split('-').map(Number); const days=new Date(year,mon,0).getDate();
   const maxDate=new Date();const keyNow=`${maxDate.getFullYear()}-${String(maxDate.getMonth()+1).padStart(2,'0')}-${String(maxDate.getDate()).padStart(2,'0')}`;
   const dates=Array.from({length:days},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`).filter(x=>x<=keyNow);
   const data=[];
   // Limit concurrency: Firestore get requests remain predictable.
   for(let i=0;i<dates.length;i+=5){
    const values=await Promise.all(dates.slice(i,i+5).map(async date=>({date,...await loadAttendance(location,date)})));
    data.push(...values);
   }
   const sessions=data.filter(d=>d.session);
   const rows=members.map(m=>{
    const count=Object.fromEntries(statuses.map(s=>[s,0]));
    for(const day of sessions){const state=day.records[m.id]?.trangThai || 'Chưa điểm danh';count[statuses.includes(state)?state:'Chưa điểm danh']++;}
    const judged=count['Có mặt']+count['Vắng có phép']+count['Vắng không phép'];
    return {id:m.id,name:m.name||m.hoTen||'Chưa rõ tên',code:m.maHoiVienNoiBo||m.maHV||'',...count,rate:judged?Math.round(100*count['Có mặt']/judged):null};
   }).sort((a,b)=>a.name.localeCompare(b.name,'vi'));
   setReport({location,month,sessions:sessions.length,rows});
  } catch(e){setError(`Không tải được báo cáo: ${e.message}. Kiểm tra quyền đọc attendanceSessions.`);}
  finally{setLoading(false);}
 };
 return <Paper variant="outlined" sx={{p:{xs:2,md:2.5},mt:3,borderRadius:3,borderColor:'#D7E7DC'}}>
   <Stack direction={{xs:'column',sm:'row'}} alignItems={{sm:'center'}} justifyContent="space-between" spacing={1.5} sx={{mb:2}}>
     <Box><Typography fontWeight={800} sx={{color:'#175B3C',display:'flex',gap:1,alignItems:'center'}}><AssessmentRounded/> Lịch sử & chuyên cần theo tháng</Typography><Typography variant="caption" color="text.secondary">Chỉ tính các ngày đã tạo buổi điểm danh; chưa điểm danh không được coi là vắng.</Typography></Box>
     <Stack direction="row" spacing={1}><TextField size="small" type="month" value={month} onChange={e=>setMonth(e.target.value)} inputProps={{'aria-label':'Tháng báo cáo'}}/><Button variant="contained" disabled={loading||!location} onClick={calculate} sx={{bgcolor:'#087B50',whiteSpace:'nowrap'}}>Xem báo cáo</Button></Stack>
   </Stack>
   {loading && <LinearProgress sx={{mb:1}}/>}{error && <Alert severity="error">{error}</Alert>}
   {report && <><Typography sx={{mb:1}} variant="body2">Điểm tập: <b>{report.location}</b> · Tháng <b>{report.month}</b> · <b>{report.sessions}</b> buổi đã ghi nhận</Typography>
    <TableContainer sx={{maxHeight:410}}><Table size="small" stickyHeader><TableHead><TableRow><TableCell>Võ sinh</TableCell><TableCell align="center">Có mặt</TableCell><TableCell align="center">Có phép</TableCell><TableCell align="center">Không phép</TableCell><TableCell align="center">Chưa ghi</TableCell><TableCell align="center">Chuyên cần*</TableCell></TableRow></TableHead>
    <TableBody>{report.rows.map(r=><TableRow key={r.id}><TableCell><Typography fontWeight={650} fontSize={13}>{r.name}</Typography><Typography color="text.secondary" variant="caption">{r.code}</Typography></TableCell><TableCell align="center">{r['Có mặt']}</TableCell><TableCell align="center">{r['Vắng có phép']}</TableCell><TableCell align="center">{r['Vắng không phép']}</TableCell><TableCell align="center">{r['Chưa điểm danh']}</TableCell><TableCell align="center">{r.rate==null?'—':`${r.rate}%`}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
    <Typography variant="caption" color="text.secondary">* Tỷ lệ Có mặt / số buổi đã có kết quả (Có mặt, Vắng có phép, Vắng không phép). Số buổi chưa điểm danh không đưa vào mẫu số. Chỉ phản ánh các buổi đã tạo trong hệ thống.</Typography></>}
 </Paper>;
}
