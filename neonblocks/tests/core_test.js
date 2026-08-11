/* Headless tests for NeonBlocksCore */
const Core = require('../web/core.js');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL: ' + m); } };

// helper: enumerate all valid moves
function validMoves(g) {
  const moves = [];
  for (let i = 0; i < 3; i++) {
    const s = g.tray[i];
    if (!s) continue;
    for (let r = 0; r <= Core.N - s.h; r++)
      for (let c = 0; c <= Core.N - s.wid; c++)
        if (g.canPlaceAt(s, r, c)) moves.push([i, r, c]);
  }
  return moves;
}

// 1. Random full games across seeds: invariants + eventual game over
let totalScore = 0, totalPieces = 0, clears = 0;
for (let seed = 1; seed <= 12; seed++) {
  const g = new Core({ seed: seed * 104729 });
  g.onEvent = (n, d) => { if (n === 'clear') clears += d.lines; };
  let guard = 0;
  while (!g.gameOver && guard++ < 5000) {
    const moves = validMoves(g);
    assert(moves.length > 0 || g.gameOver, 'anyMove agrees with enumeration');
    if (!moves.length) break;
    const mv = moves[(g.rng() * moves.length) | 0];
    const res = g.place(mv[0], mv[1], mv[2]);
    assert(res !== null, 'valid move accepted');
    // grid sanity
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
      assert(g.grid[r][c] >= 0 && g.grid[r][c] <= 11, 'cell value sane');
    // no full lines may survive a placement
    for (let r = 0; r < 8; r++) assert(!g.grid[r].every(v => v), 'no lingering full row');
    for (let c = 0; c < 8; c++) { let f = true; for (let r = 0; r < 8; r++) if (!g.grid[r][c]) f = false; assert(!f, 'no lingering full col'); }
  }
  assert(g.gameOver, 'random play reaches game over, seed ' + seed);
  assert(g.score > 0, 'scored, seed ' + seed);
  totalScore += g.score; totalPieces += g.piecesPlaced;
}
console.log('random-play avg score: ' + Math.round(totalScore / 12) + ', avg pieces: ' + Math.round(totalPieces / 12) + ', total lines cleared: ' + clears);
assert(clears >= 10, 'clears actually happen in random play');

// 2. Greedy player (prefers clearing moves) survives much longer & scores higher
{
  const g = new Core({ seed: 777 });
  let guard = 0;
  while (!g.gameOver && guard++ < 3000) {
    const moves = validMoves(g);
    if (!moves.length) break;
    let bestMv = null, bestVal = -1;
    for (const mv of moves.slice(0, 400)) {
      const s = g.tray[mv[0]];
      // score = would-clear lines
      const sim = g._simulatePlace(g.grid, s, mv[1], mv[2]);
      let filled = 0; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (sim[r][c]) filled++;
      let cur = 0; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (g.grid[r][c]) cur++;
      const val = (cur + s.cells.length) - filled; // cells removed by clears
      if (val > bestVal) { bestVal = val; bestMv = mv; }
    }
    g.place(bestMv[0], bestMv[1], bestMv[2]);
  }
  console.log('greedy score: ' + g.score + ' pieces: ' + g.piecesPlaced + ' bestStreak: ' + g.bestStreak);
  assert(g.score > 1500, 'greedy play scores well (skill matters), got ' + g.score);
}

// 3. Multi-line + streak scoring
{
  const g = new Core({ seed: 1 });
  // craft: fill row 0 except col 0, fill col 0 except row 0
  for (let c = 1; c < 8; c++) g.grid[0][c] = 1;
  for (let r = 1; r < 8; r++) g.grid[r][0] = 1;
  g.tray = [Core.SHAPES[0], Core.SHAPES[0], Core.SHAPES[0]]; // 1x1s
  const before = g.score;
  const res = g.place(0, 0, 0);   // completes row 0 AND col 0
  assert(res.lines === 2, 'double clear detected, got ' + res.lines);
  // base 160 * multi 2 * streak 1 => 320 + 1 cell
  assert(g.score - before === 321, 'double-clear score = 321, got ' + (g.score - before));
  assert(g.streak === 1, 'streak started');
}

// 4. Refill guarantee: fresh batch always playable on current board
{
  const g = new Core({ seed: 5 });
  for (let k = 0; k < 200; k++) {
    // random half-full board
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) g.grid[r][c] = g.rng() < 0.45 ? 1 : 0;
    g._refillTray();
    assert(g.tray.filter(Boolean).length === 3, 'tray refilled with 3');
    assert(g.anyMove(), 'refilled batch playable on half-full board (iter ' + k + ')');
  }
}

// 5. Revive reopens the game
{
  const g = new Core({ seed: 99 });
  let guard = 0;
  while (!g.gameOver && guard++ < 5000) {
    const moves = validMoves(g);
    if (!moves.length) break;
    const mv = moves[(g.rng() * moves.length) | 0];
    g.place(mv[0], mv[1], mv[2]);
  }
  assert(g.gameOver, 'reached game over');
  g.revive();
  assert(!g.gameOver, 'revive resumes');
  assert(g.anyMove(), 'moves exist after revive');
}

// 6. Invalid placements rejected
{
  const g = new Core({ seed: 3 });
  const big = Core.SHAPES.find(s => s.cells.length === 9); // 3x3
  g.tray = [big, null, null];
  assert(g.place(0, 6, 6) === null, '3x3 out of bounds rejected');
  g.grid[0][0] = 1;
  assert(g.place(0, 0, 0) === null, 'overlap rejected');
  assert(g.place(1, 0, 0) === null, 'empty tray slot rejected');
}

if (failures === 0) console.log('ALL CORE TESTS PASSED');
else { console.error(failures + ' FAILURES'); process.exit(1); }
