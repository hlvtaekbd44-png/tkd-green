import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Alert, Box, Button, CircularProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import FileDownloadRounded from "@mui/icons-material/FileDownloadRounded";
import { db } from "./firebase";

const group = (a, n) => Array.from({ length: Math.ceil(a.length/n) },(_,i)=>a.slice(i*n,(i+1)*n));
const normalizeLocations = profile => Array.isArray(profile?.diemTap) ? profile.diemTap.filter(Boolean) : typeof profile?.diemTap === "string" && profile.diemTap ? [profile.diemTap] : [];
function useScopedData(collectionName, profile) {
  const [state,setState]=useState({rows:[],loading:true,error:""});
  const assigned = normalizeLocations(profile);
  const key = [...new Set(assigned)].sort().join("|~|");
  useEffect(()=>{
    if (!profile || !["admin","hlv"].includes(profile.role)) {setState({rows:[],loading:false,error:"Không có quyền xem báo cáo."});return;}
    if (profile.role==="hlv" && !assigned.length) {setState({rows:[],loading:false,error:"HLV chưa được cấp điểm tập."});return;}
    setState({rows:[],loading:true,error:""});
    const queries=profile.role==="admin" ? [collection(db,collectionName)] : group([...new Set(assigned)],30).map(loc=>query(collection(db,collectionName),where("diemTap","in",loc)));
    const snapshots=new Map();
    const unsubs=queries.map((q,i)=>onSnapshot(q,snap=>{
      snapshots.set(i,snap.docs);
      if(snapshots.size===queries.length){const map=new Map();snapshots.forEach(docs=>docs.forEach(d=>map.set(d.id,{id:d.id,...d.data()})));setState({rows:[...map.values()],loading:false,error:""});}
    },err=>setState({rows:[],loading:false,error:`${collectionName}: ${err.message}`})));
    return ()=>unsubs.forEach(fn=>fn());
  // key là tập điểm tập, tránh đăng ký lại không cần thiết
  },[collectionName,profile?.role,key]);
  return state;
}
function inMonth(value,month) {
  if(!value) return false;
  const str=typeof value?.toDate==="function" ? value.toDate().toLocaleDateString("sv-SE") : String(value);
  if(/^\d{4}-\d{2}/.test(str)) return str.slice(0,7)===month;
  const m=str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return Boolean(m && `${m[3]}-${m[2]}`===month);
}
function fmt(n) {return new Intl.NumberFormat("vi-VN").format(n);}
function csvDownload(rows,month) {
  const head=["Điểm tập","Tổng hội viên","Đang học","Tạm nghỉ","Nghỉ học","Học phí đã thu (VNĐ)","Đăng ký thi (tất cả đợt)"];
  const quote=x=>`"${String(x??"").replaceAll('"','""')}"`;
  const lines=[head,...rows.map(r=>[r.name,r.total,r.active,r.paused,r.inactive,r.money,r.exams])].map(cols=>cols.map(quote).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob(["\uFEFF",lines],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download=`bao-cao-tkd-green-${month}.csv`;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
}
export default function ReportsManagement({students=[],profile,locations=[]}) {
  const now=new Date();const initial=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const [month,setMonth]=useState(initial);const [location,setLocation]=useState("Tất cả điểm tập");
  const payments=useScopedData("tuitionPayments",profile);
  const registrations=useScopedData("examRegistrations",profile);
  const authorized=profile?.role==="admin" || profile?.permissions?.reports?.view===true;
  const assigned=normalizeLocations(profile);
  const allowed=profile?.role==="admin" ? [...new Set(students.map(s=>s.location).filter(Boolean))] : assigned;
  const points=useMemo(()=>[...new Set(allowed)].sort((a,b)=>a.localeCompare(b,"vi")),[allowed.join("|~|")]);
  const selected=points.includes(location)?location:"Tất cả điểm tập";
  const rows=useMemo(()=>points.filter(p=>selected==="Tất cả điểm tập"||selected===p).map(name=>{
    const members=students.filter(s=>s.location===name);
    const ps=payments.rows.filter(p=>p.diemTap===name && inMonth(p.ngayThu,month));
    const ex=registrations.rows.filter(r=>r.diemTap===name && !["Đã hủy","Hủy","cancelled"].includes(String(r.status||r.trangThai||"")));
    return {name,total:members.length,active:members.filter(s=>s.status==="Đang học").length,paused:members.filter(s=>s.status==="Tạm nghỉ").length,inactive:members.filter(s=>s.status==="Nghỉ học").length,money:ps.reduce((a,p)=>a+Number(p.soTien||0),0),exams:ex.length};
  }),[points,selected,students,payments.rows,registrations.rows,month]);
  const total=rows.reduce((r,x)=>({total:r.total+x.total,active:r.active+x.active,paused:r.paused+x.paused,inactive:r.inactive+x.inactive,money:r.money+x.money,exams:r.exams+x.exams}),{total:0,active:0,paused:0,inactive:0,money:0,exams:0});
  const loading=payments.loading||registrations.loading;
  const incomplete=Boolean(payments.error||registrations.error);
  if(!authorized)return <Alert severity="error">Tài khoản chưa được cấp quyền xem Báo cáo.</Alert>;
  return <Stack spacing={2.5} sx={{mt:2,minWidth:0,pb:3}}>
    <Box><Typography variant="overline" color="success.main" fontWeight={800}>TKD GREEN · REPORTS</Typography><Typography variant="h5" fontWeight={900}>Báo cáo câu lạc bộ</Typography><Typography color="text.secondary" variant="body2">Dữ liệu thực tế theo điểm tập được phân quyền</Typography></Box>
    <Paper sx={{p:2.5,borderRadius:3}}><Stack direction={{xs:"column",md:"row"}} gap={2} alignItems={{md:"center"}}>
      <TextField type="month" label="Tháng thu học phí" value={month} onChange={e=>setMonth(e.target.value)} slotProps={{inputLabel:{shrink:true}}}/>
      <TextField select label="Điểm tập" value={selected} onChange={e=>setLocation(e.target.value)} sx={{minWidth:220,flex:1}}><MenuItem value="Tất cả điểm tập">Tất cả điểm tập được phép</MenuItem>{points.map(p=><MenuItem key={p} value={p}>{p}</MenuItem>)}</TextField>
      <Button variant="contained" startIcon={<FileDownloadRounded/>} disabled={loading||incomplete} onClick={()=>csvDownload(rows,month)}>Xuất CSV (Excel)</Button>
    </Stack></Paper>
    {payments.error&&<Alert severity="error">Không đọc được dữ liệu học phí: {payments.error}. Báo cáo chưa đầy đủ.</Alert>}
    {registrations.error&&<Alert severity="error">Không đọc được dữ liệu thi cấp: {registrations.error}. Báo cáo chưa đầy đủ.</Alert>}
    {loading&&<Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={18}/><Typography>Đang tổng hợp dữ liệu từ Firestore...</Typography></Stack>}
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"repeat(2,minmax(0,1fr))",lg:"repeat(4,minmax(0,1fr))"},gap:1.5}}>
      {[ ["Hội viên",fmt(total.total)], ["Đang học",fmt(total.active)], ["Học phí tháng (VNĐ)",incomplete?"—":fmt(total.money)], ["Đăng ký thi",incomplete?"—":fmt(total.exams)] ].map(([title,value])=><Paper key={title} sx={{p:2,borderRadius:3}}><Typography variant="caption" color="text.secondary">{title}</Typography><Typography variant="h5" fontWeight={900} sx={{mt:1}}>{loading?"…":value}</Typography></Paper>)}
    </Box>
    <Paper sx={{borderRadius:3,overflow:"hidden"}}><Box sx={{p:2}}><Typography fontWeight={800}>Chi tiết theo điểm tập</Typography><Typography variant="caption" color="text.secondary">Học phí theo tháng đã chọn; đăng ký thi tính trên tất cả đợt, trừ đăng ký hủy</Typography></Box>
      <TableContainer><Table size="small"><TableHead><TableRow>{["Điểm tập","Tổng HV","Đang học","Tạm nghỉ","Nghỉ học","Đã thu (VNĐ)","ĐK thi"].map(h=><TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(r=><TableRow key={r.name} hover><TableCell>{r.name}</TableCell>{[r.total,r.active,r.paused,r.inactive,incomplete?"—":fmt(r.money),incomplete?"—":r.exams].map((v,i)=><TableCell key={i}>{v}</TableCell>)}</TableRow>)}{!rows.length&&<TableRow><TableCell colSpan={7}>Chưa có điểm tập phù hợp trong dữ liệu được phân quyền.</TableCell></TableRow>}</TableBody></Table></TableContainer>
    </Paper><Alert severity="info">Bản báo cáo này chỉ gồm hội viên, khoản thu trong tuitionPayments và đăng ký thi trong examRegistrations. Không suy đoán công nợ, lợi nhuận, tỷ lệ điểm danh hoặc kết quả thi khi chưa có quy tắc tổng hợp thống nhất.</Alert>
  </Stack>;
}
