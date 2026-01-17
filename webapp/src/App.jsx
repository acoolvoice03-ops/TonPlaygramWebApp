import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { Analytics } from '@vercel/analytics/react';

import Home from './pages/Home.jsx';
import Mining from './pages/Mining.jsx';
import Wallet from './pages/Wallet.jsx';
import Tasks from './pages/Tasks.jsx';
import Referral from './pages/Referral.jsx';
import MyAccount from './pages/MyAccount.jsx';
import Store from './pages/Store.jsx';
import Messages from './pages/Messages.jsx';
import Trending from './pages/Trending.jsx';
import Notifications from './pages/Notifications.jsx';
import InfluencerAdmin from './pages/InfluencerAdmin.jsx';
import MagazineWarehouse from './pages/MagazineWarehouse.jsx';
import Nfts from './pages/Nfts.jsx';

import SnakeAndLadder from './pages/Games/SnakeAndLadder.jsx';
import SnakeMultiplayer from './pages/Games/SnakeMultiplayer.jsx';
import SnakeResults from './pages/Games/SnakeResults.jsx';
import Lobby from './pages/Games/Lobby.jsx';
import Games from './pages/Games.jsx';
import GameTransactions from './pages/GameTransactions.jsx';
import MiningTransactions from './pages/MiningTransactions.jsx';
import SpinPage from './pages/spin.tsx';
import GoalRush from './pages/Games/GoalRush.jsx';
import GoalRushLobby from './pages/Games/GoalRushLobby.jsx';
import AirHockey from './pages/Games/AirHockey.jsx';
import AirHockeyLobby from './pages/Games/AirHockeyLobby.jsx';
import MurlanRoyale from './pages/Games/MurlanRoyale.jsx';
import MurlanRoyaleLobby from './pages/Games/MurlanRoyaleLobby.jsx';
import LudoBattleRoyal from './pages/Games/LudoBattleRoyal.jsx';
import LudoBattleRoyalLobby from './pages/Games/LudoBattleRoyalLobby.jsx';
import TexasHoldem from './pages/Games/TexasHoldem.jsx';
import TexasHoldemLobby from './pages/Games/TexasHoldemLobby.jsx';
import DominoRoyal from './pages/Games/DominoRoyal.jsx';
import DominoRoyalLobby from './pages/Games/DominoRoyalLobby.jsx';

const ChessBattleRoyal = React.lazy(() => import('./pages/Games/ChessBattleRoyal.jsx'));
const ChessBattleRoyalLobby = React.lazy(() => import('./pages/Games/ChessBattleRoyalLobby.jsx'));
import PoolRoyale from './pages/Games/PoolRoyale.jsx';
import PoolRoyaleLobby from './pages/Games/PoolRoyaleLobby.jsx';
import SnookerRoyal from './pages/Games/SnookerRoyal.jsx';
import SnookerRoyalLobby from './pages/Games/SnookerRoyalLobby.jsx';

import Layout from './components/Layout.jsx';
import useTelegramAuth from './hooks/useTelegramAuth.js';
import useReferralClaim from './hooks/useReferralClaim.js';
import useNativePushNotifications from './hooks/useNativePushNotifications.js';

export default function App() {
  useTelegramAuth();
  useReferralClaim();
  useNativePushNotifications();

  const manifestUrl = `${window.location.origin}/tonconnect-manifest.json`;

  return (
    <BrowserRouter>
      <TonConnectUIProvider manifestUrl={manifestUrl}>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/mining" element={<Mining />} />
            <Route
              path="/mining/transactions"
              element={<MiningTransactions />}
            />
            <Route path="/games" element={<Games />} />
            <Route path="/games/transactions" element={<GameTransactions />} />
            <Route path="/games/:game/lobby" element={<Lobby />} />
            <Route path="/games/snake" element={<SnakeAndLadder />} />
            <Route path="/games/snake/mp" element={<SnakeMultiplayer />} />
            <Route path="/games/snake/results" element={<SnakeResults />} />
            <Route path="/games/goalrush/lobby" element={<GoalRushLobby />} />
            <Route path="/games/goalrush" element={<GoalRush />} />
            <Route path="/games/airhockey/lobby" element={<AirHockeyLobby />} />
            <Route path="/games/airhockey" element={<AirHockey />} />
            <Route
              path="/games/chessbattleroyal/lobby"
              element={(
                <Suspense fallback={<div className="p-4 text-center">Loading Chess Lobby…</div>}>
                  <ChessBattleRoyalLobby />
                </Suspense>
              )}
            />
            <Route
              path="/games/chessbattleroyal"
              element={(
                <Suspense fallback={<div className="p-4 text-center">Loading Chess Battle Royal…</div>}>
                  <ChessBattleRoyal />
                </Suspense>
              )}
            />
            <Route
              path="/games/ludobattleroyal/lobby"
              element={<LudoBattleRoyalLobby />}
            />
            <Route
              path="/games/ludobattleroyal"
              element={<LudoBattleRoyal />}
            />
            <Route
              path="/games/texasholdem/lobby"
              element={<TexasHoldemLobby />}
            />
            <Route path="/games/texasholdem" element={<TexasHoldem />} />
            <Route
              path="/games/domino-royal/lobby"
              element={<DominoRoyalLobby />}
            />
            <Route path="/games/domino-royal" element={<DominoRoyal />} />
            <Route
              path="/games/murlanroyale/lobby"
              element={<MurlanRoyaleLobby />}
            />
            <Route path="/games/murlanroyale" element={<MurlanRoyale />} />
            <Route
              path="/games/poolroyale/lobby"
              element={<PoolRoyaleLobby />}
            />
            <Route path="/games/poolroyale" element={<PoolRoyale />} />
            <Route
              path="/games/snookerroyale/lobby"
              element={<SnookerRoyalLobby />}
            />
            <Route path="/games/snookerroyale" element={<SnookerRoyal />} />
            <Route
              path="/games/pollroyale/lobby"
              element={<Navigate to="/games/poolroyale/lobby" replace />}
            />
            <Route
              path="/games/pollroyale"
              element={<Navigate to="/games/poolroyale" replace />}
            />
            <Route path="/spin" element={<SpinPage />} />
            <Route path="/admin/influencer" element={<InfluencerAdmin />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/store" element={<Navigate to="/store/poolroyale" replace />} />
            <Route path="/store/:gameSlug" element={<Store />} />
            <Route path="/referral" element={<Referral />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/trending" element={<Trending />} />
            <Route path="/account" element={<MyAccount />} />
            <Route path="/nfts" element={<Nfts />} />
            <Route path="/magazine" element={<MagazineWarehouse />} />
          </Routes>
          <Analytics />
        </Layout>
      </TonConnectUIProvider>
    </BrowserRouter>
  );
}
