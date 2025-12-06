// audio.js - MINIMAL recording engine
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

// Get storage instance (add after class definition)
const storage = getStorage(); // Uses default app

class VoiceRecorder {
  constructor(userId) { // ← ADD userId parameter
    this.mediaRecorder = null;
    this.chunks = [];
    this.userId = userId; // ← STORE userId
    this.currentAudio = null; // ← ADD for playback
  }

  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.chunks = [];
      
      this.mediaRecorder.ondataavailable = e => {
        this.chunks.push(e.data);
      };
      
      this.mediaRecorder.start();
      return true;
    } catch {
      return false;
    }
  }

  async stop() {
    return new Promise(resolve => {
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        resolve(blob);
      };
      
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
    });
  }

  // NEW: Firebase upload - FIXED: uses this.userId
  async upload(blob, questionNumber) {
    // 1. Create storage ref with this.userId
    const storageRef = ref(storage, `user-voices/${this.userId}/q${questionNumber}.webm`);
    
    // 2. uploadBytes()
    await uploadBytes(storageRef, blob);
    
    // 3. Return download URL
    const url = await getDownloadURL(storageRef);
    return url;
  }

  // Playback method - FIXED: uses this.currentAudio
  play(blob) {
    // Stop any current playback
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    
    // Create object URL and play
    const audioUrl = URL.createObjectURL(blob);
    this.currentAudio = new Audio(audioUrl);
    this.currentAudio.play();
    
    // Clean up after playback
    this.currentAudio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      this.currentAudio = null;
    };
  }
}

window.VoiceRecorder = VoiceRecorder;
