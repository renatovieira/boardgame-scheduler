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
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [participantToRemove, setParticipantToRemove] = useState(null);

  const [formData, setFormData] = useState({
    date: '',
    time: '',
    location: '',
    gameName: '',
    gameId: null,
    playersNeeded: 4,
    organizerJoins: true,
    isFlexible: false,
    flexibleGames: [],
    isPrivate: false
  });

  const addCustomGame = (name) => {
    if (!name.trim()) return;

    // Check if already exists
    if (formData.flexibleGames.some(g => g.name === name)) return;

    // Add as custom game
    setFormData({
      ...formData,
      flexibleGames: [
        ...formData.flexibleGames,
        {
          id: null,
          name: name,
        }
      ]
    });

    setFormData({ ...formData, gameName: '' });
    setGameSuggestions([]);
  };

  const addNewFlexibleGameRow = () => {
    setFormData({
      ...formData,
      flexibleGames: [...formData.flexibleGames, {
        name: '',
        id: '',
      }]
    });
  };

  const removeFlexibleGame = (index) => {
    const newGames = [...formData.flexibleGames];
    newGames.splice(index, 1);
    setFormData({ ...formData, flexibleGames: newGames });
  };

  const addFlexibleGame = (game) => {
    if (formData.flexibleGames.some(g => g.id === game.id)) return;

    setFormData({
      ...formData,
      flexibleGames: [
        ...formData.flexibleGames,
        {
          id: game.id,
          name: game.name,
        }
      ],
      gameName: '', // Clear input
    });

    setGameSuggestions([]); // Hide dropdown
  };

  // Load table if URL has ?table=12345
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tableId = urlParams.get('table');

    if (tableId) {
      setLoading(true);

      // Only fetch the table once
      fetch(`https://boardgame-scheduler.onrender.com/api/table/${tableId}`) 
        .then(res => res.json())
        .then((data) => {
          // If we have gameData, use it directly
          if (data.gameData) {
            setCurrentTable(data);
          } else {
            // Fallback: still show table even without gameData
            setCurrentTable({
              ...data,
              gameData: null
            });
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

      // Only keep base games
      const filteredData = data.filter(g => g.id && g.name);
      setGameSuggestions(filteredData);
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
    const { date, time, location, playersNeeded } = formData;

    if (!date || !time || !location || playersNeeded < 1 || !organizerName.trim()) {
      alert("Please fill in all required fields (*).");
      return;
    }

    if (formData.isFlexible && formData.flexibleGames.filter(g => g.name.trim()).length < 2) {
      alert("Please select at least two games.");
      return;  
    }

    try {
      const payload = {
        ...formData,
        participants: formData.organizerJoins ? [organizerName] : [],
        gameData: undefined
      };

      if (payload.isFlexible) {
        delete payload.gameName;
        delete payload.gameId;
      } else {
        delete payload.flexibleGames;
      }

      const res = await fetch(`https://boardgame-scheduler.onrender.com/api/table`,  {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      const newTableLink = `${window.location.origin}/?table=${result.id}`;
      window.history.pushState({}, '', `/?table=${result.id}`);

      const tableRes = await fetch(`https://boardgame-scheduler.onrender.com/api/table/${result.id}`); 
      const tableData = await tableRes.json();

      setCurrentTable(tableData);
      setCurrentTableId(result.id);
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
    return `https://boardgame-scheduler.onrender.com/preview/${tableId}`;
  };

  const getComplexityCategory = (complexityValue) => {
    if (complexityValue < 2) return 'Light';
    if (complexityValue < 3) return 'Medium';
    if (complexityValue < 4) return 'Medium-Heavy';
    return 'Heavy';
  };

  const getComplexityRange = (games) => {
    if (!games || games.length === 0) return '';
    const complexities = games.map(g => parseFloat(g.complexity)).filter(c => c);

    if (complexities.length === 0) return 'N/A';

    const min = getComplexityCategory(Math.min(...complexities));
    const max = getComplexityCategory(Math.max(...complexities));

    return min === max
      ? min
      : `${min} – ${max}`;
  };  

  const getComplexity = (complexityValue) => {
    if (!complexityValue || complexityValue === 'N/A') return 'N/A';

    return `${getComplexityCategory(complexityValue)} (${complexityValue})`;
  };

  const getPlayingTime = (minPlayingTime, maxPlayingTime) => {
    if (!minPlayingTime || !maxPlayingTime) return 'N/A';
    if (minPlayingTime === 'N/A' && maxPlayingTime === 'N/A') {
      return 'N/A';
    }
    if (minPlayingTime == maxPlayingTime) {
      return `${minPlayingTime} min`;
    }

    return `${minPlayingTime}-${maxPlayingTime} min`;
  };

  const resetUrl = () => {
    window.history.pushState({}, '', window.location.origin);
  };  

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">Board Game Scheduler</h1>
          <p className="opacity-90">Schedule board game sessions with friends</p>
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
            onClick={() => {
              resetUrl();
              setActiveTab('organize-single');
            }}
          >
            Organize Single Game Session
          </button>

          <button 
            className={`px-6 py-3 font-medium ${
              activeTab === 'organize-flexible'
                ? 'border-b-2 border-purple-600 text-purple-600'
                : 'text-gray-600 hover:text-purple-600'
            }`}
            onClick={() => {
              resetUrl();
              setActiveTab('organize-flexible');
              setFormData({
                ...formData,
                isFlexible: true,
                gameName: '',
                gameId: null
              });
            }}
          >
            Organize Flexible Game Session
          </button>          
        </div>

        {/* Organize Single Game Form */}
        {activeTab === 'organize-single' && (
          <div className="bg-white rounded-xl shadow-md p-6 max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Organize Single Game Session</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Name*</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Date*</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Time*</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Location*</label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  placeholder="Your home, Black Sheep, etc."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Board Game Name*</label>
                <div className="relative">
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
                    <ul className="list-group list-group-flush position-absolute w-100 mt-2 max-h-[160px] overflow-auto z-30">
                      {gameSuggestions.map((suggestion, idx) => (
                        <li key={idx} className="list-group-item cursor-pointer"
                          onClick={() => selectGame(suggestion)}
                        >
                          <div className="fw-bold">{suggestion.name}</div>
                          <small className="text-muted">Released: {suggestion.yearPublished}</small>
                        </li>
                      ))}
                    </ul>                    
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Players*</label>
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

              {/* Privacy Toggle */}
              <div className="flex items-center mt-4">
                <input
                  id="isPrivate"
                  type="checkbox"
                  checked={formData.isPrivate}
                  onChange={(e) => setFormData({ ...formData, isPrivate: e.target.checked })}
                  className="h-5 w-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <label htmlFor="isPrivate" className="ml-2 text-sm text-gray-700">
                  This session is private (only people with the link can join)
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
        {activeTab === 'organize-flexible' && (
          <div className="bg-white rounded-xl shadow-md p-6 max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Organize Flexible Game Session</h2>

            <div className="space-y-4">
              {/* Organizer Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Name*</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={organizerName}
                  onChange={(e) => setOrganizerName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date*</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              {/* Time */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time*</label>
                <input
                  type="time"
                  name="time"
                  value={formData.time}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location*</label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  placeholder="Your home, Black Sheep, etc."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              {/* Game Search Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Suggested Games*</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Start typing to search..."
                    value={formData.gameName}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData({ ...formData, gameName: value });
                      handleGameSearch(e);
                    }}
                    onKeyDown={(e) => {
                      // Allow Enter key to add custom game
                      if (e.key === 'Enter' && formData.gameName.trim()) {
                        e.preventDefault();
                        addCustomGame(formData.gameName);
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    autoComplete="off"
                  />

                  {/* Suggestions Dropdown */}
                  {gameSuggestions.length > 0 && (
                    <ul className="list-group list-group-flush position-absolute w-100 mt-2 max-h-[160px] overflow-auto z-30">
                      {gameSuggestions.map((suggestion, idx) => (
                        <li key={idx} className="list-group-item cursor-pointer"
                          onClick={() => addFlexibleGame(suggestion)}
                        >
                          <div className="fw-bold">{suggestion.name}</div>
                          <small className="text-muted">Released: {suggestion.yearPublished}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Selected Games List */}
              <div className="mt-4 flex flex-wrap gap-2">
                {formData.flexibleGames
                  .filter(g => g.name.trim()) // 👈 Only show if name exists
                  .map((game, index) => (
                    <span key={index} className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm flex items-center">
                      {game.name}
                      <button
                        type="button"
                        onClick={() => removeFlexibleGame(index)}
                        className="ml-2 text-purple-600 hover:text-purple-900 font-bold"
                      >
                        &times;
                      </button>
                    </span>
                  ))
                }
              </div>

              {/* Players Needed */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Players*</label>
                <input
                  type="number"
                  min="1"
                  value={formData.playersNeeded}
                  onChange={(e) => setFormData({ ...formData, playersNeeded: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Organizer Joins Checkbox */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="organizerJoinsFlex"
                  checked={formData.organizerJoins}
                  onChange={(e) => setFormData({ ...formData, organizerJoins: e.target.checked })}
                  className="h-5 w-5 text-purple-600 rounded focus:ring-purple-500"
                />
                <label htmlFor="organizerJoinsFlex" className="ml-2 text-sm text-gray-700">
                  I will join this session when created
                </label>
              </div>

              {/* Privacy Toggle */}
              <div className="flex items-center mt-4">
                <input
                  id="isPrivate"
                  type="checkbox"
                  checked={formData.isPrivate}
                  onChange={(e) => setFormData({ ...formData, isPrivate: e.target.checked })}
                  className="h-5 w-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <label htmlFor="isPrivate" className="ml-2 text-sm text-gray-700">
                  This session is private (only people with the link can join)
                </label>
              </div>              

              {/* Create Button */}
              <button
                onClick={createTable}
                className="mt-6 w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Create Flexible Game Session
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
                  <h3 className="font-bold text-lg">
                    {currentTable.isFlexible ? "Flexible Game Session" : currentTable.gameName || "Unknown Game"}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Date: {formatDate(currentTable.date)} at {currentTable.time}
                  </p>
                  <p className="text-sm text-gray-600">
                    Location: {currentTable.location}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    Organized by: {currentTable.participants[0] || "Unknown"}
                  </p>
                </div>

                {/* Show game details if it's a single game */}
                {!currentTable.isFlexible && currentTable.gameData && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start mb-6">
                    {/* Game Thumbnail */}
                    <div className="sm:col-span-1 flex justify-center">
                      {currentTable.gameData.thumbnail && (
                        <img 
                          src={currentTable.gameData.thumbnail} 
                          alt={`${currentTable.gameData.name} thumbnail`} 
                          className="max-w-full h-auto rounded shadow"
                        />
                      )}
                    </div>

                    {/* Game Stats */}
                    <div className="sm:col-span-2">
                      <h4 className="font-medium text-gray-700 mb-2">About {currentTable.gameData.name}</h4>
                      <ul className="space-y-1 text-sm text-gray-600">
                        <li><strong>Complexity:</strong> {getComplexity(currentTable.gameData.complexity)}</li>
                        <li><strong>Duration:</strong> {getPlayingTime(currentTable.gameData.minPlayingTime, currentTable.gameData.maxPlayingTime)}</li>
                        <li>
                          <a href={currentTable.gameData.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            View on BoardGameGeek
                          </a>
                        </li>
                        <li>
                          <a href={currentTable.gameData.youtubeLink} target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline">
                            How to Play (YouTube)
                          </a>
                        </li>
                      </ul>
                    </div>
                  </div>
                )}
                {/* Show all flexible games if this is a flexible session */}
                {currentTable.isFlexible && currentTable.flexibleGames?.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-medium text-gray-700 mb-2">Suggested Games</h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      {currentTable.flexibleGames.map((game, idx) => (
                        <div key={idx} className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex flex-col">
                          {/* Game Name + BGG Link */}
                          <a href={game.link} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
                            {game.name}
                          </a>

                          {/* Complexity */}
                          <div className="mt-2 text-sm text-gray-600">
                            Complexity: {getComplexity(game.complexity)}
                          </div>

                          {/* Duration */}
                          <div className="text-sm text-gray-600">
                            Duration: {getPlayingTime(game.minPlayingTime, game.maxPlayingTime)}
                          </div>

                          {/* How to Play on YouTube */}
                          <a 
                            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${game.name} how to play board game`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            How to Play (YouTube)
                          </a>
                        </div>
                      ))}
                    </div>

                    {/* Complexity Range */}
                    <div className="text-sm text-gray-600">
                      Complexity Range: <strong>{getComplexityRange(currentTable.flexibleGames)}</strong>
                    </div>
                  </div>
                )}

                {/* Participants List */}
                <div className="mb-6">
                  <h4 className="font-medium text-gray-700 mb-2">
                    Participants ({currentTable.participants.length}/{currentTable.playersNeeded})
                  </h4>

                  <div className="flex flex-col space-y-2 mb-4">
                    {currentTable.participants.map((name, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-blue-50 px-4 py-2 rounded-lg">
                        <span>{name}</span>
                        <button
                          onClick={() => {
                            setParticipantToRemove(name);
                            setShowConfirmModal(true);
                          }}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  {currentTable.participants.length < currentTable.playersNeeded && (
                    <form onSubmit={handleJoin} className="mt-4">
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

        {showConfirmModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-auto">
              <h3 className="text-lg font-semibold text-red-600">Warning: Removing a Player</h3>
              <p className="mt-2 text-sm text-gray-600">
                You are about to remove <strong>{participantToRemove}</strong> from the session.
              </p>
              <p className="mt-2 text-sm text-yellow-700 bg-yellow-100 p-2 rounded">
                Please note: This action affects other players. Only remove yourself unless you have permission from the person.
              </p>

              <div className="mt-4 flex justify-end space-x-2">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(`https://boardgame-scheduler.onrender.com/api/table/${currentTable._id}/remove`,  {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: participantToRemove }),
                      });

                      const updatedTable = await res.json();
                      setCurrentTable(updatedTable);
                      setTables(prev => prev.map(t => t._id === currentTable._id ? updatedTable : t));
                      setShowConfirmModal(false);
                    } catch (err) {
                      console.error("Failed to remove participant:", err);
                      alert("Could not remove participant");
                    }
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Confirm Removal
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-gray-100 py-6 mt-12">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>Board Game Scheduler • Written by AI, made functional by humans</p>
        </div>
      </footer>
    </div>
  );
}