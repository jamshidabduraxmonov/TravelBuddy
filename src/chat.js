// IMPORTS
import { collection, query, orderBy, onSnapshot, addDoc, doc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db, auth, user } from './app.js';


// Globals
let currentChatMatchId = null;




// Open Chat
function openChat(matchId) {
  currentChatMatchId = matchId;
  document.getElementById('inboxBtn').classList.add('active');
  document.getElementById('feedBtn').classList.remove('active');
  document.getElementById('profileBtn').classList.remove('active');
  renderChat(matchId);
}


// Render Chat
async function renderChat(matchId) {
  if(!matchId) return;

  document.getElementById('inboxBtn').classList.add('active');
  document.getElementById('feedBtn').classList.remove('active');
  document.getElementById('profileBtn').classList.remove('active');

  content.innerHTML = `
    <div class="chat" style="display: flex; position:fixed; flex-direction: column; height: 90vh; overflow: hidden;">
      <h2 style="padding: 16px; margin: 0; background: white; border-bottom: 1px solid #e0e0e0; flex-shrink: 0;">Chat</h2>
      
      <div id="meeting-planner-container" style="flex-shrink: 0;"></div>

      <div id="messages" style="flex-grow: 1; overflow-y: auto; background: #f9f9f9;"></div>
      
      <div class="chat-input" style="flex-shrink: 0;">
        <input id="msg" placeholder="Type message">
        <button id="send">Send</button>
      </div>
    </div>
  `;

  // Initialize the Meeting Planner
  // We import it dynamically to ensure the container exists first
  const { initMeetingPlanner } = await import('./meetingPlanner.js');
  initMeetingPlanner(matchId, document.getElementById('meeting-planner-container'));
  
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



// EXPORTS
export { openChat, renderChat, sendMessage, listenToChat, currentChatMatchId };
