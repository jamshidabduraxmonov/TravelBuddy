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
    const selectedVibe = document.querySelector('input[name="profileVibe"]:checked')?.value;
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const accommodation = document.getElementById('accommodation').value.trim();
    
    const tripPurpose = Array.from(document.querySelectorAll('.checkbox-option input[type="checkbox"]:checked'))
                            .map(cb => cb.value);
    const languages = Array.from(document.querySelectorAll('.checkbox-option input[type="checkbox"]:checked'))
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

      // Photo already uploaded directly to Storage and URL set in avatar
      // If user uploaded new photo, it's already in profile.photoURL (from upload handler)
      if (profile.photoURL) {
        updateData.photoURL = profile.photoURL;
      }

      await setDoc(doc(db, "users", user.uid), updateData, { merge: true });

      // Update local profile
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
