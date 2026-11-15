// The DOM HUD and menus. It never touches the simulation: main.js pushes
// numbers in and reads callbacks out. Health, armour, ammo, money, the round
// timer, the score, the alive counts, the kill feed, the crosshair that opens
// with spread, a top-down minimap, and the buy menu.
import { BUY_ITEMS } from './economy.js';
import { TEAM_INFO } from './state.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const buyMsg = $('buy-msg');
  const feed = $('feed');
  const minimap = $('minimap');
  const mapCtx = minimap.getContext('2d');
  let last = {};
  let bannerTimer = 0;
  let playHandler = null;
  let buyHandler = null;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  play.addEventListener('click', () => {
    if (playHandler) playHandler();
  });
  buyList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-buy]');
    if (button && buyHandler) buyHandler(button.dataset.buy);
  });

  return {
    setHealth(hp, armor) {
      setText($('hp-value'), 'hp', String(Math.ceil(hp)));
      $('hp-bar').style.width = `${Math.max(0, hp)}%`;
      setText($('armor-value'), 'armor', armor > 0 ? `+${Math.ceil(armor)}` : '');
    },
    setAmmo(mag, reserve, name) {
      setText($('ammo-mag'), 'mag', String(mag));
      setText($('ammo-reserve'), 'reserve', `/ ${reserve}`);
      setText($('weapon-name'), 'wname', name);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      setText($('money-value'), 'money', `$${value}`);
      setText(buyMoney, 'buymoney', `$${value}`);
    },
    setTimer(seconds, planted) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText($('timer-value'), 'timer', text);
      $('timer').classList.toggle('danger', planted || s <= 10);
    },
    setScore(van, sen, round) {
      setText($('score-van'), 'sv', String(van));
      setText($('score-sen'), 'ss', String(sen));
      setText($('round-value'), 'round', `ROUND ${round}`);
    },
    setAlive(van, sen) {
      setText($('alive-van'), 'av', '●'.repeat(van) + '○'.repeat(Math.max(0, 5 - van)));
      setText($('alive-sen'), 'as', '●'.repeat(sen) + '○'.repeat(Math.max(0, 5 - sen)));
    },
    setBomb(text) {
      setText($('bomb-status'), 'bomb', text);
    },
    setCrosshair(spreadPx) {
      document.documentElement.style.setProperty('--spread', `${spreadPx.toFixed(1)}px`);
    },
    hitMarker(killed) {
      const el = $('hitmarker');
      el.classList.add('on');
      el.classList.toggle('kill', killed);
      clearTimeout(this._hitTimer);
      this._hitTimer = setTimeout(() => el.classList.remove('on', 'kill'), killed ? 260 : 110);
    },
    damageFlash() {
      const el = $('damage');
      el.classList.add('on');
      clearTimeout(this._dmgTimer);
      this._dmgTimer = setTimeout(() => el.classList.remove('on'), 180);
    },
    killfeed(killer, victim, part, killerTeam) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      const color = killerTeam ? TEAM_INFO[killerTeam].color : '#888';
      line.innerHTML = '';
      const k = document.createElement('b');
      k.style.color = color;
      k.textContent = killer;
      const v = document.createElement('b');
      v.textContent = victim;
      line.append(k, document.createTextNode(part === 'head' ? ' ⌖ ' : '  →  '), v);
      feed.prepend(line);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(titleText, subText, ms = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, ms);
    },
    hideBanner() {
      banner.hidden = true;
    },
    showOverlay(mode, data) {
      const texts = {
        start: ['DUSTWORKS', 'Vanguard vs Sentinel. Plant the charge at A or B — or wipe the other team out. First to 8 rounds.', 'Click to play'],
        paused: ['Paused', 'Click to resume. Your team is holding without you.', 'Click to resume'],
        dead: ['You are down', 'Spectating your squad until the round ends.', 'Click to keep watching'],
        match: [data && data.winner === 'vanguard' ? 'VANGUARD TAKES THE MATCH' : 'SENTINEL TAKES THE MATCH', data ? data.sub : '', 'Play again'],
      };
      const [t, c, a] = texts[mode] || texts.start;
      title.textContent = t;
      copy.textContent = c;
      play.textContent = a;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      playHandler = handler;
    },
    showBuy(open) {
      buyMenu.hidden = !open;
      if (open) this.renderBuy();
    },
    renderBuy() {
      buyList.innerHTML = '';
      for (const item of BUY_ITEMS) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.dataset.buy = item.id;
        row.innerHTML = '';
        const key = document.createElement('kbd');
        key.textContent = item.key;
        const name = document.createElement('span');
        name.className = 'buy-name';
        name.textContent = `${item.name} — ${item.kind}`;
        const desc = document.createElement('span');
        desc.className = 'buy-desc';
        desc.textContent = item.desc;
        const price = document.createElement('span');
        price.className = 'buy-price';
        price.textContent = `$${item.price}`;
        row.append(key, name, desc, price);
        buyList.appendChild(row);
      }
      buyMsg.textContent = '';
    },
    buyMessage(text, ok) {
      buyMsg.textContent = text;
      buyMsg.className = ok ? 'ok' : 'bad';
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    drawMinimap(actors, bomb, world) {
      const ctx = mapCtx;
      const W = minimap.width;
      const H = minimap.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(20,16,12,0.85)';
      ctx.fillRect(0, 0, W, H);
      const toX = (x) => ((x + 33) / 66) * W;
      const toY = (z) => ((z + 23) / 46) * H;
      ctx.strokeStyle = 'rgba(201,168,106,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(toX(-32), toY(-22), toX(32) - toX(-32), toY(22) - toY(-22));
      ctx.fillStyle = '#ff9d2e';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('A', toX(-24), toY(-16.5) + 4);
      ctx.fillStyle = '#2ec4b6';
      ctx.fillText('B', toX(24), toY(-16.5) + 4);
      if (bomb && (bomb.state === 'dropped' || bomb.state === 'planted')) {
        ctx.fillStyle = bomb.state === 'planted' ? '#e5484d' : '#ff9d2e';
        ctx.beginPath();
        ctx.arc(toX(bomb.x), toY(bomb.z), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const actor of actors) {
        if (!actor.alive) continue;
        ctx.fillStyle = actor.isPlayer ? '#ffffff' : TEAM_INFO[actor.team].color;
        ctx.beginPath();
        ctx.arc(toX(actor.body.position.x), toY(actor.body.position.z), actor.isPlayer ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    setHint(text) {
      setText($('hint'), 'hint', text);
    },
  };
}
