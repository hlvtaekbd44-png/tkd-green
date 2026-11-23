// TKD GREEN — Máy in A5 đen trắng. Chỉ in dữ liệu đã được nghiệp vụ học phí đối chiếu.
// Không đọc/ghi Firestore, không tạo giao dịch hoặc kỳ thu.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = (v, fallback='—') => esc(String(v ?? '').trim() || fallback);
const money = v => `${Number(v).toLocaleString('vi-VN')} đ`;
const dateVN = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v).split('-').reverse().join('/') : String(v || '—');
const validMoney = v => Number.isSafeInteger(Number(v)) && Number(v) >= 0;
const owed = c => Number(c.soTienPhaiDong ?? c.soTien ?? 0);
const paid = c => Number(c.daThu ?? c.soTien ?? 0);
const debt = c => owed(c) - paid(c);
const safeCode = v => String(v || '').replace(/[^\p{L}\p{N} _.\-]/gu,'').slice(0,65);
// Quy đổi số tiền sang chữ tiếng Việt, không đọc số thập phân hoặc giá trị không an toàn.
const VI_DIGITS = ['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'];
function readThreeDigits(n, full = false) {
  const hundred = Math.floor(n / 100);
  const ten = Math.floor((n % 100) / 10);
  const unit = n % 10;
  const out = [];
  if (hundred > 0) out.push(VI_DIGITS[hundred], 'trăm');
  else if (full && n > 0) out.push('không', 'trăm');
  if (ten > 1) {
    out.push(VI_DIGITS[ten], 'mươi');
    if (unit === 1) out.push('mốt');
    else if (unit === 5) out.push('lăm');
    else if (unit) out.push(VI_DIGITS[unit]);
  } else if (ten === 1) {
    out.push('mười');
    if (unit === 5) out.push('lăm');
    else if (unit) out.push(VI_DIGITS[unit]);
  } else if (unit) {
    if (hundred > 0 || full) out.push('lẻ');
    out.push(VI_DIGITS[unit]);
  }
  return out.join(' ');
}
export function numberToVietnameseWords(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Số tiền không hợp lệ để đọc thành chữ.');
  if (number === 0) return 'Không đồng';
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  const groups = [];
  let rest = number;
  while (rest > 0) { groups.unshift(rest % 1000); rest = Math.floor(rest / 1000); }
  const phrases = [];
  for (let i = 0; i < groups.length; i++) {
    const part = groups[i];
    if (!part) continue;
    const index = groups.length - i - 1;
    const full = i > 0 && part < 100 && groups.slice(0,i).some(x => x !== 0);
    phrases.push([readThreeDigits(part, full), units[index]].filter(Boolean).join(' '));
  }
  const sentence = `${phrases.join(' ').replace(/\s+/g,' ').trim()} đồng`;
  return sentence.charAt(0).toLocaleUpperCase('vi') + sentence.slice(1);
}

const status = v => String(v || '').trim().toLocaleLowerCase('vi');

function qrSrc(url) {
  const v = String(url || '').trim();
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= 150000) return v;
  if (/^https:\/\/[a-z0-9.-]+(?:\/[^\s<>"']*)?$/i.test(v)) return v;
  return '';
}
function normalize(item) {
  const member = item?.member;
  const cycles = item?.cycles;
  const totalDebt = item?.totalDebt;
  if (!member?.id || !Array.isArray(cycles) || !validMoney(totalDebt)) throw new Error('Thiếu hồ sơ hoặc dữ liệu kỳ học phí.');
  if (cycles.some(c => !c || !/^\d{4}-\d{2}-\d{2}$/.test(c.ngayBatDau || '') || !/^\d{4}-\d{2}-\d{2}$/.test(c.ngayHetHan || '') || !validMoney(owed(c)) || !validMoney(paid(c)) || paid(c)>owed(c))) {
    throw new Error(`Lịch sử kỳ học phí của ${member.hoTen || member.name || member.id} chưa hợp lệ.`);
  }
  const pending = cycles.filter(c => debt(c) > 0).sort((a,b) => a.ngayBatDau.localeCompare(b.ngayBatDau));
  const sum = pending.reduce((v,c) => v + debt(c),0);
  if (!Number.isSafeInteger(sum) || sum !== Number(totalDebt)) throw new Error(`Tổng nợ và các kỳ của ${member.hoTen || member.name || member.id} không khớp.`);
  const examFees = Array.isArray(item.examFees) ? item.examFees : [];
  if (examFees.some(f => !f || !validMoney(f.amount) || !validMoney(f.paid) || !validMoney(f.remaining) || Number(f.amount)-Number(f.paid)!==Number(f.remaining) || !['Thi cấp','Thi đẳng'].includes(f.type))) {
    throw new Error(`Khoản lệ phí thi của ${member.hoTen || member.name || member.id} không hợp lệ.`);
  }
  const totalExamFees = examFees.reduce((s,f) => s + Number(f.remaining),0);
  const grandTotal = Number(totalDebt) + totalExamFees;
  if (!Number.isSafeInteger(grandTotal)) throw new Error('Tổng phải thanh toán vượt giới hạn số nguyên an toàn.');
  return {...item, pending, examFees, totalExamFees, grandTotal};
}
const splitPages = rows => {
  if (!rows.length) return [[]];
  // Mỗi tờ A5 giới hạn 2 dòng để giữ chỗ cho chữ lớn, QR và chữ ký.
  const blocks = [];
  for (let i=0;i<rows.length;i+=2) blocks.push(rows.slice(i,i+2));
  return blocks;
};
function table(rows, offset) {
  return `<table><colgroup><col style="width:7%"><col style="width:36%"><col style="width:19%"><col style="width:19%"><col style="width:19%"></colgroup><thead><tr><th>STT</th><th>KHOẢN CẦN ĐÓNG</th><th>PHẢI ĐÓNG</th><th>ĐÃ THU</th><th>CÒN NỢ</th></tr></thead><tbody>${rows.map((entry,i) => {
    if (entry.kind === 'exam') {
      const f = entry.data;
      return `<tr><td class="center">${offset+i+1}</td><td><b>${text(f.type)}</b><div class="sub">${text(f.period)} · ${text(f.level)}</div></td><td class="amount">${money(f.amount)}</td><td class="amount">${money(f.paid)}</td><td class="amount bold">${money(f.remaining)}</td></tr>`;
    }
    const c=entry.data;
    return `<tr><td class="center">${offset+i+1}</td><td>${text(dateVN(c.ngayBatDau))} – ${text(dateVN(c.ngayHetHan))}<div class="sub">Học phí ${text(c.loaiHocPhi,'')}</div></td><td class="amount">${money(owed(c))}</td><td class="amount">${money(paid(c))}</td><td class="amount bold">${money(debt(c))}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="center">Không có khoản phải đóng.</td></tr>'}</tbody></table>`;
}

function renderEntry(item, serial, total, issued) {
  const {member, locationInfo: loc = {}, pending, totalDebt, examFees, totalExamFees, grandTotal} = item;
  const office = loc.printNotice || {};
  const name = member.hoTen || member.name || 'Chưa có tên';
  const center = loc.name || member.diemTap || member.location || 'Chưa xác định';
  const instructor = office.coachName || office.hlvName || '';
  const phone = office.coachPhone || office.phone || '';
  const bank = office.bankName || '';
  const number = office.bankAccount || '';
  const holder = office.bankHolder || '';
  const note = office.transferNote || `HP ${safeCode(member.maHoiVienNoiBo || member.maHV)} ${safeCode(name)}`;
  const qr = qrSrc(office.qrUrl || '');
  const canBank = !!(bank && number && holder);
  const combined = [
    ...pending.map(data => ({kind:'tuition',data})),
    ...examFees.map(data => ({kind:'exam',data})),
  ];
  const blocks = splitPages(combined);
  let offset = 0;
  return blocks.map((block, page) => {
    const first = page===0, last=page===blocks.length-1;
    const tableHtml = table(block,offset);offset+=block.length;
    return `<section class="sheet">
      <header><div><div class="brand">TKD GREEN</div><div class="orgname">CÂU LẠC BỘ TAEKWONDO GREEN</div></div><div class="place"><b>${text(center)}</b>${instructor?`<span>HLV: ${text(instructor)}</span>`:''}${phone?`<span>Điện thoại: ${text(phone)}</span>`:''}</div></header>
      <div class="headtitle"><div>THÔNG BÁO HỌC PHÍ</div></div>
      ${first?`<div class="info"><div><em>HỌ VÀ TÊN</em><b>${text(name)}</b></div><div><em>MÃ HỘI VIÊN NỘI BỘ</em><b>${text(member.maHoiVienNoiBo)}</b></div><div><em>MÃ HỘI VIÊN VTF</em><b>${text(member.maHV)}</b></div><div><em>ĐIỂM TẬP</em><b>${text(center)}</b></div><div><em>NGÀY THÔNG BÁO</em><b>${text(dateVN(issued))}</b></div></div>`:`<div class="carry">Hội viên: <b>${text(name)}</b> · ${text(member.maHoiVienNoiBo || member.maHV)} · tiếp theo</div>`}
      ${first && ['nghỉ học','đã nghỉ','ngừng học'].includes(status(member.trangThai || member.status))?'<div class="inactive">Hội viên đã nghỉ học: chỉ thông báo nợ cũ, không phát sinh kỳ mới.</div>':''}
      <div class="sectionhead"><b>CÁC KHOẢN CẦN THANH TOÁN</b><span>Trang ${page+1}/${blocks.length}</span></div>
      ${tableHtml}
      ${last ? `<div class="breakdown"><span>Học phí: <b>${money(totalDebt)}</b></span><span>Lệ phí thi: <b>${money(totalExamFees)}</b></span></div>
      <div class="total"><span>TỔNG SỐ TIỀN CẦN THANH TOÁN</span><strong>${money(grandTotal)}</strong></div>
      <div class="totalwords"><b>Bằng chữ:</b> ${text(numberToVietnameseWords(grandTotal))}.</div>
      <div class="bankrow"><div class="banktext"><b>THÔNG TIN THANH TOÁN</b>${canBank ? `<p>Ngân hàng: <strong>${text(bank)}</strong></p><p>Số tài khoản: <strong>${text(number)}</strong></p><p>Chủ tài khoản: <strong>${text(holder)}</strong></p><p>Nội dung: <strong>${text(note)}</strong></p>` : `<p>Liên hệ HLV để nhận thông tin chuyển khoản.</p>`}${instructor?`<p>HLV phụ trách: <strong>${text(instructor)}</strong></p>`:''}${phone?`<p>SĐT: <strong>${text(phone)}</strong></p>`:''}</div>${qr?`<div class="qrwrap"><img src="${esc(qr)}" alt="QR chuyển khoản"/><small>QUÉT MÃ CHUYỂN KHOẢN</small></div>`:''}</div>
      <div class="note">Lưu ý: Phiếu này là thông báo học phí, khi đóng phí hoàn tất phụ huynh/hội viên vui lòng đưa phiếu cho HLV ký và đóng mộc CLB xác nhận.</div>
      <div class="sign"><div>PHỤ HUYNH / HỘI VIÊN<small>(Ký xác nhận nếu cần)</small></div><div>HLV / ĐẠI DIỆN CLB<small>${text(instructor,'Ký, ghi rõ họ tên')}</small></div></div>` : ''}
      <footer><span>TKD GREEN · THÔNG BÁO HỌC PHÍ</span><span>Phiếu ${serial}/${total} · ${page+1}/${blocks.length}</span></footer>
    </section>`;
  }).join('');
}

export function renderTuitionNoticesA5(items, {date}={}) {
  if (!Array.isArray(items) || !items.length) throw new Error('Chưa chọn hội viên để in.');
  const clean = items.map(normalize);
  const day = date || (() => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;})();
  const content = clean.map((item,index) => renderEntry(item,index+1,clean.length,day)).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>TKD GREEN · Thông báo A5 (${clean.length} hội viên)</title><style>
  @page{size:A5 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;color:#000;background:#dedede;font-family:Arial,'Segoe UI',sans-serif;font-size:11px}
  .sheet{width:148mm;height:210mm;position:relative;overflow:hidden;background:#fff;margin:0 auto 12px;padding:8mm 8mm 12mm;page-break-after:always;break-after:page}
  .sheet:last-of-type{page-break-after:auto;break-after:auto}header{border-bottom:2px solid #000;padding-bottom:6px;display:flex;justify-content:space-between;gap:7px}.brand{font-weight:900;font-size:20px;letter-spacing:.6px}.orgname{font-size:10px;margin-top:3px}.place{font-size:10.5px;text-align:right;max-width:49%;overflow-wrap:anywhere;line-height:1.3}.place span{display:block;margin-top:3px}.headtitle{text-align:center;padding:10px 0 9px}.headtitle div{font-size:20px;font-weight:900;letter-spacing:.3px}
  .info{border:1px solid #444;display:grid;grid-template-columns:1fr 1fr;padding:7px 9px;gap:6px 8px;margin-bottom:7px}.info em{display:block;font-style:normal;font-size:9px;margin-bottom:3px}.info b{font-size:12px;overflow-wrap:anywhere}.carry{padding:9px 0;font-size:11px}.inactive{border:1px dashed #555;padding:6px;margin-bottom:7px;font-size:10px}
  .sectionhead{display:flex;justify-content:space-between;margin:8px 0 6px;font-size:10px}
  table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}td,th{padding:7px 3px;vertical-align:middle;border:1px solid #666;overflow-wrap:anywhere}th{text-align:left;background:#f3f3f3;font-size:9px}.center{text-align:center}.sub{font-size:9px;margin-top:2px}.amount{text-align:right;font-variant-numeric:tabular-nums}.bold{font-weight:900}
  .breakdown{display:flex;justify-content:space-between;gap:8px;margin-top:9px;font-size:10px}.breakdown span{flex:1}
  .total{border:2px solid #000;padding:8px;display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:9px}.total span{font-size:10.5px;font-weight:800}.total strong{font-size:18px;white-space:nowrap}.totalwords{border:1px solid #555;border-top:0;padding:7px 8px;font-size:11px;line-height:1.45;overflow-wrap:anywhere}
  .bankrow{display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:9px;border:1px solid #777;padding:7px;min-height:116px;break-inside:avoid}.banktext{min-width:0;overflow-wrap:anywhere;flex:1}.banktext>b{font-size:11px}.banktext p{margin:4px 0;font-size:10px;line-height:1.3}.qrwrap{text-align:center;width:108px;flex-shrink:0}.qrwrap img{display:block;width:104px;height:104px;object-fit:contain;margin:0 auto;image-rendering:crisp-edges}.qrwrap small{display:block;font-size:8px;font-weight:700;line-height:1.2;margin-top:3px}
  .note{font-size:10.5px;line-height:1.45;margin-top:9px}.sign{display:flex;justify-content:space-between;margin-top:11px;font-size:10px;font-weight:bold;text-align:center}.sign div{width:44%}.sign small{display:block;font-weight:normal;margin-top:5px}footer{position:absolute;left:8mm;right:8mm;bottom:6mm;border-top:1px solid #555;padding-top:4px;display:flex;justify-content:space-between;font-size:8px}
  .toolbar{padding:14px;text-align:center}.toolbar button{background:#111;color:#fff;padding:10px 20px;cursor:pointer;border:0;border-radius:5px}.toolbar p{font-size:12px}
  @media print{html,body{background:white}.toolbar{display:none}.sheet{margin:0;width:148mm;height:210mm;box-shadow:none}}
  @media screen{.sheet{box-shadow:0 4px 18px #888}}
  </style></head><body><div class="toolbar"><button onclick="window.print()">In tất cả (${clean.length} hội viên) / Lưu PDF</button><p>Chọn giấy A5 dọc, tỷ lệ 100%, tắt phần đầu/chân trang trình duyệt. In hàng loạt: mỗi phiếu bắt đầu trên trang A5 mới.</p></div>${content}</body></html>`;
}
export function printTuitionNoticesA5(items, options={}) {
  const html = renderTuitionNoticesA5(items,options); // kiểm tra TẤT CẢ phiếu trước khi mở trang in
  const popup = options.targetWindow || window.open('','_blank','width=820,height=960');
  if (!popup) throw new Error('Cửa sổ in bị chặn. Hãy cho phép pop-up của trang TKD Green.');
  popup.document.open();popup.document.write(html);popup.document.close();
  return popup;
}
export function printTuitionNoticeA5(item) { return printTuitionNoticesA5([item],{date:item?.date}); }
