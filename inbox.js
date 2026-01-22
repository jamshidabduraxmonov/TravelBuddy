// Inbox full script

// IMPORTS
import { collection, query, where, getDocs, limit, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { matchesCache, user } from './app.js';
import { openChat } from './chat.js';



async function renderInbox() {
  const content = document.getElementById('content');

  if (!user) {
    content.innerHTML = `<p style="text-align:center; padding:40px;">Sign in to see your matches and messages</p>`;
    return;
  }

  if (matchesCache.length === 0) {
    content.innerHTML = `<p>No matches yet. Start liking in Discovery!</p>`;
    return;
  }

  content.innerHTML = `
    <div class="inbox">
      <h2>Your Matches</h2>
      <div class="matches-list">
        ${matchesCache.map(m => `
          <div class="match-item" data-matchid="${m.matchId}">
            <div class="match-avatar" style="${m.otherProfile.photoURL ? `background-image: url('${m.otherProfile.photoURL}')` : ''}">
              ${!m.otherProfile.photoURL ? m.otherProfile.name?.charAt(0).toUpperCase() : ''}
            </div>
            <div class="match-content">
              <strong>${m.otherProfile.name || "Unknown User"}</strong><br>
              <small>Last message: ... (skip or add later)</small>
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



// EXPORTS
export {
    renderInbox
}