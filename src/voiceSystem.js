// voiceSystem.js
// Handles voice recording, state, timers, and UI updates



// IMPORTS ////////////////////////////////


import { doc, setDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { VoiceRecorder } from "./audio.js";
import { db, user } from './app.js'

import { FieldValue } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";


let currentUser = null;
let currentProfile = null;
let currentDb = null;
let firebaseApp = null;



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

  updateQuestionUI(qNumber);
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

    updateQuestionUI(qNumber);
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

  updateQuestionUI(qNumber);
}

// ==============================================
// 3.5 SAVE HANDLER (Uploads to Firebase, saves URL)
// ==============================================
  
async function handleSave(qNumber) {
  const state = voiceState[qNumber];
  
  if (!state.blob) {
    alert("No recording to save!");
    return;
  }

  // 1. Upload blob to Firebase Storage
  const downloadURL = await voiceRecorder.uploadAnswer(qNumber, state.blob);
  if (!downloadURL) {
    alert("Failed to save voice answer. Check internet and try again!");
    return;
  }

  // 2. Save nested voiceAnswers object correctly (🔥 FIX HERE)
  await setDoc(
    doc(currentDb, "users", currentUser.uid),
    {
      voiceAnswers: {
        [`q${qNumber}`]: downloadURL
      }
    },
    { merge: true }
  );

  // 3. Update local state
  state.url = downloadURL;
  state.blob = null;


  // 4. Update UI
  

  alert("Answer saved!");

  updateQuestionUI(qNumber);
  
}


// ==============================================
// 3.6 DELETE HANDLER (Removes draft or saved answer)
// ==============================================
async function handleDelete(qNumber) {
  const state = voiceState[qNumber];
  const hasSavedAnswer = !!state.url;
  const hasDraft = !!state.blob;

  if (!hasSavedAnswer && !hasDraft) return;

  if (confirm(`Delete answer ${qNumber}?`)) {
    
    if (hasSavedAnswer) {
      await setDoc(doc(db, "users", user.uid), {
        voiceAnswers: {
          [`q${qNumber}`]: deleteField()
        }
      }, { merge: true });

      if (currentProfile.voiceAnswers) {
        delete currentProfile.voiceAnswers[`q${qNumber}`];
      }
    }

    // Full reset
    voiceState[qNumber] = { recording: false, blob: null, url: null };

    updateQuestionUI(qNumber);
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
















// INITIALIZATION //////////////////////////////////////////

function initVoiceSystem({ user, profile, db, app }) {
  currentUser = user;
  currentProfile = profile;
  currentDb = db;
  firebaseApp = app;

  voiceRecorder = new VoiceRecorder(user.uid, app);

  if (!currentProfile.voiceAnswers) currentProfile.voiceAnswers = {};

  voiceState[1].url = currentProfile.voiceAnswers.q1 || null;
  voiceState[2].url = currentProfile.voiceAnswers.q2 || null;
  voiceState[3].url = currentProfile.voiceAnswers.q3 || null;

  setTimeout(() => {
    [1, 2, 3].forEach(updateQuestionUI);
  }, 100);

  console.log("Loaded profile.voiceAnswers:", currentProfile.voiceAnswers);
  console.log("Is currentProfile === profile?", currentProfile === profile);
}






window.addEventListener('beforeunload', () => {
  Object.keys(voiceState).forEach(q => {
    if (voiceState[q].recording && voiceRecorder) {
      voiceRecorder.stopRecording(Number(q));
    }
  });
});




export {
  handleRecord,
  handleStop,
  handlePlay,
  handleSave,
  handleDelete,
  initVoiceSystem
}


window.voiceRecorder = voiceRecorder;