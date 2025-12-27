import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { doc, getDoc, getDocs, collection,  setDoc, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { renderFeed } from './feed.js';
import { renderProfileSettings } from './profile.js';
import { initVoiceSystem } from './voiceSystem.js';
import { initNavigation } from './navigation.js';



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
  if (!u) {
    document.getElementById('app').innerHTML = `
      <div class="onboard">
        <h1>Travel Buddy Dubai ✈️</h1>
        <p>Find your perfect solo travel partner</p>
        <button id="signin" class="primary">Get Started</button>
      </div>`;
    document.getElementById('signin').onclick = () => signInAnonymously(auth);
    return;
  }

  const snap = await getDoc(doc(db, "users", u.uid));
  const p = snap.data() || {};

  if (!p.name || !p.vibe?.length) {
    document.getElementById('app').innerHTML = `
      <div class="onboard">
        <h2>Almost there!</h2>
        <p>Tell us about you</p>
        <input id="name" placeholder="Your first name" class="input"><br><br>
        <p><strong>Your travel vibe (pick 1–3)</strong></p>
        <div class="vibes">
          ${['Budget Explorer','Luxury Relaxer','Culture Seeker','Adrenaline Junkie'].map(v => `
            <label><input type="radio" name="vibe" value="${v}" required> ${v}</label><br>
          `).join('')}
        </div><br>
        <button id="save" class="primary">Save & Find Buddies →</button>
      </div>`;
    
    document.getElementById('save').onclick = async () => {
      const name = document.getElementById('name').value.trim();
      const vibe = document.querySelector('input[name="vibe"]:checked')?.value;
      if (!name || !vibe) {
        alert("Name + one travel vibe required");
        return;
      }
      await setDoc(doc(db, "users", u.uid), { name, vibe: [vibe], updatedAt: new Date() }, { merge: true });

    };
    return;
  }

  user = u;
  profile = p;

  // Inside onAuthStateChanged, right after profile load (after if (!p.name || !p.vibe?.length))
if (!allUsersCache) {
  const snap = await getDocs(collection(db, "users"));
  allUsersCache = snap.docs
    .filter(doc => doc.id !== u.uid)
    .map(doc => ({ id: doc.id, ...doc.data() }));
}


if (!matchesCache) {
  const q = query(collection(db, "matches"), where("users", "array-contains", u.uid));
  const snap = await getDocs(q);
  matchesCache = await Promise.all(snap.docs.map(async docSnap => {
    const data = docSnap.data();
    const otherId = data.users.find(id => id !== u.uid);
    const otherProfile = allUsersCache.find(u => u.id === otherId) || {};
    // last msg optional - skip or cache separately if needed
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
  renderFeed();

});
