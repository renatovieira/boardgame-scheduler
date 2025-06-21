const express = require('express');
const cors = require('cors');
const axios = require('axios');
const xml2js = require('xml2js');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
console.log("Connected to MongoDB");

// Table Schema
const TableSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  time: { type: String, required: true },
  location: { type: String, required: true },
  playersNeeded: { type: Number, required: true },
  organizerJoins: { type: Boolean, default: false },
  participants: { type: [String], default: [] },
  
  // Two possible modes:
  isFlexible: { type: Boolean, default: false }, // New field

  // Single Game Mode
  gameName: { type: String },
  gameData: {
    id: String,
    name: String,
    playingTime: String,
    complexity: String,
    link: String,
    youtubeLink: String
  },

  // Flexible Game Mode
  flexibleGames: [{
    id: String,
    name: String,
    playingTime: String,
    complexity: String,
    link: String
  }]
}, {
  timestamps: true,
  expires: '1d'
});

const Table = mongoose.model('Table', TableSchema);

// Search BGG
app.get('/api/games', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing search query' });

  try {
    const response = await axios.get(`https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(query)}&type=boardgame`);
    
    const parser = new xml2js.Parser({ explicitArray: false });
    parser.parseString(response.data, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to parse XML' });
      
      const items = result.items?.item || [];
      const games = Array.isArray(items) ? items : [items];

      const simplifiedGames = games.map(game => ({
        id: game.$.id,
        name: game.name?.['$']?.value || game.name?.[0]?.$?.value || 'Unknown',
        yearPublished: game.yearpublished?.['$']?.value,
        type: game.$.type
      }));

      res.json(simplifiedGames);
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Failed to fetch from BGG' });
  }
});

// Get Detailed Game Info
app.get('/api/game/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const response = await axios.get(`https://boardgamegeek.com/xmlapi2/thing?id=${id}&stats=1`);
    
    const parser = new xml2js.Parser({ explicitArray: false });
    parser.parseString(response.data, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to parse XML' });

      const game = result.items?.item || {};
      
      const detailedGame = {
        id: game.$.id,
        name: game.name?.['$']?.value || 'Unknown',
        description: game.description ? game.description.replace(/<\/?[^>]+(>|$)/g, "") : 'No description available.',
        minPlayers: game.minplayers?.['$']?.value,
        maxPlayers: game.maxplayers?.['$']?.value,
        playingTime: game.playingtime?.['$']?.value,
        complexity: parseFloat(game.statistics?.ratings?.averageweight?.['$']?.value || 0).toFixed(2),
        rating: parseFloat(game.statistics?.ratings?.average?.['$']?.value || 0).toFixed(2),
        link: `https://boardgamegeek.com/boardgame/${game.$.id}`,
        thumbnail: game.thumbnail ? game.thumbnail['$'].value : null,
        youtubeLink: "https://www.youtube.com/results?search_query=" + encodeURIComponent(`${game.name?.['$']?.value} how to play`)
      };

      res.json(detailedGame);
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Failed to fetch game details' });
  }
});

// Create Table
app.post('/api/table', async (req, res) => {
  const data = req.body;
  const oneMonthFromNow = new Date();
  oneMonthFromNow.setDate(oneMonthFromNow.getDate() + 30);

  const tableDate = new Date(data.date);
  if (tableDate > oneMonthFromNow) {
    return res.status(400).json({ error: "You cannot schedule games more than 30 days in advance." });
  }

  // If it's a flexible session, remove single-game fields and validate game list
  if (data.isFlexible) {
    delete data.gameName;
    delete data.gameData;

    if (!Array.isArray(data.flexibleGames) || data.flexibleGames.length < 1) {
      return res.status(400).json({ error: "Please select at least one game for flexible mode." });
    }
  } else {
    // If it's a single game session, remove flexible fields
    delete data.flexibleGames;
  }

  const newTable = new Table(data);
  await newTable.save();
  res.json({ id: newTable._id });
});

// Get Table
app.get('/api/table/:id', async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found' });
  res.json(table);
});

// Join Table
app.post('/api/table/:id/join', async (req, res) => {
  const { name } = req.body;
  const table = await Table.findById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  if (table.participants.length < table.playersNeeded && name) {
    table.participants.push(name);
    await table.save();
    res.json(table);
  } else {
    res.status(400).json({ error: 'Table full or missing name' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});