import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const playersAll = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/players_all.json'), 'utf8'));
console.log(`Loaded ${playersAll.length} players from players_all.json`);

const app = express();
app.use(cors());

// Serve the Vite production build when running in production
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('/*any', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

const TEAMS = [
  { id: 'CSK', name: 'Chennai Super Kings', city: 'Chennai', color: '#fcce06', initials: '🦁', flag: '💛' },
  { id: 'MI', name: 'Mumbai Indians', city: 'Mumbai', color: '#004ba0', initials: '🌪️', flag: '💙' },
  { id: 'RCB', name: 'Royal Challengers', city: 'Bengaluru', color: '#ea1a2a', initials: '👑', flag: '❤️' },
  { id: 'KKR', name: 'Kolkata Knight Riders', city: 'Kolkata', color: '#3a225d', initials: '⚔️', flag: '💜' },
  { id: 'DC', name: 'Delhi Capitals', city: 'Delhi', color: '#00008b', initials: '🐅', flag: '💙' },
  { id: 'RR', name: 'Rajasthan Royals', city: 'Rajasthan', color: '#ea1b85', initials: '🛡️', flag: '💗' },
  { id: 'PBKS', name: 'Punjab Kings', city: 'Punjab', color: '#ed1b24', initials: '🦁', flag: '❤️' },
  { id: 'SRH', name: 'Sunrisers Hyderabad', city: 'Hyderabad', color: '#ff822a', initials: '🦅', flag: '🧡' },
  { id: 'LSG', name: 'Lucknow Super Giants', city: 'Lucknow', color: '#05122b', initials: '🏏', flag: '💙' },
  { id: 'GT', name: 'Gujarat Titans', city: 'Gujarat', color: '#1c2c46', initials: '⚡', flag: '💙' },
];

const TEAM_BUDGET_LAKHS = 12000;

const getIncrement = (bid) => {
  if (bid < 200) return 20;
  if (bid < 500) return 50;
  if (bid < 1000) return 100;
  return 200;
};

const shuffle = (array) => {
  const arr = [...array];
  let currentIndex = arr.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [arr[currentIndex], arr[randomIndex]] = [arr[randomIndex], arr[currentIndex]];
  }
  return arr;
};

// Group players by basePrice, shuffle within each group, then sort groups high->low
const getPoolShuffledPlayers = (allPlayers) => {
  const pools = {};
  allPlayers.forEach(p => {
    const price = p.basePrice;
    if (!pools[price]) pools[price] = [];
    pools[price].push(p);
  });
  const sortedPrices = Object.keys(pools).map(Number).sort((a, b) => b - a);
  let finalPlayers = [];
  sortedPrices.forEach(price => {
    finalPlayers = finalPlayers.concat(shuffle(pools[price]));
  });
  return finalPlayers;
};

// Map role string to pool label
const getPoolLabel = (role = '') => {
  const r = role.toLowerCase();
  if (r.includes('pacer') || r.includes('pace')) return 'PACE';
  if (r.includes('spin') || r.includes('spinner')) return 'SPIN';
  if (r.includes('all')) return 'AR';
  if (r.includes('wk') || r.includes('wicket')) return 'WK';
  return 'BAT';
};

// Lightweight room state for broadcasting — never includes secrets or the full players array
const getRoomState = (room) => ({
  id: room.id,
  admin: room.admin,
  adminName: room.adminName,
  phase: room.phase,
  currentPlayerIndex: room.currentPlayerIndex,
  currentBid: room.currentBid,
  lastBidder: room.lastBidder,
  isUnsoldRound: room.isUnsoldRound,
  isPaused: room.isPaused || false,
  skipVotes: room.skipVotes,
  teams: room.teams,
  timerDuration: room.timerDuration,
  timeRemaining: room.timeRemaining,
  totalPlayers: room.players.length,
  totalUnsold: room.unsoldQueue.length,
});

// Get the current player being auctioned
const getCurrentPlayer = (room) => {
  if (room.isUnsoldRound) return room.unsoldQueue[room.currentPlayerIndex] || null;
  return room.players[room.currentPlayerIndex] || null;
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', ({ adminName, timerDuration }) => {
    const roomId = nanoid(6).toUpperCase();
    const shuffledPlayers = getPoolShuffledPlayers([...playersAll]);
    const adminToken = nanoid(16);

    rooms.set(roomId, {
      id: roomId,
      admin: socket.id,
      adminName: (adminName || '').trim(),
      adminToken,
      players: shuffledPlayers,
      currentPlayerIndex: 0,
      unsoldQueue: [],
      teams: [],
      currentBid: 0,
      lastBidder: null,
      phase: 'setup',
      isUnsoldRound: false,
      isPaused: false,
      skipVotes: {},
      timerDuration: timerDuration || 10,
      timeRemaining: timerDuration || 10,
      timerInterval: null,
      soldPlayers: [],
      lastActivityAt: Date.now(),
    });

    socket.join(roomId);
    socket.emit('room-created', { ...getRoomState(rooms.get(roomId)), adminToken });
    console.log(`Room ${roomId} created with timer ${timerDuration || 10}s`);
  });

  const startRoomTimer = (roomId, { reset = true } = {}) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.timerInterval) clearInterval(room.timerInterval);
    if (reset) room.timeRemaining = room.timerDuration;
    if (typeof room.timeRemaining !== 'number') room.timeRemaining = room.timerDuration;

    io.to(roomId).emit('timer-tick', { timeRemaining: room.timeRemaining });

    room.timerInterval = setInterval(() => {
      // On each timer tick, also trigger bot evaluation
    
    room.timeRemaining--;
    io.to(roomId).emit('timer-tick', { timeRemaining: room.timeRemaining });


      if (room.timeRemaining <= 0) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
        handleTimeUp(roomId);
      }
    }, 1000);
  };

  const handleTimeUp = (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const currentPlayer = getCurrentPlayer(room);
    if (!currentPlayer) return;

    if (room.lastBidder) {
      const team = room.teams.find(t => t.id === room.lastBidder);
      if (team) {
        team.budget -= room.currentBid;
        const soldEntry = { ...currentPlayer, soldPrice: room.currentBid, soldTo: team.id, soldToName: team.name };
        team.players.push(soldEntry);
        if (!room.soldPlayers) room.soldPlayers = [];
        room.soldPlayers.push(soldEntry);

        const buyerName = room.userTeamMap 
           ? Object.keys(room.userTeamMap).find(k => room.userTeamMap[k] === team.id) || team.name 
           : team.name;

        io.to(roomId).emit('event-log', {
          type: 'player-sold',
          teamId: team.id,
          teamName: team.name,
          buyerName: buyerName,
          playerName: currentPlayer.name,
          price: room.currentBid,
          role: currentPlayer.role
        });
      }
    } else {
      if (!room.isUnsoldRound) {
        room.unsoldQueue.push(currentPlayer);
      }
      io.to(roomId).emit('event-log', {
        type: 'unsold',
        user: 'Auction',
        text: `${currentPlayer.name} went UNSOLD`
      });
    }
    nextPlayer(roomId);
  };

  socket.on('join-room', ({ roomId, userName, adminToken }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    socket.join(roomId);
    room.lastActivityAt = Date.now();

    // Reconnection: if this userName had a team, re-assign the socket
    if (room.userTeamMap && room.userTeamMap[userName]) {
      const prevTeamId = room.userTeamMap[userName];
      const team = room.teams.find(t => t.id === prevTeamId);
      if (team) {
        team.socketId = socket.id;
        console.log(`Reconnected ${userName} to team ${prevTeamId}`);
      }
    }

    // If the reconnecting user has the host token, update admin socket id.
    if (adminToken && room.adminToken && adminToken === room.adminToken) {
      room.admin = socket.id;
    }

    socket.emit('room-joined', {
      ...getRoomState(room),
      currentPlayer: getCurrentPlayer(room),
    });
    io.to(roomId).emit('user-joined', { socketId: socket.id, userName });
  });

  socket.on('select-team', ({ roomId, teamData, userName }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.phase !== 'setup') {
      socket.emit('error', 'Team selection is only allowed before the auction starts.');
      return;
    }

    const requestedId = (teamData?.id || '').toString().trim().toUpperCase();
    const teamTemplate = TEAMS.find(t => t.id === requestedId);
    if (!teamTemplate) {
      socket.emit('error', 'Invalid team.');
      return;
    }

    const takenByOther = room.teams.some(t => t.id === teamTemplate.id && t.socketId !== socket.id);
    if (takenByOther) {
      socket.emit('error', 'Team already taken.');
      return;
    }

    room.teams = room.teams.filter(t => t.socketId !== socket.id);
    room.teams.push({
      ...teamTemplate,
      budget: TEAM_BUDGET_LAKHS,
      players: [],
      socketId: socket.id,
    });

    // Track userName → teamId for reconnection
    if (!room.userTeamMap) room.userTeamMap = {};
    if (userName) room.userTeamMap[userName] = teamTemplate.id;
    room.lastActivityAt = Date.now();

    io.to(roomId).emit('state-update', getRoomState(room));
  });

  socket.on('start-auction', ({ roomId, adminToken }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.phase !== 'setup') return; // already started
    room.lastActivityAt = Date.now();

    room.phase = 'auction';
    const firstPlayer = room.players[0];
    room.currentBid = firstPlayer.basePrice;
    room.lastBidder = null;
    room.skipVotes = {};

    io.to(roomId).emit('state-update', getRoomState(room));
    io.to(roomId).emit('player-update', {
      ...getRoomState(room),
      currentPlayer: firstPlayer,
    });
    startRoomTimer(roomId, { reset: true });
  });

  // ── PAUSE / RESUME ──
  socket.on('pause-auction', ({ roomId, adminToken }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'auction' || !adminToken || adminToken !== room.adminToken) return;
    if (room.isPaused) return;

    room.isPaused = true;
    if (room.timerInterval) {
      clearInterval(room.timerInterval);
      room.timerInterval = null;
    }
    // timeRemaining is already saved from last tick

    io.to(roomId).emit('state-update', getRoomState(room));
    io.to(roomId).emit('event-log', {
      type: 'info',
      user: 'System',
      text: 'Auction paused by room creator'
    });
  });

  socket.on('resume-auction', ({ roomId, adminToken }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'auction' || !adminToken || adminToken !== room.adminToken) return;
    if (!room.isPaused) return;

    room.isPaused = false;
    room.lastActivityAt = Date.now();
    io.to(roomId).emit('state-update', getRoomState(room));
    io.to(roomId).emit('event-log', {
      type: 'info',
      user: 'System',
      text: 'Auction resumed'
    });
    startRoomTimer(roomId, { reset: false });
  });

  socket.on('end-auction', ({ roomId, adminToken }) => {
    const room = rooms.get(roomId);
    if (!room || !adminToken || adminToken !== room.adminToken) return;

    if (room.timerInterval) {
      clearInterval(room.timerInterval);
      room.timerInterval = null;
    }
    room.phase = 'results';
    room.lastActivityAt = Date.now();
    io.to(roomId).emit('state-update', getRoomState(room));
    io.to(roomId).emit('event-log', {
      type: 'info',
      user: 'System',
      text: 'Auction ended by Host.'
    });
  });

  // ── TRADING (Mind Games) ──
  socket.on('propose-trade', ({ roomId, targetTeamId, myPlayerId, targetPlayerId, cashOffset }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const myTeam = room.teams.find(t => t.socketId === socket.id);
    const targetTeam = room.teams.find(t => t.id === targetTeamId);
    if (!myTeam || !targetTeam) return;

    if (myTeam.id === targetTeam.id) {
      socket.emit('error', 'You cannot trade with your own team.');
      return;
    }

    const cleanMyPlayerId = (myPlayerId || '').toString().trim();
    const cleanTargetPlayerId = (targetPlayerId || '').toString().trim();
    const offset = Number.isFinite(Number(cashOffset)) ? Math.trunc(Number(cashOffset)) : 0;

    // Validate that any provided player names actually belong to the expected squads.
    if (cleanMyPlayerId && !myTeam.players.some(p => p.name === cleanMyPlayerId)) {
      socket.emit('error', 'Your proposed player is not in your squad.');
      return;
    }
    if (cleanTargetPlayerId && !targetTeam.players.some(p => p.name === cleanTargetPlayerId)) {
      socket.emit('error', 'Target proposed player is not in that squad.');
      return;
    }

    const tradeId = nanoid(8);
    if (!room.pendingTrades) room.pendingTrades = {};
    
    const tradeOffer = {
      id: tradeId,
      proposerId: myTeam.id,
      proposerName: myTeam.name,
      targetTeamId: targetTeam.id,
      myPlayerId: cleanMyPlayerId,
      targetPlayerId: cleanTargetPlayerId,
      cashOffset: offset, // +ve: Proposer Pays, -ve: Target Pays
      status: 'pending'
    };
    
    room.pendingTrades[tradeId] = tradeOffer;
    room.lastActivityAt = Date.now();

    // Send only to the target team (prevents overwriting on other clients)
    if (targetTeam.socketId) {
      io.to(targetTeam.socketId).emit('trade-offered', tradeOffer);
    }
    
    // Feedback to proposer
    socket.emit('trade-sent', { tradeId });
    
    console.log(`Trade ${tradeId} proposed from ${myTeam.name} to ${targetTeam.name}`);
  });

  socket.on('respond-trade', ({ roomId, tradeId, action }) => {
    const room = rooms.get(roomId);
    if (!room || !room.pendingTrades || !room.pendingTrades[tradeId]) return;

    const trade = room.pendingTrades[tradeId];
    const proposer = room.teams.find(t => t.id === trade.proposerId);
    const target = room.teams.find(t => t.id === trade.targetTeamId);
    const responderTeam = room.teams.find(t => t.socketId === socket.id);
    if (!proposer || !target || !responderTeam) return;

    const isAccept = action === 'accept';
    const isTargetResponder = responderTeam.id === target.id;
    const isProposerResponder = responderTeam.id === proposer.id;

    // Authorization:
    // - Only receiving team can accept.

    if (isAccept && !isTargetResponder) {
      socket.emit('error', 'Only the receiving team can accept this trade.');
      return;
    }
    if (!isAccept && !isTargetResponder && !isProposerResponder) {
      socket.emit('error', 'You are not a party to this trade.');
      return;
    }

    if (isAccept) {
      // Validation: Check if buyer has money
      if (trade.cashOffset > 0 && proposer.budget < trade.cashOffset) {
        socket.emit('error', 'Proposer has insufficient budget!');
        return;
      }
      if (trade.cashOffset < 0 && target.budget < Math.abs(trade.cashOffset)) {
        socket.emit('error', 'Insufficient budget to accept this trade!');
        return;
      }

      // Validate players exist in the expected squads (prevents client spoofing).
      let proposerPlayer = null;
      let targetPlayer = null;

      if (trade.myPlayerId) {
        proposerPlayer = proposer.players.find(p => p.name === trade.myPlayerId);
        if (!proposerPlayer) {
          socket.emit('error', 'Trade proposer player not found in proposer squad.');
          return;
        }
      }
      if (trade.targetPlayerId) {
        targetPlayer = target.players.find(p => p.name === trade.targetPlayerId);
        if (!targetPlayer) {
          socket.emit('error', 'Trade target player not found in target squad.');
          return;
        }
      }

      // Validate squad size limits (max 25 players)
      const proposerNewSize = proposer.players.length - (proposerPlayer ? 1 : 0) + (targetPlayer ? 1 : 0);
      const targetNewSize = target.players.length - (targetPlayer ? 1 : 0) + (proposerPlayer ? 1 : 0);

      if (proposerNewSize > 25) {
        socket.emit('error', 'Trade violates proposer squad limit (Max 25 players)!');
        return;
      }
      if (targetNewSize > 25) {
        socket.emit('error', 'Trade violates target squad limit (Max 25 players)!');
        return;
      }

      // Validate overseas player limits (max 8 OS players)
      const isInd = (p) => (p.nationality || '').toLowerCase().includes('indian') || (p.country || '').toLowerCase() === 'india';
      
      const proposerOsCount = proposer.players.filter(p => !isInd(p)).length;
      const targetOsCount = target.players.filter(p => !isInd(p)).length;

      const proposerNewOsCount = proposerOsCount - (proposerPlayer && !isInd(proposerPlayer) ? 1 : 0) + (targetPlayer && !isInd(targetPlayer) ? 1 : 0);
      const targetNewOsCount = targetOsCount - (targetPlayer && !isInd(targetPlayer) ? 1 : 0) + (proposerPlayer && !isInd(proposerPlayer) ? 1 : 0);

      if (proposerNewOsCount > 8) {
        socket.emit('error', 'Trade violates proposer overseas limit (Max 8 OS players)!');
        return;
      }
      if (targetNewOsCount > 8) {
        socket.emit('error', 'Trade violates target overseas limit (Max 8 OS players)!');
        return;
      }

      // Execute Swap
      if (proposerPlayer) {
        proposer.players = proposer.players.filter(p => p.name !== proposerPlayer.name);
        target.players.push(proposerPlayer);
      }
      if (targetPlayer) {
        target.players = target.players.filter(p => p.name !== targetPlayer.name);
        proposer.players.push(targetPlayer);
      }

      // Adjust Budgets
      proposer.budget -= trade.cashOffset;
      target.budget += trade.cashOffset;

      // Keep auction stats consistent by updating sold ownership too.
      const updateSoldOwnership = (playerObj, newTeam) => {
        if (!room.soldPlayers) return;
        const playerId = playerObj?.id;
        room.soldPlayers.forEach((sp, idx) => {
          const matchById = playerId && sp.id === playerId;
          const matchByName = sp.name === playerObj.name;
          if (matchById || matchByName) {
            room.soldPlayers[idx] = { ...sp, soldTo: newTeam.id, soldToName: newTeam.name };
          }
        });
      };

      if (proposerPlayer) updateSoldOwnership(proposerPlayer, target);
      if (targetPlayer) updateSoldOwnership(targetPlayer, proposer);

      // Log publicly
      io.to(roomId).emit('event-log', {
        type: 'trade',
        user: 'Trade',
        text: `🤝 ${proposer.name} and ${target.name} executed a secret trade!`
      });

      // Update clients (rosters and purses)
      io.to(roomId).emit('state-update', getRoomState(room));
      
      // Notify parties
      io.to(proposer.socketId).emit('trade-resolved', { tradeId, status: 'accepted' });
      io.to(target.socketId).emit('trade-resolved', { tradeId, status: 'accepted' });
    } else {
      // Declined
      io.to(proposer.socketId).emit('trade-resolved', { tradeId, status: 'declined' });
      io.to(target.socketId).emit('trade-resolved', { tradeId, status: 'declined' });
    }
    delete room.pendingTrades[tradeId];
    room.lastActivityAt = Date.now();
  });

  // ── AUCTION STATS (pool display) ──
  socket.on('request-auction-stats', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    // Collect all sold player IDs
    const soldIds = new Set((room.soldPlayers || []).map(p => p.id));
    // Collect unsold IDs
    const unsoldIds = new Set(room.unsoldQueue.map(p => p.id));

    // Upcoming = all players not yet auctioned (after currentPlayerIndex)
    const currentIdx = room.currentPlayerIndex;
    const queue = room.isUnsoldRound ? room.unsoldQueue : room.players;
    const upcoming = queue.slice(currentIdx + 1).map(p => ({
      name: p.name, role: p.role, nationality: p.nationality,
      country: p.country, basePrice: p.basePrice, pool: getPoolLabel(p.role)
    }));
    // If still in main round, also include unsold queue as upcoming
    if (!room.isUnsoldRound && room.unsoldQueue.length > 0) {
      room.unsoldQueue.forEach(p => {
        upcoming.push({
          name: p.name, role: p.role, nationality: p.nationality,
          country: p.country, basePrice: p.basePrice, pool: getPoolLabel(p.role)
        });
      });
    }

    // Sold players with team info
    const sold = (room.soldPlayers || []).map(p => ({
      name: p.name, role: p.role, nationality: p.nationality,
      basePrice: p.basePrice, soldPrice: p.soldPrice,
      soldTo: p.soldToName, pool: getPoolLabel(p.role)
    }));

    // Unsold = in unsold queue (during main round) or permanently unsold (during unsold round — already passed)
    const unsold = [];
    if (room.isUnsoldRound) {
      // Players before currentPlayerIndex that weren't sold in re-auction
      room.unsoldQueue.slice(0, currentIdx).forEach(p => {
        if (!soldIds.has(p.id)) {
          unsold.push({
            name: p.name, role: p.role, nationality: p.nationality,
            basePrice: p.basePrice, pool: getPoolLabel(p.role)
          });
        }
      });
    }

    // Group upcoming by pool
    const pools = {};
    upcoming.forEach(p => {
      if (!pools[p.pool]) pools[p.pool] = [];
      pools[p.pool].push(p);
    });

    // Helper for Tiered Categorization
    const getTieredCategory = (p) => {
      const bp = p.basePrice || 0;
      const role = (p.role || '').toLowerCase();
      const pNat = (p.nationality || '').toLowerCase();
      const pCountry = (p.country || '').toLowerCase();
      const isInd = pNat.includes('indian') || pCountry === 'india';
      const nat = isInd ? 'Indian' : 'Overseas';

      if (bp >= 250) return '🔥 MARQUEE';
      
      if (bp >= 180) {
        if (role.includes('wk') || role.includes('wicket')) return '💎 Elite WK';
        if (role.includes('all')) return '🔄 Elite AR';
        if (role.includes('bat')) return '🏏 Elite Bat';
        return '🎯 Elite Bowl';
      }

      if (bp >= 100) {
        if (role.includes('all')) return `🔄 Star AR (${nat})`;
        if (role.includes('bat')) return `🏏 Star Bat (${nat})`;
        return `🎯 Star Bowl (${nat})`;
      }

      // Classic (80L and below)
      if (role.includes('bat')) return `🏏 Classic Bat (${nat})`;
      return `🎯 Classic Bowl (${nat})`;
    };

    // Group upcoming by tier/category
    const tierMap = {};
    upcoming.forEach(p => {
      const tier = getTieredCategory(p);
      if (!tierMap[tier]) tierMap[tier] = [];
      tierMap[tier].push(p);
    });

    // Convert to Array for stable rendering
    const tierGroups = Object.entries(tierMap).map(([name, pList]) => ({
      name,
      players: pList.sort(() => Math.random() - 0.5)
    }));

    // Optional: Sort groups by tier priority (Marquee first, Elite second...)
    const getPriority = (n) => {
      if (n.includes('🔥')) return 1;
      if (n.includes('💎')) return 2;
      if (n.includes('⭐')) return 3;
      return 4;
    };
    tierGroups.sort((a, b) => getPriority(a.name) - getPriority(b.name));

    socket.emit('auction-stats', {
      upcoming,
      sold,
      unsold,
      tierGroups, // Now an array
      totalUpcoming: upcoming.length,
      totalSold: sold.length,
      totalUnsold: unsold.length,
    });
  });

  socket.on('place-bid', ({ roomId, teamId, amount, teamName }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'auction' || room.isPaused) return;

    // Server-side bid validation
    const myTeam = room.teams.find(t => t.socketId === socket.id);
    if (!myTeam) return socket.emit('error', 'Select a team first');
    if (myTeam.id !== teamId) return socket.emit('error', 'You cannot bid for another team');

    const team = room.teams.find(t => t.id === teamId);
    if (!team) return socket.emit('error', 'Team not found');
    if (room.lastBidder === teamId) return socket.emit('error', 'You are already the highest bidder');
    if (team.budget < amount) return socket.emit('error', 'Not enough budget!');

    // Squad Size Limits
    if (team.players.length >= 25) {
      return socket.emit('error', 'Squad limit reached (Max 25 players)!');
    }

    const currentPlayer = getCurrentPlayer(room);
    if (!currentPlayer) return;
    
    // Overseas Limits
    const isInd = (currentPlayer.nationality || '').toLowerCase().includes('indian') || (currentPlayer.country || '').toLowerCase() === 'india';
    if (!isInd) {
      const osCount = team.players.filter(p => !((p.nationality || '').toLowerCase().includes('indian') || (p.country || '').toLowerCase() === 'india')).length;
      if (osCount >= 8) return socket.emit('error', 'Overseas limit reached (Max 8 OS players)!');
    }

    if (amount < currentPlayer.basePrice) return socket.emit('error', 'Bid must be at least base price');

    const expectedNext = room.currentBid + getIncrement(room.currentBid);
    if (amount !== expectedNext) {
      return socket.emit('error', `Invalid bid increment. Next bid must be ₹${expectedNext}L`);
    }

    room.currentBid = amount;
    room.lastBidder = teamId;
    room.skipVotes = {};
    room.lastActivityAt = Date.now();

    // Reset timer on every bid
    startRoomTimer(roomId, { reset: true });

    io.to(roomId).emit('bid-update', { currentBid: room.currentBid, lastBidder: room.lastBidder, teamName });
    io.to(roomId).emit('skip-update', { skipVotes: room.skipVotes });
  });

  socket.on('toggle-skip', ({ roomId, userId, vote }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    // Only active auction (and unpaused) allows skip voting, and only team owners can vote.
    if (room.phase !== 'auction' || room.isPaused) return;
    const myTeam = room.teams.find(t => t.socketId === socket.id);
    if (!myTeam) return;

    const voterId = socket.id; // ignore any client-supplied voterId
    room.skipVotes[voterId] = vote;
    room.lastActivityAt = Date.now();
    
    // Only count connected teams in the skip threshold
    const connectedTeams = room.teams.filter(t => io.sockets.sockets.has(t.socketId));
    const totalPlayers = connectedTeams.length;
    const skipCount = Object.values(room.skipVotes).filter(v => v).length;

    io.to(roomId).emit('skip-update', { skipVotes: room.skipVotes });

    if (skipCount >= totalPlayers && totalPlayers > 0) {
      if (room.timerInterval) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
      }
      const currentPlayer = getCurrentPlayer(room);
      if (currentPlayer && !room.isUnsoldRound) {
        room.unsoldQueue.push(currentPlayer);
        io.to(roomId).emit('event-log', {
          type: 'info',
          user: 'Auction',
          text: `Everyone skipped ${currentPlayer.name}`
        });
      }
      nextPlayer(roomId);
    }
  });

  const nextPlayer = (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const queue = room.isUnsoldRound ? room.unsoldQueue : room.players;

    if (room.currentPlayerIndex < queue.length - 1) {
      room.currentPlayerIndex++;
    } else if (!room.isUnsoldRound && room.unsoldQueue.length > 0) {
      room.isUnsoldRound = true;
      room.currentPlayerIndex = 0;
    } else {
      room.phase = 'results';
    }

    room.skipVotes = {};

    if (room.phase === 'auction') {
      const nextPlayerObj = getCurrentPlayer(room);
      if (!nextPlayerObj) {
        // Safety: no player found even though phase is still auction — end it
        room.phase = 'results';
        io.to(roomId).emit('state-update', getRoomState(room));
        return;
      }
      room.currentBid = nextPlayerObj.basePrice;
      room.lastBidder = null;
      // After moving to next player, let bots consider bidding

      io.to(roomId).emit('player-update', {
        ...getRoomState(room),
        currentPlayer: nextPlayerObj,
      });
    }

    io.to(roomId).emit('state-update', getRoomState(room));
  };

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Clean up: find rooms this socket was in
    for (const [roomId, room] of rooms.entries()) {
      const teamIndex = room.teams.findIndex(t => t.socketId === socket.id);
      if (teamIndex === -1) continue;

      // If still in lobby, remove the team
      if (room.phase === 'setup') {
        room.teams.splice(teamIndex, 1);
        io.to(roomId).emit('state-update', getRoomState(room));
      }
      // During auction, keep the team but log the disconnect
      // (they can reconnect via join-room with same userName)
      if (room.phase === 'auction') {
        // Clear their skip vote on disconnect so skip count matches connected players
        if (room.skipVotes && room.skipVotes[socket.id] !== undefined) {
          delete room.skipVotes[socket.id];
          io.to(roomId).emit('skip-update', { skipVotes: room.skipVotes });
        }
        io.to(roomId).emit('event-log', {
          type: 'info',
          user: 'System',
          text: `${room.teams[teamIndex].name} owner disconnected`
        });
      }
    }
  });

  socket.on('chat-message', ({ roomId, name, text, teamId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.lastActivityAt = Date.now();
    io.to(roomId).emit('chat-message', { name, text, teamId });
  });
});

// Cleanup stale rooms (prevents unbounded memory growth)
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    const adapterRoom = io.sockets.adapter.rooms.get(roomId);
    const connectedCount = adapterRoom ? adapterRoom.size : 0;
    const lastAt = room.lastActivityAt || 0;
    const isStale = now - lastAt > ROOM_TTL_MS;

    if (connectedCount === 0 && isStale) {
      if (room.timerInterval) clearInterval(room.timerInterval);
      rooms.delete(roomId);
      console.log(`Cleaned up stale room ${roomId}`);
    }
  }
}, 60 * 1000);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.io server running on http://localhost:${PORT}`);
});
