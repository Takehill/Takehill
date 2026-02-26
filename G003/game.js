// ═══════════════════════════════════════════
//  三國志将棋 - Game Engine
// ═══════════════════════════════════════════

const SZ = 9;
const SHU = 'shu', WEI = 'wei';

// ─── Piece Type Definitions ───
// m = movement types, k = isKing, v = material value
const PT = {
  ryubi:   {n:'劉備', m:['cross'],                k:true,  v:9999},
  kannu:   {n:'関羽', m:['rook','king'],           k:false, v:1200},
  chohi:   {n:'張飛', m:['bishop','lance'],        k:false, v:900},
  chouun:  {n:'超雲', m:['rook'],                  k:false, v:800},
  kouchuu: {n:'黄忠', m:['rook'],                  k:false, v:800},
  bachou:  {n:'馬超', m:['bishop'],                k:false, v:700},
  koumei:  {n:'孔明', m:['king','knight'],         k:false, v:700},
  houtou:  {n:'龐統', m:['king','knight'],         k:false, v:700},
  sousou:  {n:'曹操', m:['king','knight','lance'], k:true,  v:9999},
  kakuka:  {n:'郭嘉', m:['king'],                  k:false, v:500},
  juniku:  {n:'荀彧', m:['king'],                  k:false, v:500},
  junyuu:  {n:'荀攸', m:['silver'],                k:false, v:400},
  teiiku:  {n:'程昱', m:['silver'],                k:false, v:400},
  kakouton:{n:'夏侯惇',m:['rook'],                 k:false, v:800},
  kakouen: {n:'夏侯淵',m:['bishop'],               k:false, v:700},
  churyou: {n:'張遼', m:['bishop'],                k:false, v:700},
  kyocho:  {n:'許褚', m:['rook'],                  k:false, v:800},
  jokou:   {n:'徐晃', m:['rook'],                  k:false, v:800},
  fu:      {n:'歩',   m:['pawn'],                  k:false, v:100},
};

// ─── Game State ───
let board;      // [row][col] = {type, owner} | null
let hands;      // {shu:[], wei:[]}
let turn;       // SHU | WEI
let selCell;    // {r,c} | null  (selected board piece)
let selHand;    // pieceType | null (selected hand piece)
let targets;    // [{r,c}] valid move/drop targets
let gameOver;
let winner;
let lastFrom, lastTo; // last move highlight

// ─── Board Initialization ───
function initGame() {
  board = Array.from({length:SZ}, () => Array(SZ).fill(null));
  hands = {shu:[], wei:[]};
  turn = SHU;
  selCell = null;
  selHand = null;
  targets = [];
  gameOver = false;
  winner = null;
  lastFrom = null;
  lastTo = null;

  // Place Shu pieces (player, bottom side)
  // Shogi notation (col, row) -> array [row-1][9-col]
  function ps(col, row, type) {
    board[row-1][9-col] = {type, owner:SHU};
  }
  ps(5,9,'ryubi');
  ps(4,9,'kannu');
  ps(6,9,'chohi');
  ps(5,8,'chouun');
  ps(4,8,'kouchuu');
  ps(6,8,'bachou');  // Fixed: was listed as 4-8, assuming 6-8
  ps(3,9,'koumei');
  ps(7,9,'houtou');
  ps(3,7,'fu'); ps(4,7,'fu'); ps(5,7,'fu'); ps(6,7,'fu'); ps(7,7,'fu');

  // Place Wei pieces (computer, top side)
  // Positions given from Wei's perspective -> mirror: board col=10-c, row=10-r
  function pw(col, row, type) {
    const bc = 10 - col, br = 10 - row;
    board[br-1][9-bc] = {type, owner:WEI};
  }
  pw(5,9,'sousou');
  pw(4,9,'kakuka');
  pw(6,9,'juniku');
  pw(3,9,'junyuu');
  pw(7,9,'teiiku');
  pw(2,8,'kakouton');
  pw(8,8,'kakouen');
  pw(1,8,'churyou');
  pw(5,8,'kyocho');
  pw(9,8,'jokou');
  pw(3,7,'fu'); pw(4,7,'fu'); pw(5,7,'fu'); pw(6,7,'fu'); pw(7,7,'fu');

  render();
}

// ═══════════════════════════════════════════
//  Move Generation
// ═══════════════════════════════════════════

function fwd(owner) { return owner === SHU ? -1 : 1; }

// Generate pseudo-legal moves (ignoring check)
function genMoves(type, r, c, owner) {
  const piece = PT[type];
  const f = fwd(owner);
  const mvs = [];
  const seen = new Set();

  function add(nr, nc) {
    if (nr < 0 || nr >= SZ || nc < 0 || nc >= SZ) return false;
    const key = nr * SZ + nc;
    if (seen.has(key)) return false;
    const t = board[nr][nc];
    if (t && t.owner === owner) return false; // blocked by own piece
    seen.add(key);
    mvs.push({r:nr, c:nc});
    return !t; // true = can continue sliding, false = captured (stop)
  }

  function step(offsets) {
    for (const [dr, dc] of offsets) add(r+dr, c+dc);
  }

  function slide(dirs) {
    for (const [dr, dc] of dirs) {
      for (let i = 1; i < SZ; i++) {
        if (!add(r+dr*i, c+dc*i)) break;
      }
    }
  }

  for (const mt of piece.m) {
    switch(mt) {
      case 'cross':
        step([[0,1],[0,-1],[1,0],[-1,0]]);
        break;
      case 'king':
        step([[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]);
        break;
      case 'rook':
        slide([[0,1],[0,-1],[1,0],[-1,0]]);
        break;
      case 'bishop':
        slide([[1,1],[1,-1],[-1,1],[-1,-1]]);
        break;
      case 'knight':
        step([[f*2,-1],[f*2,1]]);
        break;
      case 'lance':
        slide([[f,0]]);
        break;
      case 'gold':
        step([[f,0],[f,-1],[f,1],[0,-1],[0,1],[-f,0]]);
        break;
      case 'silver':
        step([[f,0],[f,-1],[f,1],[-f,-1],[-f,1]]);
        break;
      case 'pawn':
        step([[f,0]]);
        break;
    }
  }
  return mvs;
}

// ═══════════════════════════════════════════
//  Check Detection & Legal Moves
// ═══════════════════════════════════════════

function findKing(owner) {
  for (let r = 0; r < SZ; r++)
    for (let c = 0; c < SZ; c++)
      if (board[r][c] && board[r][c].owner === owner && PT[board[r][c].type].k)
        return {r, c};
  return null;
}

function inCheck(owner) {
  const kp = findKing(owner);
  if (!kp) return true;
  const opp = owner === SHU ? WEI : SHU;
  for (let r = 0; r < SZ; r++)
    for (let c = 0; c < SZ; c++)
      if (board[r][c] && board[r][c].owner === opp) {
        const mvs = genMoves(board[r][c].type, r, c, opp);
        if (mvs.some(m => m.r === kp.r && m.c === kp.c)) return true;
      }
  return false;
}

// Legal moves for a board piece (filters out moves leaving own king in check)
function legalMoves(r, c) {
  const pc = board[r][c];
  if (!pc) return [];
  const mvs = genMoves(pc.type, r, c, pc.owner);
  return mvs.filter(m => {
    const cap = board[m.r][m.c];
    board[m.r][m.c] = pc;
    board[r][c] = null;
    const chk = inCheck(pc.owner);
    board[r][c] = pc;
    board[m.r][m.c] = cap;
    return !chk;
  });
}

// Legal drop squares for a hand piece
function legalDrops(type, owner) {
  const f = fwd(owner);
  const sq = [];
  for (let r = 0; r < SZ; r++) {
    for (let c = 0; c < SZ; c++) {
      if (board[r][c]) continue;
      // Pawn: can't drop on last row
      if (type === 'fu') {
        if ((owner === SHU && r === 0) || (owner === WEI && r === 8)) continue;
        // Nifu: can't have 2 pawns in same column
        let nifu = false;
        for (let rr = 0; rr < SZ; rr++)
          if (board[rr][c] && board[rr][c].type === 'fu' && board[rr][c].owner === owner) { nifu = true; break; }
        if (nifu) continue;
      }
      // Check that drop doesn't leave own king in check
      board[r][c] = {type, owner};
      const chk = inCheck(owner);
      board[r][c] = null;
      if (!chk) sq.push({r, c});
    }
  }
  return sq;
}

// All legal moves for a player
function allLegalMoves(player, includeDrops) {
  const mvs = [];
  // Board moves
  for (let r = 0; r < SZ; r++)
    for (let c = 0; c < SZ; c++)
      if (board[r][c] && board[r][c].owner === player) {
        const lm = legalMoves(r, c);
        for (const m of lm)
          mvs.push({t:'move', fr:r, fc:c, tr:m.r, tc:m.c});
      }
  // Drop moves
  if (includeDrops !== false) {
    const unique = [...new Set(hands[player])];
    for (const pt of unique) {
      const ds = legalDrops(pt, player);
      for (const d of ds)
        mvs.push({t:'drop', pt, tr:d.r, tc:d.c, owner:player});
    }
  }
  return mvs;
}

function isCheckmate(player) {
  return inCheck(player) && allLegalMoves(player, true).length === 0;
}

function hasNoMoves(player) {
  return allLegalMoves(player, true).length === 0;
}

// ═══════════════════════════════════════════
//  Move Execution (with undo support)
// ═══════════════════════════════════════════

function doMove(mv) {
  const undo = {mv};
  if (mv.t === 'move') {
    undo.srcPc = board[mv.fr][mv.fc];
    undo.dstPc = board[mv.tr][mv.tc];
    undo.captured = null;
    if (undo.dstPc && !PT[undo.dstPc.type].k) {
      hands[undo.srcPc.owner].push(undo.dstPc.type);
      undo.captured = {type:undo.dstPc.type, hand:undo.srcPc.owner};
    }
    board[mv.tr][mv.tc] = undo.srcPc;
    board[mv.fr][mv.fc] = null;
  } else { // drop
    undo.dstPc = null;
    const idx = hands[mv.owner].indexOf(mv.pt);
    undo.handIdx = idx;
    hands[mv.owner].splice(idx, 1);
    board[mv.tr][mv.tc] = {type:mv.pt, owner:mv.owner};
  }
  return undo;
}

function undoMove(undo) {
  const mv = undo.mv;
  if (mv.t === 'move') {
    board[mv.fr][mv.fc] = undo.srcPc;
    board[mv.tr][mv.tc] = undo.dstPc;
    if (undo.captured) {
      const h = hands[undo.captured.hand];
      h.splice(h.lastIndexOf(undo.captured.type), 1);
    }
  } else {
    board[mv.tr][mv.tc] = null;
    hands[mv.owner].splice(undo.handIdx, 0, mv.pt);
  }
}

// ═══════════════════════════════════════════
//  AI (Minimax with Alpha-Beta)
// ═══════════════════════════════════════════

function evaluate() {
  let shuK = false, weiK = false;
  let score = 0;
  for (let r = 0; r < SZ; r++)
    for (let c = 0; c < SZ; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (PT[p.type].k) {
        if (p.owner === SHU) shuK = true; else weiK = true;
        continue;
      }
      const v = PT[p.type].v;
      if (p.owner === WEI) {
        score += v;
        score += r * 3; // bonus for advancing
      } else {
        score -= v;
        score -= (8 - r) * 3;
      }
    }
  if (!shuK) return 99999;
  if (!weiK) return -99999;
  // Hand pieces
  for (const t of hands[WEI]) score += PT[t].v * 0.8;
  for (const t of hands[SHU]) score -= PT[t].v * 0.8;
  // Check bonuses
  if (inCheck(SHU)) score += 150;
  if (inCheck(WEI)) score -= 150;
  return score;
}

function orderMoves(mvs) {
  return mvs.sort((a, b) => {
    let sa = 0, sb = 0;
    if (a.t === 'move' && board[a.tr][a.tc]) sa = PT[board[a.tr][a.tc].type].v;
    if (b.t === 'move' && board[b.tr][b.tc]) sb = PT[board[b.tr][b.tc].type].v;
    return sb - sa;
  });
}

function minimax(depth, alpha, beta, maximizing) {
  if (depth === 0) return evaluate();
  const player = maximizing ? WEI : SHU;
  // At depth 1, skip drops for performance
  const mvs = orderMoves(allLegalMoves(player, depth >= 2));
  if (mvs.length === 0) {
    return inCheck(player) ? (maximizing ? -90000 + depth : 90000 - depth) : 0;
  }
  if (maximizing) {
    let best = -Infinity;
    for (const mv of mvs) {
      const u = doMove(mv);
      best = Math.max(best, minimax(depth-1, alpha, beta, false));
      undoMove(u);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const mv of mvs) {
      const u = doMove(mv);
      best = Math.min(best, minimax(depth-1, alpha, beta, true));
      undoMove(u);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function aiTurn() {
  if (gameOver) return;
  const mvs = allLegalMoves(WEI, true);
  if (mvs.length === 0) {
    gameOver = true;
    winner = SHU;
    render();
    return;
  }
  let bestScore = -Infinity;
  let bestMvs = [];
  for (const mv of orderMoves(mvs)) {
    const u = doMove(mv);
    const sc = minimax(2, -Infinity, Infinity, false);
    undoMove(u);
    if (sc > bestScore) {
      bestScore = sc;
      bestMvs = [mv];
    } else if (sc === bestScore) {
      bestMvs.push(mv);
    }
  }
  const chosen = bestMvs[Math.floor(Math.random() * bestMvs.length)];
  doMove(chosen);
  if (chosen.t === 'move') {
    lastFrom = {r:chosen.fr, c:chosen.fc};
  } else {
    lastFrom = null;
  }
  lastTo = {r:chosen.tr, c:chosen.tc};
  // Check game over
  if (isCheckmate(SHU)) {
    gameOver = true;
    winner = WEI;
  } else if (hasNoMoves(SHU)) {
    gameOver = true;
    winner = WEI;
  }
  turn = SHU;
  render();
}

// ═══════════════════════════════════════════
//  UI Rendering
// ═══════════════════════════════════════════

function render() {
  renderBoard();
  renderHand(SHU);
  renderHand(WEI);
  renderStatus();
  renderLabels();
}

function renderLabels() {
  const cl = document.getElementById('col-labels');
  if (!cl.children.length) {
    let h = '';
    for (let c = 0; c < SZ; c++) {
      h += `<div class="col-label">${9-c}</div>`;
    }
    cl.innerHTML = h;
  }
  const rl = document.getElementById('row-labels');
  if (!rl.children.length) {
    const rows = '一二三四五六七八九';
    let h = '';
    for (let r = 0; r < SZ; r++) {
      h += `<div class="row-label">${rows[r]}</div>`;
    }
    rl.innerHTML = h;
  }
}

function renderBoard() {
  const el = document.getElementById('board');
  let html = '';
  for (let r = 0; r < SZ; r++) {
    for (let c = 0; c < SZ; c++) {
      const pc = board[r][c];
      let cls = 'cell';
      if (selCell && selCell.r === r && selCell.c === c) cls += ' selected';
      if (lastFrom && lastFrom.r === r && lastFrom.c === c) cls += ' last-from';
      if (lastTo && lastTo.r === r && lastTo.c === c) cls += ' last-to';
      const isTarget = targets.some(t => t.r === r && t.c === c);
      if (isTarget) {
        cls += ' valid-target';
        if (pc) cls += ' has-enemy';
      }
      html += `<div class="${cls}" onclick="clickCell(${r},${c})">`;
      if (pc) {
        const name = PT[pc.type].n;
        const oc = pc.owner === SHU ? 'shu-p' : 'wei-p';
        const bg = pc.owner === SHU ? 'shu-bg' : 'wei-bg';
        const sz = name.length >= 3 ? 'sz3' : name.length === 1 ? 'sz1' : 'sz2';
        html += `<div class="piece-bg ${bg}"></div>`;
        html += `<div class="piece-text ${oc} ${sz}">${name}</div>`;
      } else if (isTarget) {
        html += '<div class="dot"></div>';
      }
      html += '</div>';
    }
  }
  el.innerHTML = html;
}

function renderHand(owner) {
  const el = document.getElementById(owner === SHU ? 'shu-hand' : 'wei-hand');
  const label = owner === SHU ? '【蜀 持駒】' : '【魏 持駒】';
  let html = `<span class="hand-label">${label}</span>`;
  // Count pieces by type
  const counts = {};
  for (const t of hands[owner]) {
    counts[t] = (counts[t] || 0) + 1;
  }
  if (Object.keys(counts).length === 0) {
    html += '<span style="color:#555;font-size:13px">なし</span>';
  }
  for (const [type, cnt] of Object.entries(counts)) {
    const cls = owner === SHU ? 'shu' : 'wei';
    const sel = (selHand === type && turn === owner) ? ' selected' : '';
    const clickable = (owner === SHU && turn === SHU && !gameOver) ? `onclick="clickHand('${type}')"` : '';
    html += `<span class="hand-piece ${cls}${sel}" ${clickable}>${PT[type].n}`;
    if (cnt > 1) html += `<span class="count">x${cnt}</span>`;
    html += '</span>';
  }
  el.innerHTML = html;
}

function renderStatus() {
  const el = document.getElementById('status');
  if (gameOver) {
    el.textContent = winner === SHU ? '蜀の勝利！' : '魏の勝利！';
    el.style.color = winner === SHU ? '#ff6b6b' : '#6b9bff';
    return;
  }
  if (turn === WEI) {
    el.textContent = '魏が考えています...';
    el.style.color = '#6b9bff';
  } else {
    const ck = inCheck(SHU) ? ' 【王手！】' : '';
    el.textContent = '蜀のターンです' + ck;
    el.style.color = '#ffd700';
  }
}

// ═══════════════════════════════════════════
//  Event Handlers
// ═══════════════════════════════════════════

function clearSelection() {
  selCell = null;
  selHand = null;
  targets = [];
}

function clickCell(r, c) {
  if (gameOver || turn !== SHU) return;

  // If a target is clicked, execute the move/drop
  if (targets.some(t => t.r === r && t.c === c)) {
    if (selCell) {
      // Board move
      const mv = {t:'move', fr:selCell.r, fc:selCell.c, tr:r, tc:c};
      const captured = board[r][c];
      doMove(mv);
      lastFrom = {r:selCell.r, c:selCell.c};
      lastTo = {r, c};
      clearSelection();
      // Check game over
      if (isCheckmate(WEI)) { gameOver = true; winner = SHU; }
      else if (hasNoMoves(WEI)) { gameOver = true; winner = SHU; }
      turn = WEI;
      render();
      if (!gameOver) setTimeout(aiTurn, 200);
      return;
    }
    if (selHand) {
      // Drop
      const mv = {t:'drop', pt:selHand, tr:r, tc:c, owner:SHU};
      doMove(mv);
      lastFrom = null;
      lastTo = {r, c};
      clearSelection();
      if (isCheckmate(WEI)) { gameOver = true; winner = SHU; }
      else if (hasNoMoves(WEI)) { gameOver = true; winner = SHU; }
      turn = WEI;
      render();
      if (!gameOver) setTimeout(aiTurn, 200);
      return;
    }
  }

  // Select own piece
  const pc = board[r][c];
  if (pc && pc.owner === SHU) {
    selHand = null;
    if (selCell && selCell.r === r && selCell.c === c) {
      clearSelection();
    } else {
      selCell = {r, c};
      targets = legalMoves(r, c);
    }
    render();
    return;
  }

  // Deselect
  clearSelection();
  render();
}

function clickHand(type) {
  if (gameOver || turn !== SHU) return;
  selCell = null;
  if (selHand === type) {
    clearSelection();
  } else {
    selHand = type;
    targets = legalDrops(type, SHU);
  }
  render();
}

// ═══════════════════════════════════════════
//  Start
// ═══════════════════════════════════════════
initGame();
