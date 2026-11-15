// One state object for the whole match. Every module reads and writes this and
// nothing else for game state, so a round reset is one function call and the
// simulation never has to hunt for a stray variable.
export const CONFIG = {
  roundsToWin: 8,
  maxRounds: 15,
  roundTime: 100,
  freezeTime: 6,
  bombTime: 40,
  plantTime: 3.2,
  defuseTime: 5,
  startMoney: 800,
  killReward: 300,
  winReward: 3250,
  lossReward: 1900,
  lossStreakBonus: 500,
  plantReward: 300,
  defuseReward: 300,
  teamSize: 5,
};

export const TEAMS = {
  VANGUARD: 'vanguard',
  SENTINEL: 'sentinel',
};

export const TEAM_INFO = {
  vanguard: { name: 'Vanguard', short: 'VAN', color: '#ff9d2e', role: 'attackers' },
  sentinel: { name: 'Sentinel', short: 'SEN', color: '#2ec4b6', role: 'defenders' },
};

export function createState() {
  return {
    phase: 'menu', // menu | freeze | live | planted | roundEnd | matchEnd
    round: 1,
    wins: { vanguard: 0, sentinel: 0 },
    lossStreak: { vanguard: 0, sentinel: 0 },
    timer: 0,
    freezeTimer: 0,
    bombTimer: 0,
    time: 0,
    seed: 1,
    playerTeam: TEAMS.VANGUARD,
    player: null,
    bots: [],
    actors: [], // player + bots, the combat targets
    bomb: { state: 'carried', carrier: null, site: null, x: 0, z: 0, progress: 0, planter: null, defuser: null },
    feed: [],
    kills: { vanguard: 0, sentinel: 0 },
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    buyOpen: false,
    muted: false,
  };
}
