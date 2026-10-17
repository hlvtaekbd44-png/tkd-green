
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDDKFTpnv-R94ObtafwvDLqnvjuLu9-918",
  authDomain: "tkd-green.firebaseapp.com",
  projectId: "tkd-green",
  storageBucket: "tkd-green.firebasestorage.app",
  messagingSenderId: "383750738318",
  appId: "1:383750738318:web:6a3ba63bfbaec6e26f54df",
  measurementId: "G-R8T089HFFV"
};
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
