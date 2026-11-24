import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';

export const HONOR_COLLECTION = 'honorPosts';
export const HONOR_CONFIG = doc(db, 'publicContentSettings', 'honor');
export const defaultHonorConfig = { popupEnabled: true, bannerEnabled: true };

export function subscribePublicHonors(onData, onError) {
  return onSnapshot(query(collection(db, HONOR_COLLECTION), where('status', '==', 'published')),
    snapshot => onData(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}
export function subscribeHonorConfig(onData, onError) {
  return onSnapshot(HONOR_CONFIG, snap => onData(snap.exists() ? { ...defaultHonorConfig, ...snap.data() } : defaultHonorConfig), onError);
}
export const activeHonor = p => {
  const now = new Date().toISOString().slice(0, 10);
  return p.status === 'published' && (p.startDate || '') <= now && (!p.endDate || p.endDate >= now);
};
export function sortHonors(posts) {
  return [...posts].sort((a,b) => (Number(b.priority)||0)-(Number(a.priority)||0) || String(b.createdAt?.seconds||0).localeCompare(String(a.createdAt?.seconds||0)));
}
