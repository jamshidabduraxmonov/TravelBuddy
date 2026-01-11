import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { collection, query, where, getDocs, limit, orderBy, doc, setDoc, addDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

import { db, user, profile, storage, app} from './app.js';
import {sendMessage, listenToChat} from './chat.js';
import { handleRecord, handlePlay, handleStop, handleSave, handleDelete, initVoiceSystem } from './voiceSystem.js';
import { renderFeed } from './feed.js';





// Profile Settings

async function renderProfileSettings() {
  
  content.innerHTML = `
  <div class="profile-settings">
    <h2>Complete Your Profile</h2>
    
    <div class="profile-picture-section">
      <div class="profile-avatar" id="profileAvatar" 
          style="${profile.photoURL ? `background-image: url('${profile.photoURL}'); width: 280px; height: 420px; border-radius: 16px;` : 'width: 280px; height: 420px; border-radius: 16px;'}">
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

    <!-- Voice Questions Section - fully kept -->
    <div class="setting-group">
      <label>Voice Answers (30 seconds each)</label>
      
      <div id="voiceQuestionsContainer">
        <!-- Question 1 -->
        <div class="voice-question" data-q="1">
          <div class="question-header">
            <strong>🎤 1. What's something simple you enjoy more than people expect?</strong>
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
            <strong>🎤 2. What feels different to you when you are in a new place?</strong>
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
            <strong>🎤 3. Tell us about a small moment you enjoyed recently.</strong>
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




    <div class="setting-group">
      <label>🎯 Current Intention</label>
      <div class="intention-options" style="display:grid; gap:12px;">
        ${['Coffee & conversation', 'Walk & talk', 'Food', 'Exploring', 'Open / spontaneous']
          .map(opt => `
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="radio" name="currentIntention" value="${opt}" 
                ${profile.currentIntention === opt ? 'checked' : ''}>
              ${opt}
            </label>
          `).join('')}
      </div>
    </div>




    <div class="setting-group">
      <label>⏰ Availability (optional)</label>
      <div class="availability-options" style="display:grid; gap:12px;">
        ${['Today', 'Tomorrow']
          .map(opt => `
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="radio" name="availability" value="${opt}" 
                ${profile.availability === opt ? 'checked' : ''}>
              ${opt}
            </label>
          `).join('')}
      </div>
    </div>


    <button id="saveProfile" class="save-btn">Save & Continue</button>
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
      
      // Directly update local profile
      profile.photoURL = photoURL;
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
      document.getElementById('removePhotoBtn').remove();
    };
  }

  

    // Save handler
  document.getElementById('saveProfile').onclick = async () => {
    const newName = document.getElementById('profileName').value.trim();
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const accommodation = document.getElementById('accommodation').value.trim();
    
    const currentIntention = document.querySelector('input[name="currentIntention"]:checked')?.value;
    const availability = document.querySelector('input[name="availability"]:checked')?.value;

    if (!newName || !dateFrom || !dateTo) {
      alert('Please fill all required fields (*)');
      return;
    }

    try {
      const updateData = {
        name: newName,
        travelDates: { from: dateFrom, to: dateTo },
        accommodation,
        currentIntention,
        availability,
        updatedAt: new Date()
      };

      if (profile.photoURL) {
        updateData.photoURL = profile.photoURL;
      }

      await setDoc(doc(db, "users", user.uid), updateData, { merge: true });

      Object.assign(profile, updateData);

      alert('Profile updated!');
      renderFeed();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };







initVoiceSystem({ user, profile, db, app });
















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












// Make global
window.startMatch = startMatch;
window.sendMessage = sendMessage;
window.listenToChat = listenToChat;



// Your existing event listener - UPDATED:


}




// EXPORTS
export { renderProfileSettings };
