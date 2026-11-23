// Chạy tại thư mục gốc tkd-green bằng: node .\sua_hoc_phi_ngay.cjs
const fs = require('node:fs');
const path = require('node:path');
const target = path.join(process.cwd(), 'src', 'EditMember.jsx');
if (!fs.existsSync(target)) { console.error('Không tìm thấy '+target); process.exit(1); }
const source = fs.readFileSync(target, 'utf8');
const block = /(<TextField\b[^>]*\bname=["']loaiHocPhi["'][\s\S]*?>)([\s\S]*?)(<\/TextField>)/g;
const matches = [...source.matchAll(block)];
if (matches.length !== 1) {console.error('Không tìm thấy duy nhất trường loaiHocPhi; không thay đổi file.'); process.exit(1);}
const content=matches[0][2];
if (/value=["']Ngày["']/.test(content)) {console.log('Đã có Học phí Ngày trong EditMember.jsx — không cần sửa.'); process.exit(0);}
const month=/<MenuItem\b[^>]*value=["']Tháng["'][^>]*>/;
if (!month.test(content)) {console.error('Cấu trúc menu học phí không khớp; không tự sửa.');process.exit(1);}
const replacement=matches[0][0].replace(month, '<MenuItem value="Ngày">Ngày</MenuItem>\n              $&');
const next=source.slice(0,matches[0].index)+replacement+source.slice(matches[0].index+matches[0][0].length);
const backup=target+'.backup-'+new Date().toISOString().replace(/[:.]/g,'-');
fs.copyFileSync(target,backup);
fs.writeFileSync(target,next,'utf8');
console.log('Đã bổ sung Ngày / Tháng / Quý tại: '+target);
console.log('Sao lưu: '+backup);
