const express = require('express');
const app = express();


// Allow JSON + large files
app.use(express.json({ limit: '10mb' }));

// The voice note endpoint
app.post('/api/save-voice-note', (req, res) => {
    console.log('Voice note received! Size:', req.body.audio?.length || 0, 'chars');
    res.json({ status: "success", message: "Voice note saved (placeholder)" });
});






const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Test with: curl -X POST http://localhost:${PORT}/api/save-voice-note -d '{"audio":"test"}' -H "Content-Type: application/json"`);
});