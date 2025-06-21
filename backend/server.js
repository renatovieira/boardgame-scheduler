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

const formatDate = (dateString) => {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-GB', options).format(date);
};

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
      const gameName = game.name[0]['$']?.value;

      // Check if game has a name
      if (!game || !game.name) {
        return res.status(404).json({ error: "Game not found on BoardGameGeek" });
      }

      // Build clean JSON output
      const detailedGame = {
        id: game.$.id,
        name: gameName,
        minPlayingTime: game.minplaytime?.['$']?.value || game.minplaytime || 'N/A',
        maxPlayingTime: game.maxplaytime?.['$']?.value || game.maxplaytime || 'N/A',
        complexity: game.statistics?.ratings?.averageweight?.['$']?.value 
          ? parseFloat(game.statistics.ratings.averageweight['$'].value).toFixed(2)
          : 'N/A',
        link: `https://boardgamegeek.com/boardgame/${game.$.id}`,
        thumbnail: game.thumbnail || null,
        image: game.image || null,
        youtubeLink: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${gameName} how to play board game`)}`,
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

          const game = result.items.item;
          const gameName = game.name[0]['$']?.value;

          // Check if game has a name
          if (!game || !game.name) {
            return res.status(404).json({ error: "Game not found on BoardGameGeek" });
          }

          data.gameData = {
            id: game.$.id,
            name: gameName,
            minPlayingTime: game.minplaytime?.['$']?.value || game.minplaytime || 'N/A',
            maxPlayingTime: game.maxplaytime?.['$']?.value || game.maxplaytime || 'N/A',
            complexity: game.statistics?.ratings?.averageweight?.['$']?.value 
              ? parseFloat(game.statistics.ratings.averageweight['$'].value).toFixed(2)
              : 'N/A',
            link: `https://boardgamegeek.com/boardgame/${game.$.id}`,
            thumbnail: game.thumbnail || null,
            image: game.image || null,
            youtubeLink: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${gameName} how to play board game`)}`,
          };

          res.json(detailedGame);
        });
      } catch (error) {
        console.warn("Could not fetch full game data from BGG:", error.message);
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

app.get('/preview/:id', async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table) {
      return res.status(404).send('Table not found');
    }

    // If table has gameData, use that
    const gameName = table.gameData?.name || table.gameName || "Board Game";

    const formattedDate = formatDate(table.date);
    const formattedTime = table.time;

    const participants = table.participants || [];
    const participantList = participants.length > 0
      ? `Participants: ${participants.join(', ')}`
      : `Organizer: ${table.organizerName}`;    

    const imageUrl = table.gameData?.thumbnail || "https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg"; 

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${gameName} • ${formattedDate} • ${formattedTime}</title>

          <!-- Open Graph / WhatsApp Preview -->
          <meta property="og:title" content="${gameName} • ${formattedDate} • ${formattedTime} • ${table.location}">
          <meta property="og:description" content="${participantList}">
          <meta property="og:image" content="${imageUrl}">
          <meta property="og:url" content="https://boardgame-scheduler.netlify.app/?table=${table._id}">
          <meta property="og:type" content="website">

          <!-- Optional: Redirect to real URL -->
          <meta http-equiv="refresh" content="0; url=https://boardgame-scheduler.netlify.app/?table=${table._id}" />
        </head>
        <body style="background:#f9f9f9;color:#333;font-family:sans-serif;text-align:center;padding:40px;"> 
          <h1>Board Game Session</h1>
          <p>Redirecting...</p>
        </body>
      </html>
    `;

    res.send(html);
  } catch (err) {
    console.error("Preview error:", err.message);
    res.status(500).send("Error loading preview");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});