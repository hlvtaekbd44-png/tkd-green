import { auth, db } from './firebase';
import { collection, doc, getDocs, query, where, runTransaction, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { createMemberWithAutoId } from './memberIdService';
import { getBeltAppearance, normalizeBeltLevel } from './BeltBadge';
import { normalizeEducationLevel } from './educationLevels';

export const OPTIONAL_IMPORT_COLUMNS = ['Mã VTF','SĐT phụ huynh','Ngày bắt đầu','Ngày hết hạn','Loại học phí'];
export const IMPORT_COLUMNS = ['Họ và tên','Ngày sinh','Giới tính','Trình độ văn hóa','Mã VTF','Điểm tập','Cấp đai','SĐT phụ huynh','Ngày bắt đầu','Ngày hết hạn','Loại học phí','Trạng thái','Ghi chú'];
const FIELD_MAP = {
  'Họ và tên':'hoTen', 'Ngày sinh':'ngaySinh', 'Giới tính':'gioiTinh',
  'Trình độ văn hóa':'trinhDoVanHoa', 'Mã VTF':'maHV', 'Điểm tập':'diemTap',
  'Cấp đai':'capDaiDang', 'SĐT phụ huynh':'soDienThoaiPhuHuynh',
  'Ngày bắt đầu':'ngayBatDau','Ngày hết hạn':'ngayHetHan',
  'Loại học phí':'loaiHocPhi','Trạng thái':'trangThai','Ghi chú':'ghiChu',
};
const DATE_FIELDS = new Set(['ngaySinh','ngayBatDau','ngayHetHan']);
const TEXT_FIELDS = Object.keys(FIELD_MAP).map(k=>FIELD_MAP[k]);
export const LABELS = Object.fromEntries(Object.entries(FIELD_MAP).map(([k,v])=>[v,k]));
export const normalizeText = v => String(v ?? '').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
export function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value > 2958465) return 'Ngày không hợp lệ';
    return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'Ngày không hợp lệ' : [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : s;
}
export function formatDateVN(v) { const s=normalizeDate(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : String(v||''); }
function validDate(s){if(!s)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;}
const key = (vtf,loc) => `${normalizeText(vtf)}\u0001${normalizeText(loc)}`;
const identityKey = (m) => `${normalizeText(m.hoTen||m.name)}\u0001${normalizeDate(m.ngaySinh)}\u0001${normalizeText(m.diemTap||m.location)}`;
const valueFor = (field,v) => DATE_FIELDS.has(field) ? normalizeDate(v) : normalizeText(v);
function parseMember(raw) {
  const supplied = {};
  const member = {};
  for (const [column,field] of Object.entries(FIELD_MAP)) {
    const rawValue=raw[column];
    supplied[field] = rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== '';
    member[field] = DATE_FIELDS.has(field) ? normalizeDate(rawValue) : String(rawValue ?? '').trim();
  }
  member.trinhDoVanHoa = supplied.trinhDoVanHoa ? normalizeEducationLevel(raw['Trình độ văn hóa']) : '';
  member.capDaiDang = supplied.capDaiDang ? (normalizeBeltLevel(raw['Cấp đai']) || String(raw['Cấp đai']).trim()) : '';
  return {member,supplied};
}
function compare(existing, member, supplied){
  return TEXT_FIELDS.filter(field => field !== 'diemTap' && field !== 'maHV' && supplied[field] && valueFor(field,existing[field]) !== valueFor(field,member[field])).map(field=>({field,label:LABELS[field],before:String(existing[field]??''),after:String(member[field]??'')}));
}
// Lấy hồ sơ nguyên bản từ Firestore (không dùng students rút gọn của App.jsx).
// HLV: chỉ truy vấn những điểm tập được cấp quyền; Rules cần cho phép read/list.
export async function loadExistingForImport(profile, allowedLocations){
  if(!profile?.role) throw new Error('Chưa xác định tài khoản.');
  if(profile.role==='admin') {
    const snap=await getDocs(collection(db,'members'));
    return snap.docs.map(d=>({id:d.id,...d.data()}));
  }
  if(profile.role!=='hlv') throw new Error('Không được nhập hội viên.');
  const allowed=[...new Set(allowedLocations)];
  const all=[];
  for(let i=0;i<allowed.length;i+=30){
    const snap=await getDocs(query(collection(db,'members'),where('diemTap','in',allowed.slice(i,i+30))));
    snap.docs.forEach(d=>all.push({id:d.id,...d.data()}));
  }
  return all;
}
export function validateImportRows(rawRows, existingMembers=[], locationNames=[]){
  const allowed=new Map(locationNames.map(n=>[normalizeText(n),n]));
  const vtfMap=new Map(), identityMap=new Map();
  for(const x of existingMembers){
    if(x.maHV){const k=normalizeText(x.maHV);vtfMap.set(k,[...(vtfMap.get(k)||[]),x]);}
    if(x.hoTen && x.ngaySinh){const k=identityKey(x);identityMap.set(k,[...(identityMap.get(k)||[]),x]);}
  }
  const seenVtf=new Set(),seenIdentity=new Set();
  return rawRows.map((raw,index)=>{
    const {member,supplied}=parseMember(raw);
    const errors=[];
    if(!member.hoTen)errors.push('Thiếu họ và tên');
    if(!allowed.has(normalizeText(member.diemTap)))errors.push('Điểm tập không hoạt động hoặc không được cấp quyền');
    else member.diemTap=allowed.get(normalizeText(member.diemTap));
    if(member.trinhDoVanHoa===null)errors.push('Trình độ văn hóa không hợp lệ');
    if(supplied.capDaiDang && !getBeltAppearance(member.capDaiDang))errors.push('Cấp đai không hợp lệ');
    for(const f of DATE_FIELDS)if(!validDate(member[f])) errors.push(`Ngày không hợp lệ: ${LABELS[f]}`);
    if(supplied.loaiHocPhi && !['Ngày','Tháng','Quý'].includes(member.loaiHocPhi))errors.push('Loại học phí chỉ nhận Ngày, Tháng, Quý');
    const v=normalizeText(member.maHV);
    const idKey=identityKey(member);
    if(v && seenVtf.has(v))errors.push('Mã VTF xuất hiện nhiều lần trong file; chỉ giữ một dòng');
    if(!v && member.ngaySinh && seenIdentity.has(idKey))errors.push('Hồ sơ không có VTF bị lặp trong file');
    if(v)seenVtf.add(v);
    if(member.ngaySinh)seenIdentity.add(idKey);
    const candidates=v?(vtfMap.get(v)||[]):(member.ngaySinh?(identityMap.get(idKey)||[]):[]);
    let action='create',existingId='',changes=[];
    if(candidates.length>1)errors.push('Có nhiều hồ sơ trùng khóa trong Firebase; cần xử lý thủ công');
    else if(candidates.length===1){
      const old=candidates[0];
      if(normalizeText(old.diemTap||old.location)!==normalizeText(member.diemTap)) errors.push('Mã VTF đã thuộc điểm tập khác; không tự chuyển điểm tập');
      else if(!v) errors.push('Trùng họ tên/ngày sinh nhưng chưa có VTF; kiểm tra thủ công');
      else {
        existingId=old.id;
        changes=compare(old,member,supplied);
        action=changes.length?'update':'skip';
      }
    } else if(member.ngaySinh && (identityMap.get(idKey)||[]).length>0){
      errors.push('Trùng họ tên/ngày sinh với hồ sơ khác; đối chiếu mã VTF trước');
    }
    if(errors.length) action='error';
    return {rowNumber:index+2,member,supplied,existingId,changes,action,errors,valid:action!=='error'};
  });
}
export async function importOneMember(member, profile){
  if (!auth.currentUser?.uid) throw new Error('Bạn cần đăng nhập để nhập hội viên');
  if (profile?.role !== 'admin' && !(profile?.role === 'hlv' && profile?.permissions?.members?.create === true)) {
    throw new Error('Tài khoản chưa có quyền thêm hội viên');
  }
  // Đối chiếu lại trước khi tạo vì dữ liệu có thể đổi sau lúc xem trước.
  // Với HLV chỉ được đọc đúng phạm vi Rules; để chặn trùng mã toàn hệ thống
  // khi HLV không có quyền đọc điểm khác cần kiểm tra duy nhất ở backend.
  if(member.maHV){
    const matches=await getDocs(profile?.role === 'hlv'
      ? query(collection(db,'members'),where('diemTap','==',member.diemTap))
      : query(collection(db,'members'),where('maHV','==',member.maHV)));
    if(matches.docs.some(d=>normalizeText(d.data().maHV)===normalizeText(member.maHV)))throw new Error('Mã VTF đã tồn tại sau bước xem trước; hãy tải lại file và đối chiếu.');
  }
  return createMemberWithAutoId({
    ...member, capDaiDang:member.capDaiDang||'Cấp 10',
    trangThai:member.trangThai||'Đang học',
    ...(member.capDaiDang ? {mauDai:getBeltAppearance(member.capDaiDang)?.name||''} : {}),
  });
}
export async function updateExistingFromImport(row, allowedLocations, profile){
  if(row.action!=='update'||!row.existingId)throw new Error('Dòng không hợp lệ để cập nhật');
  if(!auth.currentUser?.uid)throw new Error('Bạn cần đăng nhập');
  if(profile?.role !== 'admin' && !(profile?.role === 'hlv' && profile?.permissions?.members?.edit === true)) throw new Error('Tài khoản chưa có quyền sửa Hội viên');
  const ref=doc(db,'members',row.existingId);
  return runTransaction(db,async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists())throw new Error('Hồ sơ hội viên không còn tồn tại');
    const old=snap.data();
    if(!allowedLocations.some(n=>normalizeText(n)===normalizeText(old.diemTap)) || normalizeText(old.diemTap)!==normalizeText(row.member.diemTap)) throw new Error('Điểm tập đã thay đổi hoặc ngoài phạm vi quyền');
    if(normalizeText(old.maHV)!==normalizeText(row.member.maHV))throw new Error('Mã VTF đã thay đổi trong lúc xử lý; hãy tải lại');
    const changes=compare(old,row.member,row.supplied);
    if(!changes.length)return {action:'skip',id:ref.id};
    const patch=Object.fromEntries(changes.map(c=>[c.field,row.member[c.field]]));
    if(changes.some(c=>c.field==='capDaiDang'))patch.mauDai=getBeltAppearance(row.member.capDaiDang)?.name||old.mauDai||'';
    const event={type:'excel_import',at:new Date().toISOString(),byUid:auth.currentUser.uid,
      byEmail:auth.currentUser.email||'',vtf:old.maHV||'',fileRow:row.rowNumber,
      fields:changes.map(c=>({field:c.field,label:c.label,before:c.before,after:c.after}))};
    tx.update(ref,{...patch,updatedAt:serverTimestamp(),lichSuDieuChinh:arrayUnion(event)});
    return {action:'update',id:ref.id,changes};
  });
}
