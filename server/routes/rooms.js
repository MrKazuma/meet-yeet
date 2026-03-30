const express = require('express');
const router = express.Router();
const Room = require('../models/Room');

// Create a room
router.post('/create-room', async (req, res) => {
  res.send('Create room endpoint');
});

// Get room info
router.get('/:id', async (req, res) => {
  res.send('Get room endpoint');
});

module.exports = router;