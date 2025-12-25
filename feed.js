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
        getDoc(doc(db, "matches", [user.uid, candidateId].sort().join('_'))),
        getDoc(doc(db, "meetRequests", `${user.uid}_${candidateId}`)),
        getDoc(doc(db, "meetRequests", `${candidateId}_${user.uid}`))
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
    if (!content || !allUsersCache || !profile) return;

    content.innerHTML = `<div class="loading">Finding travel buddies...</div>`;

    // 1. Manage Feed Generation
    const myVibe = profile.vibe || [];
    const currentVibeKey = myVibe[0] || 'none';

    if (feedCandidates.length === 0 || lastVibe !== currentVibeKey) {
        feedCandidates = allUsersCache.filter(u =>
            u.vibe?.some(v => myVibe.includes(v))
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

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Not specified';
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // 4. Render Card
    content.innerHTML = `
    <div class="discovery-single">
      <div class="profile-card">
        <div class="feed-profile-pic" style="${currentCandidate.photoURL ? `background-image: url('${currentCandidate.photoURL}')` : ''}">
          ${!currentCandidate.photoURL ? (currentCandidate.name?.charAt(0).toUpperCase() || '?') : ''}
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
              <p>${currentCandidate.travelDates?.from ? `${formatDate(currentCandidate.travelDates.from)} - ${formatDate(currentCandidate.travelDates.to)}` : 'Dates not set'}</p>
            </div>
          </div>
          ${currentCandidate.accommodation ? `<div class="detail-item"><span class="detail-icon">🏨</span><p>${currentCandidate.accommodation}</p></div>` : ''}
        </div>

        <div class="audio-section">
          ${[1, 2, 3].map(q => {
            const url = currentCandidate.voiceAnswers?.[`q${q}`];
            return url ? `<div class="voice-answer-feed"><audio controls src="${url}" preload="none"></audio></div>` : '';
          }).join('')}
        </div>

        <div class="action-buttons">
          <button class="pass-btn">✗ Pass</button>
          <button class="like-btn" ${buttonDisabled ? 'disabled' : ''} style="${buttonStyle}">
            ${buttonText}
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

    content.querySelector('.like-btn').onclick = async () => {
        if (status.theirPending) {
            const requestId = `${currentCandidate.id}_${user.uid}`;
            await acceptMeetRequest(requestId, currentCandidate.id);
            openChat([user.uid, currentCandidate.id].sort().join('_'));
        } else {
            await sendMeetRequest(currentCandidate.id);
            meetCache.delete(currentCandidate.id); // Clear cache to refresh UI
            renderFeed();
        }
    };
}

// Helper Functions
async function sendMeetRequest(recipientId) {
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
    await setDoc(doc(db, "meetRequests", requestId), { status: "accepted" }, { merge: true });
    const matchId = [user.uid, requesterId].sort().join('_');
    await setDoc(doc(db, "matches", matchId), {
        users: [user.uid, requesterId],
        createdAt: new Date()
    }, { merge: true });
}

export { renderFeed };
