// Chạy tại thư mục dự án: node cap_nhat_App.cjs
// Chỉ thay đúng các điểm nối; giữ nguyên tất cả phân hệ khác.
const fs=require('node:fs');
const path=require('node:path');
const target=path.join(process.cwd(),'src','App.jsx');
if(!fs.existsSync(target)) {console.error('Không thấy src/App.jsx. Hãy chạy trong thư mục tkd-green.');process.exit(1);}
let s=fs.readFileSync(target,'utf8');
const backup=path.join(process.cwd(),'src',`App.backup.leave.${new Date().toISOString().replace(/[:.]/g,'-')}.txt`);
function assert(ok,msg){if(!ok) throw new Error(msg+' - Chưa ghi đè App.jsx.');}
try {
  if(!s.includes('import LeaveApprovalPanel from')) s="import LeaveApprovalPanel from './LeaveApprovalPanel';\n"+s;
  if(!s.includes("module: 'leave'")) {
    const at=s.indexOf('const navItems = [');assert(at>=0,'Không tìm thấy navItems');
    const end=s.indexOf('\n]',at);assert(end>at,'Không tìm thấy cuối navItems');
    const before=s.slice(at,end);
    const match=before.match(/(^\s*\{ label: ['"]Điểm danh['"], module: ['"]attendance['"].*\},?\s*$)/m);
    assert(!!match,'Không tìm thấy mục Điểm danh trong navItems');
    s=s.slice(0,at)+before.replace(match[0], match[0]+"\n  { label: 'Xin phép nghỉ', module: 'leave', icon: <CalendarMonthRounded /> },")+s.slice(end);
  }
  if(s.includes('const visibleNavItems = navItems.filter(item =>')){
    s=s.replace(/const visibleNavItems = navItems\.filter\(item =>[^\n]+\);/, (old)=>{
      if(old.includes("item.module === 'leave'"))return old;
      const prefix='const visibleNavItems = navItems.filter(item => ';
      assert(old.startsWith(prefix),'Không thể sửa lọc menu');
      return prefix+"(item.module === 'leave' && (profile?.role === 'admin' || hasPermission('attendance','manage') || hasPermission('members','edit'))) || "+old.slice(prefix.length);
    });
  } else throw new Error('Không thấy bộ lọc visibleNavItems - Chưa ghi đè App.jsx.');
  // Mục Xin phép nghỉ luôn hiện trong cổng cá nhân, quyền ghi vẫn do Rules ràng buộc.
  s=s.replace(/\.\.\.\(feature\('leaveRequests'\) \? \[\{ label: 'Xin phép nghỉ', icon: <CalendarMonthRounded \/> \}\] : \[\]\),/, "{ label: 'Xin phép nghỉ', icon: <CalendarMonthRounded /> },");
  s=s.replace(/leaveEnabled=\{feature\('leaveRequests'\) && member\?\.locationId === locationDoc\?\.id\}/g, "leaveEnabled={true} locationId={locationDoc?.id || ''}");
  if(!s.includes("activePage === 'Xin phép nghỉ' ?")){
    const marker=') : activePage === "Điểm danh" ? (';
    assert(s.includes(marker),'Không tìm thấy nhánh render Điểm danh');
    s=s.replace(marker,") : activePage === 'Xin phép nghỉ' ? (\n   <LeaveApprovalPanel profile={profile} students={students} />\n"+marker);
  }
  assert(s.includes("module: 'leave'")&&s.includes('LeaveApprovalPanel profile={profile}')&&s.includes("{ label: 'Xin phép nghỉ', icon:"),'Chưa gắn đủ giao diện');
  // Chỉ vá vị trí gọi biểu mẫu nghỉ, không thay toàn bộ cổng Võ sinh hiện có.
  const portalPath=path.join(process.cwd(),'src','MemberSelfPortal.jsx');
  assert(fs.existsSync(portalPath),'Không thấy src/MemberSelfPortal.jsx');
  let portal=fs.readFileSync(portalPath,'utf8');
  if(!portal.includes("import LeaveRequestPanel from"))portal="import LeaveRequestPanel from './LeaveRequestPanel';\n"+portal;
  if(portal.includes('<LeaveForm member={member} profile={profile} />')) {
    portal=portal.replace(/leaveEnabled\s*\?\s*<LeaveForm member=\{member\} profile=\{profile\} \/>\s*:\s*<Alert[^>]*>[^<]*<\/Alert>/, '<LeaveRequestPanel member={member} profile={profile} enabled locationId={locationId} />');
    portal=portal.replace('<LeaveForm member={member} profile={profile} />','<LeaveRequestPanel member={member} profile={profile} enabled locationId={locationId} />');
  }
  if(!portal.includes('<LeaveRequestPanel')){
    // Hỗ trợ bản cũ có thông báo chưa mở chức năng.
    portal=portal.replace(/<Alert severity="info">Chức năng xin phép nghỉ[^<]+<\/Alert>/, '<LeaveRequestPanel member={member} profile={profile} enabled locationId={locationId} />');
  }
  assert(portal.includes('<LeaveRequestPanel'),'Không tìm được vị trí tích hợp Xin phép nghỉ trong MemberSelfPortal.jsx');
  // Thêm prop locationId để hỗ trợ hồ sơ cũ chưa gán ID điểm tập.
  portal=portal.replace(/export default function MemberSelfPortal\(\{([^}]*)\}\)/, (all, props)=>props.includes('locationId')?all:`export default function MemberSelfPortal({${props}, locationId = '' })`);
  assert(portal.includes('locationId ='),'Không đọc được tham số MemberSelfPortal');
  const portalBackup=path.join(process.cwd(),'src',`MemberSelfPortal.backup.leave.${new Date().toISOString().replace(/[:.]/g,'-')}.txt`);
  fs.copyFileSync(target,backup);fs.copyFileSync(portalPath,portalBackup);
  fs.writeFileSync(target,s,'utf8');fs.writeFileSync(portalPath,portal,'utf8');
  console.log('Đã cập nhật App.jsx và MemberSelfPortal.jsx. Bản sao:',backup,portalBackup);
}catch(e){console.error(e.message);process.exit(1);}
