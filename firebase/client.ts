import {initializeApp, getApp, getApps} from "firebase/app";
import {getAuth} from 'firebase/auth';
import {getFirestore} from 'firebase/firestore';
const firebaseConfig = {
    apiKey: "AIzaSyAvd2muPlTccMnmDgp3ZyV9T7kS5DxCDoY",
    authDomain: "prepwise-8d3f6.firebaseapp.com",
    projectId: "prepwise-8d3f6",
    storageBucket: "prepwise-8d3f6.firebasestorage.app",
    messagingSenderId: "423401903231",
    appId: "1:423401903231:web:e79eb7d51b10549a571b4a",
    measurementId: "G-P89RPSK94D"
};

// Initialize Firebase
const app = !getApps.length ? initializeApp(firebaseConfig): getApp();
export const auth=getAuth(app);
export const db=getFirestore(app);
