import { doc, onSnapshot, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db, auth, user } from './app.js';
import { sendMessage } from './chat.js';
import { getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"; // Ensure getDoc is in your imports

let meetingListener = null;

export function initMeetingPlanner(matchId, container) {
  if (meetingListener) meetingListener(); 

  const meetingRef = doc(db, "matches", matchId, "meeting", "details");

  meetingListener = onSnapshot(meetingRef, (snap) => {
    if (!snap.exists()) {
      setupInitialMeeting(matchId);
    } else {
      renderPlannerUI(matchId, snap.data(), container);
    }
  });
}

async function setupInitialMeeting(matchId) {
  const meetingRef = doc(db, "matches", matchId, "meeting", "details");
  await setDoc(meetingRef, {
    date: "Tomorrow",
    time: "6pm",
    address: "Dubai Mall",
    status: "pending",
    acceptedBy: []
  });
}

function renderPlannerUI(matchId, data, container) {
  const isAccepted = data.status === "accepted";
  const myUid = auth.currentUser.uid;
  const hasIAccepted = data.acceptedBy && data.acceptedBy.includes(myUid);
  
  // Get preference and options
  const lastState = localStorage.getItem('plannerExpanded') || 'open';
  const stateClass = lastState === 'open' ? 'planner-open' : 'planner-minimized';
  const { dates, times } = getPlannerOptions();

  container.innerHTML = `
    <div id="planner-wrapper" class="${stateClass}">
      <div class="planner-header" onclick="togglePlanner()">
        <span>${isAccepted ? '✅ Meeting Confirmed' : '📅 You have a meetup!'}</span>
        <span style="transform: ${lastState === 'open' ? 'rotate(180deg)' : 'rotate(0deg)'}; transition: 0.3s;">⌄</span>
      </div>
      
      <div class="planner-content">
        <div class="planner-row">
          <select id="dateBtn" ${isAccepted ? 'disabled' : ''}>
            ${dates.map(d => `<option value="${d}" ${d === data.date ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
          at 
          <select id="timeBtn" ${isAccepted ? 'disabled' : ''}>
            ${times.map(t => `<option value="${t}" ${t === data.time ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
          in 
          <button class="loc-btn" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.address)}')">
            ${data.address}
          </button>
        </div>

        <div class="planner-actions">
          ${!isAccepted ? `
            <button id="acceptBtn" ${hasIAccepted ? 'disabled' : ''} class="${hasIAccepted ? 'waiting' : 'confirm'}">
              ${hasIAccepted ? 'Waiting...' : 'Accept'}
            </button>
            <button id="suggestBtn" class="suggest">Suggest</button>
          ` : `<p style="color: #28a745; font-weight: bold; margin-top: 10px;">Meeting is set for ${data.date} at ${data.time}!</p>`}
        </div>
      </div>
    </div>
  `;

  // Apply the safety fix here
  if (!isAccepted) {
    const sBtn = document.getElementById('suggestBtn');
    const aBtn = document.getElementById('acceptBtn');
    if(sBtn) sBtn.onclick = () => handleSuggest(matchId);
    if(aBtn) aBtn.onclick = () => handleAccept(matchId, data);
  }
}

async function handleSuggest(matchId) {
  const newDate = document.getElementById('dateBtn').value;
  const newTime = document.getElementById('timeBtn').value;
  
  // 1. Fetch the real name from Firestore 'users' collection
  const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
  const userData = userDoc.data();
  
  // 2. Use the name field from your DB (adjust 'name' if your field is called 'displayName' or 'firstName')
  const name = userData?.name || userData?.displayName || "Someone"; 

  const meetingRef = doc(db, "matches", matchId, "meeting", "details");
  await updateDoc(meetingRef, {
    date: newDate,
    time: newTime,
    acceptedBy: [], 
    status: "pending"
  });

  await sendMessage(matchId, `📌 ${name} proposed a new time: ${newDate} at ${newTime}`);
}



async function handleAccept(matchId, data) {
  const myUid = auth.currentUser.uid;
  
  // 1. Fetch name from Firestore
  const userDoc = await getDoc(doc(db, "users", myUid));
  const userData = userDoc.data();
  const name = userData?.name || userData?.displayName || "Someone";

  const meetingRef = doc(db, "matches", matchId, "meeting", "details");
  let newAcceptedBy = data.acceptedBy || [];
  
  if (!newAcceptedBy.includes(myUid)) {
    newAcceptedBy.push(myUid);
  }

  const isNowConfirmed = newAcceptedBy.length >= 2;
  
  // 2. LOG THE FIRST ACCEPTANCE
  // If only 1 person has accepted, it means this user just clicked it first
  if (newAcceptedBy.length === 1) {
    await sendMessage(matchId, `👍 ${name} accepted the meeting details.`);
  }

  // 3. Update the database
  await updateDoc(meetingRef, {
    acceptedBy: newAcceptedBy,
    status: isNowConfirmed ? "accepted" : "pending"
  });

  // 4. LOG THE FINAL CONFIRMATION
  if (isNowConfirmed) {
    await sendMessage(matchId, `✅ Meeting officially confirmed by ${name}!`);
  }
}

// Global toggle for the UI
window.togglePlanner = () => {
  const el = document.getElementById('planner-wrapper');
  
  if (el.classList.contains('planner-minimized')) {
    // Opening it
    el.classList.remove('planner-minimized');
    el.classList.add('planner-open');
    localStorage.setItem('plannerExpanded', 'open');
  } else {
    // Closing it
    el.classList.remove('planner-open');
    el.classList.add('planner-minimized');
    localStorage.setItem('plannerExpanded', 'closed');
  }
};







function getPlannerOptions() {
  const dates = [];
  const times = [];
  
  // Generate next 7 days
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    dates.push(label);
  }

  // Generate hours (8am to 10pm)
  for (let h = 8; h <= 22; h++) {
    const suffix = h >= 12 ? "PM" : "AM";
    const displayHour = h > 12 ? h - 12 : h;
    times.push(`${displayHour}:00 ${suffix}`);
    times.push(`${displayHour}:30 ${suffix}`);
  }

  return { dates, times };
}
