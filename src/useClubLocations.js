import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

/** Nguồn điểm tập duy nhất: collection locations trong Firestore. */
export function useClubLocations() {
  const [locations, setLocations] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [locationError, setLocationError] = useState('');
  useEffect(() => onSnapshot(collection(db, 'locations'), (snap) => {
    setLocations(snap.docs.map(d => ({ ...d.data(), id: d.id }))
      .filter(x => x.deleted !== true && x.name)
      .sort((a,b) => a.name.localeCompare(b.name, 'vi')));
    setLoadingLocations(false); setLocationError('');
  }, e => { setLocationError(`Không đọc được cấu hình điểm tập: ${e.message}`); setLoadingLocations(false); }), []);
  return { locations, loadingLocations, locationError };
}
export function namesForProfile(locations, profile, { activeOnly = true } = {}) {
  const raw = profile?.diemTap ?? profile?.locations ?? profile?.location ?? [];
  const assigned = (Array.isArray(raw) ? raw : String(raw).split(/[,;]/)).map(x => String(x).trim());
  return locations.filter(loc => (!activeOnly || loc.active !== false) &&
    (profile?.role === 'admin' || assigned.includes(loc.name) || assigned.includes(loc.id) || assigned.includes(loc.code)))
    .map(loc => loc.name);
}
