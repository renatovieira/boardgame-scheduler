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
  gameName: { type: String },
  gameId: { type: String },
  playersNeeded: { type: Number, required: true },
  organizerJoins: { type: Boolean, default: false },
  participants: { type: [String], default: [] },
  gameData: {
    id: String,
    name: String,
    playingTime: String,
    complexity: String,
    link: String,
    youtubeLink: String
  },
  isFlexible: { type: Boolean, default: false },
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
        id: game.$.id || 'Unknown ID',
        name: 
          (typeof game.name === 'object' && game.name?.['$']?.value) || 
          (Array.isArray(game.name) && game.name[0]?.['$']?.value) ||
          'Unknown Game',
        yearPublished: 
          (typeof game.yearpublished === 'object' && game.yearpublished?.['$']?.value) || 
          'N/A'
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
      if (err) {
        console.error("XML parse error:", err);
        return res.status(500).json({ error: "Failed to parse BGG data" });
      }

      const game = result.items.item;

      // Check if game has a name
      if (!game || !game.name || !game.name.value) {
        console.error("Result: ", result);
        console.error("Items: ", result.items);
        console.error("Item: ", result.items.item);
        return res.status(404).json({ error: "Game not found on BoardGameGeek" });
      }

      // Build clean JSON output
      const detailedGame = {
        id: game.$.id,
        name: game.name.value,
        description: game.description?.toString().replace(/<\/?[^>]+(>|$)/g, "").substring(0, 200) + '...' || 'No description available.',
        minPlayers: game.minplayers?.['$']?.value || game.minplayers || '?',
        maxPlayers: game.maxplayers?.['$']?.value || game.maxplayers || '?',
        playingTime: game.playingtime?.['$']?.value || game.playingtime || 'N/A',
        complexity: game.statistics?.ratings?.averageweight?.['$']?.value 
          ? parseFloat(game.statistics.ratings.averageweight['$'].value).toFixed(2)
          : 'N/A',
        rating: game.statistics?.ratings?.average?.['$']?.value 
          ? parseFloat(game.statistics.ratings.average['$'].value).toFixed(2)
          : 'N/A',
        link: `https://boardgamegeek.com/boardgame/${game.$.id}`,
        thumbnail: game.thumbnail?.['$']?.value || null,
        youtubeLink: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${game.name.value} how to play board game`)}`,
      };

      res.json(detailedGame);
    });
  } catch (error) {
    console.error("Error fetching from BGG:", error.message);
    res.status(500).json({ error: "Failed to fetch game details from BGG" });
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

  // If it's a flexible session, remove single-game fields
  if (data.isFlexible) {
    delete data.gameName;
    delete data.gameData;

    if (!Array.isArray(data.flexibleGames) || data.flexibleGames.length < 1) {
      return res.status(400).json({ error: "Please select at least one game for flexible mode." });
    }
  } else {
    // If it's a single game session, remove flexible fields
    delete data.flexibleGames;

    // If gameId is present, fetch full game data
    if (data.gameId) {
      try {
        const response = await axios.get(`https://boardgamegeek.com/xmlapi2/thing?id=${data.gameId}&stats=1`);
        
        const parser = new xml2js.Parser({ explicitArray: false });
        parser.parseString(response.data, (err, result) => {
          if (err) {
            console.error("XML parse error:", err);
            return res.status(500).json({ error: "Failed to parse BGG data" });
          }

          const game = result.items?.item || {};
          
          data.gameData = {
            id: game.$.id,
            name: game.name?.['$']?.value || 'Unknown',
            playingTime: game.playingtime?.['$']?.value || 'N/A',
            complexity: parseFloat(game.statistics?.ratings?.averageweight?.['$']?.value || 0).toFixed(2),
            link: `https://boardgamegeek.com/boardgame/${game.$.id}`,
            thumbnail: game.thumbnail ? game.thumbnail['$'].value : null,
            youtubeLink: "https://www.youtube.com/results?search_query=" + encodeURIComponent(`${game.name?.['$']?.value} how to play`)
          };
        });
      } catch (error) {
        console.warn("Could not fetch full game data from BGG:", error.message);
        // Continue without gameData
      }
    }
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