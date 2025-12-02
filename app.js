import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// For the matching mechanism
import { collection, query, where, getDocs, limit, orderBy} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// For real accepted match
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// For the messaging and listening for new messages
import { addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// For login interface - onAuthStateChanged()
import { getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// For profile picture storage
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";


const firebaseConfig = {
  apiKey: "AIzaSyBUQd_x2mj0KO6V6QL6IpAlGS2c9R3btz8",
  authDomain: "travelbuddy-8b52e.firebaseapp.com",
  projectId: "travelbuddy-8b52e",
  storageBucket: "travelbuddy-8b52e.firebasestorage.app",
  messagingSenderId: "1037819323621",
  appId: "1:1037819323621:web:65281a7026d24c2182a00c",
  measurementId: "G-WTYP9Y82CP"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ADD THIS LINE after initializing auth and db
const storage = getStorage(app); // New Line: Inititalizing Firebase Storage

// EDIT: Add globals for user and profile to make them accessible in functions
let user = null;
let profile = null;

// Tracks the current match ID for chat
let currentChatMatchId = null;

// Replace your onAuthStateChanged with this final clean version
onAuthStateChanged(auth, async (u) => { // EDIT: Change 'user' to 'u' to avoid conflict
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
  const p = snap.data() || {}; // EDIT: Change 'profile' to 'p' to avoid conflict

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
      const selected = document.querySelector('input[name="vibe"]:checked')?.value || '';
      if(!document.getElementById('name').value || !selected) {
        alert("Name + one travel vibe required");
        return;
      }
      await setDoc(doc(db, "users", u.uid), { // EDIT: Use 'u.uid'
        name: document.getElementById('name').value.trim(),
        vibe: [selected],
        updatedAt: new Date()
      }, { merge: true });
      location.reload();
    };
  } else {
    user = u; // EDIT: Set global user
    profile = p; // EDIT: Set global profile

    document.getElementById('app').innerHTML = `
      <div id="content"></div>
      <div class="nav">
        <button id="feedBtn" class="active">Feed</button>
        <button id="inboxBtn">Inbox</button>
        <button id="profileBtn">Profile</button>
      </div>
    `;

    const content = document.getElementById('content');

    async function renderFeed() {
      // Get current user's vibe array
      const myVibe = profile.vibe;

      // Query Firestore for users who share at least one vibe
      const q = query(
        collection(db, 'users'),
        where("vibe", "array-contains-any", myVibe)
      );

      // Execute query and get snapshot
      const snapshot = await getDocs(q);

      // Build array of candidates (exclude self)
      const candidates = [];
      snapshot.forEach(doc => {
        if(doc.id !== user.uid) {
          candidates.push({ id: doc.id, ...doc.data() });
        }
      });

      // Shuffle and take only 5
      const five = candidates.sort(() => Math.random() - 0.5).slice(0, 5);

      // Build full HTML string for the feed
      let cardsHTML = '';
      if (five.length === 0) {
        cardsHTML = `<p>No matches yet. Tell friends to join!</p>`;
      } else {
        cardsHTML = five.map(p => `
          <div class="card">
            <h3>${p.name}</h3>
            <p>Vibe: ${p.vibe.join(" • ")}</p>
            <button class="like" data-id="${p.id}">Like</button>
            <button class="pass" data-id="${p.id}">Pass</button>
          </div>
          `).join('');
      }

      // Render everything to content div (no separate feed div)
      content.innerHTML = `
      <div class="discovery">
        <h2>Focus Five</h2>
        ${cardsHTML}
      </div>
      `;

      // Attach event listeners to Like/Pass buttons after render
      document.querySelectorAll('.like').forEach(btn => {
        btn.onclick = async () => {
          const otherId = btn.dataset.id;
          await startMatch(user.uid, otherId);
          btn.parentElement.remove(); // remove the card on like
        };
      });

      document.querySelectorAll('.pass').forEach(btn => {
          btn.onclick = () => btn.parentElement.remove(); // remove card on pass
      });
    } 

   async function renderInbox() {
      // Query all matches where current user is in the users array
      const matchesQuery = query(
        collection(db, "matches"),
        where("users", "array-contains", user.uid)
      );

      const matchesSnap = await getDocs(matchesQuery);

        console.log("MATCHES FOUND:", matchesSnap.size); // ← ADD THIS
  console.log("ALL MATCHES:", matchesSnap.docs.map(d => ({id: d.id, data: d.data()}))); // ← ADD THIS

      if (matchesSnap.empty) {
        content.innerHTML = `<p>No matches yet. Start liking in Discovery!</p>`;
        return;
      }

      // For each match => get other person's name/vibe + last message
      const matchPromises = matchesSnap.docs.map(async (matchDoc) => {
        const data = matchDoc.data();
        const otherId = data.users.find(id => id !== user.uid); // find the other person
        const otherSnap = await getDoc(doc(db, "users", otherId));
        const otherProfile = otherSnap.data();

          // ADD NULL CHECKS:
          if (!otherProfile) {
            return {
              matchId: matchDoc.id,
              name: "Unknown User",
              vibe: "Unknown",
              lastMsg: ""
            };
          }

        // Get the very last message (most recent one)
        const lastMsgSnap = await getDocs(
          query(collection(db, "matches", matchDoc.id, "messages"), limit(1))
        );
        const lastMsg = lastMsgSnap.empty ? "" : lastMsgSnap.docs[0].data().text;

        return {
          matchId: matchDoc.id,
          name: otherProfile.name || "Unknown User",
          vibe: otherProfile.vibe?.[0] || "Unknown",
          photoURL: otherProfile.photoURL || null, // NEW LINE: Include photo URL
          lastMsg
        };
      });

      const matches = await Promise.all(matchPromises);

      // Set full HTML string for the inbox
      content.innerHTML = `
      <div class="inbox">
        <h2>Your Matches</h2>
        <div class="matches-list">
          ${matches.map(m => `
            <div class="match-item" data-matchid="${m.matchId}">
              <div class="match-avatar" style="${m.photoURL ? `background-image:
                url('${m.photoURL}')` : ''}"> <!-- NEW: Show photo -->
                  ${!m.photoURL ? m.name.charAt(0).toUpperCase() : ''} <!-- CHANGED: Initial if no photo -->
              </div>
              <div class="match-content">
                <strong>${m.name}</strong> <small>(${m.vibe})</small><br>
                <small>${m.lastMsg || "No messages yet"}</small>
              </div>
            </div>
            `).join('')}
        </div>
      </div>
      `;

      document.querySelectorAll('.match-item').forEach(item => {
        item.addEventListener('click', () => openChat(item.dataset.matchid));
      });
  }



    // WITH this:
document.addEventListener('click', (e) => {
  if (e.target.id === 'feedBtn') {
    document.getElementById('feedBtn').classList.add('active');
    document.getElementById('inboxBtn').classList.remove('active');
    document.getElementById('profileBtn').classList.remove('active');
    renderFeed();
  } else if (e.target.id === 'inboxBtn') {
    document.getElementById('inboxBtn').classList.add('active');
    document.getElementById('feedBtn').classList.remove('active');
    document.getElementById('profileBtn').classList.remove('active');
    renderInbox();
  } else if (e.target.id === 'profileBtn') {
    document.getElementById('inboxBtn').classList.remove('active');
    document.getElementById('feedBtn').classList.remove('active');
    document.getElementById('profileBtn').classList.add('active');
    renderProfileSettings();
  }

});




    // EDIT: Start on Feed
    renderFeed();
  }
});



 // OPENCHAT !!!
  function openChat(matchId) {
    currentChatMatchId = matchId; // Set the selected match ID
    document.getElementById('inboxBtn').classList.add('active');
    document.getElementById('feedBtn').classList.remove('active');
    document.getElementById('profileBtn').classList.remove('active');

    renderChat(matchId);

    console.log("Opening chat with", matchId);
  }



// Function to render chats
async function renderChat(matchId) {
  if(!matchId) {

    return;
  };

  
  // Keep inbox button active while in chat
  document.getElementById('inboxBtn').classList.add('active');
  document.getElementById('feedBtn').classList.remove('active');
  document.getElementById('profileBtn').classList.remove('active');


  content.innerHTML = `
    <div class="chat">
      <h2 style="padding: 16px; margin: 0; background: white; border-bottom: 1px solid #e0e0e0;" >Chat</h2>
      <div id="messages"></div>
      <div class="chat-input">
          <input id="msg" placeholder="Type message">
          <button id="send">Send</button>
      </div>
    
    </div>
  `;

  // In renderChat(), after content.innerHTML:
  setTimeout(() => document.getElementById('msg').focus(), 100);
  
  const messagesDiv = document.getElementById('messages');

  onSnapshot(query(
    collection(db, "matches", matchId, "messages"),
    orderBy("timestamp", "asc")
  ), 
    snap => {
    messagesDiv.innerHTML = snap.docs.map(d => {
      const m = d.data();
      const isMe = m.sender === user.uid; // Check if sent by current user
      return `<div class="${isMe ? 'me' : 'other'}">${m.text}</div>`; // Style as me or other
    }).join(''); // Join all message HTML into one string
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to bottom for new messages
  });

  document.getElementById('send').onclick = async () => {
    const msg = document.getElementById('msg').value.trim();
    if(msg) {
      await sendMessage(matchId, msg); // Call your sendMessage function
      document.getElementById('msg').value = ''; // Clear Input
    }
  };
}








// This is matching brain
async function findMatches(myVibe) {
    const q = query(
        collection(db, "users"),
        where("vibe", "array-contains-any", myVibe)
    );

    const snapshot = await getDocs(q);
    const matches = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        if (doc.id !== auth.currentUser.uid) { // don't match yourself
            matches.push({ id: doc.id, ...data });
        }
    });

    console.log("Your real matches:", matches);
    return matches;
}


// Create real match when two users accept each other
async function startMatch(userId1, userId2) {
    const matchId = `${userId1}_${userId2}`;
    await setDoc(doc(db, "matches", matchId), {
        users: [userId1, userId2],
        status: "active",
        createdAt: new Date()
    });
    console.log("Match created:", matchId);

    
}

// To make it visible in the browser and make it global
    window.startMatch = startMatch;




// Send message (My version)
async function sendMessage(matchId, text) {
    const matchDocRef = doc(db, "matches", matchId); // get reference to the parent match document
    const messagesCollectionRef = collection(matchDocRef, "messages"); // get the reference to the subcollection


    await addDoc( messagesCollectionRef, {
        text,
        sender: auth.currentUser.uid,
        timestamp: new Date()
    });
    console.log("Message sent to match:", matchId);
}





// Listen for new messages (real-time)
function listenToChat(matchId) {
    const messagesRef = collection(db, "matches", matchId, "messages");
    onSnapshot(messagesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if(change.type === "added") {
                console.log("New message:", change.doc.data());
            }
        });
    });
}

// To make it global
    window.sendMessage = sendMessage;
    window.listenToChat = listenToChat;








// Profile page functions and code
async function renderProfileSettings() {
  content.innerHTML = `
    <div class="profile-settings">
      <h2>Profile Settings</h2>

      <!-- Profile Picture Section -->
      <div class="profile-picture-section">
        <div class="profile-avatar" id="profileAvatar"
            style="${profile.photoURL ? `background-image: url('${profile.photoURL}')`: ''
          }"> <!-- ADDED: Show existing photo -->
            ${!profile.photoURL && profile.name ? 
              profile.name.charAt(0).toUpperCase() : ''} <!-- CHANGED: Only initial if no photo -->
        </div>
        <input type="file" id="profilePhoto" accept="image/*" style="display:none;">
        <button id="uploadPhotoBtn" class="change-photo-btn">
          ${profile.photoURL ? 'Change Photo' : 'Upload Photo'} <!-- CHANGED: Dynamic button text -->
        </button> 
        ${profile.photoURL ? '<button id="removePhotoBtn" class="remove-btn">Remove Photo</button>' : ''} <!-- NEW: Remove button -->
      </div>




      <!-- Name Section -->
      <div class="setting-group">
        <label>Your Name</label>
        <input type="text" id="profileName" value="${profile.name || ''}" placeholder="Enter your name">
      </div>

      <!-- Vibe Section -->
      <div class="setting-group">
        <label>Your Travel Vibe</label>
        <div class="vibe-options">
          ${['Budget Explorer', 'Luxury Relaxer', 'Culture Seker', 'Adrenaline Junkie']
            .map(vibe => `
               <label class="vibe-option">
                <input type='radio' name="profileVibe" value="${vibe}"
                  ${profile.vibe && profile.vibe.includes(vibe) ? 'checked' : ''}>
                ${vibe}
               </label>
              `).join('')}
        </div>
      </div>

      <!-- Save Button -->
      <button id="saveProfile" class="save-btn">Save Changes</button>
    </div>
  `;

  // Handle profile photo upload (basic version)
  

// REPLACE your current photo handler with this:

// Upload photo handler - NEW CODE
document.getElementById('uploadPhotoBtn').onclick = () => 
  document.getElementById('profilePhoto').click();

document.getElementById('profilePhoto').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Show loading
  document.getElementById('profileAvatar').innerHTML = '⏳';
  
  try {
    // Upload to Firebase Storage - NEW CODE
    const storageRef = ref(storage, `profile-pics/${user.uid}`);
    await uploadBytes(storageRef, file);
    
    // Get download URL - NEW CODE
    const photoURL = await getDownloadURL(storageRef);
    
    // Update preview immediately
    document.getElementById('profileAvatar').style.backgroundImage = `url('${photoURL}')`;
    document.getElementById('profileAvatar').innerHTML = '';
    
    // Store URL for saving later - NEW CODE
    document.getElementById('profileAvatar').dataset.tempPhoto = photoURL;
    
  } catch (error) {
    alert('Upload failed: ' + error.message);
    document.getElementById('profileAvatar').innerHTML = 
      profile.name ? profile.name.charAt(0).toUpperCase() : '?';
  }
};


// Remove photo handler - NEW CODE
if (profile.photoURL) {
  document.getElementById('removePhotoBtn').onclick = () => {
    document.getElementById('profileAvatar').style.backgroundImage = '';
    document.getElementById('profileAvatar').innerHTML = 
      profile.name ? profile.name.charAt(0).toUpperCase() : '?';
    document.getElementById('profileAvatar').dataset.tempPhoto = '';
    document.getElementById('removePhotoBtn').remove();
  };
}











  // Handle and save profile

// Handle and save profile
document.getElementById('saveProfile').onclick = async () => {
  const newName = document.getElementById('profileName').value.trim();
  const selectedVibe = document.querySelector('input[name="profileVibe"]:checked')?.value;

  if (!newName || !selectedVibe) {
    alert('Please fill in both name and travel vibe');
    return;
  }

  try {
    await setDoc(doc(db, "users", user.uid), {
      name: newName,
      vibe: [selectedVibe],
      updatedAt: new Date()
    }, { merge: true });

    // Update global profile
    profile.name = newName;
    profile.vibe = [selectedVibe];

    alert('Profile updated successfully!');
  } catch(error) {
    alert('Error updating profile: ' + error.message);
  }
};


}
