// feed.js - feed page logic
import { collection, query, where, getDocs, limit, orderBy, doc, setDoc, addDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { openChat } from './chat.js';
import { db, auth, user, profile, allUsersCache } from './app.js';

let feedCandidates = [];
let currentCandidateIndex = 0;
let lastVibe = null;

const meetCache = new Map();

async function getMeetStatus(candidateId) {
    if (meetCache.has(candidateId)) return meetCache.get(candidateId);

    const [matchSnap, mySnap, theirSnap] = await Promise.all([
        user ? getDoc(doc(db, "matches", [user.uid, candidateId].sort().join('_'))) : Promise.resolve({ exists: () => false }),
        user ? getDoc(doc(db, "meetRequests", `${user.uid}_${candidateId}`)) : Promise.resolve({ exists: () => false }),
        user ? getDoc(doc(db, "meetRequests", `${candidateId}_${user.uid}`)) : Promise.resolve({ exists: () => false })
    ]);

    const status = {
        matched: matchSnap.exists(),
        myPending: mySnap.exists() && mySnap.data().status === "pending",
        theirPending: theirSnap.exists() && theirSnap.data().status === "pending"
    };

    meetCache.set(candidateId, status);
    return status;
}

async function renderFeed() {
    const content = document.getElementById('content');

    const formatDate = (dateStr) => {
      if (!dateStr) return 'Not specified';
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    if (!content || !allUsersCache || !profile) return;

    content.innerHTML = `<div class="loading" style="text-align:center; padding:100px 20px;">
      <div style="font-size:48px; animation: spin 1.5s linear infinite;">⏳</div>
      <p style="margin-top:16px; font-size:18px;">Loading buddies...</p>
    </div>

    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>`;

    // For meeting request:

    const incomingSnap = await getDocs(query(
  collection(db, "meetRequests"),
  where("recipientId", "==", user ? user.uid : ""),
  where("status", "==", "pending")
));

if (!incomingSnap.empty) {
  const req = incomingSnap.docs[0].data();
  const requesterId = req.requesterId;
  




let requester = allUsersCache.find(u => u.id === requesterId) || { name: 'Loading...', photoURL: '' };

// Fetch fresh if not in cache
if (!requester.name || requester.name === 'Loading...') {
  const snap = await getDoc(doc(db, "users", requesterId));
  if (snap.exists()) {
    requester = { id: requesterId, ...snap.data() };
  } else {
    requester = { name: 'Unknown User', photoURL: '' };
  }
}


  content.innerHTML = `
    <div style="margin:20px;padding:20px;background:#fff;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.1);text-align:center;">
      <h3>${requester.name || 'Someone'} wants to meet you as a buddy</h3>
      <div style="margin:20px 0;">
        <button id="accept-req" style="background:#00c853;color:white;padding:12px 24px;border:none;border-radius:30px;margin:0 10px;">Accept</button>
        <button id="decline-req" style="background:#ff5252;color:white;padding:12px 24px;border:none;border-radius:30px;margin:0 10px;">Decline</button>
      </div>
    </div>
    <div id="profile-below"></div>
  `;

  // Render requester's profile below
  document.getElementById('profile-below').innerHTML = `
    <div class="discovery-single">
      <div class="profile-card">
        <div class="feed-profile-pic" style="width:280px;height:420px;border-radius:16px;background-size:cover;background-position:center;${requester.photoURL ? `background-image: url('${requester.photoURL}')` : ''}">
          ${!requester.photoURL ? requester.name?.charAt(0).toUpperCase() || '?' : ''}
        </div>
        
        <div class="profile-header">
          <h2>${requester.name || 'Traveler'}</h2>
        </div>

        <div class="details-section">
          <div class="detail-item">
            <span class="detail-icon">📅</span>
            <div>
              <strong>Dubai Dates</strong>
              <p>${requester.travelDates?.from ? 
                `${formatDate(requester.travelDates.from)} - ${formatDate(requester.travelDates.to)}` : 
                'Dates not set'}</p>
            </div>
          </div>
          ${requester.accommodation ? `
          <div class="detail-item">
            <span class="detail-icon">🏨</span>
            <div>
              <strong>Staying at</strong>
              <p>${requester.accommodation}</p>
            </div>
          </div>` : ''}
          ${requester.currentIntention ? `
          <div class="detail-item">
            <span class="detail-icon">🎯</span>
            <div>
              <strong>Up for</strong>
              <p>${requester.currentIntention}</p>
            </div>
          </div>` : ''}
          ${requester.availability ? `
          <div class="detail-item">
            <span class="detail-icon">⏰</span>
            <div>
              <strong>Available</strong>
              <p>${requester.availability}</p>
            </div>
          </div>` : ''}
        </div>

        <div class="audio-section">
          ${[1,2,3].map(q => {
            const url = requester.voiceAnswers?.[`q${q}`];
            const questions = [
              "What's something simple you enjoy more than people expect?",
              "What feels different to you when you are in a new place?",
              "Tell us about a small moment you enjoyed recently."
            ];
            return `
              <div class="voice-answer-feed">
                <div class="question-label">Q${q}: ${questions[q-1]}</div>
                ${url ? `<audio controls src="${url}" preload="none"></audio>` : '<small>Not recorded</small>'}
              </div>
            `;
          }).join('')}
        </div>

        <!-- Accept/Decline buttons stay here -->
      </div>
    </div>
  `;



  // Button actions
  document.getElementById('accept-req').onclick = async () => {
  if (!user) return;
  const matchId = [user.uid, requesterId].sort().join('_');
  await setDoc(doc(db, "matches", matchId), { users: [user.uid, requesterId], createdAt: new Date() });
  await setDoc(doc(db, "meetRequests", `${requesterId}_${user.uid}`), { status: "accepted" }, { merge: true });
  openChat(matchId);
};

  document.getElementById('decline-req').onclick = async () => {
  if (!user) return;
  await setDoc(doc(db, "meetRequests", `${requesterId}_${user.uid}`), { status: "declined" }, { merge: true });
  renderFeed();  // refreshes and removes card
};

  return;
}

// For meeting request  /////////////////////////////////////

    // 1. Manage Feed Generation
    const myVibe = profile.vibe || [];
    const currentVibeKey = myVibe[0] || 'none';

    if (feedCandidates.length === 0 || lastVibe !== currentVibeKey) {
        feedCandidates = allUsersCache.filter(u =>
            // u.vibe?.some(v => myVibe.includes(v))
            // → replace with: true  (show everyone)
        feedCandidates = allUsersCache.filter(u => u.id !== user?.uid),
        console.log('Current user UID:', user?.uid),
        console.log('Filtered out self?', feedCandidates.some(u => u.id === user?.uid))
        );

        // Shuffle
        for (let i = feedCandidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [feedCandidates[i], feedCandidates[j]] = [feedCandidates[j], feedCandidates[i]];
        }

        currentCandidateIndex = 0;
        lastVibe = currentVibeKey;
    }

if (currentCandidateIndex >= feedCandidates.length) {
    currentCandidateIndex = 0;  // cycle back to start
}

    const currentCandidate = feedCandidates[currentCandidateIndex];
    const status = await getMeetStatus(currentCandidate.id);

    // 3. UI State for Buttons
    let buttonText = "⚡ Let’s meet!";
    let buttonDisabled = false;
    let buttonStyle = "";

    if (status.matched) {
        buttonText = "Already connected";
        buttonDisabled = true;
        buttonStyle = "background:#ccc;color:#999;cursor:not-allowed;";
    } else if (status.myPending) {
        buttonText = "Pending...";
        buttonDisabled = true;
        buttonStyle = "background:#ff9800;color:white;cursor:not-allowed;";
    } else if (status.theirPending) {
        buttonText = "They want to meet!";
        buttonStyle = "background:#667eea;color:white;";
    }

 

    // 4. Render Card
      content.innerHTML = `
  <div class="discovery-single">
    <div class="profile-card">
      <div class="feed-profile-pic" style="width:280px;height:420px;border-radius:16px;background-size:cover;background-position:center;${currentCandidate.photoURL ? `background-image:url('${currentCandidate.photoURL}')` : ''}">
        ${!currentCandidate.photoURL ? currentCandidate.name?.charAt(0).toUpperCase() || '?' : ''}
      </div>
      
      <div class="profile-header">
        <h2>${currentCandidate.name || 'Traveler'}</h2>
      </div>

      <div class="details-section">
        ${currentCandidate.accommodation ? `
        <div class="detail-item">
          <span class="detail-icon">🏨</span>
          <div>
            <strong>Staying at</strong>
            <p>${currentCandidate.accommodation}</p>
          </div>
        </div>` : ''}
        ${currentCandidate.currentIntention ? `
        <div class="detail-item">
          <span class="detail-icon">🎯</span>
          <div>
            <strong>Up for</strong>
            <p>${currentCandidate.currentIntention}</p>
          </div>
        </div>` : ''}
        ${currentCandidate.availability ? `
        <div class="detail-item">
          <span class="detail-icon">⏰</span>
          <div>
            <strong>Available</strong>
            <p>${currentCandidate.availability === 'Other date' && currentCandidate.availabilityDate 
              ? formatDate(currentCandidate.availabilityDate) 
              : currentCandidate.availability || 'Not set'}</p>
          </div>
        </div>` : ''}
      </div>

      <div class="audio-section">
        ${[1,2,3].map(q => {
          const url = currentCandidate.voiceAnswers?.[`q${q}`];
          const questions = [
            "What's something simple you enjoy more than people expect?",
            "What feels different to you when you are in a new place?",
            "Tell us about a small moment you enjoyed recently."
          ];
          return `
            <div class="voice-answer-feed">
              <div class="question-label">Q${q}: ${questions[q-1]}</div>
              ${url ? `<audio controls src="${url}" preload="none"></audio>` : '<small>Not recorded</small>'}
            </div>
          `;
        }).join('')}
      </div>

      <div class="action-buttons">
        <button class="pass-btn">✗ Pass</button>
        <button class="like-btn" 
          ${buttonDisabled || currentCandidate.id === user?.uid ? 'disabled' : ''} 
          style="${buttonDisabled || currentCandidate.id === user?.uid 
            ? 'background:#ccc;color:#999;cursor:not-allowed;opacity:0.6;' 
            : buttonStyle}">
          ${currentCandidate.id === user?.uid ? 'Your profile' : buttonText}
        </button>
      </div>
    </div>
    <div class="candidate-counter">${feedCandidates.length - currentCandidateIndex - 1} more buddies left</div>
  </div>`;

    // 5. Event Listeners
    content.querySelector('.pass-btn').onclick = () => {
        currentCandidateIndex++;
        renderFeed();
    };

    content.querySelector('.like-btn')?.addEventListener('click', async () => {      
      
      if (!user) {
        alert("Please sign in to send meetup requests");
        document.getElementById('profileBtn').click();
        return;
      } 

    if (confirm("Send meet request?")) {
      const recipientId = currentCandidate.id;
      const requestId = `${user.uid}_${recipientId}`;
// (already protected by if (!user) above)

      await setDoc(doc(db, "meetRequests", requestId), {
        requesterId: user.uid,
        recipientId,
        status: "pending",
        requesterName: profile.name,
        createdAt: new Date()
      });

      meetCache.delete(recipientId); // Note: If you increment index, you won't see the "Pending" button anyway because you move to the next person.

      
      renderFeed();  // moves to next + refreshes button to Pending
    }
    });

  }

// Helper Functions
async function sendMeetRequest(recipientId) {
    if (!user) return;

    const requestId = `${user.uid}_${recipientId}`;
    await setDoc(doc(db, "meetRequests", requestId), {
        requesterId: user.uid,
        recipientId: recipientId,
        status: "pending",
        createdAt: new Date(),
        requesterName: profile.name
    });
}

async function acceptMeetRequest(requestId, requesterId) {
  if (!user) return;

  await setDoc(doc(db, "meetRequests", requestId), { status: "accepted" }, { merge: true });
    const matchId = [user.uid, requesterId].sort().join('_');
    await setDoc(doc(db, "matches", matchId), {
        users: [user.uid, requesterId],
        createdAt: new Date()
    }, { merge: true });
}

export { renderFeed };
