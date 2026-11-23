import {
  collection, doc, getDocs, query, where, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { getMemberPrefix, formatMemberId } from './memberLocations';
import { getBeltAppearance } from './BeltBadge';

/**
 * Nguồn chuẩn điểm tập là locations. Giữ mã prefix trước đây cho điểm tập cũ,
 * và đọc code/id từ locations cho điểm tập mới. Không tự khởi tạo counter:
 * bộ đếm phải được Admin khởi tạo đúng số lớn nhất để không cấp mã trùng.
 */
async function resolveLocationCode(locationName) {
  const name = String(locationName ?? '').trim();
  if (!name) throw new Error('Chưa chọn điểm tập.');

  const snap = await getDocs(query(collection(db, 'locations'), where('name', '==', name)));
  const matches = snap.docs.filter(x => x.data().deleted !== true);
  if (matches.length > 1) throw new Error(`Có nhiều cấu hình cùng tên điểm tập “${name}”.`);
  const entry = matches[0];
  if (entry) {
    const info = entry.data();
    if (info.active === false) throw new Error(`Điểm tập “${name}” đã tạm ngừng hoạt động.`);
    const code = String(info.code || entry.id).trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,20}$/.test(code)) throw new Error(`Mã điểm tập “${name}” không hợp lệ.`);
    return { prefix: code, locationRef: entry.ref, locationName: name };
  }

  // Tương thích dữ liệu 6 điểm tập cũ chưa khởi tạo locations.
  // Điểm tập MỚI bắt buộc có cấu hình thực tế trong locations.
  const oldPrefix = getMemberPrefix(name);
  if (oldPrefix) return { prefix: oldPrefix, locationRef: null, locationName: name };
  throw new Error(`Không tìm thấy điểm tập “${name}” trong Cài đặt điểm tập (locations).`);
}

function validCounter(snapshot, name) {
  if (!snapshot.exists()) {
    throw new Error(`Chưa khởi tạo memberCounters cho điểm tập “${name}”. Admin cần thiết lập bộ đếm trước khi thêm hội viên.`);
  }
  const current = snapshot.data().lastNumber;
  if (!Number.isSafeInteger(current) || current < 0) throw new Error('Bộ đếm mã hội viên không hợp lệ.');
  return current;
}

function checkLocationInTransaction(snapshot, name) {
  if (!snapshot) return;
  if (!snapshot.exists() || snapshot.data().deleted === true || snapshot.data().active === false || snapshot.data().name !== name) {
    throw new Error('Cấu hình điểm tập đã thay đổi; vui lòng tải lại dữ liệu.');
  }
}

export async function createMemberWithAutoId(memberData) {
  if (!String(memberData?.hoTen ?? '').trim()) throw new Error('Chưa nhập họ tên hội viên.');
  if (!auth.currentUser) throw new Error('Bạn cần đăng nhập để thêm hội viên.');
  const loc = await resolveLocationCode(memberData.diemTap);
  const counterRef = doc(db, 'memberCounters', loc.prefix);
  const memberRef = doc(collection(db, 'members'));
  const level = String(memberData.capDaiDang || 'Cấp 10').trim();
  const beltName = getBeltAppearance(level)?.name || '';

  return runTransaction(db, async tx => {
    // Tất cả transaction.get phải đứng trước transaction.update/set.
    const counter = await tx.get(counterRef);
    const locationSnap = loc.locationRef ? await tx.get(loc.locationRef) : null;
    checkLocationInTransaction(locationSnap, loc.locationName);
    const next = validCounter(counter, loc.locationName) + 1;
    const maHoiVienNoiBo = formatMemberId(loc.prefix, next);

    tx.update(counterRef, { lastNumber: next, updatedAt: serverTimestamp() });
    tx.set(memberRef, {
      ...memberData,
      diemTap: loc.locationName,
      ...(loc.locationRef ? { locationId: loc.locationRef.id } : {}),
      maHoiVienNoiBo,
      maHV: String(memberData.maHV ?? '').trim(), // VTF là trường không bắt buộc
      hoTen: String(memberData.hoTen).trim(),
      trangThai: memberData.trangThai || 'Đang học',
      capDaiDang: level,
      mauDai: beltName, // tự đồng bộ màu, không yêu cầu nhập từ Excel
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: memberRef.id, maHoiVienNoiBo };
  });
}

/** Chuyển điểm tập nhưng giữ nguyên document ID, UID liên kết và lịch sử. */
export async function transferMemberLocation(memberId, newLocation, updateData = {}) {
  if (!memberId) throw new Error('Thiếu ID hồ sơ hội viên.');
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Bạn cần đăng nhập để chuyển điểm tập.');
  const memberRef = doc(db, 'members', memberId);
  const loc = await resolveLocationCode(newLocation);
  const counterRef = doc(db, 'memberCounters', loc.prefix);
  const historyRef = doc(collection(db, 'memberTransferHistory'));
  // Không cho updateData ghi đè mã CLB, điểm tập hay Firebase ID.
  const { diemTap: _ignoredLocation, maHoiVienNoiBo: _ignoredCode,
    locationId: _ignoredLocationId, id: _ignoredId, ...safeUpdates } = updateData || {};

  return runTransaction(db, async tx => {
    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists()) throw new Error('Không tìm thấy hồ sơ hội viên.');
    const member = memberSnap.data();
    const unchanged = member.diemTap === loc.locationName;
    // Chỉ đọc counter khi thực sự chuyển điểm tập.
    const counter = unchanged ? null : await tx.get(counterRef);
    const locationSnap = loc.locationRef ? await tx.get(loc.locationRef) : null;
    checkLocationInTransaction(locationSnap, loc.locationName);

    if (unchanged) {
      tx.update(memberRef, { ...safeUpdates, updatedAt: serverTimestamp() });
      return { changed: false, maHoiVienNoiBo: member.maHoiVienNoiBo || '' };
    }
    const next = validCounter(counter, loc.locationName) + 1;
    const newMemberCode = formatMemberId(loc.prefix, next);
    tx.update(counterRef, { lastNumber: next, updatedAt: serverTimestamp() });
    tx.update(memberRef, {
      ...safeUpdates,
      diemTap: loc.locationName,
      ...(loc.locationRef ? { locationId: loc.locationRef.id } : {}),
      maHoiVienNoiBo: newMemberCode,
      updatedAt: serverTimestamp(),
    });
    tx.set(historyRef, {
      memberId,
      diemTapCu: member.diemTap || '', diemTapMoi: loc.locationName,
      maNoiBoCu: member.maHoiVienNoiBo || '', maNoiBoMoi: newMemberCode,
      maHV: member.maHV || '', hoTen: member.hoTen || '',
      nguoiThucHienUid: currentUser.uid,
      nguoiThucHienEmail: currentUser.email || '',
      ngayChuyen: serverTimestamp(),
    });
    return { changed: true, oldMemberCode: member.maHoiVienNoiBo || '', maHoiVienNoiBo: newMemberCode };
  });
}
