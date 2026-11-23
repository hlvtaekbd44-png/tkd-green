/**
 * Vá có sao lưu các bộ lọc, không thay toàn bộ nghiệp vụ.
 * Chạy tại thư mục gốc dự án: node .\\tools\\giu_bo_loc.cjs
 */
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const srcDir = path.join(root, 'src');
const hookName = 'useRetainedFilter.js';
const hookSrc = path.resolve(__dirname, '..', 'src', hookName);
const hookDest = path.join(srcDir, hookName);

function changeOne(fileName, transform) {
  const filePath = path.join(srcDir, fileName);
  if (!fs.existsSync(filePath)) {
    console.log(`BỎ QUA ${fileName}: không thấy file.`);
    return;
  }
  const old = fs.readFileSync(filePath, 'utf8');
  if (old.includes('useRetainedFilter(')) {
    console.log(`BỎ QUA ${fileName}: đã có hook giữ bộ lọc; hãy kiểm tra thủ công nếu cần.`);
    return;
  }
  const { next, count, expected } = transform(old);
  if (count !== expected) {
    console.warn(`KHÔNG SỬA ${fileName}: khớp ${count}/${expected} vị trí. Hãy gửi file này để vá đúng bản mới.`);
    return;
  }
  const backup = filePath + '.backup-before-retained-filters';
  if (!fs.existsSync(backup)) fs.copyFileSync(filePath, backup);
  fs.writeFileSync(filePath, next, 'utf8');
  console.log(`ĐÃ SỬA ${fileName}. Sao lưu: ${path.basename(backup)}`);
}

function replaceOnce(text, search, replacement) {
  const matched = text.split(search).length - 1;
  if (matched !== 1) return { text, changed: 0 };
  return { text: text.replace(search, replacement), changed: 1 };
}

if (!fs.existsSync(srcDir)) {
  console.error('Không thấy thư mục src. Mở PowerShell tại thư mục tkd-green rồi chạy lại.');
  process.exit(1);
}
if (!fs.existsSync(hookSrc)) {
  console.error('Thiếu src/useRetainedFilter.js trong bộ mã ZIP đã giải nén.');
  process.exit(1);
}
if (!fs.existsSync(hookDest)) {
  fs.copyFileSync(hookSrc, hookDest);
  console.log('ĐÃ THÊM src/useRetainedFilter.js');
} else if (fs.readFileSync(hookDest, 'utf8') !== fs.readFileSync(hookSrc, 'utf8')) {
  console.warn('ĐÃ CÓ useRetainedFilter.js khác nội dung; không ghi đè.');
}

changeOne('App.jsx', (original) => {
  let next = original;
  let count = 0;
  let r = replaceOnce(next, 'import useUserRole from "./useUserRole";', 'import useUserRole from "./useUserRole";\nimport useRetainedFilter from "./useRetainedFilter";');
  next = r.text; count += r.changed;
  r = replaceOnce(next, "const [location, setLocation] = useState('Tất cả điểm tập');", "const [location, setLocation] = useRetainedFilter(`tkd-green:${user?.uid || 'guest'}:global-location`, 'Tất cả điểm tập');");
  next = r.text; count += r.changed;
  return { next, count, expected: 2 };
});

changeOne('MemberList.jsx', (original) => {
  let next = original;
  let count = 0;
  // Thêm import ở đầu, độc lập kiểu dấu nháy hiện tại.
  next = 'import useRetainedFilter from "./useRetainedFilter";\n' + next; count++;
  const scope = "`tkd-green:${profile?.uid || profile?.email || 'guest'}:members";
  for (const [name,initial] of [['search','""'],['statusFilter','ALL'],['beltFilter','ALL']]) {
    const pattern = new RegExp(`const \\[${name}, set${name[0].toUpperCase()+name.slice(1)}\\] = useState\\(${initial==='""'?'""':initial}\\);`, 'g');
    const hits = [...next.matchAll(pattern)].length;
    if (hits===1) {
      next = next.replace(pattern, `const [${name}, set${name[0].toUpperCase()+name.slice(1)}] = useRetainedFilter(${scope}:${name}\`, ${initial});`);
      count++;
    }
  }
  return { next, count, expected:4 };
});

// Bộ lọc tìm kiếm và kỳ đang chọn trong phần Học phí được giữ khi đổi menu.
changeOne('TuitionManagement.jsx', (original) => {
  let next = 'import useRetainedFilter from "./useRetainedFilter";\n' + original;
  let count = 1;
  let r = replaceOnce(next, 'const [search, setSearch] = useState("");', 'const [search, setSearch] = useRetainedFilter(`tkd-green:${profile?.uid || profile?.email || "guest"}:tuition:search`, "");');
  next = r.text; count += r.changed;
  return { next, count, expected:2 };
});

console.log('Hoàn tất. Chạy npm run build để xác nhận tương thích với mã hiện tại.');
