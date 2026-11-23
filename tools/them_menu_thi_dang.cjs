// Chạy một lần tại thư mục gốc dự án tkd-green. Không ghi đè nếu cấu trúc App.jsx thay đổi.
const fs = require('fs');
const path = require('path');
const target = path.join(process.cwd(), 'src', 'App.jsx');
if (!fs.existsSync(target)) { console.error('Không thấy src/App.jsx'); process.exit(1); }
let code = fs.readFileSync(target, 'utf8');
if (code.includes("activePage === \"Thi đẳng\"") || code.includes("activePage === 'Thi đẳng'")) {
  console.log('Đã có mục Thi đẳng. Không thay đổi file.'); process.exit(0);
}
const nav = "{ label: 'Thi cấp', module: 'exams', icon: <EmojiEventsRounded /> },";
const portal = "...(feature('exams') ? [{ label: 'Thi cấp', icon: <EmojiEventsRounded /> }] : []),";
const page = /\)\s*:\s*activePage === ["']Thi cấp["']\s*\?\s*\(\s*<ExamManagement([\s\S]*?)\/>\s*\)\s*:\s*activePage === ["']Điểm danh["']\s*\?\s*\(/;
const match = code.match(page);
if (!code.includes(nav) || !code.includes(portal) || !match) {
  console.error('Cấu trúc App.jsx không khớp. Không chỉnh sửa. Hãy gửi App.jsx mới nhất để ghép.');
  process.exit(2);
}
if (/examType\s*=/.test(match[1])) {
  console.error('Đã có examType trong khối Thi cấp, cần kiểm tra thủ công.'); process.exit(3);
}
const backup = `${target}.before_split_exams_${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
fs.copyFileSync(target, backup);
code = code.replace(nav, nav + "\n  { label: 'Thi đẳng', module: 'exams', icon: <EmojiEventsRounded /> },");
code = code.replace(portal, "...(feature('exams') ? [{ label: 'Thi cấp', icon: <EmojiEventsRounded /> }, { label: 'Thi đẳng', icon: <EmojiEventsRounded /> }] : []),");
code = code.replace(page, (full, props) => {
  const inner = props.trimEnd();
  return `) : activePage === "Thi cấp" ? (\n  <ExamManagement key="cap" examType="cap"${inner}\/>\n) : activePage === "Thi đẳng" ? (\n  <ExamManagement key="dan" examType="dan"${inner}\/>\n) : activePage === "Điểm danh" ? (`;
});
fs.writeFileSync(target, code);
console.log('Đã thêm Thi đẳng và phân biệt loại đợt thi. Sao lưu:', backup);
