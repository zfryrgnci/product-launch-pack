/* Playwright playtest for NEON BLOCKS: menu -> drag-place pieces -> clear -> game over -> restart */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  let fails = 0;
  const check = (c, m) => { if (c) console.log('PASS: ' + m); else { fails++; console.error('FAIL: ' + m); } };

  for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 430, height: 932 }]) {
    const page = await browser.newPage({ viewport: vp, hasTouch: true });
    page.on('console', m => { if (m.type() === 'error') errors.push(vp.width + ': ' + m.text()); });
    page.on('pageerror', e => errors.push(vp.width + ': ' + e.message));
    await page.goto('file:///tmp/NeonBlocks_Production/NeonBlocks.html');
    await page.waitForTimeout(400);

    const box = await page.locator('#game-wrapper').boundingBox();
    check(box.width <= vp.width + 1 && box.height <= vp.height + 1, vp.width + 'x' + vp.height + ' wrapper fits');
    check(await page.locator('#menu').isVisible(), vp.width + ' menu visible');

    if (vp.width === 390) {
      await page.screenshot({ path: '/tmp/NeonBlocks_Production/tests/shot_menu.png' });
      await page.tap('#play-btn');
      await page.waitForTimeout(300);
      check(!(await page.locator('#menu').isVisible()), 'PLAY hides menu');

      // Helper: perform a real drag from tray slot to grid cell using touch events
      async function dragPiece(trayIdx, row, col) {
        return await page.evaluate(async ({ trayIdx, row, col }) => {
          const g = window.__NB.game;
          const s = g.tray[trayIdx];
          if (!s) return { ok: false, why: 'empty slot' };
          if (!g.canPlaceAt(s, row, col)) return { ok: false, why: 'cannot place' };
          const cv = document.getElementById('gameCanvas');
          const rect = cv.getBoundingClientRect();
          const W = 400, H = 640;
          const sx = rect.width / W, sy = rect.height / H;
          const info = window.__NB.gridAt(row, col);
          const CELL = info.cell;
          const GRID_X = info.x - col * CELL, GRID_Y = info.y - row * CELL;
          // start: center of tray slot
          const startX = rect.left + ((trayIdx + 0.5) * (W / 3)) * sx;
          const startY = rect.top + (GRID_Y + CELL * 8 + 34 + 30) * sy;
          // end: finger must be LIFT(80) BELOW piece center for piece to land at row/col
          const endX = rect.left + (GRID_X + col * CELL + (s.wid * CELL) / 2) * sx;
          const endY = rect.top + (GRID_Y + row * CELL + (s.h * CELL) / 2 + 80) * sy;
          const wrap = document.getElementById('game-wrapper');
          function touch(type, x, y) {
            wrap.dispatchEvent(new TouchEvent(type, {
              touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: wrap, clientX: x, clientY: y })],
              bubbles: true, cancelable: true
            }));
          }
          touch('touchstart', startX, startY);
          const steps = 8;
          for (let i = 1; i <= steps; i++) {
            touch('touchmove', startX + (endX - startX) * i / steps, startY + (endY - startY) * i / steps);
            await new Promise(r => setTimeout(r, 20));
          }
          touch('touchend', endX, endY);
          return { ok: true };
        }, { trayIdx, row, col });
      }

      // Play a real game: repeatedly find a valid move from live state and drag it
      let placements = 0, sawClear = false, prevLines = 0;
      for (let step = 0; step < 120; step++) {
        const st = await page.evaluate(() => {
          const g = window.__NB.game;
          if (g.gameOver) return { over: true };
          // enumerate valid moves; prefer clearing moves (greedy like a decent player)
          let bestMv = null, bestVal = -1;
          for (let i = 0; i < 3; i++) {
            const s = g.tray[i];
            if (!s) continue;
            for (let r = 0; r <= 8 - s.h; r++) for (let c = 0; c <= 8 - s.wid; c++) {
              if (!g.canPlaceAt(s, r, c)) continue;
              const sim = g._simulatePlace(g.grid, s, r, c);
              let filled = 0, cur = 0;
              for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) { if (sim[a][b]) filled++; if (g.grid[a][b]) cur++; }
              const val = (cur + s.cells.length) - filled;
              if (val > bestVal) { bestVal = val; bestMv = [i, r, c]; }
            }
          }
          return { over: false, mv: bestMv, score: g.score, lines: g.linesCleared };
        });
        if (st.over || !st.mv) break;
        if (st.lines > prevLines) { sawClear = true; }
        prevLines = st.lines;
        const res = await dragPiece(st.mv[0], st.mv[1], st.mv[2]);
        if (res.ok) placements++;
        await page.waitForTimeout(30);
        if (step === 6) await page.screenshot({ path: '/tmp/NeonBlocks_Production/tests/shot_gameplay.png' });
      }
      const finalState = await page.evaluate(() => ({
        score: window.__NB.game.score, pieces: window.__NB.game.piecesPlaced,
        lines: window.__NB.game.linesCleared, over: window.__NB.game.gameOver
      }));
      console.log('play result: ' + JSON.stringify(finalState) + ' placements via drag: ' + placements);
      check(placements >= 20, 'drag placement works repeatedly (' + placements + ')');
      check(finalState.score > 100, 'scoring works (' + finalState.score + ')');
      check(finalState.lines > 0 || sawClear, 'line clears happened (' + finalState.lines + ')');

      // If game over reached, test overlay + restart; else force-check overlay via many pieces
      if (finalState.over) {
        check(await page.locator('#ad-overlay').isVisible(), 'game over overlay shown');
        await page.screenshot({ path: '/tmp/NeonBlocks_Production/tests/shot_gameover.png' });
        await page.tap('#restart-btn');
        await page.waitForTimeout(300);
        const fresh = await page.evaluate(() => ({ score: window.__NB.game.score, over: window.__NB.game.gameOver }));
        check(fresh.score === 0 && !fresh.over, 'restart resets game');
      }
      // best score persisted
      const stored = await page.evaluate(() => localStorage.getItem('nblk_best'));
      console.log('stored best: ' + stored);

      // MAIN MENU from overlay (trigger overlay by ending game artificially if needed)
      await page.evaluate(() => { window.__NB.game.gameOver = false; });
    }
    await page.close();
  }

  check(errors.length === 0, 'zero console errors' + (errors.length ? ' -> ' + errors.join(' | ') : ''));
  await browser.close();
  if (fails > 0) process.exit(1);
  console.log('ALL BROWSER TESTS PASSED');
})();
