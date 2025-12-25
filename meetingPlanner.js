
// THE 1ST MF /////////////////////////////////////////

// meetingPlanner.js
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from './app.js';

const PLACES = [
  "Dubai Mall Fountain",
  "JBR Beach",
  "La Mer",
  "Boxpark",
  "Al Seef",
  "Dubai Marina Walk"
];
const TIMES = ["6 PM", "7 PM", "8 PM", "9 PM"];

export async function createMeetingPlan(matchId) {
  const plan = {
    place: PLACES[Math.floor(Math.random() * PLACES.length)],
    day: Math.random() > 0.5 ? "Today" : "Tomorrow",
    time: TIMES[Math.floor(Math.random() * TIMES.length)],
    confirmed: false
  };

  await setDoc(doc(db, "matches", matchId), { meeting: plan }, { merge: true });
}


// THE 1ST MF /////////////////////////////////////////////////////
