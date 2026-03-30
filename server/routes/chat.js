const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');

// Save a chat message
router.post('/:roomId', async (req, res) => {
  res.send('Save chat endpoint');
});

// Get chats for a room
router.get('/:roomId', async (req, res) => {
  res.send('Get chats endpoint');
});

module.exports = router;