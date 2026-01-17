import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import bot from './bot.js';
import { getInviteUrl } from './utils/notifications.js';
import mongoose from 'mongoose';
import { proxyUrl, proxyAgent } from './utils/proxyAgent.js';
import http from 'http';
import { initSocket } from './socket.js';
import { GameRoomManager } from './gameEngine.js';
import miningRoutes from './routes/mining.js';
import tasksRoutes from './routes/tasks.js';
import watchRoutes from './routes/watch.js';
import referralRoutes from './routes/referral.js';
import walletRoutes from './routes/wallet.js';
import accountRoutes from './routes/account.js';
import profileRoutes from './routes/profile.js';
import twitterAuthRoutes from './routes/twitterAuth.js';
import airdropRoutes from './routes/airdrop.js';
import checkinRoutes from './routes/checkin.js';
import socialRoutes from './routes/social.js';
import broadcastRoutes from './routes/broadcast.js';
import storeRoutes, { BUNDLES } from './routes/store.js';
import adsRoutes from './routes/ads.js';
import influencerRoutes from './routes/influencer.js';
import onlineRoutes from './routes/online.js';
import poolRoyaleRoutes from './routes/poolRoyale.js';
import snookerRoyaleRoutes from './routes/snookerRoyal.js';
import pushRoutes from './routes/push.js';
import User from './models/User.js';
import GameResult from './models/GameResult.js';
import AdView from './models/AdView.js';
import Airdrop from './models/Airdrop.js';
import BurnedTPC from './models/BurnedTPC.js';
import FriendRequest from './models/FriendRequest.js';
import GameRoom from './models/GameRoom.js';
import InfluencerTask from './models/InfluencerTask.js';
import Message from './models/Message.js';
import Post from './models/Post.js';
import PostRecord from './models/PostRecord.js';
import Task from './models/Task.js';
import WatchRecord from './models/WatchRecord.js';
import ActiveConnection from './models/ActiveConnection.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import rateLimit from 'express-rate-limit';
import {
  registerConnection,
  removeConnection,
  countOnline,
  listOnline
} from './services/connectionService.js';

const CHESS_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1';
const chessGames = new Map();

function logFatal(event, err) {
  const message = err?.stack || err?.message || String(err);
  console.error(`[${new Date().toISOString()}] Unhandled ${event}:`, message);
}

process.on('unhandledRejection', (reason) => logFatal('rejection', reason));
process.on('uncaughtException', (err) => {
  logFatal('exception', err);
});

const models = [
  AdView,
  Airdrop,
  BurnedTPC,
  FriendRequest,
  GameResult,
  GameRoom,
  InfluencerTask,
  Message,
  Post,
  PostRecord,
  Task,
  User,
  WatchRecord,
  ActiveConnection
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (proxyUrl) {
  console.log(`Using HTTPS proxy ${proxyUrl}`);
}

if (!process.env.MONGO_URI) {
  if (process.env.NODE_ENV === 'production') {
    console.error('MONGO_URI is required in production');
    process.exit(1);
  }
  process.env.MONGO_URI = 'memory';
  console.log('MONGO_URI not set, defaulting to in-memory MongoDB');
}

const PORT = process.env.PORT || 3000;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')

  .split(',')

  .map((o) => o.trim())

  .filter(Boolean);

const rateLimitWindowMs =
  Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;

const rateLimitMax = Number(process.env.RATE_LIMIT_MAX) || 100;
const app = express();
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : '*' }));
const httpServer = http.createServer(app);
const io = initSocket(httpServer, {
  cors: { origin: allowedOrigins.length ? allowedOrigins : '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000
});
const gameManager = new GameRoomManager(io);

// Expose socket.io instance and userSockets map for routes
app.set('io', io);

bot.action(/^reject_invite:(.+)/, async (ctx) => {
  const [roomId] = ctx.match[1].split(':');
  await ctx.answerCbQuery('Invite rejected');
  try {
    await ctx.deleteMessage();
  } catch {}
  pendingInvites.delete(roomId);
});

// Middleware and routes
// Increase JSON body limit to handle large photo uploads
app.use(express.json({ limit: '10mb' }));
const apiLimiter = rateLimit({
  windowMs: rateLimitWindowMs,
  limit: rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', apiLimiter);
app.use('/api/mining', miningRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/watch', watchRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/influencer', influencerRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/push', pushRoutes);
if (process.env.ENABLE_TWITTER_OAUTH === 'true') {
  app.use('/api/twitter', twitterAuthRoutes);
           
app.use('/api/airdrop', airdropRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/broadcast', broadcastRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/online', onlineRoutes);
app.use('/api/pool-royale', poolRoyaleRoutes);
app.use('/api/snooker-royale', snookerRoyaleRoutes);

app.post('/api/goal-rush/calibration', (req, res) => {
  const { accountId, calibration } = req.body || {};
  const devAccounts = [
    process.env.DEV_ACCOUNT_ID || process.env.VITE_DEV_ACCOUNT_ID,
    process.env.DEV_ACCOUNT_ID_1 || process.env.VITE_DEV_ACCOUNT_ID_1,
    process.env.DEV_ACCOUNT_ID_2 || process.env.VITE_DEV_ACCOUNT_ID_2
  ].filter(Boolean);
  if (
    devAccounts.length &&
    (!accountId || !devAccounts.includes(accountId))
  ) {
    return res.status(403).json({ error: 'unauthorized' });
  }
  if (!calibration || typeof calibration !== 'object') {
    return res.status(400).json({ error: 'invalid calibration' });
  }
  try {
    const data = JSON.stringify(calibration, null, 2);
    const pubPath = path.join(
      __dirname,
      '../webapp/public/goal-rush-calibration.json'
    );
    writeFileSync(pubPath, data);
    try {
      const distPath = path.join(
        __dirname,
        '../webapp/dist/goal-rush-calibration.json'
      );
      writeFileSync(distPath, data);
    } catch {}
    res.json({ ok: true });
  } catch (err) {
    console.error('save calibration failed:', err.message);
    res.status(500).json({ error: 'failed to save calibration' });
  }
});

// Serve the built React app
const webappPath = path.join(__dirname, '../webapp/dist');
const versionFilePath = path.join(webappPath, 'version.json');
const sourceVersionPath = path.join(__dirname, '../webapp/public/version.json');

function loadWebappVersion() {
  const fallbackBuild = process.env.APP_BUILD || 'dev';
  const candidates = [versionFilePath, sourceVersionPath];
  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
        return {
          build: parsed.build || fallbackBuild,
          generatedAt: parsed.generatedAt || null
        };
      } catch (err) {
        console.warn(`Failed to read ${path.basename(filePath)}:`, err.message);
      }
    }
  }
  return { build: fallbackBuild, generatedAt: null };
}

function ensureWebappBuilt() {
  if (process.env.SKIP_WEBAPP_BUILD) {
    console.log('Skipping webapp build');
    return true;
  }
  if (
    existsSync(path.join(webappPath, 'index.html')) &&
    existsSync(path.join(webappPath, 'assets'))
  ) {
    return true;
  }
  try {
    console.log('Building webapp...');
    const webappDir = path.join(__dirname, '../webapp');
    execSync('npm install', { cwd: webappDir, stdio: 'inherit' });

    const apiBase = process.env.WEBAPP_API_BASE_URL || '';
    const displayBase = apiBase || '(same origin)';
    console.log(`Using API base URL ${displayBase} for webapp build`);

    execSync('npm run build', {
      cwd: webappDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_API_BASE_URL: apiBase
      }
    });

    return existsSync(path.join(webappPath, 'index.html'));
  } catch (err) {
    console.error('Failed to build webapp:', err.message);
    return false;
  }
}

ensureWebappBuilt();

app.use(express.static(webappPath, { maxAge: '1y', immutable: true }));

function sendIndex(res) {
  if (ensureWebappBuilt()) {
    res.sendFile(path.join(webappPath, 'index.html'));
  } else {
    res.status(503).send('Webapp build not available');
  }
  if (process.env.SKIP_BOT_LAUNCH !== '1') launchBotWithDelay();
  else console.log('Skipping Telegram bot launch');
}

let botLaunchTriggered = false;
function launchBotWithDelay() {
  if (botLaunchTriggered) return;
  botLaunchTriggered = true;
  if (!process.env.BOT_TOKEN || process.env.BOT_TOKEN === 'dummy') {
    console.log('BOT_TOKEN not configured. Attempting to launch bot anyway');
  }
  setTimeout(async () => {
    try {
      // Ensure no lingering webhook is configured when using polling
      try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      } catch (err) {
        console.error('Failed to delete existing webhook:', err.message);
      }
      await bot.launch({ dropPendingUpdates: true });
    } catch (err) {
      console.error('Failed to launch Telegram bot:', err.message);
    }
  }, 5000);
}

if (process.env.SKIP_BOT_LAUNCH !== '1') launchBotWithDelay();
else console.log('Skipping Telegram bot launch');

app.get('/', (req, res) => {
  sendIndex(res);
});
app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});
app.get('/api/version', (req, res) => {
  res.json(loadWebappVersion());
});

const tableSeats = new Map();
const tables = new Map();
const userSockets = new Map();
const pendingInvites = new Map();

app.set('userSockets', userSockets);

const tableWatchers = new Map();
// Dynamic lobby tables grouped by game type and capacity
const lobbyTables = {};
const tableMap = new Map();
const poolStates = new Map();
const snookerStates = new Map();
const BUNDLE_TON_MAP = Object.fromEntries(
  Object.values(BUNDLES).map((b) => [b.label, b.ton])
);

const lastActionBySocket = new Map();
const rollRateLimitMs = Number(process.env.SOCKET_ROLL_COOLDOWN_MS) || 800;

const MATCH_META_KEYS = ['mode', 'playType', 'variant', 'tableSize', 'ballSet', 'token'];

function normalizeMatchMeta(rawMeta = {}) {
  const normalized = {};
  MATCH_META_KEYS.forEach((key) => {
    const value = rawMeta[key];
    if (typeof value === 'string' && value.trim()) {
      normalized[key] = value.trim().toLowerCase();
    }
  });
  return normalized;
}

function isMatchMetaCompatible(existing = {}, requested = {}) {
  const entries = Object.entries(requested);
  if (!entries.length) return true;
  return entries.every(([key, value]) => (existing?.[key] || '') === value);
}

function isRateLimited(socket, key, cooldownMs) {
  const now = Date.now();
  const last = lastActionBySocket.get(socket.id)?.[key] || 0;
  if (now - last < cooldownMs) return true;
  const map = lastActionBySocket.get(socket.id) || {};
  map[key] = now;
  lastActionBySocket.set(socket.id, map);
  return false;
}

function ensureRegistered(socket, accountId) {
  const registered = socket.data?.playerId;
  if (!registered) {
    socket.emit('errorMessage', 'register_required');
    return false;
  }
  if (accountId && String(accountId) !== String(registered)) {
    socket.emit('errorMessage', 'identity_mismatch');
    return false;
  }
  return true;
}

function getAvailableTable(gameType, stake = 0, maxPlayers = 4, matchMeta = {}) {
  const normalizedMeta = normalizeMatchMeta(matchMeta);
  const key = `${gameType}-${maxPlayers}`;
  if (!lobbyTables[key]) lobbyTables[key] = [];
  const open = lobbyTables[key].find(
    (t) =>
      t.stake === stake &&
      t.players.length < t.maxPlayers &&
      isMatchMetaCompatible(t.meta, normalizedMeta)
  );
  if (open) return open;
  const table = {
    id: randomUUID(),
    gameType,
    stake,
    maxPlayers,
    players: [],
    currentTurn: null,
    ready: new Set(),
    meta: normalizedMeta
  };
  lobbyTables[key].push(table);
  tableMap.set(table.id, table);
  console.log(
    `Created new table: ${table.id} (${gameType}, cap ${maxPlayers}, stake: ${stake})`
  );
  return table;
}

function cleanupSeats() {
  const now = Date.now();
  for (const [tableId, players] of tableSeats) {
    for (const [pid, info] of players) {
      if (now - info.ts > 60_000) players.delete(pid);
    }
    if (players.size === 0) tableSeats.delete(tableId);
  }
}

function getChessState(tableId) {
  if (!chessGames.has(tableId)) {
    chessGames.set(tableId, {
      fen: CHESS_START_FEN,
      turnWhite: true,
      lastMove: null,
      updatedAt: Date.now()
    });
  }
  return chessGames.get(tableId);
}

function updateChessState(tableId, nextState = {}) {
  const base = getChessState(tableId);
  const merged = {
    ...base,
    ...nextState,
    updatedAt: Date.now()
  };
  chessGames.set(tableId, merged);
  return merged;
}

function normalizeSidePreference(pref) {
  return pref === 'white' || pref === 'black' ? pref : 'auto';
}

function assignChessSides(players = []) {
  if (!Array.isArray(players)) return [];
  if (players.length <= 1) {
    return players.map((p, idx) => ({
      ...p,
      side: idx === 0 ? 'white' : 'black'
    }));
  }

  const [p1, p2] = players.map((p) => ({
    ...p,
    sidePreference: normalizeSidePreference(p.sidePreference)
  }));

  let whitePlayer = null;
  let blackPlayer = null;

  if (p1.sidePreference === 'white' && p2.sidePreference === 'black') {
    whitePlayer = p1;
    blackPlayer = p2;
  } else if (p1.sidePreference === 'black' && p2.sidePreference === 'white') {
    whitePlayer = p2;
    blackPlayer = p1;
  } else if (p1.sidePreference === 'white' && p2.sidePreference !== 'white') {
    whitePlayer = p1;
    blackPlayer = p2;
  } else if (p2.sidePreference === 'white' && p1.sidePreference !== 'white') {
    whitePlayer = p2;
    blackPlayer = p1;
  } else if (p1.sidePreference === 'black' && p2.sidePreference !== 'black') {
    blackPlayer = p1;
    whitePlayer = p2;
  } else if (p2.sidePreference === 'black' && p1.sidePreference !== 'black') {
    blackPlayer = p2;
    whitePlayer = p1;
  } else {
    const p1White = Math.random() < 0.5;
    whitePlayer = p1White ? p1 : p2;
    blackPlayer = p1White ? p2 : p1;
  }

  return players.map((p) => ({
    ...p,
    side: p.id === whitePlayer.id ? 'white' : 'black'
  }));
}

async function seatTableSocket(
  accountId,
  gameType,
  stake,
  maxPlayers,
  playerName,
  socket,
  playerAvatar,
  preferredSide,
  matchMeta = {}
) {
  if (!accountId) return null;
  console.log(
    `Seating player ${playerName || accountId} at ${gameType}-${maxPlayers} (stake ${stake})`
  );
  const table = getAvailableTable(gameType, stake, maxPlayers, matchMeta);
  const tableId = table.id;
  cleanupSeats();
  // Ensure this user is not seated at any other table
  for (const id of Array.from(tableSeats.keys())) {
    if (id !== tableId && tableSeats.get(id)?.has(String(accountId))) {
      unseatTableSocket(accountId, id);
    }
  }
  let map = tableSeats.get(tableId);
  if (!map) {
    map = new Map();
    tableSeats.set(tableId, map);
  }
  if (!map.has(String(accountId))) {
    map.set(String(accountId), {
      id: accountId,
      name: playerName || String(accountId),
      avatar: playerAvatar || '',
      ts: Date.now(),
      socketId: socket?.id,
      sidePreference: normalizeSidePreference(preferredSide)
    });
    table.players.push({
      id: accountId,
      name: playerName || String(accountId),
      avatar: playerAvatar || '',
      position: 0,
      socketId: socket?.id,
      sidePreference: normalizeSidePreference(preferredSide)
    });
    if (table.players.length === 1) {
      table.currentTurn = accountId;
    }
  } else {
    const info = map.get(String(accountId));
    info.name = playerName || info.name;
    info.avatar = playerAvatar || info.avatar;
    info.ts = Date.now();
    info.socketId = socket?.id;
    info.sidePreference = normalizeSidePreference(preferredSide || info.sidePreference);
    const p = table.players.find((pl) => pl.id === accountId);
    if (p) {
      p.socketId = socket?.id;
      p.avatar = playerAvatar || p.avatar;
      p.sidePreference = normalizeSidePreference(preferredSide || p.sidePreference);
    }
  }
  console.log(`Player ${playerName || accountId} joined table ${tableId}`);
  socket?.join(tableId);
  table.ready.delete(String(accountId));
  if (!table.meta) {
    table.meta = normalizeMatchMeta(matchMeta);
  }
  io.to(tableId).emit('lobbyUpdate', {
    tableId,
    players: table.players,
    currentTurn: table.currentTurn,
    ready: Array.from(table.ready),
    meta: table.meta
  });
  return table;
}

function maybeStartGame(table) {
  if (
    table.players.length === table.maxPlayers &&
    table.ready &&
    table.ready.size === table.maxPlayers
  ) {
    if (table.startTimeout) return;
    table.startTimeout = setTimeout(() => {
      console.log(`Table ${table.id} confirmed by all players. Starting game.`);
      if (table.gameType === 'chess') {
        table.players = assignChessSides(table.players);
        const whitePlayer = table.players.find((p) => p.side === 'white');
        if (whitePlayer) table.currentTurn = whitePlayer.id;
        const initial = updateChessState(table.id, { turnWhite: true, lastMove: null });
        io.to(table.id).emit('chessState', { tableId: table.id, ...initial });
      }
      io.to(table.id).emit('gameStart', {
        tableId: table.id,
        players: table.players,
        currentTurn: table.currentTurn,
        stake: table.stake,
        meta: table.meta
      });
      tableSeats.delete(table.id);
      const key = `${table.gameType}-${table.maxPlayers}`;
      lobbyTables[key] = (lobbyTables[key] || []).filter(
        (t) => t.id !== table.id
      );
      if (table.gameType === 'poolroyale') {
        poolStates.set(table.id, { state: null, hud: null, layout: null, ts: Date.now() });
      }
      table.startTimeout = null;
    }, 1000);
  }
}

function unseatTableSocket(accountId, tableId, socketId) {
  if (!tableId) return;
  const map = tableSeats.get(tableId);
  if (map) {
    if (accountId) map.delete(String(accountId));
    else if (socketId) {
      for (const [pid, info] of map) {
        if (info.socketId === socketId) map.delete(pid);
      }
    }
    if (map.size === 0) tableSeats.delete(tableId);
  }
  const table = tableMap.get(tableId);
  if (table) {
    if (accountId)
      table.players = table.players.filter((p) => p.id !== accountId);
    else if (socketId)
      table.players = table.players.filter((p) => p.socketId !== socketId);
    if (table.ready) {
      if (accountId) table.ready.delete(String(accountId));
      if (socketId) {
        for (const [pid, info] of map || []) {
          if (info.socketId === socketId) table.ready.delete(pid);
        }
      }
    }
    if (table.players.length === 0) {
      tableMap.delete(tableId);
      const key = `${table.gameType}-${table.maxPlayers}`;
      lobbyTables[key] = (lobbyTables[key] || []).filter(
        (t) => t.id !== tableId
      );
      table.currentTurn = null;
    } else if (table.currentTurn === accountId) {
      const nextIndex = 0;
      table.currentTurn = table.players[nextIndex].id;
    }
    io.to(tableId).emit('lobbyUpdate', {
      tableId,
      players: table.players,
      currentTurn: table.currentTurn,
      ready: Array.from(table.ready || []),
      meta: table.meta
    });
    if (accountId && table.currentTurn && table.currentTurn !== accountId) {
      io.to(tableId).emit('turnUpdate', { currentTurn: table.currentTurn });
    }
  }
  if (accountId) {
    User.updateOne({ accountId }, { currentTableId: null }).catch(() => {});
  }
}

app.get('/api/stats', async (req, res) => {
  try {
    const [{ totalBalance = 0, totalMined = 0, nftCount = 0 } = {}] =
      await User.aggregate([
        {
          $project: {
            balance: 1,
            minedTPC: 1,
            nftCount: {
              $size: {
                $filter: {
                  input: { $ifNull: ['$gifts', []] },
                  as: 'g',
                  cond: { $ifNull: ['$$g.nftTokenId', false] }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            totalBalance: { $sum: '$balance' },
            totalMined: { $sum: '$minedTPC' },
            nftCount: { $sum: '$nftCount' }
          }
        }
      ]);
    const accounts = await User.countDocuments();
    const active = await countOnline();
    const users = await User.find({}, { transactions: 1, gifts: 1 }).lean();
    let giftSends = 0;
    let bundlesSold = 0;
    let tonRaised = 0;
    let currentNfts = 0;
    let nftValue = 0;
    let appClaimed = 0;
    let externalClaimed = 0;
    for (const u of users) {
      const nftGifts = (u.gifts || []).filter((g) => g.nftTokenId);
      currentNfts += nftGifts.length;
      for (const g of nftGifts) {
        nftValue += g.price || 0;
      }
      for (const tx of u.transactions || []) {
        if (tx.type === 'gift') giftSends++;
        if (tx.type === 'store') {
          bundlesSold++;
          if (tx.detail && BUNDLE_TON_MAP[tx.detail]) {
            tonRaised += BUNDLE_TON_MAP[tx.detail];
          }
        }
        if (tx.type === 'claim') appClaimed += Math.abs(tx.amount || 0);
        if (tx.type === 'withdraw') externalClaimed += Math.abs(tx.amount || 0);
      }
    }
    const nftsBurned = giftSends - currentNfts;
    res.json({
      minted: totalBalance + totalMined,
      accounts,
      activeUsers: active,
      nftsCreated: currentNfts,
      nftsBurned,
      bundlesSold,
      tonRaised,
      appClaimed: totalBalance,
      externalClaimed,
      nftValue
    });
  } catch (err) {
    console.error('Failed to compute stats:', err.message);
    res.status(500).json({ error: 'failed to compute stats' });
  }
});

app.post('/api/snake/table/seat', (req, res) => {
  const { tableId, playerId, accountId, name, avatar } = req.body || {};
  const pid = playerId || accountId;
  if (!tableId || !pid) return res.status(400).json({ error: 'missing data' });
  const [gameType, capStr] = tableId.split('-');
  seatTableSocket(pid, gameType, 0, Number(capStr) || 4, name, null, avatar);
  res.json({ success: true });
});

app.post('/api/snake/table/unseat', (req, res) => {
  const { tableId, playerId, accountId } = req.body || {};
  const pid = playerId || accountId;
  unseatTableSocket(pid, tableId);
  res.json({ success: true });
});
app.get('/api/snake/lobbies', async (req, res) => {
  cleanupSeats();
  const capacities = [2, 3, 4];
  const lobbies = await Promise.all(
    capacities.map(async (cap) => {
      const id = `snake-${cap}`;
      const room = await gameManager.getRoom(id, cap);
      const roomCount = room.players.filter((p) => !p.disconnected).length;
      // Seats are stored in `tableSeats` under their actual table ids, which may
      // include additional stake or random components (e.g. `snake-2-100`).
      // Aggregate seats for all tables matching this game type and capacity.
      let lobbyCount = 0;
      for (const [tid, players] of tableSeats.entries()) {
        const t = tableMap.get(tid);
        if (t && t.gameType === 'snake' && t.maxPlayers === cap) {
          lobbyCount += players.size;
        }
      }
      const players = roomCount + lobbyCount;
      return { id, capacity: cap, players };
    })
  );
  res.json(lobbies);
});

app.get('/api/snake/lobby/:id', async (req, res) => {
  const { id } = req.params;
  const parts = id.split('-');
  const match = /(\d+)$/.exec(id);
  const gameType = parts[0] || 'snake';
  const cap = match ? Number(match[1]) : 4;

  const room = await gameManager.getRoom(id, cap);
  const roomPlayers = room.players
    .filter((p) => !p.disconnected)
    .map((p) => ({ id: p.playerId, name: p.name, avatar: p.avatar }));

  const seen = new Set();
  const lobbyPlayers = [];
  for (const [tid, players] of tableSeats.entries()) {
    const table = tableMap.get(tid);
    if (!table || table.gameType !== gameType || table.maxPlayers !== cap) continue;
    for (const info of players.values()) {
      if (seen.has(info.id)) continue;
      seen.add(info.id);
      lobbyPlayers.push({ id: info.id, name: info.name, avatar: info.avatar });
    }
  }

  res.json({ id, capacity: cap, players: [...lobbyPlayers, ...roomPlayers] });
});

app.get('/api/snake/board/:id', async (req, res) => {
  const { id } = req.params;
  const match = /-(\d+)$/.exec(id);
  const cap = match ? Number(match[1]) : 4;
  const room = await gameManager.getRoom(id, cap);
  // Persist the board so all players receive the same layout
  await gameManager.saveRoom(room).catch(() => {});
  res.json({
    snakes: room.snakes,
    ladders: room.ladders,
    diceCells: room.diceCells
  });
});
app.get('/api/watchers/count/:id', (req, res) => {
  const set = tableWatchers.get(req.params.id);
  res.json({ count: set ? set.size : 0 });
});

app.get('/api/checkers/lobbies', async (req, res) => {
  const capacities = [2];
  const lobbies = await Promise.all(
    capacities.map(async (cap) => {
      const id = `checkers-${cap}`;
      const room = await gameManager.getRoom(id, cap);
      const players = room.players.filter((p) => !p.disconnected).length;
      return { id, capacity: cap, players };
    })
  );
  res.json(lobbies);
});

app.get('/api/checkers/lobby/:id', async (req, res) => {
  const { id } = req.params;
  const match = /-(\d+)$/.exec(id);
  const cap = match ? Number(match[1]) : 2;
  const room = await gameManager.getRoom(id, cap);
  const players = room.players
    .filter((p) => !p.disconnected)
    .map((p) => ({ id: p.playerId, name: p.name }));
  res.json({ id, capacity: cap, players });
});

app.get('/api/checkers/board/:id', async (req, res) => {
  const { id } = req.params;
  const match = /-(\d+)$/.exec(id);
  const cap = match ? Number(match[1]) : 2;
  const room = await gameManager.getRoom(id, cap);
  res.json({ board: room.game.board });
});

app.post('/api/snake/invite', async (req, res) => {
  let { fromAccount, fromName, toAccount, roomId, token, amount, type } =
    req.body || {};
  if (!fromAccount || !toAccount || !roomId) {
    return res.status(400).json({ error: 'missing data' });
  }

  const targets = userSockets.get(String(toAccount));
  if (targets && targets.size > 0) {
    for (const sid of targets) {
      io.to(sid).emit('gameInvite', {
        fromId: fromAccount,
        fromName,
        roomId,
        token,
        amount,
        game: 'snake'
      });
    }
  }

  pendingInvites.set(roomId, {
    fromId: fromAccount,
    toIds: [toAccount],
    token,
    amount,
    game: 'snake'
  });

  const url = getInviteUrl(roomId, token, amount, 'snake');
  res.json({ success: true, url });
});

app.get('/api/snake/results', async (req, res) => {
  if (req.query.leaderboard) {
    const leaderboard = await GameResult.aggregate([
      { $group: { _id: '$winner', wins: { $sum: 1 } } },
      { $sort: { wins: -1 } },
      { $limit: 20 }
    ]);
    return res.json({ leaderboard });
  }
  const limit = Number(req.query.limit) || 20;
  const results = await GameResult.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  res.json({ results });
});
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).end();
  sendIndex(res);
});

// MongoDB Connection
const mongoUri = process.env.MONGO_URI;

if (mongoUri === 'memory') {
  import('mongodb-memory-server').then(async ({ MongoMemoryServer }) => {
    try {
      const mem = await MongoMemoryServer.create();
      await mongoose.connect(mem.getUri());
      console.log('Using in-memory MongoDB');
    } catch (err) {
      console.error('Failed to start in-memory MongoDB:', err.message);
      console.log('Continuing without database');
    }
  });
} else if (mongoUri) {
  const maxRetries = 5;
  const initialDelayMs = 5000;

  const connectWithRetry = async (attempt = 1) => {
    try {
      await mongoose.connect(mongoUri);
    } catch (err) {
      console.error(`MongoDB connection attempt ${attempt} failed:`, err);
      const delay = Math.min(initialDelayMs * attempt, 60_000);
      if (attempt < maxRetries) {
        console.log(`Retrying MongoDB connection in ${delay}ms...`);
      } else {
        console.error(
          'Exceeded MongoDB connection retries, continuing without DB connection while retrying in background.'
        );
      }
      setTimeout(() => connectWithRetry(attempt + 1), delay);
    }
  };

  connectWithRetry();
} else {
  console.log('No MongoDB URI configured, continuing without database');
}

mongoose.connection.once('open', async () => {
  console.log('Connected to MongoDB');
  for (const model of models) {
    try {
      await model.syncIndexes();
    } catch (err) {
      console.error(`Failed to sync ${model.modelName} indexes:`, err);
    }
  }
  gameManager
    .loadRooms()
    .catch((err) => console.error('Failed to load game rooms:', err));
});

io.on('connection', (socket) => {
  socket.on('register', async ({ playerId }) => {
    if (!playerId) return;
    let set = userSockets.get(String(playerId));
    if (!set) {
      set = new Set();
      userSockets.set(String(playerId), set);
    }
    set.add(socket.id);
    socket.data.playerId = String(playerId);
    await registerConnection({ userId: String(playerId), socketId: socket.id });
  });

  socket.on('createLobby', ({ roomId }, cb) => {
    const id = roomId || randomUUID();
    socket.join(id);
    cb && cb({ roomId: id });
  });

  socket.on('listPlayers', async (cb) => {
    const users = await listOnline();
    cb && cb(users);
  });

  socket.on(
    'seatTable',
    async (
      {
        accountId,
        gameType,
        stake,
        maxPlayers = 4,
        playerName,
        tableId,
        avatar,
        preferredSide,
        variant,
        mode,
        playType,
        tableSize,
        ballSet,
        token
      },
      cb
    ) => {
      if (!ensureRegistered(socket, accountId)) return cb && cb({ success: false, error: 'register_required' });
      let table;
      if (tableId) {
        const [gt, capStr] = tableId.split('-');
        table = await seatTableSocket(
          accountId,
          gt,
          stake,
          Number(capStr) || 4,
          playerName,
          socket,
          avatar,
          preferredSide,
          { variant, mode, playType, tableSize, ballSet, token }
        );
      } else {
        table = await seatTableSocket(
          accountId,
          gameType,
          stake,
          maxPlayers,
          playerName,
          socket,
          avatar,
          preferredSide,
          { variant, mode, playType, tableSize, ballSet, token }
        );
      }
      if (table && cb) {
        cb({
          success: true,
          tableId: table.id,
          players: table.players,
          currentTurn: table.currentTurn,
          ready: Array.from(table.ready),
          meta: table.meta
        });
      } else if (cb) {
        cb({ success: false, error: 'table_join_failed' });
      }
    }
  );

  socket.on('leaveLobby', ({ accountId, tableId }) => {
    if (tableId) {
      unseatTableSocket(accountId, tableId, socket.id);
    }
  });

  socket.on('confirmReady', ({ accountId, tableId }) => {
    const table = tableMap.get(tableId);
    if (!table) {
      socket.emit('errorMessage', 'table_not_found');
      return;
    }
    if (!ensureRegistered(socket, accountId)) return;
    if (!table.ready) table.ready = new Set();
    table.ready.add(String(accountId));
    io.to(tableId).emit('lobbyUpdate', {
      tableId,
      players: table.players,
      currentTurn: table.currentTurn,
      ready: Array.from(table.ready)
    });
    maybeStartGame(table);
  });

  socket.on('joinRoom', async ({ roomId, playerId, accountId, name, avatar }) => {
    const pid = playerId || accountId;
    const map = tableSeats.get(roomId);
    const cap = Number(roomId.split('-')[1]) || 4;
    if (!gameManager.rooms.has(roomId) && map && map.size < cap) {
      socket.emit('error', 'waiting_for_players');
      return;
    }
    if (!ensureRegistered(socket, pid)) return;
    // When a player connects to the actual game room we should keep their
    // lobby seat so that lobby endpoints continue to reflect the occupied
    // seat. Previously this function removed the player's seat from
    // `tableSeats`, which caused the lobby to show zero players after a
    // socket joined the room. Tests expect the lobby count to remain until the
    // game starts or the player explicitly leaves, so we simply update the
    // stored socket id without deleting the seat.
    if (map) {
      const info = map.get(String(pid));
      if (info) info.socketId = socket.id;
    }
    if (pid) {
      await registerConnection({
        userId: String(pid),
        roomId,
        socketId: socket.id
      });
      // Track the user's current table when they actually join a room
      User.updateOne({ accountId: pid }, { currentTableId: roomId }).catch(
        () => {}
      );
    }
    const result = await gameManager.joinRoom(roomId, pid, name, socket, avatar);
    if (result.error) {
      socket.emit('error', result.error);
    } else if (result.board) {
      socket.emit('boardData', result.board);
    }
  });

  socket.on('joinChessRoom', async ({ tableId, accountId }) => {
    if (!tableId) return;
    if (accountId && !ensureRegistered(socket, accountId)) return;
    socket.join(tableId);
    const state = getChessState(tableId);
    socket.emit('chessState', { tableId, ...state });
    if (accountId) {
      await registerConnection({
        userId: String(accountId),
        roomId: tableId,
        socketId: socket.id
      });
    }
  });

  socket.on('chessSyncRequest', ({ tableId }) => {
    if (!tableId) return;
    const state = getChessState(tableId);
    socket.emit('chessState', { tableId, ...state });
  });

  socket.on('joinPoolTable', async ({ tableId, accountId }) => {
    if (!tableId) return;
    if (accountId && !ensureRegistered(socket, accountId)) return;
    socket.join(tableId);
    if (accountId) {
      await registerConnection({
        userId: String(accountId),
        roomId: tableId,
        socketId: socket.id
      });
    }
    const cached = poolStates.get(tableId);
    if (cached?.state) {
      socket.emit('poolState', {
        tableId,
        state: cached.state,
        hud: cached.hud,
        layout: cached.layout,
        updatedAt: cached.ts
      });
    }
  });

  socket.on('poolSyncRequest', ({ tableId }) => {
    if (!tableId) return;
    const cached = poolStates.get(tableId);
    if (cached?.state) {
      socket.emit('poolState', {
        tableId,
        state: cached.state,
        hud: cached.hud,
        layout: cached.layout,
        updatedAt: cached.ts
      });
    }
  });

  socket.on('poolFrame', ({ tableId, layout, hud, playerId, frameTs }) => {
    if (!tableId || !Array.isArray(layout)) return;
    const ts = Number.isFinite(frameTs) ? frameTs : Date.now();
    const cached = poolStates.get(tableId) || {};
    const payload = {
      tableId,
      layout,
      hud: hud || cached.hud || null,
      updatedAt: ts,
      playerId: playerId || null
    };
    poolStates.set(tableId, {
      state: cached.state || null,
      hud: payload.hud,
      layout,
      ts
    });
    socket.to(tableId).emit('poolFrame', payload);
  });

  socket.on('poolShot', ({ tableId, state, hud, layout }) => {
    if (!tableId || !state) return;
    const payload = {
      tableId,
      state,
      hud: hud || null,
      layout: layout || null,
      updatedAt: Date.now()
    };
    poolStates.set(tableId, {
      state,
      hud: hud || null,
      layout: layout || null,
      ts: payload.updatedAt
    });
    socket.to(tableId).emit('poolState', payload);
  });

  socket.on('joinSnookerTable', async ({ tableId, accountId }) => {
    if (!tableId) return;
    if (accountId && !ensureRegistered(socket, accountId)) return;
    socket.join(tableId);
    if (accountId) {
      await registerConnection({
        userId: String(accountId),
        roomId: tableId,
        socketId: socket.id
      });
    }
    const cached = snookerStates.get(tableId);
    if (cached?.state) {
      socket.emit('snookerState', {
        tableId,
        state: cached.state,
        hud: cached.hud,
        layout: cached.layout,
        updatedAt: cached.ts
      });
    }
  });

  socket.on('snookerSyncRequest', ({ tableId }) => {
    if (!tableId) return;
    const cached = snookerStates.get(tableId);
    if (cached?.state) {
      socket.emit('snookerState', {
        tableId,
        state: cached.state,
        hud: cached.hud,
        layout: cached.layout,
        updatedAt: cached.ts
      });
    }
  });

  socket.on('snookerFrame', ({ tableId, layout, hud, playerId, frameTs }) => {
    if (!tableId || !Array.isArray(layout)) return;
    const ts = Number.isFinite(frameTs) ? frameTs : Date.now();
    const cached = snookerStates.get(tableId) || {};
    const payload = {
      tableId,
      layout,
      hud: hud || cached.hud || null,
      updatedAt: ts,
      playerId: playerId || null
    };
    snookerStates.set(tableId, {
      state: cached.state || null,
      hud: payload.hud,
      layout,
      ts
    });
    socket.to(tableId).emit('snookerFrame', payload);
  });

  socket.on('snookerShot', ({ tableId, state, hud, layout }) => {
    if (!tableId || !state) return;
    const payload = {
      tableId,
      state,
      hud: hud || null,
      layout: layout || null,
      updatedAt: Date.now()
    };
    snookerStates.set(tableId, {
      state,
      hud: hud || null,
      layout: layout || null,
      ts: payload.updatedAt
    });
    socket.to(tableId).emit('snookerState', payload);
  });

  socket.on('chessMove', ({ tableId, move }) => {
    if (!tableId || !move) return;
    const next = updateChessState(tableId, {
      fen: move.fen || CHESS_START_FEN,
      turnWhite: typeof move.turnWhite === 'boolean' ? move.turnWhite : true,
      lastMove: move.lastMove || null
    });
    socket.to(tableId).emit('chessMove', { tableId, ...next });
  });
  socket.on('watchRoom', async ({ roomId }) => {
    if (!roomId) return;
    let set = tableWatchers.get(roomId);
    if (!set) {
      set = new Set();
      tableWatchers.set(roomId, set);
    }
    set.add(socket.id);
    socket.join(roomId);
    try {
      const room = await gameManager.getRoom(roomId);
      const board =
        room.gameType === 'snake'
          ? { snakes: room.snakes, ladders: room.ladders, diceCells: room.diceCells }
          : room.gameType === 'checkers'
          ? { board: room.game.board }
          : null;
      if (board) socket.emit('boardData', board);
    } catch {}
    io.to(roomId).emit('watchCount', { roomId, count: set.size });
  });

  socket.on('leaveWatch', ({ roomId }) => {
    if (!roomId) return;
    const set = tableWatchers.get(roomId);
    socket.leave(roomId);
    if (set) {
      set.delete(socket.id);
      const count = set.size;
      if (count === 0) tableWatchers.delete(roomId);
      io.to(roomId).emit('watchCount', { roomId, count });
    }
  });

  socket.on('rollDice', async (payload = {}) => {
    const { accountId, tableId } = payload;
    if (accountId && tableId && tableMap.has(tableId)) {
      if (!ensureRegistered(socket, accountId)) return;
      if (isRateLimited(socket, 'rollDice', rollRateLimitMs)) {
        return socket.emit('errorMessage', 'roll_rate_limited');
      }
      const table = tableMap.get(tableId);
      if (table.currentTurn !== accountId) {
        return socket.emit('errorMessage', 'Not your turn');
      }
      const player = table.players.find((p) => p.id === accountId);
      if (!player) return;
      const dice = Math.floor(Math.random() * 6) + 1;
      player.position += dice;
      io.to(tableId).emit('diceRolled', {
        accountId,
        dice,
        newPosition: player.position
      });
      const idx = table.players.findIndex((p) => p.id === accountId);
      const nextIndex = (idx + 1) % table.players.length;
      table.currentTurn = table.players[nextIndex].id;
      io.to(tableId).emit('turnUpdate', { currentTurn: table.currentTurn });
      return;
    }

    const room = gameManager.findRoomBySocket(socket.id);
    if (!room) return;
    if (isRateLimited(socket, 'rollDice', rollRateLimitMs)) {
      return socket.emit('errorMessage', 'roll_rate_limited');
    }
    const current = room.players[room.currentTurn];
    if (!current || current.socketId !== socket.id) {
      return socket.emit('errorMessage', 'Not your turn');
    }
    await gameManager.rollDice(socket);
  });

  socket.on('invite1v1', async (payload, cb) => {
    let { fromId, fromName, toId, roomId, token, amount, game } = payload || {};
    if (!fromId || !toId)
      return cb && cb({ success: false, error: 'invalid ids' });

    const targets = userSockets.get(String(toId));
    if (targets && targets.size > 0) {
      for (const sid of targets) {
        io.to(sid).emit('gameInvite', {
          fromId,
          fromName,
          roomId,
          token,
          amount,
          game
        });
      }
    }
    pendingInvites.set(roomId, {
      fromId,
      toIds: [toId],
      token,
      amount,
      game
    });
    const url = getInviteUrl(roomId, token, amount, game);
    cb && cb({ success: true, url });
  });

  socket.on(
    'inviteGroup',
    async (
      { fromId, fromName, toIds, opponentNames = [], roomId, token, amount },
      cb
    ) => {
      if (!fromId || !Array.isArray(toIds) || toIds.length === 0) {
        return cb && cb({ success: false, error: 'invalid ids' });
      }
      pendingInvites.set(roomId, {
        fromId,
        toIds: [...toIds],
        token,
        amount,
        game: 'snake'
      });
      let url = getInviteUrl(roomId, token, amount, 'snake');
      for (let i = 0; i < toIds.length; i++) {
        const toId = toIds[i];
        const targets = userSockets.get(String(toId));
        if (targets && targets.size > 0) {
          for (const sid of targets) {
            io.to(sid).emit('gameInvite', {
              fromId,
              fromName,
              roomId,
              token,
              amount,
              group: toIds,
              opponentNames,
              game: 'snake'
            });
          }
        } else {
          console.warn(`No socket found for account ID ${toId}`);
        }
      }
      cb && cb({ success: true, url });
      setTimeout(async () => {
        try {
          const room = await gameManager.getRoom(roomId);
          if (room.status === 'waiting' && room.players.length >= 2) {
            room.startGame();
            await gameManager.saveRoom(room);
          }
        } catch (err) {
          console.error('Failed to auto-start group game:', err.message);
        }
      }, 45000);
    }
  );

  socket.on('disconnect', async () => {
    await gameManager.handleDisconnect(socket);
    lastActionBySocket.delete(socket.id);
    const pid = socket.data.playerId;
    if (pid) {
      const set = userSockets.get(String(pid));
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) userSockets.delete(String(pid));
      }
      await removeConnection(socket.id);
      User.updateOne({ accountId: pid }, { currentTableId: null }).catch(
        () => {}
      );
    }
    for (const roomId of socket.rooms) {
      if (tableSeats.has(roomId)) {
        unseatTableSocket(pid, roomId, socket.id);
      }
    }
    for (const [id, set] of tableWatchers) {
      if (set.delete(socket.id)) {
        const count = set.size;
        if (count === 0) tableWatchers.delete(id);
        io.to(id).emit('watchCount', { roomId: id, count });
      }
    }
  });
});

// Start the server
httpServer.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  if (!process.env.BOT_TOKEN || process.env.BOT_TOKEN === 'dummy') {
    console.log('BOT_TOKEN not configured. Bot may fail to connect.');
  }
});

if (process.env.BOT_TOKEN && process.env.BOT_TOKEN !== 'dummy') {
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
