// audio.js - UPDATED for 3-question architecture
class VoiceRecorder {
  constructor(userId, firebaseApp) {
    this.userId = userId;
    this.firebaseApp = firebaseApp;
    this.recorders = {}; // Stores separate recorder for each question
    this.currentAudio = null;
  }

  // ==============================================
  // 1. START RECORDING (for specific question)
  // ==============================================
  async startRecording(qNumber) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });
      
      const mediaRecorder = new MediaRecorder(stream);
      const chunks = [];
      
      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      // Store separately for each question
      this.recorders[qNumber] = { mediaRecorder, chunks, stream };
      mediaRecorder.start(100); // Collect every 100ms
      
      console.log(`Recording Q${qNumber}...`);
      return true;
      
    } catch (error) {
      console.error(`Mic error Q${qNumber}:`, error);
      return false;
    }
  }

  // ==============================================
  // 2. STOP RECORDING (for specific question)
  // ==============================================
  async stopRecording(qNumber) {
    return new Promise((resolve) => {
      const recorder = this.recorders[qNumber];
      if (!recorder || recorder.mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }
      
      recorder.mediaRecorder.onstop = () => {
        const blob = new Blob(recorder.chunks, { type: 'audio/webm' });
        
        // Clean up stream
        recorder.stream.getTracks().forEach(track => track.stop());
        
        // Remove from active recorders
        delete this.recorders[qNumber];
        
        console.log(`Stopped Q${qNumber}, blob size:`, blob.size);
        resolve(blob);
      };
      
      recorder.mediaRecorder.stop();
    });
  }

  // ==============================================
  // 3. UPLOAD ANSWER (to Firebase for specific question)
  // ==============================================
  async uploadAnswer(qNumber, blob) {
    try {
      // Dynamic import - works with type="module"
      const { getStorage, ref, uploadBytes, getDownloadURL } = await import(
        "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js"
      );
      
      const storage = getStorage(this.firebaseApp);
      const storageRef = ref(storage, `user-voices/${this.userId}/q${qNumber}.webm`);
      
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      
      console.log(`Uploaded Q${qNumber}:`, url);
      return url;
      
    } catch (error) {
      console.error(`Upload failed Q${qNumber}:`, error);
      return null;
    }
  }

  // ==============================================
  // 4. PLAY AUDIO (from blob or URL)
  // ==============================================
  playAudio(source) {
    // Stop any current playback
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    
    const audio = new Audio();
    
    if (source instanceof Blob) {
      // Play from local blob
      audio.src = URL.createObjectURL(source);
      audio.onended = () => URL.revokeObjectURL(audio.src);
    } else {
      // Play from Firebase URL
      audio.src = source;
    }
    
    audio.play();
    this.currentAudio = audio;
    return audio;
  }

  // ==============================================
  // 5. CHECK IF RECORDING (for specific question)
  // ==============================================
  isRecording(qNumber) {
    return !!this.recorders[qNumber];
  }
}

window.VoiceRecorder = VoiceRecorder;
