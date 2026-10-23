import {useEffect, useMemo, useState} from "react";
import {collection, doc, onSnapshot, query, where, runTransaction, serverTimestamp} from "firebase/firestore";
import {Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Typography} from "@mui/material";
import {db} from "./firebase";

const money = n => Number(n||0).toLocaleString("vi-VN")+" ₫";
const isoToday = () => {const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};

// Giữ lệ phí thi riêng với chu kỳ học phí để không làm sai ngày đã đóng đến.
export default function ExamFeeCollection({profile, students=[], location="Tất cả điểm tập"}) {
  const [items,setItems]=useState([]);
  const [error,setError]=useState("");
  const [target,setTarget]=useState(null);
  const [amount,setAmount]=useState("");
  const [date,setDate]=useState(isoToday());
  const [busy,setBusy]=useState(false);
  const [success,setSuccess]=useState("");
  const admin=profile?.role==="admin";
  const assigned=useMemo(()=>Array.isArray(profile?.locationPermissions?.tuition)
    ? profile.locationPermissions.tuition : [],[profile]);
  const assignedKey=assigned.join("\u0001");
  useEffect(()=>{
    if(!profile || (!admin && (!profile.permissions?.tuition?.view || !assigned.length))) {setItems([]);return;}
    const ref=collection(db,"examRegistrations");
    const queries=admin ? [ref] : Array.from({length:Math.ceil(assigned.length/30)},(_,i)=>
      query(ref,where("diemTap","in",assigned.slice(i*30,i*30+30))));
    const chunks=new Map();
    return (()=>{
      const offs=queries.map((q,i)=>onSnapshot(q,snap=>{
        chunks.set(i,snap.docs);
        const all=new Map(); for(const a of chunks.values()) for(const d of a) all.set(d.id,{id:d.id,...d.data()});
        setItems([...all.values()]);setError("");
      },e=>{setError("Không đọc được lệ phí thi: "+e.message);setItems([]);}));
      return ()=>offs.forEach(fn=>fn());
    })();
  },[profile?.uid,profile?.role,profile?.permissions?.tuition?.view,admin,assignedKey]);
  const memberIds=useMemo(()=>new Set(students.map(m=>m.id)),[students]);
  const visible=useMemo(()=>items.filter(x=>
    x.status!=="Không dự thi" && x.lePhiThi &&
    (location==="Tất cả điểm tập" || !location || x.diemTap===location) &&
    (admin || (assigned.includes(x.diemTap) && memberIds.has(x.memberDocId)))
  ),[items,location,admin,assignedKey,memberIds]);
  const outstanding=visible.filter(x=>Number(x.lePhiThi?.conNo||0)>0);
  const total=outstanding.reduce((sum,x)=>sum+Number(x.lePhiThi.conNo),0);
  const openPayment=x=>{setTarget(x);setAmount(String(x.lePhiThi.conNo));setDate(isoToday());setError("");setSuccess("");};
  const save=async()=>{
    if(!target || !admin || busy) return;
    const received=Number(amount);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isSafeInteger(received)||received<=0){setError("Ngày thu hoặc số tiền không hợp lệ.");return;}
    setBusy(true);setError("");
    try {
      const regRef=doc(db,"examRegistrations",target.id);
      const payRef=doc(collection(db,"tuitionPayments"));
      const result=await runTransaction(db,async tx=>{
        const snap=await tx.get(regRef);
        if(!snap.exists()) throw new Error("Đăng ký không tồn tại.");
        const reg=snap.data(),fee=reg.lePhiThi;
        if(reg.status==="Không dự thi") throw new Error("Đăng ký đã hủy, không thể thu phí.");
        if(!fee || !Number.isSafeInteger(Number(fee.phaiThu)) || Number(fee.phaiThu)<0 || !Number.isSafeInteger(Number(fee.daThu)) || Number(fee.daThu)<0) throw new Error("Lệ phí thi chưa được cấu hình/đối soát.");
        const left=Number(fee.phaiThu)-Number(fee.daThu);
        if(left<=0 || received>left) throw new Error("Số thu vượt dư nợ lệ phí thi. Vui lòng tải lại.");
        tx.update(regRef,{lePhiThi:{...fee,daThu:Number(fee.daThu)+received,conNo:left-received,
          trangThai:left===received?"Đã đóng":"Còn nợ",ngayThuCuoi:date}});
        tx.set(payRef,{memberId:reg.memberDocId,maHV:reg.maHV||"",hoTen:reg.hoTen||"",
          diemTap:reg.diemTap,ngayThu:date,soTien:received,loaiHocPhi:"Lệ phí thi",
          loaiGiaoDich:"thu_le_phi_thi",examRegistrationId:target.id,periodId:reg.periodId,
          ghiChu:`Lệ phí thi cấp ${reg.dangDuThi||""}`,nguoiThu:profile?.email||"",
          conNoSauThu:left-received,createdAt:serverTimestamp()});
        return left-received;
      });
      setSuccess(`Đã thu ${money(received)} lệ phí thi. Còn nợ: ${money(result)}.`);
      setTarget(null);
    } catch(e){setError("Không thu được lệ phí thi: "+e.message);}
    finally{setBusy(false);}
  };
  return <Paper variant="outlined" sx={{p:2.5,borderRadius:3,mt:2}}>
    <Stack spacing={1.5}>
      <Typography variant="h6" fontWeight={800}>Lệ phí thi cấp trong quản lý học phí</Typography>
      <Typography variant="body2" color="text.secondary">Khoản phải thu theo từng đăng ký thi, theo dõi riêng với kỳ học phí. Không tính trùng vào nợ học phí tháng/quý/ngày.</Typography>
      <Chip sx={{alignSelf:"start"}} color={total>0?"warning":"success"} label={`Lệ phí thi còn phải thu: ${money(total)} · ${outstanding.length} đăng ký`}/>
      {error&&<Alert severity="error">{error}</Alert>}{success&&<Alert severity="success">{success}</Alert>}
      {!outstanding.length&&<Typography color="text.secondary">Chưa có lệ phí thi chưa đóng trong phạm vi đang xem.</Typography>}
      {outstanding.map(r=><Box key={r.id} sx={{display:"flex",gap:2,alignItems:"center",justifyContent:"space-between",borderTop:"1px solid",borderColor:"divider",py:1.5,flexWrap:"wrap"}}>
        <Box><Typography fontWeight={700}>{r.hoTen} — {r.dangDuThi}</Typography>
          <Typography variant="caption" color="text.secondary">{r.diemTap} · Đợt thi {r.periodId} · Phải đóng {money(r.lePhiThi.phaiThu)} · Đã thu {money(r.lePhiThi.daThu)}</Typography>
        </Box>
        <Stack direction="row" alignItems="center" spacing={1}><Typography fontWeight={800}>Nợ {money(r.lePhiThi.conNo)}</Typography>{admin&&<Button variant="contained" size="small" onClick={()=>openPayment(r)}>Thu lệ phí</Button>}</Stack>
      </Box>)}
    </Stack>
    <Dialog open={Boolean(target)} onClose={()=>!busy&&setTarget(null)} fullWidth maxWidth="xs">
      <DialogTitle>Thu lệ phí thi cấp</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{pt:1}}>
        <Typography>{target?.hoTen} · {target?.dangDuThi} · Nợ {money(target?.lePhiThi?.conNo)}</Typography>
        <TextField label="Số tiền thực thu (VNĐ)" type="number" value={amount} onChange={e=>setAmount(e.target.value)} slotProps={{htmlInput:{min:1,step:1}}}/>
        <TextField label="Ngày thu" type="date" value={date} onChange={e=>setDate(e.target.value)} slotProps={{inputLabel:{shrink:true}}}/>
        {error&&<Alert severity="error">{error}</Alert>}
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={()=>setTarget(null)}>Hủy</Button><Button variant="contained" disabled={busy} onClick={save}>{busy?"Đang lưu...":"Ghi nhận thu"}</Button></DialogActions>
    </Dialog>
  </Paper>;
}
