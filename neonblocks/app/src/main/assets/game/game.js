/* =====================================================================
 * NEON BLOCKS — RENDER / INPUT / SOUND / BRIDGE LAYER
 * The juice layer: drag with lift, ghost preview, line-clear highlight,
 * pop animations, combo text, WebAudio synth. Drives NeonBlocksCore.
 * ===================================================================== */
(function () {
  'use strict';
  var Core = window.NeonBlocksCore;
  var N = Core.N;

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  // Logical resolution (portrait 5:8)
  var W = 400, H = 640;
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.scale(DPR, DPR);

  // Layout
  var GRID_X = 28, GRID_Y = 64, CELL = (W - GRID_X * 2) / N;  // 43px cells
  var TRAY_Y = GRID_Y + CELL * N + 34;
  var TRAY_SLOT_W = W / 3;
  var TRAY_SCALE = 0.52;          // pieces sit small in tray
  var LIFT = 80;                  // px the dragged piece floats above the finger

  // Palette: 11 block colors (indexes match core col)
  var COLORS = ['#45f0ff', '#ff3f8e', '#ffd23f', '#7dff5a', '#b45aff',
    '#ff8c3f', '#3f6dff', '#ff5a5a', '#2ee6a8', '#ff3fd4', '#c8ff3f'];

  // ---- Native bridge -------------------------------------------------
  var Bridge = window.AndroidBridge || null;
  function hasBridge() { return !!Bridge; }
  function bridgeSafe(fn) { try { return fn(); } catch (e) { return null; } }
  var adsRemoved = false;
  if (hasBridge() && Bridge.isAdsRemoved) {
    adsRemoved = bridgeSafe(function () { var v = Bridge.isAdsRemoved(); return v === 'true' || v === true; }) || false;
  }

  // ---- Sound ---------------------------------------------------------
  var AC = null, muted = localStorage.getItem('nblk_muted') === '1';
  function ac() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (AC && AC.state === 'suspended') AC.resume();
    return AC;
  }
  function tone(freq, dur, type, vol, slide, delay) {
    if (muted) return;
    var a = ac(); if (!a) return;
    var t0 = a.currentTime + (delay || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol || 0.09, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur);
  }
  function sfxPickup() { tone(300, 0.05, 'sine', 0.06, 80); }
  function sfxPlace() { tone(180, 0.07, 'square', 0.08); }
  function sfxBad() { tone(120, 0.09, 'sawtooth', 0.05, -40); }
  function sfxClear(lines, streak) {
    var base = 420 + Math.min(6, streak) * 60;
    for (var i = 0; i < Math.min(4, lines + 1); i++) tone(base + i * 140, 0.14, 'triangle', 0.1, 60, i * 0.06);
    if (lines >= 2) tone(base * 2, 0.3, 'sine', 0.08, 200, 0.2);
  }
  function sfxOver() { tone(340, 0.5, 'sawtooth', 0.09, -260); }
  function sfxRevive() { tone(523, 0.18, 'triangle', 0.1, 260); tone(784, 0.24, 'triangle', 0.09, 200, 0.14); }

  // ---- State ---------------------------------------------------------
  var best = parseInt(localStorage.getItem('nblk_best') || '0', 10) || 0;
  var particles = [], floats = [], popCells = [], placeAnim = [];
  var shake = 0, flashA = 0;
  var running = false, inMenu = true, usedRevive = false, gameOverCount = 0;
  var game;

  function onCoreEvent(name, d) {
    if (name === 'clear') {
      sfxClear(d.lines, d.streak);
      shake = Math.min(14, 4 + d.lines * 3);
      flashA = Math.min(0.35, 0.1 + d.lines * 0.08);
      for (var i = 0; i < d.cells.length; i++) {
        var cell = d.cells[i];
        var cx = GRID_X + cell[1] * CELL + CELL / 2, cy = GRID_Y + cell[0] * CELL + CELL / 2;
        popCells.push({ r: cell[0], c: cell[1], col: cell[2] - 1, t: 0, delay: (i % 8) * 2 });
        for (var k = 0; k < 3; k++) {
          particles.push({
            x: cx, y: cy, vx: (Math.random() - 0.5) * 7, vy: (Math.random() - 0.5) * 7 - 2,
            life: 24 + Math.random() * 16, color: COLORS[(cell[2] - 1) % COLORS.length]
          });
        }
      }
      var msg = d.lines >= 3 ? 'UNBELIEVABLE!' : d.lines === 2 ? 'DOUBLE BLAST!' : ['NICE!', 'GREAT!', 'COOL!'][(Math.random() * 3) | 0];
      floats.push({ x: W / 2, y: GRID_Y + CELL * 4, text: msg, life: 55, size: 30, color: '#fff' });
      if (d.streak >= 2) floats.push({ x: W / 2, y: GRID_Y + CELL * 4 + 36, text: 'STREAK x' + d.streak, life: 55, size: 20, color: '#ffd23f' });
    }
    if (name === 'gameOver') handleGameOver(d);
    if (name === 'revive') { sfxRevive(); flashA = 0.3; }
  }
  function makeGame() {
    return new Core({ seed: (Date.now() & 0xffffffff), onEvent: onCoreEvent });
  }
  game = makeGame();

  // expose minimal hook for automated tests
  window.__NB = { get game() { return game; }, gridAt: function (r, c) { return { x: GRID_X + c * CELL, y: GRID_Y + r * CELL, cell: CELL, w: W, h: H }; } };

  // ---- HUD / overlay -------------------------------------------------
  var elScore = document.getElementById('score');
  var elBest = document.getElementById('best');
  var overlay = document.getElementById('ad-overlay');
  var overlayTitle = document.getElementById('overlay-title');
  var overlayStats = document.getElementById('overlay-stats');
  var restartBtn = document.getElementById('restart-btn');
  var reviveBtn = document.getElementById('revive-btn');
  var removeAdsBtn = document.getElementById('remove-ads-btn');
  var menuBtn2 = document.getElementById('menu-btn2');
  var menu = document.getElementById('menu');
  var playBtn = document.getElementById('play-btn');
  var menuMute = document.getElementById('menu-mute');

  function updateHud() { elScore.textContent = game.score; elBest.textContent = best; }

  function showInterstitial() {
    if (adsRemoved) return;
    bridgeSafe(function () { Bridge && Bridge.showInterstitial && Bridge.showInterstitial(); });
  }
  var rewardCb = null;
  function showRewarded(cb) {
    if (!hasBridge() || !Bridge.showRewarded) { cb(false); return; }
    rewardCb = cb;
    var ok = bridgeSafe(function () { Bridge.showRewarded(); return true; });
    if (!ok) { rewardCb = null; cb(false); }
  }
  window.NeonBlocks = {
    onReward: function (granted) { var cb = rewardCb; rewardCb = null; if (cb) cb(!!granted); },
    onAdsRemovedChanged: function (v) {
      adsRemoved = v === true || v === 'true';
      if (adsRemoved) removeAdsBtn.style.display = 'none';
    },
    onPause: function () { running = false; },
    onResume: function () { if (!game.gameOver && !inMenu) running = true; }
  };
  if (adsRemoved) removeAdsBtn.style.display = 'none';

  function handleGameOver(score) {
    sfxOver();
    gameOverCount++;
    if (score > best) { best = score; localStorage.setItem('nblk_best', String(best)); }
    overlayTitle.textContent = 'GAME OVER';
    overlayStats.innerHTML =
      'SCORE <b style="color:#fff">' + score + '</b> &nbsp;&#8226;&nbsp; BEST <b style="color:#fff">' + best + '</b>' +
      '<br>PIECES ' + game.piecesPlaced + ' &nbsp;&#8226;&nbsp; LINES ' + game.linesCleared +
      ' &nbsp;&#8226;&nbsp; BEST STREAK x' + game.bestStreak;
    reviveBtn.style.display = (!usedRevive && hasBridge() && Bridge.showRewarded) ? 'inline-block' : 'none';
    overlay.style.display = 'flex';
    updateHud();
    if (gameOverCount % 2 === 0) showInterstitial();
  }

  function startRun() {
    ac();
    inMenu = false; usedRevive = false;
    menu.style.display = 'none';
    overlay.style.display = 'none';
    particles.length = 0; floats.length = 0; popCells.length = 0;
    game = makeGame();
    updateHud();
    running = true;
  }
  function showMenu() {
    inMenu = true; running = false;
    overlay.style.display = 'none';
    document.getElementById('menu-best-v').textContent = best;
    menu.style.display = 'flex';
  }
  playBtn.addEventListener('click', startRun);
  restartBtn.addEventListener('click', startRun);
  menuBtn2.addEventListener('click', showMenu);
  reviveBtn.addEventListener('click', function () {
    showRewarded(function (granted) {
      if (granted) {
        usedRevive = true;
        overlay.style.display = 'none';
        game.revive();
        updateHud();
        running = true;
      }
    });
  });
  removeAdsBtn.addEventListener('click', function () {
    bridgeSafe(function () { Bridge && Bridge.purchaseRemoveAds && Bridge.purchaseRemoveAds(); });
  });
  function syncMute() { menuMute.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON'; }
  syncMute();
  menuMute.addEventListener('click', function () {
    muted = !muted; localStorage.setItem('nblk_muted', muted ? '1' : '0'); syncMute();
  });

  // ---- Drag input ----------------------------------------------------
  var drag = null;   // {idx, x, y}  x,y = logical canvas coords of finger
  var wrapper = document.getElementById('game-wrapper');
  function toLogical(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return [(clientX - r.left) / r.width * W, (clientY - r.top) / r.height * H];
  }
  function trayHit(x, y) {
    if (y < TRAY_Y - 30) return -1;
    var idx = Math.floor(x / TRAY_SLOT_W);
    if (idx < 0 || idx > 2) return -1;
    return game.tray[idx] ? idx : -1;
  }
  function dragGridPos() {
    // piece's top-left cell in grid coords, based on lifted piece center
    if (!drag) return null;
    var s = game.tray[drag.idx];
    if (!s) return null;
    var px = drag.x - (s.wid * CELL) / 2;          // piece top-left in canvas
    var py = drag.y - LIFT - (s.h * CELL) / 2;
    var col = Math.round((px - GRID_X) / CELL);
    var row = Math.round((py - GRID_Y) / CELL);
    return [row, col];
  }
  function pdown(e) {
    if (inMenu || overlay.style.display === 'flex') return;
    var t = e.touches ? e.touches[0] : e;
    var p = toLogical(t.clientX, t.clientY);
    var idx = trayHit(p[0], p[1]);
    if (idx >= 0) {
      drag = { idx: idx, x: p[0], y: p[1] };
      sfxPickup();
    }
    if (e.cancelable) e.preventDefault();
  }
  function pmove(e) {
    if (!drag) return;
    var t = e.touches ? e.touches[0] : e;
    var p = toLogical(t.clientX, t.clientY);
    drag.x = p[0]; drag.y = p[1];
    if (e.cancelable) e.preventDefault();
  }
  function pup() {
    if (!drag) return;
    var pos = dragGridPos();
    var s = game.tray[drag.idx];
    if (pos && s && game.canPlaceAt(s, pos[0], pos[1])) {
      var res = game.place(drag.idx, pos[0], pos[1]);
      if (res) {
        sfxPlace();
        for (var i = 0; i < s.cells.length; i++) {
          placeAnim.push({ r: pos[0] + s.cells[i][0], c: pos[1] + s.cells[i][1], t: 0 });
        }
        if (res.gained > s.cells.length) {
          floats.push({ x: GRID_X + (pos[1] + s.wid / 2) * CELL, y: GRID_Y + pos[0] * CELL, text: '+' + res.gained, life: 45, size: 18, color: '#ffd23f' });
        }
        updateHud();
      }
    } else if (pos) sfxBad();
    drag = null;
  }
  wrapper.addEventListener('touchstart', pdown, { passive: false });
  wrapper.addEventListener('touchmove', pmove, { passive: false });
  wrapper.addEventListener('touchend', pup);
  wrapper.addEventListener('mousedown', pdown);
  window.addEventListener('mousemove', pmove);
  window.addEventListener('mouseup', pup);

  // ---- Rendering -----------------------------------------------------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawBlock(x, y, size, colIdx, alpha, glow) {
    var col = COLORS[colIdx % COLORS.length];
    ctx.globalAlpha = alpha;
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow; }
    ctx.fillStyle = col;
    rr(x + 1.5, y + 1.5, size - 3, size - 3, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    // bevel highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    rr(x + 3.5, y + 3.5, size - 7, (size - 7) * 0.32, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0.5) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.85; }

    // bg
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(-20, -20, W + 40, H + 40);

    // grid frame
    ctx.strokeStyle = 'rgba(69,240,255,0.6)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#45f0ff'; ctx.shadowBlur = 10;
    rr(GRID_X - 6, GRID_Y - 6, CELL * N + 12, CELL * N + 12, 10);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // cells bg
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        rr(GRID_X + c * CELL + 1.5, GRID_Y + r * CELL + 1.5, CELL - 3, CELL - 3, 4);
        ctx.fill();
      }
    }

    // ghost preview + clear highlight
    var ghost = null;
    if (drag) {
      var s = game.tray[drag.idx];
      var pos = dragGridPos();
      if (s && pos && game.canPlaceAt(s, pos[0], pos[1])) {
        ghost = { s: s, row: pos[0], col: pos[1] };
        // which lines would clear?
        var sim = game._simulatePlace(game.grid, s, pos[0], pos[1]);
        var hl = { rows: [], cols: [] };
        for (var i = 0; i < N; i++) {
          var rowWasFull = true, colWasFull = true;
          for (var j = 0; j < N; j++) {
            var inPieceR = s.cells.some(function (cc) { return pos[0] + cc[0] === i && pos[1] + cc[1] === j; });
            var inPieceC = s.cells.some(function (cc) { return pos[0] + cc[0] === j && pos[1] + cc[1] === i; });
            if (!game.grid[i][j] && !inPieceR) rowWasFull = false;
            if (!game.grid[j][i] && !inPieceC) colWasFull = false;
          }
          if (rowWasFull) hl.rows.push(i);
          if (colWasFull) hl.cols.push(i);
        }
        // highlight lines about to clear
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        for (var hr = 0; hr < hl.rows.length; hr++) {
          rr(GRID_X, GRID_Y + hl.rows[hr] * CELL, CELL * N, CELL, 4); ctx.fill();
        }
        for (var hc = 0; hc < hl.cols.length; hc++) {
          rr(GRID_X + hl.cols[hc] * CELL, GRID_Y, CELL, CELL * N, 4); ctx.fill();
        }
      }
    }

    // placed blocks
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      if (game.grid[r][c]) drawBlock(GRID_X + c * CELL, GRID_Y + r * CELL, CELL, game.grid[r][c] - 1, 1, 0);
    }

    // place pop-in animation
    for (i = placeAnim.length - 1; i >= 0; i--) {
      var pa = placeAnim[i];
      pa.t += 1;
      if (pa.t > 8) { placeAnim.splice(i, 1); continue; }
      var k = 1 - pa.t / 8;
      ctx.strokeStyle = 'rgba(255,255,255,' + (k * 0.8) + ')';
      ctx.lineWidth = 2;
      rr(GRID_X + pa.c * CELL - k * 3, GRID_Y + pa.r * CELL - k * 3, CELL + k * 6, CELL + k * 6, 5);
      ctx.stroke();
    }

    // clearing pop cells
    for (i = popCells.length - 1; i >= 0; i--) {
      var pc = popCells[i];
      if (pc.delay > 0) { pc.delay--; drawBlock(GRID_X + pc.c * CELL, GRID_Y + pc.r * CELL, CELL, pc.col, 1, 8); continue; }
      pc.t += 1;
      if (pc.t > 12) { popCells.splice(i, 1); continue; }
      var sc = 1 + pc.t / 12 * 0.4, al = 1 - pc.t / 12;
      var cx = GRID_X + pc.c * CELL + CELL / 2, cy = GRID_Y + pc.r * CELL + CELL / 2;
      drawBlock(cx - CELL * sc / 2, cy - CELL * sc / 2, CELL * sc, pc.col, al, 12);
    }

    // ghost piece (under-finger placement preview)
    if (ghost) {
      for (i = 0; i < ghost.s.cells.length; i++) {
        drawBlock(GRID_X + (ghost.col + ghost.s.cells[i][1]) * CELL,
          GRID_Y + (ghost.row + ghost.s.cells[i][0]) * CELL, CELL, ghost.s.col, 0.35, 0);
      }
    }

    // tray
    for (i = 0; i < 3; i++) {
      var ts = game.tray[i];
      if (!ts) continue;
      if (drag && drag.idx === i) continue;
      var cs = CELL * TRAY_SCALE;
      var tx = i * TRAY_SLOT_W + (TRAY_SLOT_W - ts.wid * cs) / 2;
      var ty = TRAY_Y + (CELL * 3 * TRAY_SCALE - ts.h * cs) / 2;
      var fits = game.fitsAnywhere(ts);
      for (var j = 0; j < ts.cells.length; j++) {
        drawBlock(tx + ts.cells[j][1] * cs, ty + ts.cells[j][0] * cs, cs, ts.col, fits ? 1 : 0.28, 0);
      }
    }

    // dragged piece — floats ABOVE the finger at full grid size
    if (drag) {
      var ds = game.tray[drag.idx];
      if (ds) {
        var px = drag.x - (ds.wid * CELL) / 2;
        var py = drag.y - LIFT - (ds.h * CELL) / 2;
        for (j = 0; j < ds.cells.length; j++) {
          drawBlock(px + ds.cells[j][1] * CELL, py + ds.cells[j][0] * CELL, CELL, ds.col, 0.95, 14);
        }
      }
    }

    // particles
    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, p.life / 18);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    // float texts
    for (i = floats.length - 1; i >= 0; i--) {
      var f = floats[i];
      f.y -= 0.6; f.life--;
      if (f.life <= 0) { floats.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, f.life / 18);
      ctx.font = '900 ' + f.size + 'px Arial';
      ctx.textAlign = 'center';
      ctx.shadowColor = f.color; ctx.shadowBlur = 12;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    // streak badge
    if (game.streak >= 2 && !game.gameOver) {
      ctx.font = '900 15px Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd23f';
      ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 8;
      ctx.fillText('STREAK x' + game.streak, W / 2, GRID_Y - 14);
      ctx.shadowBlur = 0;
    }

    // full-screen flash
    if (flashA > 0.01) {
      ctx.fillStyle = 'rgba(255,255,255,' + flashA + ')';
      ctx.fillRect(-20, -20, W + 40, H + 40);
      flashA *= 0.85;
    }
    ctx.restore();
  }

  function loop() {
    requestAnimationFrame(loop);
    draw();
  }
  updateHud();
  document.getElementById('menu-best-v').textContent = best;
  requestAnimationFrame(loop);
})();
