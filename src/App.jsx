import { useState, useEffect, useRef, useMemo } from 'react'
import { io } from 'socket.io-client'

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  `${window.location.protocol}//${window.location.hostname}:3001`

const socket = io(SOCKET_URL)

const TEAMS = [
  { id: 'CSK',  name: 'Chennai Super Kings',    city: 'Chennai',    color: '#fcce06', initials: '🦁', flag: '💛' },
  { id: 'MI',   name: 'Mumbai Indians',         city: 'Mumbai',     color: '#004ba0', initials: '🌪️', flag: '💙' },
  { id: 'RCB',  name: 'Royal Challengers',      city: 'Bengaluru',  color: '#ea1a2a', initials: '👑', flag: '❤️' },
  { id: 'KKR',  name: 'Kolkata Knight Riders',  city: 'Kolkata',    color: '#3a225d', initials: '⚔️', flag: '💜' },
  { id: 'DC',   name: 'Delhi Capitals',         city: 'Delhi',      color: '#00008b', initials: '🐅', flag: '💙' },
  { id: 'RR',   name: 'Rajasthan Royals',       city: 'Rajasthan',  color: '#ea1b85', initials: '🛡️', flag: '💗' },
  { id: 'PBKS', name: 'Punjab Kings',           city: 'Punjab',     color: '#ed1b24', initials: '🦁', flag: '❤️' },
  { id: 'SRH',  name: 'Sunrisers Hyderabad',    city: 'Hyderabad',  color: '#ff822a', initials: '🦅', flag: '🧡' },
  { id: 'LSG',  name: 'Lucknow Super Giants',   city: 'Lucknow',    color: '#05122b', initials: '🏏', flag: '💙' },
  { id: 'GT',   name: 'Gujarat Titans',         city: 'Gujarat',    color: '#1c2c46', initials: '⚡', flag: '💙' },
]

const getRoleBadgeClass = (role = '') => {
  const r = role.toLowerCase()
  if (r.includes('pacer') || r.includes('pace')) return 'player-role-badge pace'
  if (r.includes('spin') || r.includes('spinner')) return 'player-role-badge spin'
  if (r.includes('all')) return 'player-role-badge ar'
  if (r.includes('wk') || r.includes('wicket')) return 'player-role-badge wk'
  return 'player-role-badge bat'
}

const formatPrice = (p) => {
  if (p >= 100) return `${(p / 100).toFixed(2)} Cr`
  return `${p}L`
}

const getIncrement = (bid) => {
  if (bid < 200) return 20
  if (bid < 500) return 50
  if (bid < 1000) return 100
  return 200
}

// Web Audio API Programmatic Synthesizers (zero static assets needed!)
let audioCtx = null;
const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

const playBidSound = () => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(550, now);
    osc.frequency.exponentialRampToValueAtTime(1100, now + 0.07);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.07);

    osc.start(now);
    osc.stop(now + 0.07);
  } catch (e) {}
};

const playTickSound = () => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'triangle';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(120, now);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.02);

    osc.start(now);
    osc.stop(now + 0.02);
  } catch (e) {}
};

const playSoldSound = () => {
  try {
    const ctx = getAudioContext();
    const strike = (time, freq, vol) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(70, time + 0.14);

      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

      osc.start(time);
      osc.stop(time + 0.14);
    };

    const now = ctx.currentTime;
    strike(now, 260, 0.22);
    strike(now + 0.14, 190, 0.16);
  } catch (e) {}
};

function App() {
  const [room, setRoom] = useState(null)
  const [phase, setPhase] = useState('landing') // landing | lobby | auction | results
  const [userName, setUserName] = useState('')
  const [roomInput, setRoomInput] = useState('')
  const [timerDuration, setTimerDuration] = useState(10)
  const [selectedTeamId, setSelectedTeamId] = useState(null)
  const [currentPlayer, setCurrentPlayer] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(10)
  const [hasVotedSkip, setHasVotedSkip] = useState(false)
  const [auctionTab, setAuctionTab] = useState('activity') // activity, chat, trade
  const [lobbyTab, setLobbyTab] = useState('players') // players, chat, settings, trade
  const [incomingTrades, setIncomingTrades] = useState([])
  const [showTradeModal, setShowTradeModal] = useState(false)
  const [tradeTarget, setTradeTarget] = useState(null)
  const [myTradePlayer, setMyTradePlayer] = useState('')
  const [theirTradePlayer, setTheirTradePlayer] = useState('')
  const [tradeCash, setTradeCash] = useState(0)
  const [chatMsg, setChatMsg] = useState('')
  const [logs, setLogs] = useState([])
  const [chat, setChat] = useState([])
  const [copied, setCopied] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [auctionStats, setAuctionStats] = useState(null)
  const [statsTab, setStatsTab] = useState('upcoming')
  const [isJoining, setIsJoining] = useState(false)
  const feedRef = useRef(null)
  const chatRef = useRef(null)
  const [showSoldHammer, setShowSoldHammer] = useState(false)
  const placeBidRef = useRef(null)
  const [autoBidTarget, setAutoBidTarget] = useState('')
  const [autoBidMax, setAutoBidMax] = useState(0)
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('adminToken') || '')

  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const addLogObj = (logObj) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
    setLogs(prev => [...prev.slice(-100), { ...logObj, time, id }])
  }

  const addLog = (user, text, type = 'info') => {
    addLogObj({ user, text, type })
  }

  const addChat = (name, text, teamId, system = false) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
    setChat(prev => [...prev.slice(-100), { name, text, teamId, system, id }])
  }

  useEffect(() => {
    socket.on('room-created', (data) => {
      setRoom(data)
      setPhase('lobby')
      setTimeRemaining(data.timerDuration || 10)
      if (data?.adminToken) {
        localStorage.setItem('adminToken', data.adminToken)
        setAdminToken(data.adminToken)
      }
    })
    socket.on('room-joined', (data) => {
      setRoom(data)
      if (data.phase === 'results') {
        setPhase('results')
      } else {
        setPhase(data.phase === 'auction' ? 'auction' : 'lobby')
      }
      setTimeRemaining(data.timerDuration || 10)
      if (data.currentPlayer) setCurrentPlayer(data.currentPlayer)
      const myTeamFromRoom = data?.teams?.find(t => t.socketId === socket.id)
      if (myTeamFromRoom) setSelectedTeamId(myTeamFromRoom.id)
    })
    socket.on('state-update', (data) => {
      setRoom(prev => ({ ...prev, ...data }))
      if (data.phase === 'results') setPhase('results')
    })
    socket.on('player-update', (data) => {
      setRoom(prev => ({ ...prev, ...data }))
      setPhase('auction')
      setHasVotedSkip(false)
      setTimeRemaining(data.timerDuration || 10)
      if (data.currentPlayer) {
        setCurrentPlayer(data.currentPlayer)
        setAutoBidTarget('')
        setAutoBidMax(0)
        addLog('Auction', `Now bidding: ${data.currentPlayer.name}`, 'info')
      }
    })
    socket.on('bid-update', ({ currentBid, lastBidder, teamName }) => {
      setRoom(prev => ({ ...prev, currentBid, lastBidder }))
      addLog(teamName, `bid ₹${formatPrice(currentBid)}`, 'bid')
      playBidSound()
    })
    socket.on('timer-tick', ({ timeRemaining }) => setTimeRemaining(timeRemaining))
    socket.on('event-log', (logObj) => {
      if (logObj.type === 'player-sold') {
        setShowSoldHammer(true);
        playSoldSound();
        setTimeout(() => setShowSoldHammer(false), 2000);
      }
      addLogObj(logObj);
    })
    socket.on('skip-update', ({ skipVotes }) => setRoom(prev => ({ ...prev, skipVotes })))
    socket.on('user-joined', ({ userName: n }) => {
      addChat(n, 'joined', null, true)
      addLog(n, 'joined the room', 'info')
    })
    socket.on('chat-message', ({ name, text, teamId }) => addChat(name, text, teamId))
    socket.on('auction-stats', (data) => setAuctionStats(data))
    socket.on('trade-offered', (offer) => {
      setIncomingTrades(prev => {
        if (!offer?.id) return prev
        const exists = prev.some(t => t.id === offer.id)
        if (exists) return prev
        return [offer, ...prev].slice(0, 20)
      })
    })
    socket.on('trade-sent', () => {
      showToast('✅ Trade proposal sent! Waiting for response...', 'success')
    })
    socket.on('trade-resolved', ({ status, tradeId }) => {
      showToast(`🔔 Trade ${status.toUpperCase()}!`, status === 'accepted' ? 'success' : 'error')
      if (tradeId) {
        setIncomingTrades(prev => prev.filter(t => t.id !== tradeId))
      }
    })
    socket.on('error', (msg) => showToast(`⚠️ ${msg}`, 'error'))
  }, [])

  // Dynamic sound tick handler
  useEffect(() => {
    if (phase === 'auction' && !room?.isPaused && timeRemaining <= 3 && timeRemaining > 0) {
      playTickSound();
    }
  }, [timeRemaining, phase, room?.isPaused]);

  // Auto-fill the room code from `?room=...` and (if we have a saved name) auto-join.
  useEffect(() => {
    try {
      const storedName = localStorage.getItem('userName') || ''
      if (storedName) setUserName(storedName)
      const storedAdminToken = localStorage.getItem('adminToken') || ''
      if (storedAdminToken) setAdminToken(storedAdminToken)

      const params = new URLSearchParams(window.location.search)
      const roomFromUrl = params.get('room')
      if (!roomFromUrl) return

      const rid = roomFromUrl.trim().toUpperCase()
      if (!rid) return

      setIsJoining(true)
      setRoomInput(rid)

      const nameForJoin = (storedName || '').trim()
      if (nameForJoin) {
        socket.emit('join-room', { roomId: rid, userName: nameForJoin, adminToken: storedAdminToken || undefined })
      }
    } catch {
      // If URL parsing/localStorage fails, just fall back to manual join/create.
    }
  }, [])

  useEffect(() => {
    placeBidRef.current = placeBid;
  }) // no deps — runs after every render so ref is always fresh

  // Proxy Bidding Effect
  useEffect(() => {
    if (phase !== 'auction' || room?.isPaused) return;
    if (!currentPlayer || currentPlayer.name !== autoBidTarget) return;
    if (!autoBidTarget || !autoBidMax) return;
    if (room?.lastBidder === selectedTeamId) return; // already winning

    const nextBid = room.currentBid + getIncrement(room.currentBid);
    const myTeam = room?.teams?.find(t => t.id === selectedTeamId);
    
    // Check squad limits for proxy bid
    const isInd = (currentPlayer.nationality || '').toLowerCase().includes('indian') || (currentPlayer.country || '').toLowerCase() === 'india';
    const osCount = myTeam ? myTeam.players.filter(p => !((p.nationality || '').toLowerCase().includes('indian') || (p.country || '').toLowerCase() === 'india')).length : 0;
    
    if (nextBid <= autoBidMax && myTeam && myTeam.budget >= nextBid && myTeam.players.length < 25 && (isInd || osCount < 8)) {
      const delay = 600 + Math.random() * 600;
      const tid = setTimeout(() => {
        if (placeBidRef.current) placeBidRef.current();
      }, delay);
      return () => clearTimeout(tid);
    }
  }, [room?.currentBid, room?.lastBidder, autoBidTarget, autoBidMax, currentPlayer, phase, room?.isPaused, selectedTeamId, room?.teams]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (placeBidRef.current) placeBidRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  useEffect(() => {
    if (feedRef.current) {
      const el = feedRef.current.parentElement
      el.scrollTop = el.scrollHeight
    }
  }, [logs])
  useEffect(() => {
    if (chatRef.current) {
      const el = chatRef.current.parentElement
      el.scrollTop = el.scrollHeight
    }
  }, [chat])

  const myTeam = useMemo(() => room?.teams?.find(t => t.id === selectedTeamId), [room?.teams, selectedTeamId])
  const isAdmin = Boolean(adminToken) && room?.admin === socket.id

  /* ── ACTIONS ── */
  const createRoom = () => {
    if (!userName.trim()) return alert('Enter your name')
    localStorage.setItem('userName', userName.trim())
    // New room means new token (server will send one); clear stale host token
    localStorage.removeItem('adminToken')
    setAdminToken('')
    socket.emit('create-room', { adminName: userName, timerDuration })
  }
  const joinRoom = () => {
    if (!userName.trim() || !roomInput.trim()) return alert('Enter name and room code')
    localStorage.setItem('userName', userName.trim())
    socket.emit('join-room', { roomId: roomInput.trim().toUpperCase(), userName: userName.trim(), adminToken: adminToken || undefined })
  }
  const selectTeam = (team) => {
    if (!room) return
    const taken = room.teams?.some(t => t.id === team.id && t.socketId !== socket.id)
    if (taken) return
    setSelectedTeamId(team.id)
    socket.emit('select-team', { roomId: room.id, teamData: { ...team, budget: 12000, players: [] }, userName })
  }
  const startAuction = () => socket.emit('start-auction', { roomId: room.id, adminToken })
  const placeBid = () => {
    if (!myTeam || !currentPlayer) return
    const next = room.currentBid + getIncrement(room.currentBid)
    if (myTeam.budget < next) return alert('Not enough budget!')
    socket.emit('place-bid', { roomId: room.id, teamId: selectedTeamId, amount: next, teamName: myTeam.name })
  }
  const toggleSkip = () => {
    const v = !hasVotedSkip
    setHasVotedSkip(v)
    socket.emit('toggle-skip', { roomId: room.id, userId: socket.id, vote: v })
  }
  const pauseAuction = () => socket.emit('pause-auction', { roomId: room.id, adminToken })
  const resumeAuction = () => socket.emit('resume-auction', { roomId: room.id, adminToken })
  const endAuction = () => {
    if (window.confirm('Are you sure you want to END the auction?')) {
      socket.emit('end-auction', { roomId: room.id, adminToken })
    }
  }
  const openStats = () => {
    socket.emit('request-auction-stats', { roomId: room.id })
    setShowStats(true)
  }
  const sendChat = () => {
    if (!chatMsg.trim() || !room) return
    socket.emit('chat-message', { roomId: room.id, name: userName, text: chatMsg, teamId: selectedTeamId })
    setChatMsg('')
  }
  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/?room=${room?.id}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /* ── SCREEN: LANDING ── */
  if (phase === 'landing') {
    return (
      <div className="landing">
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        <div className="landing-card">
          <div className="landing-header">
            <button className={`landing-tab ${!isJoining ? 'active' : ''}`} onClick={() => { setIsJoining(false); setRoomInput(''); }}>New Game</button>
            <button className={`landing-tab ${isJoining ? 'active' : ''}`} onClick={() => setIsJoining(true)}>Join Room</button>
          </div>
          <div className="landing-body">
            <div className="field">
              <label>Your Name</label>
              <input
                value={userName} onChange={e => setUserName(e.target.value)}
                placeholder="e.g. Jiyan" onKeyDown={e => e.key === 'Enter' && (isJoining ? joinRoom() : createRoom())}
              />
            </div>
            {!isJoining ? (
              <div className="field">
                <label>Bidding Timer</label>
                <div className="timer-row">
                  {[5, 10, 15].map(t => (
                    <button key={t} className={`timer-btn ${timerDuration === t ? 'active' : ''}`} onClick={() => setTimerDuration(t)}>{t}s</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="field">
                <label>Room Code</label>
                <input
                  value={roomInput} onChange={e => setRoomInput(e.target.value.toUpperCase())}
                  placeholder="e.g. AB12CD"
                />
              </div>
            )}
            <button className="btn-primary" onClick={isJoining ? joinRoom : createRoom}>
              {isJoining ? '⚡ Join Room' : '⚡ Create Room'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── SCREEN: LOBBY ── */
  if (phase === 'lobby') {
    const inviteUrl = `${window.location.origin}/?room=${room?.id}`
    return (
      <div className="lobby">
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        <div className="lobby-top">
          <span>Room:</span>
          <span className="room-badge">{room?.id}</span>
        </div>

        {/* Invite */}
        <div className="section">
          <div className="section-title">👥 Invite Friends</div>
          <div className="invite-row">
            <input className="invite-input" value={inviteUrl} readOnly />
            <button className="icon-btn" onClick={copyLink} title="Copy">{copied ? '✅' : '📋'}</button>
            <button className="share-btn" onClick={copyLink}>🔗 Share</button>
          </div>
        </div>

        {/* Team Selection */}
        <div className="section">
          <div className="section-title">🏏 Select Your Team</div>
          <div className="teams-grid">
            {TEAMS.map(team => {
              const taken = room?.teams?.some(t => t.id === team.id && t.socketId !== socket.id)
              const isMine = selectedTeamId === team.id
              return (
                <div key={team.id} className={`team-orb ${taken ? 'taken' : ''} ${isMine ? 'active' : ''}`} onClick={() => selectTeam(team)}>
                  <div className="team-orb-circle" style={{ background: team.color }}>{team.initials}</div>
                  <div className="team-orb-name">{team.city}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Players/Chat/Settings Tabs */}
        <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="lobby-tabs">
            <button className={`lobby-tab ${lobbyTab === 'players' ? 'active' : ''}`} onClick={() => setLobbyTab('players')}>
              👤 Players <span className="lobby-tab-count">{room?.teams?.length || 0}/10</span>
            </button>
            <button className={`lobby-tab ${lobbyTab === 'chat' ? 'active' : ''}`} onClick={() => setLobbyTab('chat')}>
              💬 Chat
            </button>
            <button className={`lobby-tab ${lobbyTab === 'settings' ? 'active' : ''}`} onClick={() => setLobbyTab('settings')}>
              ⚙️ Settings
            </button>
          </div>

          {lobbyTab === 'players' && (
            <div className="chat-area">
              {(!room?.teams || room.teams.length === 0) && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', marginTop: '2rem' }}>No teams joined yet...</div>
              )}
              {room?.teams?.map(t => {
                const teamInfo = TEAMS.find(x => x.id === t.id)
                const isMe = t.id === selectedTeamId
                return (
                  <div key={t.id} className="chat-msg" style={{ padding: '0.5rem 0.75rem', background: isMe ? 'rgba(245,158,11,0.06)' : 'transparent', borderRadius: 8, border: isMe ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent' }}>
                    <div className="chat-avatar" style={{ borderColor: teamInfo?.color || '#555', background: teamInfo?.color || '#333', fontSize: '0.9rem' }}>
                      {teamInfo?.initials || t.id}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span className="chat-name" style={{ color: isMe ? 'var(--accent)' : 'var(--text)' }}>{t.name} {isMe ? '(You)' : ''}</span>
                      <span className="chat-text" style={{ display: 'block', fontSize: '0.7rem' }}>{t.city}</span>
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--green)', fontWeight: 700 }}>✓ Ready</span>
                  </div>
                )
              })}
              <div ref={chatRef} />
            </div>
          )}

          {lobbyTab === 'chat' && (
            <>
              <div className="chat-area">
                {chat.map(m => (
                  <div key={m.id} className="chat-msg">
                    {m.system ? (
                      <div className="chat-system">👤 <strong>{m.name}</strong> {m.text}</div>
                    ) : (
                      <>
                        <div className="chat-avatar"
                          style={{
                            borderColor: TEAMS.find(t => t.id === m.teamId)?.color || '#555',
                            background: TEAMS.find(t => t.id === m.teamId)?.color || '#333'
                          }}
                        >
                          {m.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <span className="chat-name">{m.name}</span>
                          <span className="chat-text">{m.text}</span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                <div ref={chatRef} />
              </div>
              <div className="chat-input-row">
                <input className="chat-input" value={chatMsg} onChange={e => setChatMsg(e.target.value)}
                  placeholder="Say something..." onKeyDown={e => e.key === 'Enter' && sendChat()} />
                <button className="chat-send" onClick={sendChat}>➤</button>
              </div>
            </>
          )}

          {lobbyTab === 'settings' && (
            <div style={{ padding: '1rem' }}>
              <div className="section-title">Settings</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Timer: <strong style={{ color: 'var(--accent)' }}>{room?.timerDuration || timerDuration}s</strong> per player</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.5rem' }}>Total players: <strong style={{ color: 'white' }}>{room?.totalPlayers || '—'}</strong></p>
            </div>
          )}
        </div>

        {isAdmin && (
          <>
            <button className="start-btn" onClick={startAuction} disabled={(room?.teams?.length || 0) < 1}>
              🏏 Start Auction
            </button>
            <div className="players-count">{room?.teams?.length || 0} team{room?.teams?.length !== 1 ? 's' : ''} ready · Waiting for more...</div>
          </>
        )}
        {!isAdmin && (
          <div className="players-count" style={{ marginTop: '1rem' }}>⏳ Waiting for host to start the auction...</div>
        )}
      </div>
    )
  }

  /* ── SCREEN: RESULTS ── */
  if (phase === 'results') {
    return (
      <div className="results-screen">
        <div className="results-title">🏆 Auction Complete!</div>
        
        {myTeam && (
          <button className="start-btn" style={{ marginBottom: '1.5rem', background: 'var(--blue)', color: 'white' }} onClick={() => setPhase('playing11')}>
            👕 Build Playing 11
          </button>
        )}

        {room?.teams?.map(t => {
          const teamInfo = TEAMS.find(x => x.id === t.id)
          return (
            <div key={t.id} className="result-team">
              <div className="result-team-header">
                <div className="result-orb" style={{ background: teamInfo?.color }}>
                  {t.initials || t.id}
                </div>
                <div className="result-team-name">{t.name}</div>
                <div className="result-budget">₹{formatPrice(t.budget)} left</div>
              </div>
              {t.players?.map((p, i) => (
                <div key={i} className="result-player">
                  <span className="result-player-name">{p.name}</span>
                  <span className="result-player-price">₹{formatPrice(p.soldPrice)}</span>
                </div>
              ))}
              {!t.players?.length && <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No players acquired</div>}
            </div>
          )
        })}
      </div>
    )
  }

  /* ── SCREEN: PLAYING 11 ── */
  if (phase === 'playing11') {
    return <Playing11Builder team={myTeam} goBack={() => setPhase('results')} />
  }

  /* ── SCREEN: LIVE AUCTION ── */
  const nextBidAmount = room ? room.currentBid + getIncrement(room.currentBid) : 0
  const skipCount = Object.values(room?.skipVotes || {}).filter(Boolean).length
  const isDanger = timeRemaining <= 3
  const timerPct = ((timeRemaining / (room?.timerDuration || 10)) * 100).toFixed(1)
  const lastBidderTeam = room?.teams?.find(t => t.id === room?.lastBidder)
  const isPaused = room?.isPaused || false

  const POOL_LABELS = { BAT: 'Batsmen', PACE: 'Pacers', SPIN: 'Spinners', AR: 'All-Rounders', WK: 'Wicket-Keepers' }
  const POOL_CODES = { BAT: 'BA', PACE: 'PA', SPIN: 'SP', AR: 'AL', WK: 'WK' }
  const POOL_COLORS = { BAT: '#10b981', PACE: '#ef4444', SPIN: '#a855f7', AR: '#f59e0b', WK: '#3b82f6' }
  const myTeamInfo = TEAMS.find(t => t.id === selectedTeamId)

  return (
    <div className="auction-root">
      {/* Toast notification */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
      )}
      {showSoldHammer && (
        <div className="hammer-overlay">
          <div className="hammer-box">
            <span className="hammer-icon">🔨</span>
            <div className="hammer-text">SOLD!</div>
          </div>
        </div>
      )}
      {/* Team flag background */}
      {myTeamInfo && (
        <div className="team-bg-flag">{myTeamInfo.flag}</div>
      )}

      {/* Top bar */}
      <div className="auction-topbar">
        <span className="topbar-room">Room: <span>{room?.id}</span></span>
        <span className="topbar-players-count">👥 {room?.teams?.length || 0}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.375rem' }}>
          {isAdmin && room?.phase === 'auction' && (
            isPaused
              ? <button className="topbar-btn resume" onClick={resumeAuction}>▶ Resume</button>
              : <button className="topbar-btn pause" onClick={pauseAuction}>⏸ Pause</button>
          )}
          {isAdmin && room?.phase === 'auction' && (
            <button className="topbar-btn" style={{ color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }} onClick={endAuction}>🛑 End</button>
          )}
        </div>
      </div>

        {showTradeModal && (
          <div className="modal-overlay" onClick={() => setShowTradeModal(false)}>
            <div className="modal-content trade-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>🤝 Propose Trade</h3>
                <button className="close-btn" onClick={() => setShowTradeModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="field">
                  <label>Select Target Team</label>
                  <select value={tradeTarget || ''} onChange={e => setTradeTarget(e.target.value)}>
                    <option value="">-- Select Team --</option>
                    {room?.teams?.filter(t => t.id !== selectedTeamId).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div className="trade-grid">
                  <div className="trade-col">
                    <label>You Give</label>
                    <select value={myTradePlayer} onChange={e => setMyTradePlayer(e.target.value)}>
                      <option value="">-- None --</option>
                      {myTeam?.players?.map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="trade-col">
                    <label>You Receive</label>
                    <select value={theirTradePlayer} onChange={e => setTheirTradePlayer(e.target.value)}>
                      <option value="">-- None --</option>
                      {room?.teams?.find(t => t.id === tradeTarget)?.players?.map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label>Cash Adjustment (₹ Lakhs)</label>
                  <p className="field-desc">Positive = You pay them, Negative = They pay you</p>
                  <input 
                    type="number" 
                    value={tradeCash} 
                    onChange={e => setTradeCash(parseInt(e.target.value) || 0)}
                    placeholder="e.g. 500 for 5 Cr"
                  />
                </div>
                
                <button 
                  className="trade-send-btn" 
                  style={{ width: '100%', marginTop: '1rem' }}
                  disabled={!tradeTarget || (!myTradePlayer && !theirTradePlayer && tradeCash === 0)}
                  onClick={() => {
                    socket.emit('propose-trade', {
                      roomId: room.id,
                      targetTeamId: tradeTarget,
                      myPlayerId: myTradePlayer,
                      targetPlayerId: theirTradePlayer,
                      cashOffset: tradeCash
                    })
                    setShowTradeModal(false)
                  }}
                >
                  🚀 Send Proposal
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Player Bar */}
      {currentPlayer && (
        <div className="player-bar">
          {/* Timer strip */}
          <div
            className={`timer-strip ${isDanger ? 'danger' : ''} ${isPaused ? 'paused' : ''}`}
            style={{ width: `${timerPct}%`, marginBottom: '0.75rem', borderRadius: 4 }}
          />
          <div className="player-bar-inner">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                <span className={getRoleBadgeClass(currentPlayer.role)}>{currentPlayer.role}</span>
                <span className={currentPlayer.nationality === 'Overseas' ? 'badge-os' : 'badge-ind'}>
                  {currentPlayer.nationality === 'Overseas' ? '✈️ OS' : '🇮🇳 IND'}
                </span>
                {isPaused && <span className="badge-paused">PAUSED</span>}
              </div>
              <div className="player-name">{currentPlayer.name}</div>
              <div className="player-country">{currentPlayer.country || 'India'}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.375rem' }}>
              <div className={`timer-bubble ${isDanger ? 'danger' : ''} ${isDanger ? 'animate-pulse' : ''} ${isPaused ? 'paused-bubble' : ''}`}>
                {isPaused ? '⏸' : timeRemaining}
              </div>
              <div className="bid-info">
                <div className="bid-label">BID</div>
                <div className="bid-amount">₹{formatPrice(room?.currentBid || currentPlayer.basePrice)}</div>
                {lastBidderTeam && (
                  <div className="last-bidder-chip">
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: lastBidderTeam.color }} />
                    {lastBidderTeam.id}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bid Section */}
      <div className="bid-section">
        <div className="purse-row">
          <span className="purse-label">Purse: <strong style={{ color: 'var(--accent)' }}>₹{myTeam ? formatPrice(myTeam.budget) : '—'}</strong></span>
          {currentPlayer && <span className="purse-label">Base: ₹{formatPrice(currentPlayer.basePrice)}</span>}
        </div>

        {myTeam && currentPlayer && room?.phase === 'auction' && (
          <div className="autobid-panel">
             <div className="autobid-header">
               <span className="autobid-title">🤖 Proxy Auto-Bid</span>
               {autoBidTarget === currentPlayer.name && autoBidMax > 0 && (
                 <span className="autobid-status animate-pulse">ACTIVE</span>
               )}
             </div>
             <div className="autobid-body">
               <input type="number" 
                      className="autobid-input"
                      placeholder="Enter max limit in ₹ Lakhs..." 
                      onChange={e => {
                         const val = parseInt(e.target.value) || 0;
                         setAutoBidMax(val);
                         if (val > 0 && currentPlayer) {
                           setAutoBidTarget(currentPlayer.name);
                         } else {
                           setAutoBidTarget('');
                         }
                      }} 
                      value={autoBidMax > 0 ? autoBidMax : ''} />
             </div>
          </div>
        )}

        {(() => {
          const isSquadFull = myTeam && myTeam.players?.length >= 25;
          const isInd = (currentPlayer?.nationality || '').toLowerCase().includes('indian') || (currentPlayer?.country || '').toLowerCase() === 'india';
          const osCount = myTeam ? myTeam.players?.filter(p => !((p.nationality || '').toLowerCase().includes('indian') || (p.country || '').toLowerCase() === 'india')).length : 0;
          const isOsFull = myTeam && !isInd && osCount >= 8;
          const disabledReason = isSquadFull ? '🚫 SQUAD FULL (25/25)' : isOsFull ? '🚫 OS LIMIT REACHED' : null;

          return (
            <button 
              className={`big-bid-btn premium ${room?.lastBidder === selectedTeamId ? 'holding' : ''}`} 
              onClick={placeBid} 
              disabled={!selectedTeamId || !currentPlayer || isPaused || room?.lastBidder === selectedTeamId || disabledReason}
            >
              {isPaused ? '⏸ PAUSED' : 
               disabledReason ? disabledReason :
               room?.lastBidder === selectedTeamId ? '✋ HIGHEST BIDDER' :
               `BID (+${getIncrement(room?.currentBid || 0)}L) → ₹${formatPrice(nextBidAmount)}`}
            </button>
          )
        })()}

        <div className="bid-actions-row">
          <button
            className={`skip-btn ${hasVotedSkip ? 'voted' : ''}`}
            onClick={toggleSkip}
            disabled={!selectedTeamId || !currentPlayer || isPaused || !room?.teams?.length}
          >
            ⏭ Skip ({skipCount}/{room?.teams?.length || 0})
          </button>
          <button className="stats-btn" style={{flex: 1}} onClick={openStats}>📊 Players Pool</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="auction-tabs">
        {[
          { id: 'activity', label: '📋 Activity', badge: logs.length },
          { id: 'squad', label: '🏟️ Squad', badge: myTeam?.players?.length || 0 },
          { id: 'community', label: '👥 Community', badge: room?.teams?.length || 0 },
          { id: 'trade', label: '🤝 Trade', badge: incomingTrades.filter(t => t.targetTeamId === selectedTeamId).length ? 1 : 0 },
          { id: 'settings', label: '⚙️ Settings' },
        ].map(tab => (
          <button key={tab.id} className={`auction-tab ${auctionTab === tab.id ? 'active' : ''}`} onClick={() => setAuctionTab(tab.id)}>
            {tab.label}
            {tab.badge ? <span className="auction-tab-badge">{tab.badge}</span> : null}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="tab-content">

        {auctionTab === 'activity' && (
          <div className="activity-feed">
            {/* Stats of the current player */}
            {currentPlayer?.stats && (
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.75rem', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Player Stats</div>
                <div className="stats-grid">
                  {Object.entries(currentPlayer.stats)
                    .filter(([k, v]) => v !== null && v !== undefined && v !== '' && v !== 0 && k !== 'id')
                    .map(([k, v]) => (
                      <div key={k} className="stat-card">
                        <span className="stat-val">{v}</span>
                        <span className="stat-key">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            {logs.map(l => {
              if (l.type === 'player-sold') {
                const tInfo = TEAMS.find(x => x.id === l.teamId)
                let roleIcon = '🏏'
                if (l.role === 'Bowler' || l.role === 'Pacer' || l.role === 'Spinner') roleIcon = '🎯'
                if (l.role === 'Wicket-Keeper') roleIcon = '🧤'
                if (l.role === 'All-Rounder') roleIcon = '🔄'

                return (
                  <div key={l.id} className="feed-sold-card">
                    <div className="fsc-header">
                      <div className="fsc-avatar" style={{ background: tInfo?.color || '#333' }}>
                        {tInfo?.initials || l.teamId}
                      </div>
                      <div className="fsc-buyer">
                        <span className="fsc-buyer-name">{l.buyerName} ({l.teamId})</span>
                        <span className="fsc-team-badge" style={{ background: tInfo?.color || '#333' }}>{l.teamName}</span>
                      </div>
                    </div>
                    <div className="fsc-body">
                      <div className="fsc-player">
                        <span className="fsc-role-icon">{roleIcon}</span>
                        <span className="fsc-player-name">{l.playerName}</span>
                        <span className="fsc-arrow">→</span>
                        <span className="fsc-price">₹{formatPrice(l.price)}</span>
                      </div>
                      <div className="fsc-sold-badge">🏆 SOLD</div>
                    </div>
                    <div className="fsc-footer">
                      ❤️ {l.playerName} joins the {l.teamName} family!
                    </div>
                  </div>
                )
              }
              return (
                <div key={l.id} className={`feed-item ${l.type}`}>
                  <div className={`feed-dot ${l.type}`} />
                  <div style={{ flex: 1 }}>
                    {l.user && <strong>{l.user}</strong>} <span className="feed-text">{l.text}</span>
                  </div>
                  <span className="feed-time">{l.time}</span>
                </div>
              )
            })}
            <div ref={feedRef} />
          </div>
        )}

        {auctionTab === 'squad' && (
          <div className="squad-panel">
            {room?.teams?.map(t => {
              const teamInfo = TEAMS.find(x => x.id === t.id)
              const isMe = t.id === selectedTeamId
              return (
                <div key={t.id} className="squad-team" style={{ opacity: isMe ? 1 : 0.6 }}>
                  <div className="squad-orb" style={{ background: teamInfo?.color }}>{t.initials || t.id}</div>
                  <div className="squad-info">
                    <div className="squad-name">{t.name} {isMe ? '(You)' : ''}</div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <div className="squad-budget">₹{formatPrice(t.budget)} left</div>
                      <div className="squad-count">{t.players?.length || 0} players</div>
                    </div>
                  </div>
                  <span className="squad-chevron">›</span>
                </div>
              )
            })}
            {myTeam?.players?.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.625rem' }}>Your Squad</div>
                {myTeam.players.map((p, i) => (
                  <div key={i} className="result-player" style={{ padding: '0.5rem 0' }}>
                    <span className="result-player-name">{p.name}</span>
                    <span className="result-player-price">₹{formatPrice(p.soldPrice)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {auctionTab === 'community' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="chat-area" style={{ flex: 1 }}>
              {chat.map(m => (
                <div key={m.id} className="chat-msg">
                  {m.system ? (
                    <div className="chat-system">👤 <strong>{m.name}</strong> {m.text}</div>
                  ) : (
                    <>
                      <div className="chat-avatar"
                        style={{
                          borderColor: TEAMS.find(t => t.id === m.teamId)?.color || '#555',
                          background: TEAMS.find(t => t.id === m.teamId)?.color || '#333'
                        }}
                      >
                        {m.name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <span className="chat-name">{m.name} </span>
                        <span className="chat-text">{m.text}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
              <div ref={chatRef} />
            </div>
            <div className="chat-input-row">
              <input className="chat-input" value={chatMsg} onChange={e => setChatMsg(e.target.value)}
                placeholder="Say something..." onKeyDown={e => e.key === 'Enter' && sendChat()} />
              <button className="chat-send" onClick={sendChat}>➤</button>
            </div>
          </div>
        )}

        {auctionTab === 'trade' && (
          <div className="trade-area">
            <div className="trade-section">
              <div className="trade-section-title">Incoming Proposals</div>
              {incomingTrades.filter(t => t.targetTeamId === selectedTeamId).length ? (
                incomingTrades
                  .filter(t => t.targetTeamId === selectedTeamId)
                  .map(t => (
                    <div key={t.id} className="trade-card">
                      <div className="trade-card-header">{t.proposerName} wants to trade</div>
                      <div className="trade-details">
                        {t.targetPlayerId && <div>They want your: <strong style={{color: '#fca5a5'}}>{t.targetPlayerId}</strong></div>}
                        {t.myPlayerId && <div>They offer you: <strong style={{color: '#6ee7b7'}}>{t.myPlayerId}</strong></div>}
                        {t.cashOffset !== 0 && (
                          <div className={t.cashOffset > 0 ? 'text-negative' : 'text-positive'} style={{marginTop: '4px', fontWeight: 'bold'}}>
                            Cash: {t.cashOffset > 0 ? `You receive ₹${t.cashOffset}L` : `You pay ₹${Math.abs(t.cashOffset)}L`}
                          </div>
                        )}
                      </div>
                      <div className="trade-actions">
                        <button className="trade-accept-btn" onClick={() => {
                          socket.emit('respond-trade', { roomId: room.id, tradeId: t.id, action: 'accept' })
                          setIncomingTrades(prev => prev.filter(x => x.id !== t.id))
                        }}>Accept Trade</button>
                        <button className="trade-decline-btn" onClick={() => {
                          socket.emit('respond-trade', { roomId: room.id, tradeId: t.id, action: 'decline' })
                          setIncomingTrades(prev => prev.filter(x => x.id !== t.id))
                        }}>Decline</button>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="empty-state" style={{color: 'var(--text-muted)'}}>No active proposals</div>
              )}
            </div>

            <div className="trade-section" style={{ marginTop: 'auto' }}>
              <button className="trade-initiate-btn" style={{ width: '100%' }} onClick={() => setShowTradeModal(true)}>Initiate New Trade 🤝</button>
            </div>
          </div>
        )}

        {auctionTab === 'settings' && (
          <div style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Auction Info</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Timer: <strong style={{ color: 'var(--accent)' }}>{room?.timerDuration}s</strong></p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Total Players: <strong style={{ color: 'white' }}>{room?.totalPlayers || '—'}</strong></p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Unsold Queue: <strong style={{ color: 'white' }}>{room?.totalUnsold || 0}</strong></p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>Round: <strong style={{ color: 'white' }}>{room?.isUnsoldRound ? 'Unsold Re-auction' : 'Main Auction'}</strong></p>

            {isAdmin && (
                <div className="settings-group">
                  <div className="settings-label">Admin Controls</div>
                  <div className="btn-group">
                    {room?.isPaused ? (
                      <button className="btn-success" style={{ flex: 1 }} onClick={resumeAuction}>▶ Resume Auction</button>
                    ) : (
                      <button className="btn-warning" style={{ flex: 1 }} onClick={pauseAuction}>⏸ Pause Auction</button>
                    )}
                    <button className="btn-danger" style={{ flex: 1 }} onClick={endAuction}>🛑 End Auction</button>
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Auction Stats Modal */}
      {showStats && (
        <div className="stats-overlay" onClick={() => setShowStats(false)}>
          <div className="stats-modal" onClick={e => e.stopPropagation()}>
            <div className="stats-modal-header">
              <div className="stats-modal-title">📊 Auction Stats</div>
              <button className="stats-close" onClick={() => setShowStats(false)}>✕</button>
            </div>

            <div className="stats-tabs">
              {[{ id: 'upcoming', label: '⏳ Upcoming', count: auctionStats?.totalUpcoming },
                { id: 'sold', label: '✅ Sold', count: auctionStats?.totalSold },
                { id: 'unsold', label: '❌ Unsold', count: auctionStats?.totalUnsold },
              ].map(t => (
                <button key={t.id} className={`stats-tab ${statsTab === t.id ? 'active' : ''}`}
                  onClick={() => setStatsTab(t.id)}>
                  {t.label} <span className="stats-tab-count">{t.count || 0}</span>
                </button>
              ))}
            </div>

            <div className="stats-body">
              {statsTab === 'upcoming' && (auctionStats?.tierGroups || auctionStats?.upcoming) && (
                <>
                  <div className="pool-notice">
                    Upcoming players are grouped into professional sets and shuffled as requested.
                  </div>
                  {(() => {
                    // 1. Get or Create Tier Groups
                    let groups = [];
                    if (Array.isArray(auctionStats.tierGroups)) {
                      groups = auctionStats.tierGroups;
                    } else if (auctionStats.tierGroups && typeof auctionStats.tierGroups === 'object') {
                      groups = Object.entries(auctionStats.tierGroups).map(([name, players]) => ({ name, players }));
                    } else if (Array.isArray(auctionStats.upcoming)) {
                      // Fallback: Group on client if server hasn't sent tierGroups yet
                      const getTier = (p) => {
                        const bp = p.basePrice || 0;
                        const role = (p.role || '').toLowerCase();
                        const isInd = (p.nationality || '').toLowerCase().includes('indian') || (p.country || '').toLowerCase() === 'india';
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
                        if (role.includes('bat')) return `🏏 Classic Bat (${nat})`;
                        return `🎯 Classic Bowl (${nat})`;
                      };
                      const map = {};
                      auctionStats.upcoming.forEach(p => {
                        const t = getTier(p);
                        if (!map[t]) map[t] = [];
                        map[t].push(p);
                      });
                      groups = Object.entries(map).map(([name, players]) => ({ name, players }));
                      // Priority Sort
                      const prio = (n) => n.includes('🔥') ? 1 : n.includes('💎') ? 2 : n.includes('⭐') ? 3 : 4;
                      groups.sort((a,b) => prio(a.name) - prio(b.name));
                    }
                    
                    if (groups.length === 0) return <div className="stats-empty">No upcoming players available</div>

                    return groups.map((tg, i) => {
                      if (!tg.players || tg.players.length === 0) return null
                      const tierName = tg.name || 'Other'
                      return (
                        <div key={`${tierName}-${i}`} className="pool-section" style={{ borderLeft: `3px solid ${tierName.includes('🔥') ? '#ef4444' : tierName.includes('💎') ? '#a855f7' : tierName.includes('⭐') ? '#f59e0b' : '#3b82f6'}`, paddingLeft: '0.75rem' }}>
                          <div className="pool-header">
                            <span className="pool-label" style={{ fontSize: '0.9rem', letterSpacing: '0.5px' }}>{tierName}</span>
                            <span className="pool-count">{tg.players.length} players</span>
                          </div>
                          <div className="pool-grid">
                            {tg.players.map((p, j) => {
                              const isInd = (p.nationality || '').toLowerCase().includes('indian') || (p.country || '').toLowerCase() === 'india'
                              return (
                                <div key={`${p.name || j}-${j}`} className="pool-card">
                                  <div className="pool-card-name">{p.name || 'Unknown Player'}</div>
                                  <div className="pool-card-meta">
                                    <span className={getRoleBadgeClass(p.role)}>{p.role}</span>
                                    <span className={isInd ? 'badge-ind' : 'badge-os'}>
                                      {isInd ? '🇮🇳 IND' : '✈️ OS'}
                                    </span>
                                  </div>
                                  <div className="pool-card-price">₹{formatPrice(p.basePrice)}
                                    <span className="pool-card-base">Base</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </>
              )}

              {statsTab === 'sold' && (
                <div className="sold-list">
                  {(!auctionStats?.sold || auctionStats.sold.length === 0) && (
                    <div className="stats-empty">No players sold yet</div>
                  )}
                  {auctionStats?.sold?.map((p, i) => (
                    <div key={i} className="sold-item">
                      <div>
                        <div className="sold-name">{p.name}</div>
                        <div className="sold-meta">
                          <span className={getRoleBadgeClass(p.role)}>{p.role}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>→ {p.soldTo}</span>
                        </div>
                      </div>
                      <div className="sold-price">₹{formatPrice(p.soldPrice)}</div>
                    </div>
                  ))}
                </div>
              )}

              {statsTab === 'unsold' && (
                <div className="sold-list">
                  {(!auctionStats?.unsold || auctionStats.unsold.length === 0) && (
                    <div className="stats-empty">No unsold players yet</div>
                  )}
                  {auctionStats?.unsold?.map((p, i) => (
                    <div key={i} className="sold-item">
                      <div>
                        <div className="sold-name">{p.name}</div>
                        <div className="sold-meta">
                          <span className={getRoleBadgeClass(p.role)}>{p.role}</span>
                        </div>
                      </div>
                      <div className="sold-price" style={{ color: 'var(--red)' }}>₹{formatPrice(p.basePrice)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Playing11Builder({ team, goBack }) {
  const [squad, setSquad] = useState(team?.players || []);
  const [playing11, setPlaying11] = useState([]);

  const handleDragStart = (e, player, from) => {
    e.dataTransfer.setData('player', JSON.stringify(player));
    e.dataTransfer.setData('from', from);
  };

  const handleDrop = (e, to) => {
    e.preventDefault();
    const playerStr = e.dataTransfer.getData('player');
    const from = e.dataTransfer.getData('from');
    if (!playerStr || from === to) return;

    const p = JSON.parse(playerStr);
    
    if (to === 'playing11' && playing11.length >= 11) return alert('Max 11 players allowed in Playing 11!');

    if (from === 'squad') setSquad(prev => prev.filter(x => x.name !== p.name));
    if (from === 'playing11') setPlaying11(prev => prev.filter(x => x.name !== p.name));

    if (to === 'squad') setSquad(prev => [...prev, p]);
    if (to === 'playing11') setPlaying11(prev => [...prev, p]);
  };

  const isInd = (p) => (p.nationality || '').toLowerCase().includes('indian') || (p.country || '').toLowerCase() === 'india';
  const osCount = playing11.filter(p => !isInd(p)).length;

  return (
    <div className="p11-root">
       <div className="p11-topbar">
         <button className="topbar-btn resume" onClick={goBack}>← Back to Results</button>
         <div className="p11-title">{team?.name} - Playing 11</div>
         <div className="p11-stats">
           <span>{playing11.length}/11 Players</span>
           <span className={osCount > 8 ? 'text-negative' : ''} style={{ marginLeft: '1rem' }}>OS: {osCount}/8</span>
         </div>
       </div>

       <div className="p11-container">
         <div 
           className="p11-zone p11-squad"
           onDragOver={e => e.preventDefault()}
           onDrop={e => handleDrop(e, 'squad')}
         >
           <h3 className="p11-zone-title">Bench ({squad.length})</h3>
           <div className="p11-list">
             {squad.map(p => (
               <div key={p.name} draggable onDragStart={e => handleDragStart(e, p, 'squad')} className="p11-card">
                  <span className={getRoleBadgeClass(p.role)}>{p.role}</span>
                  <span className="p11-name" style={{ marginLeft: '0.5rem' }}>{p.name}</span>
               </div>
             ))}
             {squad.length === 0 && <div className="p11-empty">No players on bench</div>}
           </div>
         </div>

         <div 
           className="p11-zone p11-pitch-area"
           onDragOver={e => e.preventDefault()}
           onDrop={e => handleDrop(e, 'playing11')}
         >
           <h3 className="p11-zone-title">Playing 11 Pitch</h3>
           <div className="cricket-pitch">
             {playing11.map((p, i) => (
               <div key={p.name} draggable onDragStart={e => handleDragStart(e, p, 'playing11')} className="p11-card pitch-card">
                  <div className="p-num">{i+1}</div>
                  <div className="p11-info">
                    <span className={getRoleBadgeClass(p.role)}>{p.role}</span>
                    <span className="p11-name" style={{ color: 'black', marginLeft: '0.25rem' }}>{p.name}</span>
                  </div>
               </div>
             ))}
             {playing11.length === 0 && <div className="pitch-empty">Drag players here to build your playing 11</div>}
             <div className="pitch-lines"></div>
             <div className="pitch-circle"></div>
           </div>
         </div>
       </div>
    </div>
  )
}

export default App
