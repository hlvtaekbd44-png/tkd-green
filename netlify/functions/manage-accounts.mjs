import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const DOMAIN = 'accounts.tkdgreen.invalid';
const USER_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const usernameEmail = name => `${name}@${DOMAIN}`;
const validPassword = value => typeof value === 'string' && value.length >= 12 && value.length <= 128;
const normalize = value => String(value || '').trim().toLowerCase();

function ensureAdminApp() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('Thiếu FIREBASE_SERVICE_ACCOUNT_JSON trên Netlify.');
    const json = JSON.parse(raw);
    initializeApp({ credential: cert(json) });
  }
}
const response = (statusCode, value) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control':'no-store' },
  body: JSON.stringify(value),
});
const failure = (status, message) => response(status, { ok:false, error: message });

async function requireAdmin(event) {
  const bearer = /^Bearer (.+)$/.exec(event.headers.authorization || event.headers.Authorization || '');
  if (!bearer) throw Object.assign(new Error('Chưa đăng nhập.'), { httpStatus:401 });
  const decoded = await getAuth().verifyIdToken(bearer[1], true);
  const profile = await getFirestore().doc(`users/${decoded.uid}`).get();
  if (!profile.exists || profile.get('role') !== 'admin' || profile.get('active') !== true) {
    throw Object.assign(new Error('Chỉ Admin đang hoạt động mới có quyền quản lý tài khoản.'), { httpStatus:403 });
  }
  return decoded;
}
async function resolveMember(id) {
  if (typeof id !== 'string' || !id || id.includes('/')) throw Object.assign(new Error('ID hội viên không hợp lệ.'), { httpStatus:400 });
  const ref = getFirestore().doc(`members/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error('Hồ sơ hội viên không tồn tại.'), { httpStatus:404 });
  return { ref, snap };
}
async function inspectMember(id) {
  const { snap } = await resolveMember(id);
  let uid = snap.get('accountUid') || '';
  if (!uid) {
    const users = await getFirestore().collection('users').where('memberDocId', '==', id).limit(2).get();
    if (users.size > 1) throw new Error('Có nhiều tài khoản liên kết hồ sơ, cần đối soát.');
    uid = users.docs[0]?.id || '';
  }
  if (!uid) return response(200, {ok:true, account:null});
  const user = await getFirestore().doc(`users/${uid}`).get();
  if (!user.exists || user.get('role') !== 'member') throw new Error('Liên kết tài khoản không hợp lệ, cần đối soát.');
  return response(200, {ok:true,account:{uid,username:user.get('username') || '(tài khoản cũ)', active:user.get('active') === true}});
}
async function createAccount(params, adminUid) {
  const { action, password } = params;
  const username = normalize(params.username);
  if (username === 'admin') throw Object.assign(new Error('Tên admin dành riêng cho tài khoản quản trị.'), {httpStatus:400});
  if (!USER_RE.test(username) || !validPassword(password)) throw Object.assign(new Error('Tên đăng nhập 3–40 ký tự hợp lệ và mật khẩu 12–128 ký tự.'), {httpStatus:400});
  const isCoach = action === 'createCoach';
  let member = null;
  if (!isCoach) {
    member = await resolveMember(params.memberDocId);
    if (member.snap.get('accountUid')) throw Object.assign(new Error('Hội viên đã được liên kết tài khoản.'), {httpStatus:409});
    const legacy = await getFirestore().collection('users').where('memberDocId','==',params.memberDocId).limit(1).get();
    if (!legacy.empty) throw Object.assign(new Error('Đã có tài khoản cũ liên kết hồ sơ.'), {httpStatus:409});
  } else if (typeof params.name !== 'string' || !params.name.trim()) {
    throw Object.assign(new Error('Chưa có họ tên HLV.'), {httpStatus:400});
  }
  const firestore = getFirestore();
  const loginRef = firestore.doc(`loginNames/${username}`);
  if ((await loginRef.get()).exists) throw Object.assign(new Error('Tên đăng nhập đã được sử dụng.'), {httpStatus:409});
  // Không cấp mật khẩu, token hay quyền quản trị ở client. Firebase Auth giữ mật khẩu.
  let authUser;
  try {
    authUser = await getAuth().createUser({email:usernameEmail(username), password, disabled:true, displayName:isCoach?params.name.trim():member.snap.get('hoTen') || username});
  } catch (err) {
    if (err.code === 'auth/email-already-exists') throw Object.assign(new Error('Tên đăng nhập đã tồn tại trong Authentication.'), {httpStatus:409});
    throw err;
  }
  const uid = authUser.uid;
  try {
    await firestore.runTransaction(async tx => {
      const checked = await Promise.all([tx.get(loginRef), ...(member ? [tx.get(member.ref)] : [])]);
      if (checked[0].exists) throw new Error('Tên đăng nhập vừa được cấp cho tài khoản khác.');
      if (member && checked[1].get('accountUid')) throw new Error('Hội viên vừa được cấp tài khoản khác.');
      const common = {username,active:false,createdBy:adminUid,createdAt:FieldValue.serverTimestamp()};
      tx.create(loginRef,{uid, role: isCoach ? 'hlv' : 'member', createdAt:FieldValue.serverTimestamp()});
      if (isCoach) {
        const p = {
          dashboard:{view:false},members:{view:false,create:false,edit:false,delete:false},
          tuition:{view:false,collect:false},exams:{view:false,manage:false},
          attendance:{view:false,manage:false},reports:{view:false}
        };
        const lp={members:[],tuition:[],exams:[],attendance:[],reports:[]};
        tx.create(firestore.doc(`users/${uid}`),{...common,role:'hlv',tenHienThi:params.name.trim(),diemTap:[],permissions:p,locationPermissions:lp});
      } else {
        tx.create(firestore.doc(`users/${uid}`),{...common,role:'member',memberDocId:params.memberDocId});
        tx.update(member.ref,{accountUid:uid});
      }
    });
    // Trạng thái chỉ bật sau khi tạo liên kết hồ sơ thành công.
    await getAuth().updateUser(uid,{disabled:false});
    await firestore.doc(`users/${uid}`).update({active:true});
    return response(200,{ok:true,account:{uid,username,active:true}});
  } catch(err) {
    // Nếu Firestore đã tạo liên kết mà thao tác cuối lỗi, KHÔNG xóa Auth để tránh orphan.
    const current = await firestore.doc(`users/${uid}`).get().catch(()=>null);
    if (!current?.exists) await getAuth().deleteUser(uid).catch(()=>{});
    throw err;
  }
}
async function setActive({uid,active}, adminUid) {
  if (typeof uid !== 'string' || !uid || uid.includes('/') || typeof active !== 'boolean') throw Object.assign(new Error('Thông tin tài khoản không hợp lệ.'),{httpStatus:400});
  if (uid === adminUid) throw Object.assign(new Error('Không thể tự khóa tài khoản đang sử dụng.'),{httpStatus:400});
  const ref = getFirestore().doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists || !['hlv','member'].includes(snap.get('role'))) throw Object.assign(new Error('Chỉ quản lý kích hoạt HLV hoặc võ sinh.'),{httpStatus:403});
  if (active) {
    await getAuth().updateUser(uid,{disabled:false});
    await ref.update({active:true});
  } else {
    await ref.update({active:false}); // Rules chặn quyền đọc ngay lập tức.
    await getAuth().updateUser(uid,{disabled:true});
    await getAuth().revokeRefreshTokens(uid);
  }
  return response(200,{ok:true,uid,active});
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return failure(405,'Chỉ hỗ trợ POST.');
  try {
    ensureAdminApp();
    const admin = await requireAdmin(event);
    const body = JSON.parse(event.body || '{}');
    switch(body.action) {
      case 'inspectMember': return await inspectMember(body.memberDocId);
      case 'createMember':
      case 'createCoach': return await createAccount(body,admin.uid);
      case 'setActive': return await setActive(body,admin.uid);
      default: return failure(400,'Chức năng không hợp lệ.');
    }
  } catch(err) {
    console.error('manage-accounts:',err.code || err.message);
    return failure(err.httpStatus || 500,err.httpStatus ? err.message : 'Lỗi máy chủ. Kiểm tra Netlify Function Logs.');
  }
}
