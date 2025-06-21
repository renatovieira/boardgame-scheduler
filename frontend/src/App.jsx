import { useState, useEffect } from 'react';

export default function App() {
  const [activeTab, setActiveTab] = useState('organize-single');
  const [tables, setTables] = useState([]);
  const [gameSuggestions, setGameSuggestions] = useState([]);
  const [searchingGame, setSearchingGame] = useState(false);
  const [currentTableId, setCurrentTableId] = useState(null);
  const [currentTable, setCurrentTable] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [organizerName, setOrganizerName] = useState('');

  // Form state for creating table
  const [formData, setFormData] = useState({
    date: '',
    time: '',
    location: '',
    gameName: '',
    gameId: null,
    playersNeeded: 4,
    organizerJoins: true,
  });

  // Load table if URL has ?table=12345
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tableId = urlParams.get('table');

    if (tableId) {
      setLoading(true);
      
      // Load table data
      fetch(`https://boardgame-scheduler.onrender.com/api/table/${tableId}`) 
        .then(res => res.json())
        .then(async (data) => {
          // Now, if we have gameId, fetch full BGG data
          if (data.gameId) {
            try {
              const gameRes = await fetch(`https://boardgame-scheduler.onrender.com/api/game/${data.gameId}`); 
              const gameData = await gameRes.json();

              // Merge gameData into current table
              setCurrentTable({ ...data, gameData });
            } catch (err) {
              console.warn("Failed to load BGG data:", err);
              setCurrentTable(data); // Still show basic info
            }
          } else {
            setCurrentTable(data); // No game ID → skip BGG lookup
          }

          setCurrentTableId(tableId);
          setActiveTab('join');
          setLoading(false);
        })
        .catch(err => {
          setError("Could not find this session");
          setLoading(false);
        });
    }
  }, []);

  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-GB', options).format(date);
  };  

  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Handle game search
  const handleGameSearch = async (e) => {
    const query = e.target.value;
    setFormData({ ...formData, gameName: query });

    if (query.length < 3) {
      setGameSuggestions([]);
      return;
    }

    setSearchingGame(true);
    try {
      const res = await fetch(`https://boardgame-scheduler.onrender.com/api/games?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setGameSuggestions(data);
    } catch (err) {
      console.error("Search failed:", err);
      setGameSuggestions([]);
    }
    setSearchingGame(false);
  };

  // Select a game from suggestions
  const selectGame = (game) => {
    setFormData({
      ...formData,
      gameName: game.name,
      gameId: game.id
    });
    setGameSuggestions([]);
  };

  // Create new table
  const createTable = async () => {
    const { date, time, location, gameName, playersNeeded } = formData;

    if (!date || !time || !location || !gameName || playersNeeded < 1 || !organizerName.trim()) {
      alert("Please fill in all required fields including your name.");
      return;
    }

    // Build payload
    const payload = {
      ...formData,
      participants: formData.organizerJoins ? [organizerName] : [],
    };

    try {
      const res = await fetch(`https://boardgame-scheduler.onrender.com/api/table`,  {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      // Redirect to join tab with table link
      window.history.pushState({}, '', `/?table=${result.id}`);
      setCurrentTableId(result.id);

      // Fetch and update current table
      const tableRes = await fetch(`https://boardgame-scheduler.onrender.com/api/table/${result.id}`); 
      const tableData = await tableRes.json();
      setCurrentTable(tableData);
      setActiveTab('join');
    } catch (err) {
      console.error("Failed to create table:", err);
      alert("Could not create the session. Please try again.");
    }
  };

  // Join a table
  const handleJoin = async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('participantName');
    const name = nameInput.value.trim();

    if (!name) return;

    try {
      const res = await fetch(`https://boardgame-scheduler.onrender.com/api/table/${currentTableId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      const updatedTable = await res.json();
      setCurrentTable(updatedTable);
      nameInput.value = '';
    } catch (err) {
      console.error("Join failed:", err);
      alert("Could not join the session");
    }
  };

  // Copy link to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert("Link copied!");
    });
  };

  // Generate shareable link
  const getTableLink = (tableId) => {
    return `${window.location.origin}/?table=${tableId}`;
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">Board Game Scheduler</h1>
          <p className="opacity-90">Schedule and join board game sessions with friends</p>
        </div>
      </header>

      {/* Tabs */}
      <main className="container mx-auto px-4 py-6">
        <div className="flex border-b border-gray-300 mb-6">
          <button 
            className={`px-6 py-3 font-medium ${
              activeTab === 'organize-single'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-blue-600'
            }`}
            onClick={() => setActiveTab('organize-single')}
          >
            Organize New Game
          </button>
        </div>

        {/* Organize Single Game Form */}
        {activeTab === 'organize-single' && (
          <div className="bg-white rounded-xl shadow-md p-6 max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Create a New Game Session</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={organizerName}
                  onChange={(e) => setOrganizerName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                <input
                  type="time"
                  name="time"
                  value={formData.time}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  placeholder="Your home, local café, etc."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Board Game Name</label>
                <input
                  type="text"
                  name="gameName"
                  value={formData.gameName}
                  onChange={handleGameSearch}
                  placeholder="Start typing to search..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  autoComplete="off"
                />

                {/* Game Suggestions Dropdown */}
                {searchingGame && <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded animate-pulse">Searching...</div>}
                
                {gameSuggestions.length > 0 && (
                  <ul className="mt-2 bg-white border border-gray-200 rounded shadow-md z-10 w-full max-h-40 overflow-y-auto">
                    {gameSuggestions.map((game, index) => (
                      <li 
                        key={index}
                        className="px-4 py-2 hover:bg-purple-50 cursor-pointer border-b last:border-b-0"
                        onClick={() => selectGame(game)}
                      >
                        <div className="font-medium">{game.name}</div>
                        <div className="text-sm text-gray-600">
                          Released: {game.yearPublished}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Players Needed</label>
                <input
                  type="number"
                  name="playersNeeded"
                  min="1"
                  value={formData.playersNeeded}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="organizerJoins"
                  name="organizerJoins"
                  checked={formData.organizerJoins}
                  onChange={handleInputChange}
                  className="h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="organizerJoins" className="ml-2 text-sm text-gray-700">
                  I will join this session when created
                </label>
              </div>

              <button
                onClick={createTable}
                className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Create Game Session
              </button>
            </div>
          </div>
        )}

        {/* Join Table View */}
        {activeTab === 'join' && (
          <div className="bg-white rounded-xl shadow-md p-6 max-w-2xl mx-auto">
            {loading ? (
              <p>Loading session...</p>
            ) : error ? (
              <p className="text-red-600">{error}</p>
            ) : currentTable ? (
              <>
                <h2 className="text-2xl font-semibold mb-6 text-gray-800">Join Game Session</h2>

                {/* Game Info Card */}
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <h3 className="font-bold text-lg">{currentTable.gameName || "Unknown Game"}</h3>
                  <p className="text-sm text-gray-600">Organized by: {currentTable.participants[0] || 'Unknown'}</p>
                  <p className="text-sm text-gray-600">Date: {formatDate(currentTable.date)} at {currentTable.time}</p>
                  <p className="text-sm text-gray-600">Location: {currentTable.location}</p>
                </div>

                {/* BGG Game Details (if available) */}
                {currentTable.gameData && (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-white p-4 rounded-lg border border-gray-200">
                      <h4 className="font-medium text-gray-700 mb-2">Game Details</h4>
                      <p className="text-sm text-gray-600">Complexity: {getComplexity(currentTable.gameData.complexity)}</p>
                      <p className="text-sm text-gray-600">Duration: {getPlayingTime(currentTable.gameData.minPlayingTime, currentTable.gameData.maxPlayingTime)} minutes</p>
                      <a 
                        href={currentTable.gameData.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 text-sm hover:underline mt-2 inline-block"
                      >
                        View on BoardGameGeek
                      </a>
                    </div>

                    <div className="bg-white p-4 rounded-lg border border-gray-200">
                      <h4 className="font-medium text-gray-700 mb-2">How to Play</h4>
                      <a 
                        href={currentTable.gameData.youtubeLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-600 text-sm hover:underline"
                      >
                        Watch tutorial video
                      </a>
                    </div>
                  </div>
                )}

                {/* Participants */}
                <div className="mb-6">
                  <h4 className="font-medium text-gray-700 mb-2">
                    Participants ({currentTable.participants.length}/{currentTable.playersNeeded})
                  </h4>
                  
                  <div className="flex flex-wrap gap-2 mb-4">
                    {currentTable.participants.map((name, idx) => (
                      <span key={idx} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                        {name}
                      </span>
                    ))}
                  </div>

                  {currentTable.participants.length < currentTable.playersNeeded && (
                    <form onSubmit={handleJoin}>
                      <input
                        id="participantName"
                        type="text"
                        placeholder="Your name"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                      <button
                        type="submit"
                        className="mt-2 w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                      >
                        Join This Session
                      </button>
                    </form>
                  )}
                </div>

                {/* Share Link Box */}
                <div className="mt-6 p-4 bg-blue-50 text-blue-800 rounded-lg">
                  <p className="font-medium mb-2">Share this link with friends:</p>
                  <div className="flex items-center">
                    <input
                      type="text"
                      readOnly
                      value={getTableLink(currentTable._id)}
                      className="flex-grow px-4 py-2 border border-gray-300 rounded-l-lg bg-white"
                    />
                    <button
                      onClick={() => copyToClipboard(getTableLink(currentTable._id))}
                      className="px-4 py-2 bg-blue-600 text-white rounded-r-lg hover:bg-blue-700 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-red-600">Session not found. Try sharing the link again.</p>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 py-6 mt-12">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>Board Game Scheduler • Keep track of your gaming sessions with friends</p>
        </div>
      </footer>
    </div>
  );
}