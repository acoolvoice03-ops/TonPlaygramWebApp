import { BallColor, FrameState, Player, ShotContext, ShotEvent } from '../types';

/* ================= TYPES ================= */

type HudInfo = {
  next: string;
  phase: string;
  scores: { A: number; B: number };
};

type SnookerMeta = {
  variant: 'snooker';
  colorsRemaining: BallColor[];
  freeBall: boolean;
  hud: HudInfo;
};

type ScoringBallColor =
  | 'RED'
  | 'YELLOW'
  | 'GREEN'
  | 'BROWN'
  | 'BLUE'
  | 'PINK'
  | 'BLACK';

type ColoredBall =
  | 'YELLOW'
  | 'GREEN'
  | 'BROWN'
  | 'BLUE'
  | 'PINK'
  | 'BLACK';

/* ================= CONSTANTS ================= */

const COLOR_VALUES: Record<BallColor, number> = {
  RED: 1,
  YELLOW: 2,
  GREEN: 3,
  BROWN: 4,
  BLUE: 5,
  PINK: 6,
  BLACK: 7,
  CUE: 0
};

const COLOR_ORDER: ColoredBall[] = [
  'YELLOW',
  'GREEN',
  'BROWN',
  'BLUE',
  'PINK',
  'BLACK'
];

/* ================= HELPERS ================= */

function isScoringBall(color: BallColor): color is ScoringBallColor {
  return color !== 'CUE';
}

function isColoredBall(color: BallColor): color is ColoredBall {
  return color !== 'RED' && color !== 'CUE';
}

function basePlayers(playerA: string, playerB: string): { A: Player; B: Player } {
  return {
    A: { id: 'A', name: playerA, score: 0 },
    B: { id: 'B', name: playerB, score: 0 }
  };
}

function normalizeColor(value: unknown): BallColor | null {
  if (!value || typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  if (lower.startsWith('red')) return 'RED';
  if (lower.startsWith('yellow')) return 'YELLOW';
  if (lower.startsWith('green')) return 'GREEN';
  if (lower.startsWith('brown')) return 'BROWN';
  if (lower.startsWith('blue')) return 'BLUE';
  if (lower.startsWith('pink')) return 'PINK';
  if (lower.startsWith('black')) return 'BLACK';
  if (lower === 'cue' || lower === 'cue_ball') return 'CUE';
  return null;
}

function resolveBallOn(state: FrameState, colorsRemaining: ColoredBall[]): BallColor[] {
  if (state.phase === 'COLORS_ORDER') {
    return colorsRemaining.length ? [colorsRemaining[0]] : [];
  }
  if (state.colorOnAfterRed) {
    return [...COLOR_ORDER];
  }
  return ['RED'];
}

function buildHud(
  state: FrameState,
  scores: { A: number; B: number },
  ballOn: BallColor[]
): HudInfo {
  const nextBall =
    ballOn.length > 0
      ? ballOn.map((b) => b.toLowerCase()).join(' / ')
      : 'frame over';

  return {
    next: state.freeBall ? `free ball • ${nextBall}` : nextBall,
    phase: state.phase === 'COLORS_ORDER' ? 'colors' : 'reds',
    scores
  };
}

function calculateFoulPoints(ballOn: BallColor[], involved: BallColor[]): number {
  const ballOnValue = Math.max(0, ...ballOn.map((b) => COLOR_VALUES[b]));
  const involvedValue = Math.max(0, ...involved.map((b) => COLOR_VALUES[b]));
  return Math.min(7, Math.max(4, ballOnValue, involvedValue));
}

/* ================= CLASS ================= */

export class SnookerRoyalRules {
  constructor(_variant?: string | null) {}

  getInitialFrame(playerA: string, playerB: string): FrameState {
    const base: FrameState = {
      balls: [],
      activePlayer: 'A',
      players: basePlayers(playerA, playerB),
      currentBreak: 0,
      phase: 'REDS_AND_COLORS',
      redsRemaining: 15,
      ballOn: ['RED'],
      frameOver: false,
      colorOnAfterRed: false,
      freeBall: false
    };

    const scores = { A: 0, B: 0 };

    base.meta = {
      variant: 'snooker',
      colorsRemaining: [...COLOR_ORDER],
      freeBall: false,
      hud: buildHud(base, scores, base.ballOn)
    } satisfies SnookerMeta;

    return base;
  }

  applyShot(state: FrameState, events: ShotEvent[], context: ShotContext = {}): FrameState {
    const meta = state.meta as SnookerMeta | undefined;
    const colorsRemaining = meta?.colorsRemaining
      ? [...meta.colorsRemaining]
      : [...COLOR_ORDER];

    const ballOn = resolveBallOn(state, colorsRemaining);

    const hitEvent = events.find((e) => e.type === 'HIT') as
      | { type: 'HIT'; firstContact?: unknown; ballId?: unknown }
      | undefined;

    const firstContact = normalizeColor(hitEvent?.firstContact ?? hitEvent?.ballId);
    const nominatedBall = normalizeColor(context.declaredBall ?? context.nominatedBall);
    const declaredBall = nominatedBall ?? firstContact;

    const potted = events
      .filter((e) => e.type === 'POTTED')
      .map((e) =>
        normalizeColor((e as { ball?: unknown; ballId?: unknown }).ball ?? (e as any).ballId)
      )
      .filter(Boolean) as BallColor[];

    const cuePotted = Boolean(context.cueBallPotted) || potted.includes('CUE');
    const pottedNonCue = potted.filter((c) => c !== 'CUE');
    const pottedReds = pottedNonCue.filter((c) => c === 'RED');
    const pottedColors = pottedNonCue.filter((c) => c !== 'RED');

    let foulReason: string | null = null;

    if (cuePotted) foulReason = 'cue ball potted';
    if (!firstContact) foulReason = 'no contact';

    if (!foulReason && state.phase === 'REDS_AND_COLORS' && !state.colorOnAfterRed) {
      if (pottedColors.length) foulReason = 'potted color on red';
    }

    if (!foulReason && state.phase === 'COLORS_ORDER') {
      const target = ballOn[0];
      if (target && !pottedNonCue.includes(target)) {
        foulReason = 'wrong color order';
      }
    }

    if (foulReason) {
      const opponent = state.activePlayer === 'A' ? 'B' : 'A';
      const points = calculateFoulPoints(ballOn, pottedNonCue);
      state.players[opponent].score += points;
      state.currentBreak = 0;
      state.activePlayer = opponent;
    } else {
      let gained = 0;
      for (const color of pottedNonCue) {
        if (isScoringBall(color)) {
          gained += COLOR_VALUES[color];
        }
      }
      state.players[state.activePlayer].score += gained;
      state.currentBreak += gained;
    }

    state.ballOn = resolveBallOn(state, colorsRemaining);
    state.meta = {
      variant: 'snooker',
      colorsRemaining,
      freeBall: false,
      hud: buildHud(
        state,
        {
          A: state.players.A.score,
          B: state.players.B.score
        },
        state.ballOn
      )
    };

    return state;
  }
}
