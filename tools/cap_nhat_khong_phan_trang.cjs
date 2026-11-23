/**
 * TKD Green: Vá an toàn các file đang chạy để HIỂN THỊ TẤT CẢ.
 * Không thay thuật toán học phí, nguồn Firebase, hoặc phân quyền.
 * Backup mỗi file trước khi ghi. Nếu cấu trúc lạ: bỏ qua, không sửa.
 * Sử dụng: node tools/cap_nhat_khong_phan_trang.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const project = process.cwd();
const folder = path.join(project,'src');
function safePatch(filename, work) {
 const filenameFull=path.join(folder,filename);
 if (!fs.existsSync(filenameFull)) return console.log(`BỎ QUA ${filename}: không thấy file.`);
 const old=fs.readFileSync(filenameFull,'utf8');
 let result;
 try { result=work(old); }
 catch(e) { return console.log(`BỎ QUA ${filename}: ${e.message}`); }
 if (!result || result===old) return console.log(`GIỮ NGUYÊN ${filename}: bản mới hoặc cấu trúc không khớp.`);
 const bak=filenameFull+'.before-all-list-'+Date.now()+'.bak';
 fs.copyFileSync(filenameFull,bak);
 fs.writeFileSync(filenameFull,result,'utf8');
 console.log(`ĐÃ SỬA ${filename} | Sao lưu: ${path.basename(bak)}`);
}
function once(source,from,to){
 if(!source.includes(from)) throw Error('Không khớp đoạn mã, không can thiệp');
 return source.replace(from,to);
}
// Điểm danh, kỳ thi: không đụng dữ liệu hoặc nghiệp vụ, chỉ danh sách hội viên & lịch sử thu.
safePatch('MemberList.jsx',t=>{
 t=t.replace(/\r\n/g,'\n');
 if (!t.includes('pageStudents.map(')) return t;
 const block=/\s*useEffect\(\(\) => \{ setPage\(1\); \}, \[search, location, statusFilter, beltFilter, pageSize\]\);\s*const totalPages = Math\.max\(1, Math\.ceil\(filteredStudents\.length \/ pageSize\)\);\s*const currentPage = Math\.min\(page, totalPages\);\s*const pageStudents = filteredStudents\.slice\(\(currentPage - 1\) \* pageSize, currentPage \* pageSize\);\s*const from = filteredStudents\.length \? \(currentPage - 1\) \* pageSize \+ 1 : 0;\s*const to = Math\.min\(currentPage \* pageSize, filteredStudents\.length\);/;
 if(!block.test(t)||!t.includes('<Pagination count={totalPages}')) throw Error('Bản MemberList khác mẫu đã kiểm tra');
 t=t.replace(block,'\n  // Không phân trang: dùng filteredStudents cho danh sách đã lọc.');
 t=t.replace(/pageStudents\.map\(/g,'filteredStudents.map(');
 const start=t.indexOf('{!loading && filteredStudents.length > 0 && (\n        <Paper elevation={0}',t.indexOf('      {error &&'));
 const end=t.indexOf('<MemberProfile',start);
 if(start<0||end<0) throw Error('Không tìm thấy phần phân trang chuẩn');
 t=t.slice(0,start)+`{!loading && filteredStudents.length > 0 && (\n        <Typography variant="body2" color="text.secondary">Hiển thị tất cả {filteredStudents.length.toLocaleString("vi-VN")} hội viên</Typography>\n      )}\n`+'      '+t.slice(end);
 t=t.replace(/\bPagination, /,'').replace(/\bSelect, /,'').replace(/\bFormControl, /,'');
 t=t.replace('useEffect, useMemo, useState','useMemo, useState');
 t=t.replace(/const PAGE_SIZE_OPTIONS = \[[^\n]*\];\n/,'');
 t=t.replace(/  const \[page, setPage\] = useState\(1\);\n/,'').replace(/  const \[pageSize, setPageSize\] = useState\(20\);\n/,'');
 return t;
});
safePatch('TuitionManagement.jsx',t=>{
 t=t.replace(/\r\n/g,'\n');
 if(!t.includes('filteredStudents.slice(memberPage') || !t.includes('orderedPayments.slice(paymentPage')) return t;
 const snippets=[
  ['  const visibleMembers = filteredStudents.slice(memberPage * memberRows, (memberPage + 1) * memberRows);','  const visibleMembers = filteredStudents;'],
  ['  const visiblePayments = orderedPayments.slice(paymentPage * paymentRows, (paymentPage + 1) * paymentRows);','  const visiblePayments = orderedPayments;'],
 ];
 if ((t.match(/<TablePagination component="div"/g)||[]).length!==2) throw Error('Số khung phân trang Học phí không như dự kiến');
 for(const [from,to] of snippets) t=once(t,from,to);
 // Chỉ bỏ đúng 2 TablePagination; không ảnh hưởng bảng hoặc form thu học phí.
 const re=/\s*<TablePagination component="div"[\s\S]*?labelRowsPerPage="(?:Số hội viên\/trang|Giao dịch\/trang)" \/>/g;
 if ((t.match(re)||[]).length !== 2) throw Error('Không nhận diện được hai bộ phân trang học phí');
 t=t.replace(re,'');
 t=t.replace(/\s*TablePagination,\r?\n/,'\n');
 return t;
});
for(const filename of ['AddMember.jsx','EditMember.jsx']) {
 safePatch(filename,t=>{
   if(!t.includes('<MenuItem value="Tháng">Tháng</MenuItem>')) return t;
   if(!t.includes('<MenuItem value="Ngày">Ngày</MenuItem>')) {
     t=t.replace('<MenuItem value="Tháng">Tháng</MenuItem>', '<MenuItem value="Ngày">Ngày</MenuItem>\n              <MenuItem value="Tháng">Tháng</MenuItem>');
   }
   if(t.includes('if (!form.maHV.trim() || !form.hoTen.trim())')) {
     t=t.replace('if (!form.maHV.trim() || !form.hoTen.trim())','if (!form.hoTen.trim())');
     t=t.replace('Vui lòng nhập mã hội viên VTF và họ tên.','Vui lòng nhập họ tên hội viên.');
   }
   if (t.includes('label="Mã hội viên VTF"')) t=t.replace('label="Mã hội viên VTF"','label="Mã VTF (không bắt buộc)"');
   return t;
 });
}
console.log('Kiểm tra tiếp bằng npm run build. Không sửa các file thiếu hoặc không khớp.');
