/** TKD GREEN: sửa bộ lọc điểm tập trực tiếp trên App.jsx đang dùng. */
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const file = path.join(root, 'src', 'App.jsx');
const hookFile = path.join(root, 'src', 'useClubLocations.js');
if (!fs.existsSync(file)) { console.error('KHÔNG TÌM THẤY src/App.jsx. Hãy chạy lệnh ở thư mục tkd-green.'); process.exit(1); }
const original = fs.readFileSync(file, 'utf8');
let result = original;
const oldList = /^const locations = \['Tất cả điểm tập',[^\r\n]*\];?\r?\n/m;
const oldBlock = /const assignedPoints = useMemo\(\(\) => assignedLocations\(profile\), \[profile\]\);\s*const assignedKey = assignedPoints\.join\('\\u0001'\);\s*const availableLocations = useMemo\(\(\) => \(\s*profile\?\.role === 'admin'\s*\? locations\s*:\s*\['Tất cả điểm tập', \.\.\.assignedPoints\]\s*\), \[profile\?\.role, assignedKey\]\);/;
const alreadyPatched = result.includes('TKD_GREEN_DYNAMIC_LOCATION_FILTER_V9');
if (alreadyPatched) { console.log('App.jsx đã được cập nhật V9. Không thực hiện lại.'); process.exit(0); }
if (!oldBlock.test(result)) { console.error('Cấu trúc bộ lọc trong App.jsx khác bản đã kiểm tra. KHÔNG SỬA FILE. Hãy gửi App.jsx mới nhất để ghép thủ công.'); process.exit(2); }
if (!result.includes('function App() {') || !result.includes("import useUserRole from \"./useUserRole\";")) {
 console.error('Không nhận diện được App.jsx hiện tại. KHÔNG SỬA FILE.'); process.exit(2);
}
if (oldList.test(result)) result = result.replace(oldList, '');
if (!result.includes('from "./useClubLocations"')) result = result.replace('import useUserRole from "./useUserRole";', 'import useUserRole from "./useUserRole";\nimport { useClubLocations, namesForProfile } from "./useClubLocations";');
result = result.replace('function App() {', 'function App() {\n  // TKD_GREEN_DYNAMIC_LOCATION_FILTER_V9\n  const { locations: clubLocations, loadingLocations, locationError } = useClubLocations();');
const newBlock = `const assignedPoints = useMemo(() => {
  // HLV có thể được gán theo tên, mã hoặc ID điểm tập. Truy vấn members vẫn dùng tên diemTap.
  const raw = assignedLocations(profile);
  return [...new Set(raw.map(value => {
    const found = clubLocations.find(x => [x.name, x.id, x.code].includes(value));
    return found?.name || value;
  }))];
}, [profile, clubLocations]);
const assignedKey = assignedPoints.join('\\u0001');
const availableLocations = useMemo(() => [
  'Tất cả điểm tập',
  ...namesForProfile(clubLocations, profile, { activeOnly: false }),
], [clubLocations, profile]);`;
result = result.replace(oldBlock, newBlock);
// Không reset lựa chọn trước khi snapshot locations tải xong.
const oldEffect = `if (location !== 'Tất cả điểm tập' && !availableLocations.includes(location)) {`;
if (!result.includes(oldEffect)) { console.error('Không tìm thấy logic giữ bộ lọc. KHÔNG SỬA FILE.'); process.exit(2); }
result = result.replace(oldEffect, `if (!loadingLocations && !locationError && location !== 'Tất cả điểm tập' && !availableLocations.includes(location)) {`);
result = result.replace('}, [location, availableLocations]);', '}, [location, availableLocations, loadingLocations, locationError]);');
// Thông báo nếu quyền Firestore không cho đọc locations; không giả vờ đã đồng bộ.
const mainToken = '<Box component="main" className="page-content">';
if (result.includes(mainToken)) result = result.replace(mainToken, `${mainToken}\n            {locationError && <Alert severity="warning" sx={{ mb: 2 }}>{locationError}. Kiểm tra Firestore Rules của collection locations.</Alert>}`);
if (!fs.existsSync(hookFile)) {
 const packaged = path.join(__dirname, '..', 'src', 'useClubLocations.js');
 if (!fs.existsSync(packaged)) { console.error('Thiếu useClubLocations.js đi kèm.'); process.exit(2); }
 fs.copyFileSync(packaged, hookFile);
 console.log('Đã thêm src/useClubLocations.js');
} else {
 const hook = fs.readFileSync(hookFile, 'utf8');
 if (!hook.includes('useClubLocations') || !hook.includes('namesForProfile')) {
   console.error('useClubLocations.js có cấu trúc khác. Chưa sửa App.jsx; kiểm tra hook trước.'); process.exit(2);
 }
}
const backup = `${file}.backup-locations-v9-${new Date().toISOString().replace(/[.:]/g, '-')}`;
fs.writeFileSync(backup, original);
fs.writeFileSync(file, result);
console.log('ĐÃ ĐỒNG BỘ bộ lọc Điểm tập trong App.jsx từ Firebase locations.');
console.log('Đã sao lưu:', backup);
console.log('Kiểm tra: npm run build');
