import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,

} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";


import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { doc, getDoc, getDocs, collection,  setDoc, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";


import { initVoiceSystem } from './voiceSystem.js';
import { initNavigation } from './navigation.js';


let pullStartY = 0;
let pullDistance = 0;
const pullThreshold = 120; // pixels to trigger refresh

// Near the top, after imports
export let allUsersCache = null;
export let matchesCache = null;








const firebaseConfig = {
  apiKey: "AIzaSyBUQd_x2mj0KO6V6QL6IpAlGS2c9R3btz8",
  authDomain: "travelbuddy-8b52e.firebaseapp.com",
  projectId: "travelbuddy-8b52e",
  storageBucket: "travelbuddy-8b52e.firebasestorage.app",
  messagingSenderId: "1037819323621",
  appId: "1:1037819323621:web:65281a7026d24c2182a00c",
  measurementId: "G-WTYP9Y82CP"
};



export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export let user = null;
export let profile = null;
export { initVoiceSystem };













onAuthStateChanged(auth, async (u) => {
  user = u; // always set, can be null

  let p = {};
  if (u) {
    const snap = await getDoc(doc(db, "users", u.uid));
    p = snap.data() || {};
  }
  profile = p;



  if (u && !p.name && u.displayName) {
    await setDoc(doc(db, "users", u.uid), { 
      name: u.displayName, 
      photoURL: u.photoURL || '', 
      updatedAt: new Date() 
    }, { merge: true });
    profile.name = u.displayName;
    profile.photoURL = u.photoURL || '';
  }



  // Load caches (guests can see feed, but limited actions)
  if (!allUsersCache) {
    const snap = await getDocs(collection(db, "users"));
    allUsersCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }


  allUsersCache = allUsersCache.filter(u => u.id !== u.uid);


  if (u && !matchesCache) {
    const q = query(collection(db, "matches"), where("users", "array-contains", u.uid));
    const snap = await getDocs(q);
    matchesCache = await Promise.all(snap.docs.map(async docSnap => {
      const data = docSnap.data();
      const otherId = data.users.find(id => id !== u.uid);
      const otherProfile = allUsersCache.find(u => u.id === otherId) || {};
      return { matchId: docSnap.id, otherProfile, data };
    }));
  }

  
  document.getElementById('app').innerHTML = `
    <div id="content"></div>
    <div class="nav">
      <button id="feedBtn" class="active">Feed</button>
      <button id="inboxBtn">Inbox</button>
      <button id="profileBtn">Profile</button>
    </div>
  `;

  initNavigation();

  // Auto-open feed (works for guests too)
  document.getElementById('feedBtn').click();
});








// For refresh:

// Pull-to-refresh logic
document.addEventListener('touchstart', e => {
  if (e.touches.length === 1 && window.scrollY === 0) {
    pullStartY = e.touches[0].clientY;
  }
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (pullStartY > 0 && e.touches.length === 1) {
    pullDistance = e.touches[0].clientY - pullStartY;
    if (pullDistance > 0 && window.scrollY === 0) {
      e.preventDefault(); // stop overscroll bounce
    }
  }
}, { passive: false });

document.addEventListener('touchend', () => {
  if (pullDistance > pullThreshold) {
    window.location.reload(true); // force full reload
  }
  pullStartY = 0;
  pullDistance = 0;
});







// For display


let refreshSpinner = null;

document.addEventListener('touchmove', e => {
  if (pullStartY > 0 && e.touches.length === 1) {
    pullDistance = e.touches[0].clientY - pullStartY;
    if (pullDistance > 0 && window.scrollY === 0) {
      e.preventDefault();

      if (!refreshSpinner) {
        refreshSpinner = document.createElement('div');
        refreshSpinner.style.cssText = `
          position:fixed; top:0; left:0; right:0; height:60px;
          display:flex; align-items:center; justify-content:center;
          background:rgba(255,255,255,0.9); z-index:9999; transform:translateY(-100%);
          transition:transform 0.3s;
        `;
        refreshSpinner.innerHTML = '<div style="font-size:32px;animation:spin 1s linear infinite;">↻</div>';
        document.body.appendChild(refreshSpinner);
      }

      const progress = Math.min(pullDistance / pullThreshold, 1);
      refreshSpinner.style.transform = `translateY(${progress * 60}px)`;
    }
  }
});

document.addEventListener('touchend', () => {
  if (refreshSpinner) {
    if (pullDistance > pullThreshold) {
      refreshSpinner.style.transform = 'translateY(60px)';
      setTimeout(() => window.location.reload(true), 300);
    } else {
      refreshSpinner.style.transform = 'translateY(-100%)';
      setTimeout(() => {
        if (refreshSpinner) {
          refreshSpinner.remove();
          refreshSpinner = null;
        }
      }, 300);
    }
  }
  pullStartY = 0;
  pullDistance = 0;
});