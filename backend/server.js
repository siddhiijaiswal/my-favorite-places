const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/.env' });
console.log('Connection String:', process.env.MONGODB_URI);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:8000', methods: ['GET', 'POST'] }
});
const clientOrigin = process.env.CLIENT_URL || 'http://localhost:8000';
app.use(cors({ origin: '*' }));
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/favorites')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

const placeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, enum: ['cafe', 'park', 'restaurant', 'museum', 'temple', 'other'], required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  description: String,
  rating: { type: Number, default: 0 },
  visitCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Place = mongoose.model('Place', placeSchema);

app.get('/api/places', async (req, res) => {
  try {
    const { category } = req.query;
    const query = category && category !== 'all' ? { category } : {};
    const places = await Place.find(query);
    res.json(places);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/places/:id', async (req, res) => {
  try {
    const place = await Place.findById(req.params.id);
    res.json(place);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/places', async (req, res) => {
  try {
    const { name, category, lat, lng, description, rating } = req.body;
    const place = new Place({ name, category, lat, lng, description, rating });
    await place.save();
    io.emit('place-added', place);
    res.json(place);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/places/:id', async (req, res) => {
  try {
    const { name, category, lat, lng, description, rating } = req.body;
    const place = await Place.findByIdAndUpdate(
      req.params.id,
      { name, category, lat, lng, description, rating, updatedAt: Date.now() },
      { new: true }
    );
    io.emit('place-updated', place);
    res.json(place);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/places/:id', async (req, res) => {
  try {
    const place = await Place.findByIdAndDelete(req.params.id);
    io.emit('place-deleted', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/places/:id/visit', async (req, res) => {
  try {
    const place = await Place.findByIdAndUpdate(
      req.params.id,
      { $inc: { visitCount: 1 } },
      { new: true }
    );
    io.emit('place-visited', place);
    res.json(place);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  socket.on('user-action', (data) => {
    socket.broadcast.emit('user-action', data);
  });
});

const DEFAULT_PORT = process.env.PORT || 5000;

server.listen(DEFAULT_PORT)
  .on('listening', () => {
    console.log(`Server running on port ${DEFAULT_PORT}`);
  })
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(` Port ${DEFAULT_PORT} is already in use. Trying another port...`);
      const newServer = http.createServer(app);
      newServer.listen(0, () => { 
        const newPort = newServer.address().port;
        console.log(`Server running on new port ${newPort}`);
      });
    } else {
      console.error('Server error:', err);
    }
  });