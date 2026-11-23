// Một nguồn quy tắc cho Đề xuất thi và Import kết quả TKD GREEN.
// Giới hạn theo bảng cấp/đẳng hiện đang được cấu hình trong BeltBadge (Cấp 10–1, 1–7 Đẳng).
import { getBeltAppearance, normalizeBeltLevel } from './BeltBadge';

export const EXAM_RANK_SEQUENCE = Object.freeze([
  'Cấp 10', 'Cấp 9', 'Cấp 8', 'Cấp 7', 'Cấp 6', 'Cấp 5',
  'Cấp 4', 'Cấp 3', 'Cấp 2', 'Cấp 1',
  '1 Đẳng', '2 Đẳng', '3 Đẳng', '4 Đẳng', '5 Đẳng', '6 Đẳng', '7 Đẳng',
]);

export function normalizeExamLevel(input) {
  const raw = String(input ?? '').trim().replace(/\s+/g, ' ');
  // Hỗ trợ cả thứ tự 'Đẳng 1' và '1 Đẳng', không tự chấp nhận cấp lạ.
  const normalized = normalizeBeltLevel(raw);
  return EXAM_RANK_SEQUENCE.includes(normalized) ? normalized : '';
}

export function nextExamLevel(current) {
  const index = EXAM_RANK_SEQUENCE.indexOf(normalizeExamLevel(current));
  return index >= 0 && index < EXAM_RANK_SEQUENCE.length - 1 ? EXAM_RANK_SEQUENCE[index + 1] : '';
}

export function previousExamLevel(target) {
  const index = EXAM_RANK_SEQUENCE.indexOf(normalizeExamLevel(target));
  return index > 0 ? EXAM_RANK_SEQUENCE[index - 1] : '';
}

export function isDanExamLevel(target) {
  return /^\d+ Đẳng$/.test(normalizeExamLevel(target));
}

function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/đ/g, 'd').trim().replace(/\s+/g, ' ');
}

export function normalizeExamResult(value) {
  const s = fold(value);
  if (['dat', 'pass', 'passed'].includes(s)) return 'Đạt';
  if (['khong dat', 'khongdat', 'fail', 'failed'].includes(s)) return 'Không đạt';
  return '';
}

// Giữ API evaluateExamResult để tương thích các màn hình import đã có.
export function evaluateExamResult(target, rawResult) {
  const capDai = normalizeExamLevel(target);
  const result = normalizeExamResult(rawResult);
  if (!capDai) return { valid: false, error: 'Cấp/đẳng dự thi không hợp lệ' };
  if (!previousExamLevel(capDai)) return { valid: false, error: 'Không có bậc trước để đăng ký thi' };
  if (!result) return { valid: false, error: 'Kết quả chỉ nhận Đạt hoặc Không đạt' };
  const mauDai = getBeltAppearance(capDai)?.name || '';
  if (!mauDai) return { valid: false, error: 'Chưa có màu đai tương ứng' };
  return { valid: true, capDai, mauDai, result, shouldUpdateBelt: result === 'Đạt' };
}
