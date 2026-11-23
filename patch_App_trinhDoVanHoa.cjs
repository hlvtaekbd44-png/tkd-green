const fs = require('fs');
const path = require('path');
const target = path.join(process.cwd(), 'src', 'App.jsx');
if (!fs.existsSync(target)) throw new Error('Không tìm thấy src/App.jsx');
const original = fs.readFileSync(target, 'utf8');
const needle = "gioiTinh: member.gioiTinh || 'Nam',";
if (original.includes('trinhDoVanHoa: member.trinhDoVanHoa')) {
 console.log('App.jsx đã có trinhDoVanHoa, không sửa thêm.');
} else {
 const times = original.split(needle).length - 1;
 if (times !== 1) throw new Error(`Dừng an toàn: không tìm thấy đúng 1 dòng ánh xạ giới tính (tìm thấy ${times}). Gửi App.jsx để vá thủ công.`);
 const backup = target + '.bak-trinhDoVanHoa';
 fs.copyFileSync(target, backup);
 fs.writeFileSync(target, original.replace(needle, needle + "\n          trinhDoVanHoa: member.trinhDoVanHoa || '',"));
 console.log(`Đã vá App.jsx, sao lưu tại ${backup}`);
}
