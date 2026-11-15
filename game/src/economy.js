// The economy: money earned per round and spent in the buy menu. Prices are
// the buy menu's own data, so the HUD and the purchase logic never disagree.
import { WEAPONS, GRENADES } from './weapons.js';
import { CONFIG } from './state.js';

export const BUY_ITEMS = [
  { id: 'rifle', key: '1', name: 'Raptor AR-7', kind: 'Rifle', price: WEAPONS.rifle.price, desc: '30-rd automatic rifle. The all-rounder.' },
  { id: 'smg', key: '2', name: 'Hornet-9', kind: 'SMG', price: WEAPONS.smg.price, desc: 'Fast, close-range spray. Cheap and hungry.' },
  { id: 'shotgun', key: '3', name: 'Breacher-12', kind: 'Shotgun', price: WEAPONS.shotgun.price, desc: 'Eight pellets per shell. Devastating up close.' },
  { id: 'dmr', key: '4', name: 'Falcon DMR', kind: 'Marksman', price: WEAPONS.dmr.price, desc: 'One-shot headshot power. Right-click to scope.' },
  { id: 'vest', key: '5', name: 'Kevlar vest', kind: 'Armour', price: 650, desc: '100 armour. Soaks half of every hit.' },
  { id: 'frag', key: '6', name: 'Spark-9 frag', kind: 'Grenade', price: GRENADES.frag.price, desc: 'Explodes 1.6 s after the throw.' },
  { id: 'smoke', key: '7', name: 'Veil smoke', kind: 'Grenade', price: GRENADES.smoke.price, desc: 'A 13 s wall of smoke. Blocks sight.' },
];

export function createEconomy(state) {
  return {
    // Returns a message for the buy menu, or '' when the purchase lands.
    buy(player, itemId) {
      const item = BUY_ITEMS.find((entry) => entry.id === itemId);
      if (!item) return 'No such item.';
      if (state.phase !== 'freeze') return 'The buy menu is only open during freeze time.';
      if (player.money < item.price) return `Need $${item.price - player.money} more.`;
      if (item.id === 'vest' && player.armor >= 100) return 'Vest already full.';
      if ((item.id === 'frag' || item.id === 'smoke') && player.weapons.state.grenades[item.id] >= 2) return 'Grenade pouch full (2).';
      player.money -= item.price;
      if (item.id === 'vest') {
        player.armor = 100;
      } else if (item.id === 'frag' || item.id === 'smoke') {
        player.weapons.buyGrenade(item.id);
      } else {
        player.weapons.buy(item.id);
      }
      return '';
    },
    award(team, amount) {
      for (const actor of state.actors) {
        if (actor.team === team) actor.money = (actor.money || 0) + amount;
      }
    },
    roundPayout(winner) {
      const loser = winner === 'vanguard' ? 'sentinel' : 'vanguard';
      state.lossStreak[winner] = 0;
      state.lossStreak[loser] += 1;
      const lossBonus = Math.min(1000, (state.lossStreak[loser] - 1) * CONFIG.lossStreakBonus);
      this.award(winner, CONFIG.winReward);
      this.award(loser, CONFIG.lossReward + lossBonus);
    },
  };
}
