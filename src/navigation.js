import { renderFeed } from './feed.js';
import { renderInbox } from './inbox.js';
import { renderProfileSettings } from './profile.js';


export function initNavigation() {
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
}