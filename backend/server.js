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
    minPlayingTime: String,
    maxPlayingTime: String,
    complexity: String,
    link: String,
    thumbnail: String,
    image: String,
    youtubeLink: String
  },
  isFlexible: { type: Boolean, default: false },
  flexibleGames: [{ 
    id: String,
    name: String,
    minPlayingTime: String,
    maxPlayingTime: String,
    complexity: String,
    link: String,
    thumbnail: String,
    image: String,
    youtubeLink: String
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

const getComplexityCategory = (complexityValue) => {
  if (complexityValue < 2) return 'Light';
  if (complexityValue < 3) return 'Medium';
  if (complexityValue < 4) return 'Medium-Heavy';
  return 'Heavy';
};

const getComplexity = (complexityValue) => {
  if (!complexityValue) return 'N/A';

  return `${getComplexityCategory(complexityValue)} (${complexityValue})`;
};

const getPlayingTime = (minPlayingTime, maxPlayingTime) => {
  if (!minPlayingTime || !maxPlayingTime) return 'N/A';

  return `${minPlayingTime}-${maxPlayingTime}`;
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

// Create Table
app.post('/api/table', async (req, res) => {
  const data = req.body;
  const oneMonthFromNow = new Date();
  oneMonthFromNow.setDate(oneMonthFromNow.getDate() + 30);

  const tableDate = new Date(data.date);
  if (tableDate > oneMonthFromNow) {
    return res.status(400).json({ error: "You cannot schedule games more than 30 days in advance." });
  }

  if (data.isFlexible) {
    delete data.gameName;
    delete data.gameId;
    delete data.gameData;

    if (!Array.isArray(data.flexibleGames) || data.flexibleGames.length < 1) {
      return res.status(400).json({ error: "Please select at least one game for flexible mode." });
    }

    try {
      // Fetch full details for each flexible game
      const updatedFlexibleGames = [];
      let delay = 100;

      for (const game of data.flexibleGames) {
        if (!game.id) continue; // Skip non-BGG games

        try {
          const response = await axios.get(`https://boardgamegeek.com/xmlapi2/thing?id=${game.id}&stats=1`);
          const parser = new xml2js.Parser({ explicitArray: false });
          
          const result = await new Promise((resolve, reject) => {
            parser.parseString(response.data, (err, parsedResult) => {
              if (err) reject(err);
              resolve(parsedResult);
            });
          });

          const bggGame = result.items.item;
          const gameName = bggGame.name[0]['$']?.value;

          updatedFlexibleGames.push({
            id: bggGame.$.id,
            name: gameName,
            minPlayingTime: bggGame.minplaytime?.['$']?.value || bggGame.minplaytime || 'N/A',
            maxPlayingTime: bggGame.maxplaytime?.['$']?.value || bggGame.maxplaytime || 'N/A',
            complexity: bggGame.statistics?.ratings?.averageweight?.['$']?.value 
              ? parseFloat(bggGame.statistics.ratings.averageweight['$'].value).toFixed(2)
              : 'N/A',
            link: `https://boardgamegeek.com/boardgame/${bggGame.$.id}`,
            thumbnail: bggGame.thumbnail || null,
            image: bggGame.image || null,
            youtubeLink: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${game.name} how to play board game`)}`,
          });

          await sleep(delay);          
        } catch (err) {
          console.warn("Could not fetch full game data from BGG:", err.message);
          updatedFlexibleGames.push({
            id: game.id,
            name: game.name,
            minPlayingTime: 'N/A',
            maxPlayingTime: 'N/A',
            complexity: 'N/A',
            link: `https://boardgamegeek.com/boardgame/${game.id}`,
            thumbnail: null,
            image: null,
            youtubeLink: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${game.name} how to play board game`)}`,
          });
        }        
      }

      data.flexibleGames = updatedFlexibleGames;

    } catch (err) {
      console.error("Error fetching full game data for flexible games:", err.message);
      return res.status(500).json({ error: "Failed to fetch game details for flexible session" });
    }
  } else {
    delete data.flexibleGames;

    // Single game logic remains unchanged
    if (data.gameId) {
      try {
        const response = await axios.get(`https://boardgamegeek.com/xmlapi2/thing?id=${data.gameId}&stats=1`);
        const parser = new xml2js.Parser({ explicitArray: false });
        
        parser.parseString(response.data, (err, result) => {
          if (err) return res.status(500).json({ error: "Failed to parse BGG data" });

          const game = result.items.item;
          const gameName = game.name[0]['$']?.value;

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
            youtubeLink: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${data.gameName} how to play board game`)}`,
          };
        });
      } catch (err) {
        console.warn("Could not fetch full game data from BGG:", err.message);
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
    if (!table) return res.status(404).send("Table not found");

    let title, description, imageUrl;

    if (table.isFlexible && table.flexibleGames?.length > 0) {
      // Flexible session: show list of games
      const gameNames = table.flexibleGames.map(g => g.name).join(", ");
      title = `${formatDate(table.date)} • ${table.time} • ${table.location} by ${table.participants[0] || "Unknown"}`;
      description = `${gameNames}`;
      imageUrl = table.flexibleGames[0]?.thumbnail || "https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg"; 
    } else {
      // Single-game session: unchanged
      const gameName = table.gameData?.name || table.gameName || "Board Game";
      title = `${gameName} • ${formatDate(table.date)} • ${table.time} • ${table.location} by ${table.participants[0] || "Unknown"}`;
      description = `Duration: ${getPlayingTime(table.gameData?.minPlayingTime, table.gameData?.maxPlayingTime)} min; Complexity: ${getComplexity(table.gameData?.complexity)}`;
      imageUrl = table.gameData?.thumbnail || "https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg"; 
    }

    const canonicalUrl = `https://boardgame-scheduler.netlify.app/?table=${table._id}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${title}</title>

          <!-- Open Graph Tags -->
          <meta property="og:title" content="${title}">
          <meta property="og:description" content="${description}">
          <meta property="og:image" content="${imageUrl}">
          <meta property="og:url" content="${canonicalUrl}">
          <meta property="og:type" content="website">

          <!-- Redirect to real app -->
          <meta http-equiv="refresh" content="0;URL='${canonicalUrl}'" />
        </head>
        <body style="background:#f9f9f9;color:#333;font-family:sans-serif;text-align:center;padding:40px;"> 
          <h1>Board Game Session</h1>
          <p>Loading...</p>
        </body>
      </html>
    `;

    res.send(html);
  } catch (err) {
    console.error("Preview error:", err.message);
    res.status(500).send("Error loading preview");
  }
});

app.post('/api/table/:id/remove', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  try {
    const table = await Table.findById(id);

    if (!table) return res.status(404).json({ error: 'Table not found' });

    // Remove participant
    table.participants = table.participants.filter(p => p !== name);
    await table.save();

    res.json(table);
  } catch (err) {
    console.error("Error removing participant:", err);
    res.status(500).json({ error: "Failed to update table" });
  }
});

// Keeps the server awake with a self-ping every minute + random jitter
function keepAlive() {
  const intervalInMs = 60_000; // 1 minutes
  const jitterRange = 5_000;   // ±5 seconds

  setInterval(async () => {
    try {
      const url = process.env.KEEPALIVE_URL || 'https://boardgame-scheduler.onrender.com/api/games?q=catan';
      const jitter = Math.floor(Math.random() * jitterRange * 2) - jitterRange;
      const actualInterval = intervalInMs + jitter;

      // Use setTimeout instead of changing interval dynamically
      console.log(`[Keepalive] Pinging ${url} (next ping in ~${Math.floor((actualInterval / 1000) / 60)}m${(actualInterval / 1000) % 60}s)`);

      await axios.get(url);
      console.log("[Keepalive] Success");
    } catch (err) {
      console.error("[Keepalive] Error:", err.message);
    }
  }, intervalInMs);
}

keepAlive();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});