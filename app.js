import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { collection, query, where, getDocs, limit, orderBy, doc, setDoc, addDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
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
const storage = getStorage(app);



// Globals
let user = null;
let profile = null;
let currentChatMatchId = null;
let feedCandidates = [];
let currentCandidateIndex = 0;
let lastVibe = null;
// For Recorder
let recorder = null;
// For playing the audio
let currentBlob = null;





// ==============================================
// PHASE 1: VOICE STATE LAYER
// ==============================================
// Each question has its own isolated state
// This prevents questions from interfering with each other
// ==============================================

// voiceState object tracks ALL 3 questions independently
// Structure for EACH question (1, 2, 3):
// - recording: boolean (true when microphone is active)
// - blob:      Audio blob (temporary, exists after recording until saved/deleted)
// - url:       Firebase Storage URL (permanent, exists after saving)
const voiceState = {
  1: { recording: false, blob: null, url: null },
  2: { recording: false, blob: null, url: null },
  3: { recording: false, blob: null, url: null }
};

// Single recorder engine - shared by all 3 questions
// We initialize this LATER when we have user data (in renderProfileSettings)
let voiceRecorder = null;

// Timer tracking - each question can have its own countdown
const voiceTimers = {};






// Auth state
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
      const selected = document.querySelector('input[name="vibe"]:checked')?.value || '';
      if(!document.getElementById('name').value || !selected) {
        alert("Name + one travel vibe required");
        return;
      }
      await setDoc(doc(db, "users", u.uid), {
        name: document.getElementById('name').value.trim(),
        vibe: [selected],
        updatedAt: new Date()
      }, { merge: true });
      location.reload();
    };
  } else {
    user = u;
    profile = p;

    document.getElementById('app').innerHTML = `
      <div id="content"></div>
      <div class="nav">
        <button id="feedBtn" class="active">Feed</button>
        <button id="inboxBtn">Inbox</button>
        <button id="profileBtn">Profile</button>
      </div>
    `;

    const content = document.getElementById('content');

    // Navigation
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

    renderFeed();
  }
});

// Feed
async function renderFeed() {
  content.innerHTML = `<div class="loading">Finding travel buddies...</div>`;

  const myVibe = profile.vibe;
  const vibeChanged = lastVibe !== myVibe[0];
  
  if (feedCandidates.length === 0 || vibeChanged) {
    const q = query(collection(db, 'users'), where("vibe", "array-contains-any", myVibe));
    const snapshot = await getDocs(q);

    feedCandidates = [];
    snapshot.forEach(doc => {
      if(doc.id !== user.uid) {
        feedCandidates.push({ id: doc.id, ...doc.data() });
      }
    });

    // Shuffle once per vibe
    for (let i = feedCandidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [feedCandidates[i], feedCandidates[j]] = [feedCandidates[j], feedCandidates[i]];
    }

    currentCandidateIndex = 0;
    lastVibe = myVibe[0];
  }

  if (feedCandidates.length === 0) {
    content.innerHTML = `<div class="no-matches"><h3>No matches yet</h3><p>Tell friends to join or check back later!</p></div>`;
    return;
  }

  const currentCandidate = feedCandidates[currentCandidateIndex];
  
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not specified';
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  content.innerHTML = `
    <div class="discovery-single">
      <div class="profile-card">
        <div class="feed-profile-pic" 
             style="${currentCandidate.photoURL ? `background-image: url('${currentCandidate.photoURL}')` : ''}">
          ${!currentCandidate.photoURL ? currentCandidate.name?.charAt(0).toUpperCase() || '?' : ''}
        </div>
        
        <div class="profile-header">
          <h2>${currentCandidate.name || 'Traveler'}</h2>
          <div class="vibe-badge">${currentCandidate.vibe?.[0] || 'Explorer'}</div>
        </div>

        <div class="details-section">
          <div class="detail-item">
            <span class="detail-icon">📅</span>
            <div>
              <strong>Dubai Dates</strong>
              <p>${currentCandidate.travelDates?.from ? 
                `${formatDate(currentCandidate.travelDates.from)} - ${formatDate(currentCandidate.travelDates.to)}` : 
                'Dates not set'}</p>
            </div>
          </div>

          ${currentCandidate.accommodation ? `
          <div class="detail-item">
            <span class="detail-icon">🏨</span>
            <div>
              <strong>Staying at</strong>
              <p>${currentCandidate.accommodation}</p>
            </div>
          </div>` : ''}

          ${currentCandidate.tripPurpose?.length ? `
          <div class="detail-item">
            <span class="detail-icon">🎯</span>
            <div>
              <strong>Trip Purpose</strong>
              <p>${currentCandidate.tripPurpose.join(' • ')}</p>
            </div>
          </div>` : ''}

          ${currentCandidate.dailyBudget ? `
          <div class="detail-item">
            <span class="detail-icon">💰</span>
            <div>
              <strong>Daily Budget</strong>
              <p>${currentCandidate.dailyBudget}</p>
            </div>
          </div>` : ''}

          ${currentCandidate.languages?.length ? `
          <div class="detail-item">
            <span class="detail-icon">🗣️</span>
            <div>
              <strong>Languages</strong>
              <p>${currentCandidate.languages.join(', ')}</p>
            </div>
          </div>` : ''}
        </div>

        ${currentCandidate.icebreaker ? `
        <div class="icebreaker">
          <strong>💬 Says:</strong>
          <p>"${currentCandidate.icebreaker}"</p>
        </div>` : ''}

        <div class="audio-section">
          <h4>Voice Answers</h4>
          <p class="coming-soon">🎤 Audio feature coming soon!</p>
        </div>

        <div class="action-buttons">
          <button class="pass-btn" data-id="${currentCandidate.id}">✗ Pass</button>
          <button class="like-btn" data-id="${currentCandidate.id}">♥ Like</button>
        </div>
      </div>

      <div class="candidate-counter">
        ${feedCandidates.length - currentCandidateIndex - 1} more travel buddies to discover
      </div>
    </div>
  `;

  document.querySelector('.pass-btn').onclick = () => {
    currentCandidateIndex++;
    if (currentCandidateIndex >= feedCandidates.length) {
      currentCandidateIndex = 0;
      feedCandidates = [];
    }
    renderFeed();
  };

  document.querySelector('.like-btn').onclick = async () => {
    const otherId = currentCandidate.id;
    await startMatch(user.uid, otherId);
    alert(`You liked ${currentCandidate.name}! Check your inbox for matches.`);
    
    currentCandidateIndex++;
    if (currentCandidateIndex >= feedCandidates.length) {
      content.innerHTML = `
        <div class="no-matches">
          <h3>Match made! 🎉</h3>
          <p>Check your inbox to start chatting.</p>
        </div>`;
      feedCandidates = [];
    } else {
      renderFeed();
    }
  };
}

// Inbox
async function renderInbox() {
  const matchesQuery = query(collection(db, "matches"), where("users", "array-contains", user.uid));
  const matchesSnap = await getDocs(matchesQuery);

  if (matchesSnap.empty) {
    content.innerHTML = `<p>No matches yet. Start liking in Discovery!</p>`;
    return;
  }

  const matchPromises = matchesSnap.docs.map(async (matchDoc) => {
    const data = matchDoc.data();
    const otherId = data.users.find(id => id !== user.uid);
    const otherSnap = await getDoc(doc(db, "users", otherId));
    const otherProfile = otherSnap.data();

    if (!otherProfile) {
      return {
        matchId: matchDoc.id,
        name: "Unknown User",
        vibe: "Unknown",
        photoURL: null,
        lastMsg: ""
      };
    }

    const lastMsgSnap = await getDocs(query(collection(db, "matches", matchDoc.id, "messages"), limit(1)));
    const lastMsg = lastMsgSnap.empty ? "" : lastMsgSnap.docs[0].data().text;

    return {
      matchId: matchDoc.id,
      name: otherProfile.name || "Unknown User",
      vibe: otherProfile.vibe?.[0] || "Unknown",
      photoURL: otherProfile.photoURL || null,
      lastMsg
    };
  });

  const matches = await Promise.all(matchPromises);

  content.innerHTML = `
    <div class="inbox">
      <h2>Your Matches</h2>
      <div class="matches-list">
        ${matches.map(m => `
          <div class="match-item" data-matchid="${m.matchId}">
            <div class="match-avatar" style="${m.photoURL ? `background-image: url('${m.photoURL}')` : ''}">
              ${!m.photoURL ? m.name.charAt(0).toUpperCase() : ''}
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

// Profile Settings

async function renderProfileSettings() {
  content.innerHTML = `
    <div class="profile-settings">
      <h2>Complete Your Profile</h2>
      
      <div class="profile-picture-section">
        <div class="profile-avatar" id="profileAvatar" 
             style="${profile.photoURL ? `background-image: url('${profile.photoURL}')` : ''}">
          ${!profile.photoURL && profile.name ? profile.name.charAt(0).toUpperCase() : ''}
        </div>
        <input type="file" id="profilePhoto" accept="image/*" style="display: none;">
        <button id="uploadPhotoBtn" class="change-photo-btn">
          ${profile.photoURL ? 'Change Photo' : 'Upload Photo'}
        </button>
        ${profile.photoURL ? '<button id="removePhotoBtn" class="remove-btn">Remove Photo</button>' : ''}
      </div>

      <div class="setting-group">
        <label>Your Name *</label>
        <input type="text" id="profileName" value="${profile.name || ''}" placeholder="First name">
      </div>

      <div class="setting-group">
        <label>Your Travel Vibe *</label>
        <div class="vibe-options">
          ${['Budget Explorer', 'Luxury Relaxer', 'Culture Seeker', 'Adrenaline Junkie']
            .map(vibe => `
              <label class="vibe-option">
                <input type="radio" name="profileVibe" value="${vibe}" 
                  ${profile.vibe && profile.vibe.includes(vibe) ? 'checked' : ''}>
                ${vibe}
              </label>
            `).join('')}
        </div>
      </div>

      <div class="setting-group">
        <label>Your Dubai Dates *</label>
        <div class="date-inputs">
          <input type="date" id="dateFrom" value="${profile.travelDates?.from || ''}" placeholder="From">
          <span>to</span>
          <input type="date" id="dateTo" value="${profile.travelDates?.to || ''}" placeholder="To">
        </div>
      </div>

      <div class="setting-group">
        <label>Where are you staying?</label>
        <input type="text" id="accommodation" value="${profile.accommodation || ''}" 
               placeholder="Hotel name or area (e.g., Rove Downtown, Marina)">
      </div>

      <div class="setting-group">
        <label>What brings you to Dubai? (pick 1-3)</label>
        <div class="checkbox-options">
          ${['Sightseeing', 'Food & Dining', 'Shopping', 'Adventure', 'Business', 'Relaxation', 'Photography']
            .map(purpose => `
              <label class="checkbox-option">
                <input type="checkbox" value="${purpose}" 
                  ${profile.tripPurpose?.includes(purpose) ? 'checked' : ''}>
                ${purpose}
              </label>
            `).join('')}
        </div>
      </div>

      <div class="setting-group">
        <label>Daily Spending Range (AED)</label>
        <select id="dailyBudget">
          <option value="" ${!profile.dailyBudget ? 'selected' : ''}>Select range</option>
          <option value="Under 200" ${profile.dailyBudget === 'Under 200' ? 'selected' : ''}>Under 200 AED</option>
          <option value="200-500" ${profile.dailyBudget === '200-500' ? 'selected' : ''}>200-500 AED</option>
          <option value="500-1000" ${profile.dailyBudget === '500-1000' ? 'selected' : ''}>500-1000 AED</option>
          <option value="1000+" ${profile.dailyBudget === '1000+' ? 'selected' : ''}>1000+ AED</option>
        </select>
      </div>

      <div class="setting-group">
        <label>Languages you speak</label>
        <div class="checkbox-options">
          ${['English', 'Arabic', 'Hindi/Urdu', 'Russian', 'French', 'Spanish', 'Other']
            .map(lang => `
              <label class="checkbox-option">
                <input type="checkbox" value="${lang}" 
                  ${profile.languages?.includes(lang) ? 'checked' : ''}>
                ${lang}
              </label>
            `).join('')}
        </div>
      </div>

      <div class="setting-group">
        <label>Your Icebreaker *</label>
        <textarea id="icebreaker" placeholder="What makes you a great travel buddy? (e.g., 'I know all the best shawarma spots!')">${profile.icebreaker || ''}</textarea>
        <small>This appears on your profile</small>
      </div>




<!-- Voice Questions Section -->
<div class="setting-group">
  <label>Voice Answers (30 seconds each)</label>
  
  <div id="voiceQuestionsContainer">
    <!-- Question 1 -->
    <div class="voice-question" data-q="1">
      <div class="question-header">
        <strong>🎤 1. What's your favorite travel memory?</strong>
        <span class="question-status" data-status="empty">Not recorded</span>
      </div>
      
      <div class="voice-controls">
        <button class="record-btn" data-action="record">🎤 Record</button>
        <button class="stop-btn" data-action="stop" disabled>⏹️ Stop</button>
        <button class="play-btn" data-action="play" disabled>▶️ Play</button>
        <button class="save-btn" data-action="save" disabled>✅ Save</button>
        <button class="delete-btn" data-action="delete" disabled>🗑️ Delete</button>
        
        <span class="timer">00:30</span>
      </div>
      
      <div class="recording-status">
        <small class="status-text">Press Record to start</small>
        <div class="waveform"></div>
      </div>
    </div>

    <!-- Question 2 -->
    <div class="voice-question" data-q="2">
      <div class="question-header">
        <strong>🎤 2. Why do you want a travel buddy in Dubai?</strong>
        <span class="question-status" data-status="empty">Not recorded</span>
      </div>
      
      <div class="voice-controls">
        <button class="record-btn" data-action="record">🎤 Record</button>
        <button class="stop-btn" data-action="stop" disabled>⏹️ Stop</button>
        <button class="play-btn" data-action="play" disabled>▶️ Play</button>
        <button class="save-btn" data-action="save" disabled>✅ Save</button>
        <button class="delete-btn" data-action="delete" disabled>🗑️ Delete</button>
        
        <span class="timer">00:30</span>
      </div>
      
      <div class="recording-status">
        <small class="status-text">Press Record to start</small>
        <div class="waveform"></div>
      </div>
    </div>

    <!-- Question 3 -->
    <div class="voice-question" data-q="3">
      <div class="question-header">
        <strong>🎤 3. Describe your ideal day in Dubai in 3 sentences</strong>
        <span class="question-status" data-status="empty">Not recorded</span>
      </div>
      
      <div class="voice-controls">
        <button class="record-btn" data-action="record">🎤 Record</button>
        <button class="stop-btn" data-action="stop" disabled>⏹️ Stop</button>
        <button class="play-btn" data-action="play" disabled>▶️ Play</button>
        <button class="save-btn" data-action="save" disabled>✅ Save</button>
        <button class="delete-btn" data-action="delete" disabled>🗑️ Delete</button>
        
        <span class="timer">00:30</span>
      </div>
      
      <div class="recording-status">
        <small class="status-text">Press Record to start</small>
        <div class="waveform"></div>
      </div>
    </div>
  </div>
</div>





      <button id="saveProfile" class="save-btn">Save & Continue</button>

      <button class="startRecord">Start Record</button>
      <button class="stopRecord">Stop Record</button>
      <button class="playRecord">Play Record</button>
    </div>
  `;







  // ==============================================
// 3.1 MAIN EVENT LISTENER (Event Delegation)
// ==============================================
// ONE listener handles ALL buttons for ALL 3 questions
// More efficient than attaching 15 separate listeners
document.getElementById('voiceQuestionsContainer').addEventListener('click', async (e) => {
  // 1. Find which button was clicked
  const button = e.target.closest('button');
  if (!button) return; // Click wasn't on a button
  
  // 2. Find which question this button belongs to
  const questionEl = button.closest('.voice-question');
  const qNumber = parseInt(questionEl.dataset.q); // Convert "1" → 1
  const action = button.dataset.action; // "record", "stop", "play", "save", "delete"
  
  console.log(`Voice action: Q${qNumber} - ${action}`);
  
  // 3. Route to the appropriate handler
  switch (action) {
    case 'record':
      await handleRecord(qNumber);
      break;
    case 'stop':
      await handleStop(qNumber);
      break;
    case 'play':
      await handlePlay(qNumber);
      break;
    case 'save':
      await handleSave(qNumber);
      break;
    case 'delete':
      await handleDelete(qNumber);
      break;
  }
  
  // 4. Update UI to reflect new state
  updateQuestionUI(qNumber);
});








  // Photo handlers
  document.getElementById('uploadPhotoBtn').onclick = () => 
    document.getElementById('profilePhoto').click();

  document.getElementById('profilePhoto').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('profileAvatar').innerHTML = '⏳';
    
    try {
      const storageRef = ref(storage, `profile-pics/${user.uid}`);
      await uploadBytes(storageRef, file);
      const photoURL = await getDownloadURL(storageRef);
      
      document.getElementById('profileAvatar').style.backgroundImage = `url('${photoURL}')`;
      document.getElementById('profileAvatar').innerHTML = '';
      document.getElementById('profileAvatar').dataset.tempPhoto = photoURL;
    } catch (error) {
      alert('Upload failed: ' + error.message);
      document.getElementById('profileAvatar').innerHTML = 
        profile.name ? profile.name.charAt(0).toUpperCase() : '?';
    }
  };

  if (profile.photoURL) {
    document.getElementById('removePhotoBtn').onclick = () => {
      document.getElementById('profileAvatar').style.backgroundImage = '';
      document.getElementById('profileAvatar').innerHTML = 
        profile.name ? profile.name.charAt(0).toUpperCase() : '?';
      document.getElementById('profileAvatar').dataset.tempPhoto = '';
      document.getElementById('removePhotoBtn').remove();
    };
  }

  // Save handler
  document.getElementById('saveProfile').onclick = async () => {
    const newName = document.getElementById('profileName').value.trim();
    const selectedVibe = document.querySelector('input[name="profileVibe"]:checked')?.value;
    const tempPhotoURL = document.getElementById('profileAvatar').dataset.tempPhoto;
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const accommodation = document.getElementById('accommodation').value.trim();
    
    const tripPurpose = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
                            .map(cb => cb.value);
    const languages = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
                          .map(cb => cb.value);
    const dailyBudget = document.getElementById('dailyBudget').value;
    const icebreaker = document.getElementById('icebreaker').value.trim();

    if (!newName || !selectedVibe || !dateFrom || !dateTo || !icebreaker) {
      alert('Please fill all required fields (*)');
      return;
    }

    try {
      const updateData = {
        name: newName,
        vibe: [selectedVibe],
        travelDates: { from: dateFrom, to: dateTo },
        accommodation,
        tripPurpose,
        dailyBudget,
        languages,
        icebreaker,
        updatedAt: new Date()
      };

      if (tempPhotoURL) {
        updateData.photoURL = tempPhotoURL;
      }

      await setDoc(doc(db, "users", user.uid), updateData, { merge: true });

      Object.assign(profile, updateData);
      if (tempPhotoURL) profile.photoURL = tempPhotoURL;

      alert('Profile updated!');
      renderFeed();
      document.getElementById('feedBtn').click();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };




  // ==============================================
// PHASE 5: INITIALIZATION
// ==============================================
// Activates the voice system when profile page loads
// ==============================================

// INSIDE renderProfileSettings() function, AT THE END:

  // ... all your existing profile page code ...
  // ... photo handlers, save button handler, etc ...

  // ==============================================
  // 5.1 INITIALIZE VOICE RECORDER ENGINE
  // ==============================================
  // Create the recorder instance now that we have user data
  voiceRecorder = new VoiceRecorder(user.uid, app);
  console.log("Voice recorder initialized for user:", user.uid);

  // ==============================================
  // 5.2 LOAD SAVED ANSWERS FROM PROFILE
  // ==============================================
  // Check if user has previously saved voice answers
  if (profile.voiceAnswers) {
    console.log("Loading saved voice answers:", profile.voiceAnswers);
    
    // Load each question's saved URL if it exists
    voiceState[1].url = profile.voiceAnswers.q1 || null;
    voiceState[2].url = profile.voiceAnswers.q2 || null;
    voiceState[3].url = profile.voiceAnswers.q3 || null;
  }

  // ==============================================
  // 5.3 INITIALIZE UI FOR ALL QUESTIONS
  // ==============================================
  // Wait a tiny bit for HTML to render, then update all questions
  setTimeout(() => {
    console.log("Initializing UI for questions 1, 2, 3");
    [1, 2, 3].forEach(q => {
      updateQuestionUI(q);
    });
  }, 100); // 100ms delay ensures HTML is ready

  // ==============================================
  // 5.4 CLEANUP ON PAGE EXIT (Optional but good practice)
  // ==============================================
  // Stop any recording if user leaves profile page
  window.addEventListener('beforeunload', () => {
    [1, 2, 3].forEach(q => {
      if (voiceState[q].recording) {
        console.log(`Stopping recording for Q${q} before page change`);
        voiceRecorder.stopRecording(q);
      }
    });
  });

  // ==============================================
  // 5.5 DEBUG LOGGING (Remove in production)
  // ==============================================
  console.log("Voice system fully initialized. State:", voiceState);
} // ← This is the FINAL closing brace of renderProfileSettings()














// ==============================================
// PHASE 2: UI UPDATE FUNCTION
// ==============================================
// Updates ALL buttons/display for ONE question based on its state
// Called after EVERY state change (record, stop, save, delete)
// ==============================================

/**
 * Updates the UI for a specific question based on its voiceState
 * @param {number} qNumber - Question number (1, 2, or 3)
 */
function updateQuestionUI(qNumber) {
  // 1. Get the current state for this question
  const state = voiceState[qNumber];
  
  // 2. Find the HTML element for this question
  const questionEl = document.querySelector(`.voice-question[data-q="${qNumber}"]`);
  if (!questionEl) return; // Safety check
  
  // 3. Get ALL button elements for this question
  const recordBtn = questionEl.querySelector('.record-btn');
  const stopBtn = questionEl.querySelector('.stop-btn');
  const playBtn = questionEl.querySelector('.play-btn');
  const saveBtn = questionEl.querySelector('.save-btn');
  const deleteBtn = questionEl.querySelector('.delete-btn');
  const statusEl = questionEl.querySelector('.question-status');
  const timerEl = questionEl.querySelector('.timer');

  // 4. RESET ALL BUTTONS TO DEFAULT
  recordBtn.disabled = false;
  stopBtn.disabled = true;
  playBtn.disabled = true;
  saveBtn.disabled = true;
  deleteBtn.disabled = true;
  
  // Show all buttons initially (we'll hide some based on state)
  recordBtn.style.display = 'inline-block';
  stopBtn.style.display = 'inline-block';
  playBtn.style.display = 'inline-block';
  saveBtn.style.display = 'inline-block';
  deleteBtn.style.display = 'inline-block';

  // ==============================================
  // STATE 1: RECORDING (microphone is active)
  // ==============================================
  if (state.recording) {
    // UI: Show only STOP button
    recordBtn.style.display = 'none';
    stopBtn.disabled = false; // Enable stop button
    
    // Update status display
    statusEl.textContent = 'Recording...';
    statusEl.dataset.status = 'recording';
    
    return; // Stop here - recording state overrides everything
  }

  // ==============================================
  // STATE 2: HAS DRAFT BLOB (recorded but not saved)
  // ==============================================
  if (state.blob) {
    // UI: Show Record (as "Re-record"), Play, Save, Delete
    recordBtn.textContent = '🔄 Re-record';
    playBtn.disabled = false;  // Enable play
    saveBtn.disabled = false;  // Enable save
    deleteBtn.disabled = false; // Enable delete
    stopBtn.style.display = 'none'; // Hide stop button
    
    // Update status
    statusEl.textContent = 'Draft ready';
    statusEl.dataset.status = 'draft';
  }
  
  // ==============================================
  // STATE 3: HAS SAVED URL (already uploaded to Firebase)
  // ==============================================
  else if (state.url) {
    // UI: Show Record (as "Re-record"), Play saved version, Delete saved
    recordBtn.textContent = '🔄 Re-record';
    playBtn.disabled = false;
    playBtn.textContent = '▶️ Play Saved';
    deleteBtn.disabled = false;
    deleteBtn.textContent = '🗑️ Delete Saved';
    
    // Hide buttons that don't apply to saved state
    stopBtn.style.display = 'none';
    saveBtn.style.display = 'none';
    
    // Update status
    statusEl.textContent = '✅ Saved';
    statusEl.dataset.status = 'saved';
  }
  
  // ==============================================
  // STATE 4: EMPTY (no recording, no saved answer)
  // ==============================================
  else {
    // UI: Show only Record button
    recordBtn.textContent = '🎤 Record';
    stopBtn.style.display = 'none';
    playBtn.style.display = 'none';
    saveBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
    
    // Update status
    statusEl.textContent = 'Not recorded';
    statusEl.dataset.status = 'empty';
  }
  
  // Reset timer display
  if (timerEl) timerEl.textContent = '00:30';
}









// ==============================================
// PHASE 3: EVENT HANDLERS
// ==============================================
// Handles ALL button clicks for voice questions
// Uses event delegation - ONE listener for ALL questions
// ==============================================



// ==============================================
// 3.2 RECORD HANDLER (Starts recording)
// ==============================================
async function handleRecord(qNumber) {
  console.log(`Starting recording for Q${qNumber}`);
  
  // Safety: Stop ANY other recording first (only one at a time)
  for (let q in voiceState) {
    if (voiceState[q].recording && q != qNumber) {
      console.log(`Stopping Q${q} to record Q${qNumber}`);
      await handleStop(parseInt(q));
    }
  }
  
  // Start recording through our audio engine
  const success = await voiceRecorder.startRecording(qNumber);
  
  if (success) {
    // Update state
    voiceState[qNumber].recording = true;
    
    // Start 30-second countdown timer
    startTimer(qNumber, 30, () => {
      console.log(`Timer expired for Q${qNumber}, auto-stopping`);
      handleStop(qNumber);
    });
  } else {
    alert("Could not access microphone. Please check permissions.");
  }
}

// ==============================================
// 3.3 STOP HANDLER (Stops recording, creates blob)
// ==============================================
async function handleStop(qNumber) {
  console.log(`Stopping recording for Q${qNumber}`);
  
  // Stop recording and get audio blob
  const blob = await voiceRecorder.stopRecording(qNumber);
  
  if (blob) {
    // Update state: no longer recording, store the blob
    voiceState[qNumber].recording = false;
    voiceState[qNumber].blob = blob;
    
    // Stop the countdown timer
    stopTimer(qNumber);
    
    console.log(`Q${qNumber} stopped, blob size: ${blob.size} bytes`);
  }
}

// ==============================================
// 3.4 PLAY HANDLER (Plays draft or saved audio)
// ==============================================
async function handlePlay(qNumber) {
  const state = voiceState[qNumber];
  
  if (state.blob) {
    // Play the DRAFT version (local blob, not uploaded yet)
    console.log(`Playing draft for Q${qNumber}`);
    voiceRecorder.playAudio(state.blob);
  } else if (state.url) {
    // Play the SAVED version (from Firebase URL)
    console.log(`Playing saved audio for Q${qNumber}`);
    voiceRecorder.playAudio(state.url);
  } else {
    console.log(`Nothing to play for Q${qNumber}`);
  }
}

// ==============================================
// 3.5 SAVE HANDLER (Uploads to Firebase, saves URL)
// ==============================================
async function handleSave(qNumber) {
  const state = voiceState[qNumber];
  
  // Must have a blob to save
  if (!state.blob) {
    alert("Record something first!");
    return;
  }
  
  console.log(`Saving Q${qNumber} to Firebase...`);
  
  // 1. Upload blob to Firebase Storage
  const url = await voiceRecorder.uploadAnswer(qNumber, state.blob);
  
  if (url) {
    // 2. Save URL to Firestore database
    await setDoc(doc(db, "users", user.uid), {
      [`voiceAnswers.q${qNumber}`]: url, // Dynamic key: q1, q2, or q3
      updatedAt: new Date()
    }, { merge: true }); // merge: true keeps other fields intact
    
    // 3. Update local state
    voiceState[qNumber].url = url;       // Store the permanent URL
    voiceState[qNumber].blob = null;     // Clear the temporary blob
    
    // 4. Update global profile object (for immediate UI updates)
    profile.voiceAnswers = profile.voiceAnswers || {};
    profile.voiceAnswers[`q${qNumber}`] = url;
    
    console.log(`Q${qNumber} saved successfully! URL: ${url.substring(0, 80)}...`);
    alert(`Answer ${qNumber} saved successfully!`);
  } else {
    alert("Failed to save. Please try again.");
  }
}

// ==============================================
// 3.6 DELETE HANDLER (Removes draft or saved answer)
// ==============================================
async function handleDelete(qNumber) {
  const state = voiceState[qNumber];
  const hasSavedAnswer = !!state.url;
  const hasDraft = !!state.blob;
  
  if (!hasSavedAnswer && !hasDraft) {
    console.log(`Nothing to delete for Q${qNumber}`);
    return;
  }
  
  if (confirm(`Delete ${hasSavedAnswer ? 'saved ' : ''}answer ${qNumber}?`)) {
    // If it was saved to Firebase, remove from Firestore
    if (hasSavedAnswer) {
      await setDoc(doc(db, "users", user.uid), {
        [`voiceAnswers.q${qNumber}`]: null, // Set to null to remove field
        updatedAt: new Date()
      }, { merge: true });
      
      // Remove from global profile
      if (profile.voiceAnswers) {
        delete profile.voiceAnswers[`q${qNumber}`];
      }
    }
    
    // RESET STATE COMPLETELY for this question
    voiceState[qNumber] = {
      recording: false,
      blob: null,
      url: null
    };
    
    console.log(`Q${qNumber} deleted successfully`);
  }
}













// ==============================================
// PHASE 4: TIMER FUNCTIONS
// ==============================================
// Manages 30-second countdown timers for each question
// ==============================================

// ==============================================
// 4.1 START TIMER (Starts countdown for a question)
// ==============================================
/**
 * Starts a countdown timer for a specific question
 * @param {number} qNumber - Question number (1, 2, or 3)
 * @param {number} seconds - Starting time in seconds (30)
 * @param {function} onComplete - Called when timer reaches 0
 */
function startTimer(qNumber, seconds, onComplete) {
  // 1. Find the timer display element for this question
  const timerEl = document.querySelector(`.voice-question[data-q="${qNumber}"] .timer`);
  if (!timerEl) return;
  
  // 2. Stop any existing timer for this question
  stopTimer(qNumber);
  
  // 3. Initialize countdown
  let timeLeft = seconds;
  
  // 4. Update display immediately
  const minutes = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  
  // 5. Create interval that updates every second
  voiceTimers[qNumber] = setInterval(() => {
    timeLeft--;
    
    // Update display
    const minutes = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    // Optional: Visual warning when time is low
    if (timeLeft <= 5) {
      timerEl.style.color = '#ff6b6b';
      timerEl.style.fontWeight = 'bold';
    }
    
    // Timer complete - stop and call callback
    if (timeLeft <= 0) {
      stopTimer(qNumber);
      onComplete();
    }
  }, 1000); // Run every 1000ms (1 second)
  
  console.log(`Timer started for Q${qNumber}: ${seconds} seconds`);
}

// ==============================================
// 4.2 STOP TIMER (Stops countdown for a question)
// ==============================================
/**
 * Stops the timer for a specific question
 * @param {number} qNumber - Question number (1, 2, or 3)
 */
function stopTimer(qNumber) {
  // 1. Clear the interval if it exists
  if (voiceTimers[qNumber]) {
    clearInterval(voiceTimers[qNumber]);
    delete voiceTimers[qNumber];
    console.log(`Timer stopped for Q${qNumber}`);
  }
  
  // 2. Reset the timer display
  const timerEl = document.querySelector(`.voice-question[data-q="${qNumber}"] .timer`);
  if (timerEl) {
    timerEl.textContent = '00:30';
    timerEl.style.color = ''; // Reset color
    timerEl.style.fontWeight = ''; // Reset font weight
  }
}

// ==============================================
// 4.3 GET TIME LEFT (Utility function - optional)
// ==============================================
/**
 * Gets remaining time for a question's timer
 * @param {number} qNumber - Question number
 * @returns {number|null} Seconds left, or null if no timer
 */
function getTimeLeft(qNumber) {
  const timerEl = document.querySelector(`.voice-question[data-q="${qNumber}"] .timer`);
  if (!timerEl) return null;
  
  const [minutes, seconds] = timerEl.textContent.split(':').map(Number);
  return (minutes * 60) + seconds;
}













// Chat
function openChat(matchId) {
  currentChatMatchId = matchId;
  document.getElementById('inboxBtn').classList.add('active');
  document.getElementById('feedBtn').classList.remove('active');
  document.getElementById('profileBtn').classList.remove('active');
  renderChat(matchId);
}

async function renderChat(matchId) {
  if(!matchId) return;

  document.getElementById('inboxBtn').classList.add('active');
  document.getElementById('feedBtn').classList.remove('active');
  document.getElementById('profileBtn').classList.remove('active');

  content.innerHTML = `
    <div class="chat">
      <h2 style="padding: 16px; margin: 0; background: white; border-bottom: 1px solid #e0e0e0;">Chat</h2>
      <div id="messages"></div>
      <div class="chat-input">
        <input id="msg" placeholder="Type message">
        <button id="send">Send</button>
      </div>
    </div>
  `;

  setTimeout(() => document.getElementById('msg').focus(), 100);
  
  const messagesDiv = document.getElementById('messages');

  onSnapshot(query(
    collection(db, "matches", matchId, "messages"),
    orderBy("timestamp", "asc")
  ), snap => {
    messagesDiv.innerHTML = snap.docs.map(d => {
      const m = d.data();
      const isMe = m.sender === user.uid;
      return `<div class="${isMe ? 'me' : 'other'}">${m.text}</div>`;
    }).join('');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  document.getElementById('send').onclick = async () => {
    const msg = document.getElementById('msg').value.trim();
    if(msg) {
      await sendMessage(matchId, msg);
      document.getElementById('msg').value = '';
    }
  };
}

// Utility functions
async function startMatch(userId1, userId2) {
  const matchId = `${userId1}_${userId2}`;
  await setDoc(doc(db, "matches", matchId), {
    users: [userId1, userId2],
    status: "active",
    createdAt: new Date()
  });
  console.log("Match created:", matchId);
}

async function sendMessage(matchId, text) {
  const matchDocRef = doc(db, "matches", matchId);
  const messagesCollectionRef = collection(matchDocRef, "messages");
  await addDoc(messagesCollectionRef, {
    text,
    sender: auth.currentUser.uid,
    timestamp: new Date()
  });
  console.log("Message sent to match:", matchId);
}

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

// Make global
window.startMatch = startMatch;
window.sendMessage = sendMessage;
window.listenToChat = listenToChat;



// Your existing event listener - UPDATED:
document.addEventListener('click', async (event) => {
    
    if (event.target.closest('.startRecord')) {
        event.preventDefault();
        
        // FIX: Pass user.uid to constructor
        recorder = new VoiceRecorder(user.uid); // ← ADD user.uid
        const started = await recorder.start();
        console.log(started ? "Recording ..." : "Failed");
    } 
    
    else if (event.target.closest('.stopRecord')) {
        event.preventDefault(); 
        
        if (recorder) {
            // FIX: Store blob in currentBlob variable
            currentBlob = await recorder.stop(); // ← STORE blob
            const url = await recorder.upload(currentBlob, 1); // q1
            console.log("Audio URL:", url);
            // Don't set recorder = null if you want to play later
        }
    }
    
    else if (event.target.closest('.playRecord')) {
      event.preventDefault(); 

      // FIX: Check currentBlob exists
      if (currentBlob && recorder) { // ← recorder still exists
            recorder.play(currentBlob);
      } else {
            console.log("No audio to play. Record first!");
      }
    }
});




