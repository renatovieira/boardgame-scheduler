import { useState, useEffect } from 'react';

export default function App() {
  const [activeTab, setActiveTab] = useState('organize-single');
  const [tables, setTables] = useState([]);
  const [gameSuggestions, setGameSuggestions] = useState([]);
  const [searchingGame, setSearchingGame] = useState(false);
  const [currentTableId, setCurrentTableId] = useState(null);

  const [formData, setFormData] = useState({
    date: '',
    time: '',
    location: '',
    gameName: '',
    gameId: null, // ← NEW
    playersNeeded: 4,
    organizerJoins: true,
    isFlexible: false,
    flexibleGames: [],
  });

  // Dynamically update page title
  useEffect(() => {
    if (!currentTableId) {
      document.title = "Board Game Scheduler";
      return;
    }

    const table = tables.find(t => t._id === currentTableId);
    if (!table) {
      document.title = "Board Game Scheduler";
      return;
    }

    const date = new Date(table.date).toLocaleDateString();
    const { time, location } = table;

    let title = `${date} • ${time} • ${location}`;

    if (table.isFlexible && table.flexibleGames?.length > 0) {
      const gameNames = table.flexibleGames.map(g => g.name).join('/');
      title += ` • ${gameNames}`;
    } else if (table.gameData?.name) {
      title += ` • ${table.gameData.name}`;
    }

    document.title = title;
  }, [currentTableId, tables]);

  // Create a new table (single or flexible)
  const createTable = async () => {
    const payload = {
      ...formData,
      gameName: formData.gameName,
      ...(formData.gameId && { gameId: formData.gameId }) // Only include if present
    };

    try {
      const res = await fetch('https://boardgame-scheduler.onrender.com/api/table',  {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      const newTable = await fetch(`https://boardgame-scheduler.onrender.com/api/table/${data.id}`).then(r  => r.json());
      
      setTables([...tables, newTable]);
      setCurrentTableId(newTable._id);
      setActiveTab('join');
    } catch (err) {
      console.error("Failed to create table:", err);
      alert("Failed to create table. Please try again.");
    }
  };

  // Join an existing table
  const joinTable = async (tableId, name) => {
    try {
      const res = await fetch(`https://boardgame-scheduler.onrender.com/api/table/${tableId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      const updatedTable = await res.json();
      setTables(tables.map(t => t._id === tableId ? updatedTable : t));
    } catch (err) {
      console.error("Failed to join table:", err);
      alert("Failed to join table. Please try again.");
    }
  };

  // Get complexity range from flexibleGames array
  const getComplexityRange = () => {
    if (!formData.flexibleGames.length) return '';

    const complexities = formData.flexibleGames.map(g => parseFloat(g.complexity));
    const min = Math.min(...complexities);
    const max = Math.max(...complexities);

    const formatComplexity = (val) => {
      if (val < 2) return 'Light';
      if (val < 3.5) return 'Light–Medium';
      if (val < 4.5) return 'Medium';
      return 'Heavy';
    };

    if (min === max) return formatComplexity(min);
    return `${formatComplexity(min)} – ${formatComplexity(max)}`;
  };

  const getTableLink = (tableId) => {
    return `${window.location.origin}?table=${tableId}`;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("Link copied to clipboard!");
  };

  // Helper for complexity range in joined table
  const getComplexityRangeForTable = (table) => {
    if (!table.flexibleGames || !table.flexibleGames.length) return '';
    
    const complexities = table.flexibleGames
      .map(g => parseFloat(g.complexity))
      .filter(c => c);

    if (complexities.length === 0) return '';

    const min = Math.min(...complexities);
    const max = Math.max(...complexities);

    const format = (val) => {
      if (val < 2) return 'Light';
      if (val < 3.5) return 'Light–Medium';
      if (val < 4.5) return 'Medium';
      return 'Heavy';
    };

    return min === max ? format(min) : `${format(min)} – ${format(max)}`;
  };

  // Search for games on BGG
  const handleGameSearch = async (value) => {
    if (value.length < 3) {
      setGameSuggestions([]);
      return;
    }

    try {
      const res = await fetch(`https://boardgame-scheduler.onrender.com/api/games?q=${encodeURIComponent(value)}`);
      const data = await res.json();

      // Make sure data is an array before setting
      if (Array.isArray(data)) {
        // Safely map games
        const safeGames = data.map(game => ({
          id: game.id || 'Unknown ID',
          name: game.name || 'Unknown Game',
          yearPublished: game.yearPublished || 'N/A',
          type: game.type || 'boardgame'
        }));

        setGameSuggestions(safeGames);
      } else {
        console.error("Unexpected game search response:", data);
        setGameSuggestions([]);
      }
    } catch (err) {
      console.error("Game search failed:", err);
      setGameSuggestions([]);
    }
  };

  // Select a game and add it to flexibleGames or set as single game
  const selectGame = (game) => {
    setFormData({
      ...formData,
      gameName: game.name
    });
    setGameSuggestions([]); // Hide dropdown
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold mb-2">Board Game Scheduler</h1>
          <p className="opacity-90">Schedule and join board game sessions with friends</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex flex-wrap border-b border-gray-300 mb-6">
          <button 
            className={`px-4 py-2 sm:px-6 sm:py-3 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'organize-single' 
                ? 'border-b-2 border-blue-600 text-blue-600' 
                : 'text-gray-600 hover:text-blue-600'
            }`}
            onClick={() => {
              setActiveTab('organize-single');
              setFormData({ ...formData, isFlexible: false });
            }}
          >
            Organize Single Game
          </button>
          
          <button 
            className={`px-4 py-2 sm:px-6 sm:py-3 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'organize-flexible' 
                ? 'border-b-2 border-purple-600 text-purple-600' 
                : 'text-gray-600 hover:text-purple-600'
            }`}
            onClick={() => {
              setActiveTab('organize-flexible');
              setFormData({ ...formData, isFlexible: true });
            }}
          >
            Organize Flexible Session
          </button>

          <button 
            className={`ml-auto px-4 py-2 sm:px-6 sm:py-3 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'join' 
                ? 'border-b-2 border-green-600 text-green-600' 
                : 'text-gray-600 hover:text-green-600'
            }`}
            onClick={() => setActiveTab('join')}
          >
            Join Table
          </button>
        </div>
        {/* Organize Single Game Form */}
        {activeTab === 'organize-single' && (
          <div className="bg-white rounded-xl shadow-md p-6 max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Create a New Game Session</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                <input
                  type="time"
                  name="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Your home, local café, etc."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Board Game Name</label>
                <input
                  type="text"
                  name="gameName"
                  value={formData.gameName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, gameName: value });
                    handleGameSearch(value);
                  }}
                  placeholder="Start typing to search..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                
                {/* Game suggestions dropdown */}
                {gameSuggestions.length > 0 && (
                  <ul className="mt-2 border border-gray-200 p-2 max-h-40 overflow-y-auto bg-white z-10 absolute w-full">
                    {gameSuggestions.map((game, index) => (
                      <li 
                        key={index} 
                        className="px-4 py-2 hover:bg-purple-50 cursor-pointer border-b last:border-b-0"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            gameName: game.name,
                            gameId: game.id // ← Save ID here
                          });
                          setGameSuggestions([]);
                        }}
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
                  onChange={(e) => setFormData({ ...formData, playersNeeded: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="organizerJoins"
                  checked={formData.organizerJoins}
                  onChange={(e) => setFormData({ ...formData, organizerJoins: e.target.checked })}
                  className="h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
                />
                <label className="ml-2 text-sm text-gray-700">
                  I will join this session when created
                </label>
              </div>

              <button
                onClick={createTable}
                type="button"
                className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Create Game Session
              </button>
            </div>
          </div>
        )}
        {/* Organize Flexible Game Session Form */}
        {activeTab === 'organize-flexible' && (
          <div className="bg-white rounded-xl shadow-md p-6 max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Create a Flexible Game Session</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                <input
                  type="time"
                  name="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Your home, local café, etc."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Suggested Games</label>
                
                <input
                  type="text"
                  name="gameName"
                  value={formData.gameName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, gameName: value });
                    handleGameSearch(value);
                  }}
                  placeholder="Start typing to search..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                  autoComplete="off"
                />

                {/* Suggestion dropdown will go here */}

                <div className="mt-2 space-x-2 space-y-2 flex flex-wrap">
                  {formData.flexibleGames.map((game, index) => (
                    <span 
                      key={index} 
                      className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm flex items-center"
                    >
                      {game.name}
                      <button
                        onClick={() => {
                          const newGames = formData.flexibleGames.filter((_, i) => i !== index);
                          setFormData({ ...formData, flexibleGames: newGames });
                        }}
                        className="ml-2 text-purple-600 hover:text-purple-900"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Players Needed</label>
                <input
                  type="number"
                  name="playersNeeded"
                  min="1"
                  value={formData.playersNeeded}
                  onChange={(e) => setFormData({ ...formData, playersNeeded: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="organizerJoins"
                  checked={formData.organizerJoins}
                  onChange={(e) => setFormData({ ...formData, organizerJoins: e.target.checked })}
                  className="h-5 w-5 text-purple-600 rounded focus:ring-purple-500"
                />
                <label className="ml-2 text-sm text-gray-700">
                  I will join this session when created
                </label>
              </div>

              <button
                onClick={createTable}
                type="button"
                className="mt-6 w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
              >
                Create Flexible Game Session
              </button>
            </div>
          </div>
        )}
        {/* Join Form */}
        {activeTab === 'join' && currentTableId && (
          <div className="bg-white rounded-xl shadow-md p-6 max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Join Game Session</h2>
            
            <div className="mb-6 p-4 bg-blue-50 text-blue-800 rounded-lg">
              <p className="font-medium mb-2">Share this link with your friends:</p>
              <div className="flex items-center">
                <input
                  type="text"
                  readOnly
                  value={getTableLink(currentTableId)}
                  className="flex-grow px-4 py-2 border border-gray-300 rounded-l-lg bg-white"
                />
                <button
                  onClick={() => copyToClipboard(getTableLink(currentTableId))}
                  className="px-4 py-2 bg-blue-600 text-white rounded-r-lg hover:bg-blue-700 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            {tables.length > 0 && tables.find(t => t.id === currentTableId) && (
              <div className="space-y-6">
                {/* Show game info depending on session type */}
                {tables.find(t => t._id === currentTableId)?.isFlexible ? (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-bold text-lg mb-2">Suggested Games</h3>
                    <div className="space-y-2">
                      {tables.find(t => t._id === currentTableId)?.flexibleGames?.map((game, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span className="font-medium">{game.name}</span>
                          {game.complexity && (
                            <span className="text-sm text-gray-600">
                              Complexity: {parseFloat(game.complexity).toFixed(1)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    {tables.find(t => t._id === currentTableId)?.flexibleGames?.length > 0 && (
                      <div className="mt-2 text-sm text-gray-700">
                        Complexity Range: <strong>{getComplexityRangeForTable(tables.find(t => t._id === currentTableId))}</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-bold text-lg mb-2">
                      {tables.find(t => t._id === currentTableId)?.gameName || "Unknown Game"}
                    </h3>

                    {/* Only show BGG data if gameData exists */}
                    {tables.find(t => t._id === currentTableId)?.gameData ? (
                      <>
                        <p className="text-sm text-gray-600 mb-1">
                          Date: {tables.find(t => t._id === currentTableId).date} at {tables.find(t => t._id === currentTableId).time}
                        </p>
                        <p className="text-sm text-gray-600">
                          Location: {tables.find(t => t._id === currentTableId).location}
                        </p>
                        <div className="mt-2 flex items-center gap-4 text-sm">
                          <a 
                            href={tables.find(t => t._id === currentTableId).gameData.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            View on BoardGameGeek
                          </a>
                          <a 
                            href={tables.find(t => t._id === currentTableId).gameData.youtubeLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-red-600 hover:underline"
                          >
                            How to Play (YouTube)
                          </a>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-600">
                        This game was created without a known ID. No extra details are available.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <h4 className="font-medium text-gray-700 mb-2">Session Info</h4>
                    <p className="text-sm text-gray-600 mb-1">
                      Players: {tables.find(t => t.id === currentTableId).participants.length}/{tables.find(t => t.id === currentTableId).playersNeeded}
                    </p>
                    <p className="text-sm text-gray-600">
                      Time: {tables.find(t => t.id === currentTableId).time}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Participants</h4>
                  
                  <div className="flex flex-wrap gap-2 mb-4">
                    {tables.find(t => t.id === currentTableId).participants.map((participant, idx) => (
                      <span key={idx} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                        {participant}
                      </span>
                    ))}
                  </div>

                  {tables.find(t => t.id === currentTableId).participants.length < tables.find(t => t.id === currentTableId).playersNeeded ? (
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const nameInput = document.getElementById('participantName');
                      if (nameInput.value.trim()) {
                        joinTable(currentTableId, nameInput.value.trim());
                        nameInput.value = '';
                      }
                    }}>
                      <div className="flex">
                        <input
                          id="participantName"
                          type="text"
                          placeholder="Your name"
                          className="flex-grow px-4 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                        <button
                          type="submit"
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-r-lg transition-colors"
                        >
                          Join
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="text-green-600 font-medium">This session is full!</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
      </main>

      <footer className="bg-gray-100 py-6 mt-12">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>Board Game Scheduler • Keep track of your gaming sessions with friends</p>
        </div>
      </footer>
    </div>
  );
}