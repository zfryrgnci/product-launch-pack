/* =====================================================================
 * NEON BLOCKS — CORE GAME LOGIC (pure, no DOM, no rendering)
 * ---------------------------------------------------------------------
 * Block-puzzle engine: 8x8 grid, tray of 3 draggable pieces, clear full
 * rows/columns, combo streaks, smart forgiving piece generator.
 * No browser APIs -> runs headless in Node for the test harness.
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NeonBlocksCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function makeRng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const N = 8; // grid size

  /* ---- Piece library: cells = [row, col] offsets --------------------
   * Classic block-puzzle set. color = index into palette.
   * weight tuning: small friendly pieces common, monsters rarer.       */
  function line(n, horiz) {
    const c = [];
    for (let i = 0; i < n; i++) c.push(horiz ? [0, i] : [i, 0]);
    return c;
  }
  function rect(h, w) {
    const c = [];
    for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) c.push([r, q]);
    return c;
  }
  const SHAPES = [
    { cells: [[0, 0]], w: 10, col: 0 },                                  // 1x1
    { cells: line(2, true), w: 14, col: 1 }, { cells: line(2, false), w: 14, col: 1 },
    { cells: line(3, true), w: 14, col: 2 }, { cells: line(3, false), w: 14, col: 2 },
    { cells: line(4, true), w: 9, col: 3 }, { cells: line(4, false), w: 9, col: 3 },
    { cells: line(5, true), w: 5, col: 4 }, { cells: line(5, false), w: 5, col: 4 },
    { cells: rect(2, 2), w: 14, col: 5 },
    { cells: rect(2, 3), w: 7, col: 6 }, { cells: rect(3, 2), w: 7, col: 6 },
    { cells: rect(3, 3), w: 4, col: 4 },
    // corners (3 cells, 4 rotations)
    { cells: [[0, 0], [0, 1], [1, 0]], w: 8, col: 7 },
    { cells: [[0, 0], [0, 1], [1, 1]], w: 8, col: 7 },
    { cells: [[0, 0], [1, 0], [1, 1]], w: 8, col: 7 },
    { cells: [[0, 1], [1, 0], [1, 1]], w: 8, col: 7 },
    // big L (5 cells, 4 rotations)
    { cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], w: 4, col: 8 },
    { cells: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]], w: 4, col: 8 },
    { cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], w: 4, col: 8 },
    { cells: [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2]], w: 4, col: 8 },
    // T (4 cells, 4 rotations)
    { cells: [[0, 0], [0, 1], [0, 2], [1, 1]], w: 6, col: 9 },
    { cells: [[0, 1], [1, 0], [1, 1], [1, 2]], w: 6, col: 9 },
    { cells: [[0, 0], [1, 0], [1, 1], [2, 0]], w: 6, col: 9 },
    { cells: [[0, 1], [1, 0], [1, 1], [2, 1]], w: 6, col: 9 },
    // S/Z (4 cells)
    { cells: [[0, 1], [0, 2], [1, 0], [1, 1]], w: 4, col: 10 },
    { cells: [[0, 0], [0, 1], [1, 1], [1, 2]], w: 4, col: 10 }
  ];
  // precompute dims
  for (const s of SHAPES) {
    s.h = 1 + Math.max.apply(null, s.cells.map(function (c) { return c[0]; }));
    s.wid = 1 + Math.max.apply(null, s.cells.map(function (c) { return c[1]; }));
  }
  const TOTAL_W = SHAPES.reduce(function (a, s) { return a + s.w; }, 0);

  function Game(opts) {
    opts = opts || {};
    this.rng = opts.rng || makeRng(opts.seed || 12345);
    this.onEvent = opts.onEvent || null;    // (name, data) hooks for fx/sfx
    this.onGameOver = opts.onGameOver || null;
    this.reset();
  }

  Game.prototype._emit = function (name, data) { if (this.onEvent) this.onEvent(name, data); };

  Game.prototype.reset = function () {
    this.grid = [];
    for (let r = 0; r < N; r++) { this.grid.push(new Array(N).fill(0)); } // 0 empty, else color+1
    this.score = 0;
    this.streak = 0;          // consecutive clearing placements
    this.placedSinceClear = 0;
    this.piecesPlaced = 0;
    this.linesCleared = 0;
    this.bestStreak = 0;
    this.gameOver = false;
    this.tray = [null, null, null];
    this._refillTray();
  };

  /* ---- placement queries ------------------------------------------- */
  Game.prototype.canPlaceAt = function (shape, row, col) {
    for (let i = 0; i < shape.cells.length; i++) {
      const r = row + shape.cells[i][0], c = col + shape.cells[i][1];
      if (r < 0 || c < 0 || r >= N || c >= N) return false;
      if (this.grid[r][c]) return false;
    }
    return true;
  };
  Game.prototype.fitsAnywhere = function (shape) {
    for (let r = 0; r <= N - shape.h; r++)
      for (let c = 0; c <= N - shape.wid; c++)
        if (this.canPlaceAt(shape, r, c)) return true;
    return false;
  };
  Game.prototype.anyMove = function () {
    for (let i = 0; i < this.tray.length; i++)
      if (this.tray[i] && this.fitsAnywhere(this.tray[i])) return true;
    return false;
  };

  /* ---- smart generator ----------------------------------------------
   * Forgiving like the hits: every refill guarantees the batch is
   * playable IN SEQUENCE on the current board (greedy check), so the
   * player is never dealt an instant dead hand at refill time.        */
  Game.prototype._fillRatio = function () {
    let f = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (this.grid[r][c]) f++;
    return f / (N * N);
  };
  Game.prototype._randomShape = function () {
    // Adaptive mercy (like the chart-toppers): the fuller the board,
    // the more the deck leans toward small friendly pieces.
    const fill = this._fillRatio();
    if (fill > 0.45 && this.rng() < (fill - 0.3)) {
      const small = SHAPES.filter(function (s) { return s.cells.length <= 3; });
      return small[(this.rng() * small.length) | 0];
    }
    let roll = this.rng() * TOTAL_W;
    for (let i = 0; i < SHAPES.length; i++) {
      roll -= SHAPES[i].w;
      if (roll <= 0) return SHAPES[i];
    }
    return SHAPES[0];
  };
  Game.prototype._firstFit = function (grid, shape) {
    for (let r = 0; r <= N - shape.h; r++)
      for (let c = 0; c <= N - shape.wid; c++) {
        let ok = true;
        for (let i = 0; i < shape.cells.length && ok; i++) {
          const rr = r + shape.cells[i][0], cc = c + shape.cells[i][1];
          if (grid[rr][cc]) ok = false;
        }
        if (ok) return [r, c];
      }
    return null;
  };
  Game.prototype._simulatePlace = function (grid, shape, r, c) {
    const g = grid.map(function (row) { return row.slice(); });
    for (let i = 0; i < shape.cells.length; i++) g[r + shape.cells[i][0]][c + shape.cells[i][1]] = 1;
    // apply clears
    const fullR = [], fullC = [];
    for (let i = 0; i < N; i++) {
      if (g[i].every(function (v) { return v; })) fullR.push(i);
      let colFull = true;
      for (let j = 0; j < N; j++) if (!g[j][i]) { colFull = false; break; }
      if (colFull) fullC.push(i);
    }
    for (const i of fullR) for (let j = 0; j < N; j++) g[i][j] = 0;
    for (const i of fullC) for (let j = 0; j < N; j++) g[j][i] = 0;
    return g;
  };
  Game.prototype._batchPlayable = function (batch) {
    // greedy: can the 3 pieces be placed in some order using first-fits?
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const perm of perms) {
      let g = this.grid.map(function (row) { return row.slice(); });
      let ok = true;
      for (const idx of perm) {
        const fit = this._firstFit(g, batch[idx]);
        if (!fit) { ok = false; break; }
        g = this._simulatePlace(g, batch[idx], fit[0], fit[1]);
      }
      if (ok) return true;
    }
    return false;
  };
  Game.prototype._refillTray = function () {
    for (let attempt = 0; attempt < 30; attempt++) {
      const batch = [this._randomShape(), this._randomShape(), this._randomShape()];
      if (this._batchPlayable(batch)) {
        this.tray = batch.slice();
        this._emit('refill');
        return;
      }
    }
    // board is nearly dead: hand small pieces as a mercy
    this.tray = [SHAPES[0], SHAPES[1], SHAPES[0]];
    this._emit('refill');
  };

  /* ---- the one verb: place tray piece i at (row,col) ---------------- */
  Game.prototype.place = function (trayIdx, row, col) {
    if (this.gameOver) return null;
    const shape = this.tray[trayIdx];
    if (!shape) return null;
    if (!this.canPlaceAt(shape, row, col)) return null;

    for (let i = 0; i < shape.cells.length; i++) {
      this.grid[row + shape.cells[i][0]][col + shape.cells[i][1]] = shape.col + 1;
    }
    this.tray[trayIdx] = null;
    this.piecesPlaced++;
    let gained = shape.cells.length;               // 1pt per cell placed

    // find full rows / cols
    const fullR = [], fullC = [];
    for (let i = 0; i < N; i++) {
      if (this.grid[i].every(function (v) { return v; })) fullR.push(i);
      let colFull = true;
      for (let j = 0; j < N; j++) if (!this.grid[j][i]) { colFull = false; break; }
      if (colFull) fullC.push(i);
    }
    const lines = fullR.length + fullC.length;
    const clearedCells = [];
    if (lines > 0) {
      for (const i of fullR) for (let j = 0; j < N; j++) {
        if (this.grid[i][j]) clearedCells.push([i, j, this.grid[i][j]]);
        this.grid[i][j] = 0;
      }
      for (const i of fullC) for (let j = 0; j < N; j++) {
        if (this.grid[j][i]) clearedCells.push([j, i, this.grid[j][i]]);
        this.grid[j][i] = 0;
      }
      this.streak += 1;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      this.placedSinceClear = 0;
      this.linesCleared += lines;
      // scoring: line base * multi-line bonus * streak bonus
      const base = 80 * lines;
      const multi = lines > 1 ? lines : 1;          // 2 lines => x2, 3 => x3...
      const streakMult = 1 + Math.min(8, this.streak - 1) * 0.5;
      gained += Math.round(base * multi * streakMult);
      this._emit('clear', { lines: lines, rows: fullR, cols: fullC, cells: clearedCells, streak: this.streak, multi: multi });
    } else {
      this.placedSinceClear++;
      if (this.placedSinceClear >= 3 && this.streak > 0) {
        this.streak = 0;
        this._emit('streakLost');
      }
    }
    this.score += gained;
    this._emit('place', { idx: trayIdx, gained: gained, lines: lines });

    // refill when tray empty
    if (this.tray.every(function (t) { return !t; })) this._refillTray();

    // dead check
    if (!this.anyMove()) {
      this.gameOver = true;
      this._emit('gameOver', this.score);
      if (this.onGameOver) this.onGameOver(this.score);
    }
    return { gained: gained, lines: lines, rows: fullR, cols: fullC, cells: clearedCells };
  };

  /* ---- rewarded-ad revive: blow open the center + fresh tray -------- */
  Game.prototype.revive = function () {
    if (!this.gameOver) return;
    for (let r = 2; r < 6; r++) for (let c = 0; c < N; c++) this.grid[r][c] = 0;
    for (let r = 0; r < N; r++) for (let c = 2; c < 6; c++) this.grid[r][c] = 0;
    this.gameOver = false;
    this.streak = 0;
    this._refillTray();
    this._emit('revive');
  };

  Game.N = N;
  Game.SHAPES = SHAPES;
  Game.makeRng = makeRng;
  return Game;
});
