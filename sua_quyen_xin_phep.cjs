// TKD Green - sửa điều kiện bật Xin phép nghỉ, không ghi đè phân hệ khác.
// Chạy tại thư mục gốc dự án: node sua_quyen_xin_phep.cjs
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const appPath = path.join(root, 'src', 'App.jsx');
const portalPath = path.join(root, 'src', 'MemberSelfPortal.jsx');
function fail(text) { console.error('LỖI: ' + text); process.exitCode = 1; }
if (!fs.existsSync(appPath) || !fs.existsSync(portalPath)) {
  fail('Không tìm thấy src/App.jsx hoặc src/MemberSelfPortal.jsx. Hãy mở PowerShell trong thư mục tkd-green.');
} else {
  const app = fs.readFileSync(appPath, 'utf8');
  const portal = fs.readFileSync(portalPath, 'utf8');
  let fixedApp = app;
  let fixedPortal = portal;
  const changes = [];
  // Lỗi xác định: App dò được locations theo tên, nhưng điều kiện cũ bắt member.locationId phải có.
  const gate = /leaveEnabled\s*=\s*\{\s*feature\(['"]leaveRequests['"]\)\s*&&\s*member\?\.locationId\s*===\s*locationDoc\?\.id\s*\}/g;
  if (gate.test(fixedApp)) {
    fixedApp = fixedApp.replace(gate, 'leaveEnabled={feature(\'leaveRequests\')} locationId={locationDoc?.id || \'\'}');
    changes.push('App.jsx: bỏ yêu cầu member.locationId bắt buộc ở bước hiển thị, truyền locationId đã xác minh.');
  }
  // Trong phiên bản cũ, MemberSelfPortal hiển thị thông báo "chưa mở" khi prop leaveEnabled=false.
  // Giữ kiểm tra trạng thái từ locations để không tự ý bật cho điểm tập chưa được cấp quyền.
  // Các bản V1 đã tích hợp LeaveRequestPanel phải được truyền locationId để lưu đơn đúng điểm tập.
  if (fixedPortal.includes('<LeaveRequestPanel') && !fixedPortal.includes('locationId={locationId}')) {
    fixedPortal = fixedPortal.replace(/<LeaveRequestPanel\b([^>]*?)\s*\/>/g, (all, props) => {
      if (/locationId\s*=/.test(props)) return all;
      changes.push('MemberSelfPortal.jsx: truyền locationId của điểm tập cho biểu mẫu mới.');
      return `<LeaveRequestPanel${props} locationId={locationId} />`;
    });
    if (fixedPortal !== portal && !/export default function MemberSelfPortal\(\{[^}]*\blocationId\b/.test(fixedPortal)) {
      fixedPortal = fixedPortal.replace(/export default function MemberSelfPortal\(\{([^}]*)\}\)/, (all, props) => `export default function MemberSelfPortal({${props}, locationId = '' })`);
    }
  }
  if (fixedApp === app && fixedPortal === portal) {
    console.log('Không tìm thấy điều kiện lỗi phiên bản cũ. App có thể đã được vá.');
    console.log('Kiểm tra trong App.jsx: feature(\'leaveRequests\'), thông tin locations.active và locations.features.leaveRequests.');
  } else {
    // Kiểm tra trước khi ghi, không tạo file hỏng khi thiếu vị trí chỉnh sửa.
    if (fixedApp.includes('leaveEnabled={feature(\'leaveRequests\') && member?.locationId === locationDoc?.id}')) {
      fail('Chưa loại bỏ hết điều kiện cũ; không ghi file.');
    } else {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (fixedApp !== app) {fs.copyFileSync(appPath, appPath + '.backup.' + stamp); fs.writeFileSync(appPath, fixedApp, 'utf8');}
      if (fixedPortal !== portal) {fs.copyFileSync(portalPath, portalPath + '.backup.' + stamp); fs.writeFileSync(portalPath, fixedPortal, 'utf8');}
      console.log('ĐÃ SỬA:\n- ' + changes.join('\n- '));
      console.log('Đã sao lưu các file bị sửa thành .backup.<thời gian>.');
    }
  }
}
