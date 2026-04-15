// ─── Fernschach Engine ───────────────────────────────────────────

const PIECES = {
    K: { white: '\u265A', black: '\u265A', name: 'Koenig' },
    Q: { white: '\u265B', black: '\u265B', name: 'Dame' },
    R: { white: '\u265C', black: '\u265C', name: 'Turm' },
    B: { white: '\u265D', black: '\u265D', name: 'Laeufer' },
    N: { white: '\u265E', black: '\u265E', name: 'Springer' },
    P: { white: '\u265F', black: '\u265F', name: 'Bauer' }
};

const FILES = 'abcdefgh';
const RANKS = '87654321';

class ChessGame {
    constructor() {
        this.reset();
    }

    reset() {
        this.board = this.initBoard();
        this.turn = 'white';
        this.moveHistory = [];
        this.positionHistory = [];
        this.moveNumber = 1;
        this.castling = {
            white: { K: true, Q: true },
            black: { K: true, Q: true }
        };
        this.enPassant = null;
        this.halfmoveClock = 0;
        this.selectedSquare = null;
        this.lastMove = null;
        this.gameOver = false;
        this.positionHistory.push(this.toFEN());
    }

    initBoard() {
        const board = Array(8).fill(null).map(() => Array(8).fill(null));
        const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
        for (let c = 0; c < 8; c++) {
            board[0][c] = { type: back[c], color: 'black' };
            board[1][c] = { type: 'P', color: 'black' };
            board[6][c] = { type: 'P', color: 'white' };
            board[7][c] = { type: back[c], color: 'white' };
        }
        return board;
    }

    at(r, c) {
        if (r < 0 || r > 7 || c < 0 || c > 7) return undefined;
        return this.board[r][c];
    }

    set(r, c, piece) {
        this.board[r][c] = piece;
    }

    findKing(color) {
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++)
                if (this.board[r][c] && this.board[r][c].type === 'K' && this.board[r][c].color === color)
                    return [r, c];
        return null;
    }

    isAttackedBy(r, c, color) {
        for (let fr = 0; fr < 8; fr++)
            for (let fc = 0; fc < 8; fc++) {
                const p = this.board[fr][fc];
                if (p && p.color === color && this.canPieceAttack(fr, fc, r, c))
                    return true;
            }
        return false;
    }

    canPieceAttack(fr, fc, tr, tc) {
        const piece = this.board[fr][fc];
        if (!piece) return false;
        const dr = tr - fr, dc = tc - fc;
        const adr = Math.abs(dr), adc = Math.abs(dc);

        switch (piece.type) {
            case 'P': {
                const dir = piece.color === 'white' ? -1 : 1;
                return dr === dir && adc === 1;
            }
            case 'N':
                return (adr === 2 && adc === 1) || (adr === 1 && adc === 2);
            case 'B':
                return adr === adc && adr > 0 && this.pathClear(fr, fc, tr, tc);
            case 'R':
                return (dr === 0 || dc === 0) && (adr + adc > 0) && this.pathClear(fr, fc, tr, tc);
            case 'Q':
                return ((adr === adc) || (dr === 0 || dc === 0)) && (adr + adc > 0) && this.pathClear(fr, fc, tr, tc);
            case 'K':
                return adr <= 1 && adc <= 1 && (adr + adc > 0);
        }
        return false;
    }

    pathClear(fr, fc, tr, tc) {
        const dr = Math.sign(tr - fr), dc = Math.sign(tc - fc);
        let r = fr + dr, c = fc + dc;
        while (r !== tr || c !== tc) {
            if (this.board[r][c]) return false;
            r += dr; c += dc;
        }
        return true;
    }

    inCheck(color) {
        const king = this.findKing(color);
        if (!king) return false;
        const opp = color === 'white' ? 'black' : 'white';
        return this.isAttackedBy(king[0], king[1], opp);
    }

    // Generate all legal moves for a piece
    getLegalMoves(fr, fc) {
        const piece = this.board[fr][fc];
        if (!piece || piece.color !== this.turn) return [];
        const moves = [];

        const tryMove = (tr, tc, special) => {
            if (tr < 0 || tr > 7 || tc < 0 || tc > 7) return;
            const target = this.board[tr][tc];
            if (target && target.color === piece.color) return;

            // Test if move leaves king in check
            const saved = this.cloneState();
            this.applyRawMove(fr, fc, tr, tc, special);
            const legal = !this.inCheck(piece.color);
            this.restoreState(saved);

            if (legal) moves.push({ fr, fc, tr, tc, special });
        };

        switch (piece.type) {
            case 'P': {
                const dir = piece.color === 'white' ? -1 : 1;
                const startRow = piece.color === 'white' ? 6 : 1;
                const promoRow = piece.color === 'white' ? 0 : 7;

                // Forward
                if (!this.board[fr + dir]?.[fc]) {
                    if (fr + dir === promoRow) {
                        ['Q', 'R', 'B', 'N'].forEach(p => tryMove(fr + dir, fc, { promotion: p }));
                    } else {
                        tryMove(fr + dir, fc);
                    }
                    // Double forward
                    if (fr === startRow && !this.board[fr + dir][fc] && !this.board[fr + 2 * dir]?.[fc]) {
                        tryMove(fr + 2 * dir, fc);
                    }
                }
                // Captures
                for (const dc of [-1, 1]) {
                    const tr = fr + dir, tc2 = fc + dc;
                    if (tc2 < 0 || tc2 > 7) continue;
                    const target = this.board[tr]?.[tc2];
                    if (target && target.color !== piece.color) {
                        if (tr === promoRow) {
                            ['Q', 'R', 'B', 'N'].forEach(p => tryMove(tr, tc2, { promotion: p }));
                        } else {
                            tryMove(tr, tc2);
                        }
                    }
                    // En passant
                    if (this.enPassant && this.enPassant[0] === tr && this.enPassant[1] === tc2) {
                        tryMove(tr, tc2, { enPassant: true });
                    }
                }
                break;
            }
            case 'N':
                for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
                    tryMove(fr + dr, fc + dc);
                break;
            case 'B':
                for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]])
                    for (let i = 1; i < 8; i++) {
                        const tr = fr + dr * i, tc = fc + dc * i;
                        if (tr < 0 || tr > 7 || tc < 0 || tc > 7) break;
                        tryMove(tr, tc);
                        if (this.board[tr][tc]) break;
                    }
                break;
            case 'R':
                for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]])
                    for (let i = 1; i < 8; i++) {
                        const tr = fr + dr * i, tc = fc + dc * i;
                        if (tr < 0 || tr > 7 || tc < 0 || tc > 7) break;
                        tryMove(tr, tc);
                        if (this.board[tr][tc]) break;
                    }
                break;
            case 'Q':
                for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
                    for (let i = 1; i < 8; i++) {
                        const tr = fr + dr * i, tc = fc + dc * i;
                        if (tr < 0 || tr > 7 || tc < 0 || tc > 7) break;
                        tryMove(tr, tc);
                        if (this.board[tr][tc]) break;
                    }
                break;
            case 'K':
                for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
                    tryMove(fr + dr, fc + dc);
                // Castling
                if (!this.inCheck(piece.color)) {
                    const row = piece.color === 'white' ? 7 : 0;
                    if (fr === row && fc === 4) {
                        // Kingside
                        if (this.castling[piece.color].K &&
                            !this.board[row][5] && !this.board[row][6] &&
                            this.board[row][7]?.type === 'R' &&
                            !this.isAttackedBy(row, 5, piece.color === 'white' ? 'black' : 'white') &&
                            !this.isAttackedBy(row, 6, piece.color === 'white' ? 'black' : 'white')) {
                            tryMove(row, 6, { castling: 'K' });
                        }
                        // Queenside
                        if (this.castling[piece.color].Q &&
                            !this.board[row][3] && !this.board[row][2] && !this.board[row][1] &&
                            this.board[row][0]?.type === 'R' &&
                            !this.isAttackedBy(row, 3, piece.color === 'white' ? 'black' : 'white') &&
                            !this.isAttackedBy(row, 2, piece.color === 'white' ? 'black' : 'white')) {
                            tryMove(row, 2, { castling: 'Q' });
                        }
                    }
                }
                break;
        }
        return moves;
    }

    cloneState() {
        return {
            board: this.board.map(row => row.map(p => p ? { ...p } : null)),
            castling: JSON.parse(JSON.stringify(this.castling)),
            enPassant: this.enPassant ? [...this.enPassant] : null,
            halfmoveClock: this.halfmoveClock
        };
    }

    restoreState(state) {
        this.board = state.board;
        this.castling = state.castling;
        this.enPassant = state.enPassant;
        this.halfmoveClock = state.halfmoveClock;
    }

    applyRawMove(fr, fc, tr, tc, special) {
        const piece = this.board[fr][fc];
        this.board[tr][tc] = piece;
        this.board[fr][fc] = null;

        if (special?.enPassant) {
            const capRow = piece.color === 'white' ? tr + 1 : tr - 1;
            this.board[capRow][tc] = null;
        }
        if (special?.castling) {
            const row = piece.color === 'white' ? 7 : 0;
            if (special.castling === 'K') {
                this.board[row][5] = this.board[row][7];
                this.board[row][7] = null;
            } else {
                this.board[row][3] = this.board[row][0];
                this.board[row][0] = null;
            }
        }
        if (special?.promotion) {
            this.board[tr][tc] = { type: special.promotion, color: piece.color };
        }
    }

    makeMove(fr, fc, tr, tc, special) {
        const piece = this.board[fr][fc];
        if (!piece) return null;

        const captured = this.board[tr][tc];
        const moveInfo = {
            fr, fc, tr, tc, piece: { ...piece },
            captured: captured ? { ...captured } : null,
            special: special || null,
            castling: JSON.parse(JSON.stringify(this.castling)),
            enPassant: this.enPassant ? [...this.enPassant] : null,
            halfmoveClock: this.halfmoveClock
        };

        // En passant capture
        if (special?.enPassant) {
            const capRow = piece.color === 'white' ? tr + 1 : tr - 1;
            moveInfo.captured = { ...this.board[capRow][tc] };
            moveInfo.epCaptureRow = capRow;
        }

        this.applyRawMove(fr, fc, tr, tc, special);

        // Update en passant square
        this.enPassant = null;
        if (piece.type === 'P' && Math.abs(tr - fr) === 2) {
            this.enPassant = [(fr + tr) / 2, fc];
        }

        // Update castling rights
        if (piece.type === 'K') {
            this.castling[piece.color].K = false;
            this.castling[piece.color].Q = false;
        }
        if (piece.type === 'R') {
            if (fc === 0) this.castling[piece.color].Q = false;
            if (fc === 7) this.castling[piece.color].K = false;
        }
        if (captured?.type === 'R') {
            if (tc === 0 && tr === (captured.color === 'white' ? 7 : 0)) this.castling[captured.color].Q = false;
            if (tc === 7 && tr === (captured.color === 'white' ? 7 : 0)) this.castling[captured.color].K = false;
        }

        // Halfmove clock
        if (piece.type === 'P' || captured) this.halfmoveClock = 0;
        else this.halfmoveClock++;

        // Build notation
        moveInfo.notation = this.buildNotation(moveInfo, special);

        this.lastMove = { fr, fc, tr, tc };

        // Switch turn
        if (this.turn === 'black') this.moveNumber++;
        this.turn = this.turn === 'white' ? 'black' : 'white';

        // Check for check/checkmate
        const opp = this.turn;
        const inCheck = this.inCheck(opp);
        const hasLegalMoves = this.hasAnyLegalMoves(opp);

        if (inCheck && !hasLegalMoves) {
            moveInfo.notation += '#';
            this.gameOver = 'checkmate';
        } else if (inCheck) {
            moveInfo.notation += '+';
        } else if (!hasLegalMoves) {
            this.gameOver = 'stalemate';
        }

        this.moveHistory.push(moveInfo);
        this.positionHistory.push(this.toFEN());

        return moveInfo;
    }

    buildNotation(moveInfo, special) {
        const { fr, fc, tr, tc, piece, captured } = moveInfo;
        const to = FILES[tc] + RANKS[tr];

        if (special?.castling === 'K') return 'O-O';
        if (special?.castling === 'Q') return 'O-O-O';

        let notation = '';
        if (piece.type === 'P') {
            if (captured) notation = FILES[fc] + 'x';
            notation += to;
            if (special?.promotion) notation += '=' + special.promotion;
        } else {
            notation = piece.type;
            // Disambiguation
            const others = this.findOtherPieces(piece, tr, tc, fr, fc);
            if (others.length > 0) {
                const sameFile = others.some(o => o[1] === fc);
                const sameRank = others.some(o => o[0] === fr);
                if (!sameFile) notation += FILES[fc];
                else if (!sameRank) notation += RANKS[fr];
                else notation += FILES[fc] + RANKS[fr];
            }
            if (captured) notation += 'x';
            notation += to;
        }
        return notation;
    }

    findOtherPieces(piece, tr, tc, fr, fc) {
        const others = [];
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++) {
                if (r === fr && c === fc) continue;
                const p = this.board[r][c];
                if (p && p.type === piece.type && p.color === piece.color) {
                    // Check if this piece can also move to tr,tc
                    const saved = this.cloneState();
                    // Temporarily remove the original piece to avoid interference
                    if (this.canPieceAttack(r, c, tr, tc)) {
                        this.board[r][c] = null;
                        this.board[tr][tc] = p;
                        const origPiece = this.board[fr][fc];
                        this.board[fr][fc] = null;
                        const legal = !this.inCheck(piece.color);
                        this.restoreState(saved);
                        if (legal) others.push([r, c]);
                    } else {
                        this.restoreState(saved);
                    }
                }
            }
        return others;
    }

    hasAnyLegalMoves(color) {
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++)
                if (this.board[r][c]?.color === color && this.getLegalMoves(r, c).length > 0)
                    return true;
        return false;
    }

    undoMove() {
        if (this.moveHistory.length === 0) return false;
        const move = this.moveHistory.pop();
        this.positionHistory.pop();

        // Restore board
        this.board[move.fr][move.fc] = move.piece;

        if (move.special?.enPassant) {
            this.board[move.tr][move.tc] = null;
            this.board[move.epCaptureRow][move.tc] = move.captured;
        } else if (move.special?.castling) {
            this.board[move.tr][move.tc] = null;
            const row = move.piece.color === 'white' ? 7 : 0;
            if (move.special.castling === 'K') {
                this.board[row][7] = this.board[row][5];
                this.board[row][5] = null;
            } else {
                this.board[row][0] = this.board[row][3];
                this.board[row][3] = null;
            }
        } else {
            this.board[move.tr][move.tc] = move.captured;
        }

        this.castling = move.castling;
        this.enPassant = move.enPassant;
        this.halfmoveClock = move.halfmoveClock;
        this.turn = move.piece.color;
        this.gameOver = false;

        if (this.turn === 'black' && this.moveHistory.length > 0) {
            // keep moveNumber
        } else if (this.turn === 'white' && this.moveNumber > 1) {
            // Recalculate move number
        }
        this.moveNumber = Math.floor(this.moveHistory.length / 2) + 1;

        // Restore last move highlight
        if (this.moveHistory.length > 0) {
            const prev = this.moveHistory[this.moveHistory.length - 1];
            this.lastMove = { fr: prev.fr, fc: prev.fc, tr: prev.tr, tc: prev.tc };
        } else {
            this.lastMove = null;
        }

        return true;
    }

    // German to English piece mapping
    translateGermanPiece(ch) {
        const map = { 'S': 'N', 'L': 'B', 'T': 'R', 'D': 'Q', 'K': 'K' };
        return map[ch] || ch;
    }

    // Parse move input: supports "e2-e4", "e2e4", "Nf3", "Sf3", "O-O", etc.
    parseAndMakeMove(input) {
        input = input.trim();
        if (!input) return { error: 'Bitte einen Zug eingeben' };
        if (this.gameOver) return { error: 'Das Spiel ist beendet' };

        // Castling
        if (/^[Oo0]-?[Oo0]-?[Oo0]$/.test(input)) {
            return this.tryCastling('Q');
        }
        if (/^[Oo0]-?[Oo0]$/.test(input)) {
            return this.tryCastling('K');
        }

        // Coordinate notation: e2-e4, e2e4, e2 e4
        const coordMatch = input.match(/^([a-h])([1-8])[\s\-]?([a-h])([1-8])(?:\s*=?\s*([QRBNSLTD]))?$/i);
        if (coordMatch) {
            const fc = FILES.indexOf(coordMatch[1].toLowerCase());
            const fr = RANKS.indexOf(coordMatch[2]);
            const tc = FILES.indexOf(coordMatch[3].toLowerCase());
            const tr = RANKS.indexOf(coordMatch[4]);
            const promo = coordMatch[5] ? this.translateGermanPiece(coordMatch[5].toUpperCase()) : undefined;
            return this.tryCoordMove(fr, fc, tr, tc, promo);
        }

        // Algebraic notation: Nf3, Sf3, Bxe5, Lxe5, Dd1, Tad1, etc.
        const algMatch = input.match(/^([KQRBNSLTD])?([a-h])?([1-8])?(x)?([a-h])([1-8])(?:\s*=?\s*([QRBNSLTD]))?[+#]?$/);
        if (algMatch) {
            const pieceType = algMatch[1] ? this.translateGermanPiece(algMatch[1]) : 'P';
            const disambigFile = algMatch[2] ? FILES.indexOf(algMatch[2]) : null;
            const disambigRank = algMatch[3] ? RANKS.indexOf(algMatch[3]) : null;
            const tc = FILES.indexOf(algMatch[5]);
            const tr = RANKS.indexOf(algMatch[6]);
            const promo = algMatch[7] ? this.translateGermanPiece(algMatch[7].toUpperCase()) : undefined;
            return this.tryAlgebraicMove(pieceType, disambigFile, disambigRank, tr, tc, promo);
        }

        return { error: 'Ungueltiges Format. Versuche z.B. e2-e4, Sf3 oder Nf3' };
    }

    tryCastling(side) {
        const row = this.turn === 'white' ? 7 : 0;
        const king = this.findKing(this.turn);
        if (!king || king[0] !== row || king[1] !== 4)
            return { error: 'Rochade nicht moeglich' };

        const moves = this.getLegalMoves(row, 4);
        const target = side === 'K' ? [row, 6] : [row, 2];
        const move = moves.find(m => m.tr === target[0] && m.tc === target[1] && m.special?.castling === side);
        if (!move) return { error: 'Rochade nicht moeglich' };

        return { move: this.makeMove(move.fr, move.fc, move.tr, move.tc, move.special) };
    }

    tryCoordMove(fr, fc, tr, tc, promo) {
        const piece = this.board[fr][fc];
        if (!piece) return { error: `Kein Stein auf ${FILES[fc]}${RANKS[fr]}` };
        if (piece.color !== this.turn)
            return { error: `${this.turn === 'white' ? 'Weiss' : 'Schwarz'} ist am Zug` };

        const moves = this.getLegalMoves(fr, fc);
        let move = moves.find(m => m.tr === tr && m.tc === tc);

        if (!move) return { error: 'Ungueltiger Zug' };

        // Handle promotion
        if (piece.type === 'P' && (tr === 0 || tr === 7)) {
            const promoType = promo || 'Q';
            move = moves.find(m => m.tr === tr && m.tc === tc && m.special?.promotion === promoType);
            if (!move) return { error: 'Ungueltiger Zug' };
        }

        return { move: this.makeMove(move.fr, move.fc, move.tr, move.tc, move.special) };
    }

    tryAlgebraicMove(pieceType, disambigFile, disambigRank, tr, tc, promo) {
        const candidates = [];
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                if (!p || p.color !== this.turn || p.type !== pieceType) continue;
                if (disambigFile !== null && c !== disambigFile) continue;
                if (disambigRank !== null && r !== disambigRank) continue;

                const moves = this.getLegalMoves(r, c);
                for (const m of moves) {
                    if (m.tr === tr && m.tc === tc) {
                        if (promo && m.special?.promotion !== promo) continue;
                        if (pieceType === 'P' && (tr === 0 || tr === 7) && !m.special?.promotion) continue;
                        if (pieceType === 'P' && (tr === 0 || tr === 7) && !promo && m.special?.promotion !== 'Q') continue;
                        candidates.push(m);
                    }
                }
            }

        if (candidates.length === 0) return { error: 'Ungueltiger Zug' };
        if (candidates.length > 1) return { error: 'Mehrdeutiger Zug, bitte praezisieren' };

        const m = candidates[0];
        return { move: this.makeMove(m.fr, m.fc, m.tr, m.tc, m.special) };
    }

    toFEN() {
        let fen = '';
        for (let r = 0; r < 8; r++) {
            let empty = 0;
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                if (!p) { empty++; continue; }
                if (empty > 0) { fen += empty; empty = 0; }
                let ch = p.type;
                fen += p.color === 'white' ? ch : ch.toLowerCase();
            }
            if (empty > 0) fen += empty;
            if (r < 7) fen += '/';
        }
        fen += ' ' + (this.turn === 'white' ? 'w' : 'b') + ' ';

        let castStr = '';
        if (this.castling.white.K) castStr += 'K';
        if (this.castling.white.Q) castStr += 'Q';
        if (this.castling.black.K) castStr += 'k';
        if (this.castling.black.Q) castStr += 'q';
        fen += castStr || '-';

        fen += ' ';
        if (this.enPassant) fen += FILES[this.enPassant[1]] + RANKS[this.enPassant[0]];
        else fen += '-';

        fen += ` ${this.halfmoveClock} ${this.moveNumber}`;
        return fen;
    }

    getMoveListText() {
        let text = '';
        for (let i = 0; i < this.moveHistory.length; i += 2) {
            const num = Math.floor(i / 2) + 1;
            text += `${num}. ${this.moveHistory[i].notation}`;
            if (i + 1 < this.moveHistory.length) {
                text += ` ${this.moveHistory[i + 1].notation}`;
            }
            text += '\n';
        }
        return text.trim();
    }
}


// ─── Firebase Sync ───────────────────────────────────────────────

const firebaseConfig = {
    apiKey: "AIzaSyC_YhCKhA-cXlfNfdr9hgoWFm3hf0f78Lk",
    authDomain: "schach-mit-joerg.firebaseapp.com",
    projectId: "schach-mit-joerg",
    storageBucket: "schach-mit-joerg.firebasestorage.app",
    messagingSenderId: "58216476791",
    appId: "1:58216476791:web:c9ac721bdbf0b4d2065672",
    databaseURL: "https://schach-mit-joerg-default-rtdb.europe-west1.firebasedatabase.app"
};

class FirebaseSync {
    constructor(onUpdate) {
        this.onUpdate = onUpdate;
        this.db = null;
        this.gameRef = null;
        this.connected = false;
        this.ignoreNext = false;
        this.init();
    }

    init() {
        try {
            const app = firebase.initializeApp(firebaseConfig);
            this.db = firebase.database();
            this.gameRef = this.db.ref('games/default');

            // Connection status
            this.db.ref('.info/connected').on('value', (snap) => {
                this.connected = snap.val() === true;
                this.updateStatusUI();
            });

            // Listen for changes from other players
            this.gameRef.on('value', (snap) => {
                if (this.ignoreNext) {
                    this.ignoreNext = false;
                    return;
                }
                const data = snap.val();
                if (data && this.onUpdate) {
                    this.onUpdate(data);
                }
            });
        } catch (e) {
            console.error('Firebase init error:', e);
            this.updateStatusUI();
        }
    }

    save(moves, extra) {
        if (!this.gameRef) return;
        this.ignoreNext = true;
        const data = {
            moves: moves.map(m => ({
                fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc,
                special: m.special || null, notation: m.notation
            })),
            updatedAt: Date.now(),
            moveCount: moves.length,
            startTime: (extra && extra.startTime) || null,
            moveTs: (extra && extra.moveTs) || [],
            moveDurationDays: (extra && extra.moveDurationDays) || 7
        };
        this.gameRef.set(data);
    }

    updateStatusUI() {
        const el = document.getElementById('sync-status');
        if (!el) return;
        if (this.connected) {
            el.textContent = 'Online';
            el.className = 'sync-status online';
        } else {
            el.textContent = 'Offline';
            el.className = 'sync-status offline';
        }
    }
}


// ─── UI ──────────────────────────────────────────────────────────

// ─── Berlin / DST helpers ────────────────────────────────────────

function berlinParts(date) {
    const parts = new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZoneName: 'short'
    }).formatToParts(date);
    const get = (k) => (parts.find(p => p.type === k) || {}).value;
    return {
        year: +get('year'), month: +get('month'), day: +get('day'),
        hour: +get('hour'), minute: +get('minute'), second: +get('second'),
        tz: get('timeZoneName') || ''
    };
}

// Interpret (y,m,d,h,mi,s) as Europe/Berlin wall-clock time, return UTC Date
function berlinWallToDate(y, m, d, h, mi, s) {
    let utc = Date.UTC(y, m - 1, d, h, mi, s);
    for (let i = 0; i < 3; i++) {
        const p = berlinParts(new Date(utc));
        const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
        const diff = seen - utc;
        if (diff === 0) break;
        utc -= diff;
    }
    return new Date(utc);
}

// Add `days` calendar days on the Berlin wall-clock (DST-aware)
function addBerlinDays(ts, days) {
    const p = berlinParts(new Date(ts));
    return berlinWallToDate(p.year, p.month, p.day + days, p.hour, p.minute, p.second).getTime();
}

function fmtBerlinFull(ts) {
    if (!ts) return '—';
    return new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin',
        dateStyle: 'short', timeStyle: 'medium'
    }).format(new Date(ts));
}

function fmtDuration(ms) {
    const neg = ms < 0;
    ms = Math.abs(ms);
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const mi = Math.floor((s % 3600) / 60);
    const se = s % 60;
    const pad = n => String(n).padStart(2, '0');
    const str = `${d}d ${pad(h)}:${pad(mi)}:${pad(se)}`;
    return neg ? '-' + str : str;
}


class ChessUI {
    constructor() {
        this.game = new ChessGame();
        this.flipped = false;
        this.manualFlip = false;
        this.selectedSquare = null;
        this.validMoves = [];

        // Game timing state
        this.startTime = null;
        this.moveTs = [];
        this.moveDurationDays = 7;

        this.boardEl = document.getElementById('board');
        this.statusEl = document.getElementById('status');
        this.movesListEl = document.getElementById('moves-list');
        this.moveInput = document.getElementById('move-input');
        this.errorEl = document.getElementById('error');

        this.setupBoard();
        this.setupCoords();
        this.setupEvents();

        // Analysis board
        this.analysis = new AnalysisUI(this);

        // Theory panel
        this.theory = new TheoryPanel(this);

        this._loading = true;
        this.render();

        // Berlin clock tick
        this.tickClocks();
        setInterval(() => this.tickClocks(), 1000);

        // Firebase sync
        this.sync = new FirebaseSync((data) => this.onFirebaseUpdate(data));
        this.loadFromStorage();

        // Enable flip-animation once initial loads have settled
        setTimeout(() => { this._loading = false; }, 1800);
    }

    setupBoard() {
        this.squares = [];
        for (let i = 0; i < 64; i++) {
            const sq = document.createElement('div');
            sq.className = 'square';
            sq.dataset.index = i;
            sq.addEventListener('click', () => this.onSquareClick(i));
            this.boardEl.appendChild(sq);
            this.squares.push(sq);
        }
    }

    setupCoords() {
        const bottomEl = document.getElementById('coords-bottom');
        const leftEl = document.getElementById('coords-left');
        for (let i = 0; i < 8; i++) {
            const file = document.createElement('span');
            file.textContent = this.flipped ? FILES[7 - i] : FILES[i];
            bottomEl.appendChild(file);
        }
        for (let i = 0; i < 8; i++) {
            const rank = document.createElement('span');
            rank.textContent = this.flipped ? i + 1 : 8 - i;
            leftEl.appendChild(rank);
        }
    }

    updateCoords() {
        const bottomEl = document.getElementById('coords-bottom');
        const leftEl = document.getElementById('coords-left');
        bottomEl.innerHTML = '';
        leftEl.innerHTML = '';
        for (let i = 0; i < 8; i++) {
            const file = document.createElement('span');
            file.textContent = this.flipped ? FILES[7 - i] : FILES[i];
            bottomEl.appendChild(file);
        }
        for (let i = 0; i < 8; i++) {
            const rank = document.createElement('span');
            rank.textContent = this.flipped ? i + 1 : 8 - i;
            leftEl.appendChild(rank);
        }
    }

    setupEvents() {
        document.getElementById('move-btn').addEventListener('click', () => this.onMoveSubmit());
        this.moveInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.onMoveSubmit();
        });
        document.getElementById('undo-btn').addEventListener('click', () => this.onUndo());
        document.getElementById('reset-btn').addEventListener('click', () => this.onReset());
        document.getElementById('flip-btn').addEventListener('click', () => this.onFlip());
        document.getElementById('export-btn').addEventListener('click', () => this.onExport());
        document.getElementById('fen-btn').addEventListener('click', () => this.onFEN());

        const durSel = document.getElementById('move-duration');
        if (durSel) {
            durSel.addEventListener('change', () => {
                this.moveDurationDays = parseInt(durSel.value, 10) || 7;
                this.saveToStorage();
                this.tickClocks();
            });
        }
    }

    autoFlip() {
        if (this.manualFlip) return;
        const want = this.game.turn === 'black';
        if (want === this.flipped) return;

        // During initial load (constructor + first Firebase callback): flip silently
        if (this._loading) {
            this.flipped = want;
            this.updateCoords();
            return;
        }

        // Avoid stacking animations
        if (this._flipping) return;
        this._flipping = true;

        const overlay = document.getElementById('flip-overlay');
        // Phase 1: 1s delay with piece on its final square
        setTimeout(() => {
            if (overlay) overlay.classList.add('show');
            // Phase 2: 2s overlay, then rotate
            setTimeout(() => {
                this.flipped = want;
                this.updateCoords();
                this.renderBoard();
                if (this.analysis) this.analysis.onMainUpdated();
                if (overlay) overlay.classList.remove('show');
                this._flipping = false;
            }, 2000);
        }, 1000);
    }

    toBoardIndex(row, col) {
        if (this.flipped) return (7 - row) * 8 + (7 - col);
        return row * 8 + col;
    }

    fromBoardIndex(index) {
        let row = Math.floor(index / 8);
        let col = index % 8;
        if (this.flipped) { row = 7 - row; col = 7 - col; }
        return [row, col];
    }

    onSquareClick(index) {
        const [row, col] = this.fromBoardIndex(index);
        const piece = this.game.at(row, col);

        if (this.selectedSquare) {
            const [sr, sc] = this.selectedSquare;
            // Try to move
            const move = this.validMoves.find(m => m.tr === row && m.tc === col);
            if (move) {
                // Handle promotion choice
                if (move.special?.promotion && move.special.promotion !== 'Q') {
                    const queenMove = this.validMoves.find(m => m.tr === row && m.tc === col && m.special?.promotion === 'Q');
                    if (queenMove) {
                        this.game.makeMove(queenMove.fr, queenMove.fc, queenMove.tr, queenMove.tc, queenMove.special);
                    }
                } else {
                    this.game.makeMove(move.fr, move.fc, move.tr, move.tc, move.special);
                }
                this.stampMove();
                this.selectedSquare = null;
                this.validMoves = [];
                this.clearError();
                this.render();
                this.saveToStorage();
                return;
            }

            // Deselect if clicking same square
            if (sr === row && sc === col) {
                this.selectedSquare = null;
                this.validMoves = [];
                this.render();
                return;
            }
        }

        // Select new piece
        if (piece && piece.color === this.game.turn) {
            this.selectedSquare = [row, col];
            this.validMoves = this.game.getLegalMoves(row, col);
            this.render();
        } else {
            this.selectedSquare = null;
            this.validMoves = [];
            this.render();
        }
    }

    onMoveSubmit() {
        const input = this.moveInput.value;
        const result = this.game.parseAndMakeMove(input);
        if (result.error) {
            this.showError(result.error);
            return;
        }
        this.stampMove();
        this.moveInput.value = '';
        this.selectedSquare = null;
        this.validMoves = [];
        this.clearError();
        this.render();
        this.saveToStorage();
    }

    stampMove() {
        const now = Date.now();
        if (!this.startTime) this.startTime = now;
        this.moveTs.push(now);
    }

    onUndo() {
        if (this.game.undoMove()) {
            if (this.moveTs.length) this.moveTs.pop();
            this.selectedSquare = null;
            this.validMoves = [];
            this.clearError();
            this.render();
            this.saveToStorage();
        }
    }

    onReset() {
        if (this.game.moveHistory.length > 0 && !confirm('Neues Spiel starten? Alle Zuege gehen verloren.')) return;
        this.game.reset();
        this.startTime = null;
        this.moveTs = [];
        this.selectedSquare = null;
        this.validMoves = [];
        this.clearError();
        this.render();
        this.saveToStorage();
    }

    onFlip() {
        this.flipped = !this.flipped;
        this.manualFlip = true;
        this.updateCoords();
        this.render();
    }

    onExport() {
        const text = this.game.getMoveListText();
        if (!text) { this.showError('Noch keine Zuege'); return; }
        navigator.clipboard.writeText(text).then(() => {
            this.showError('Zugliste kopiert!');
            this.errorEl.style.color = '#2ecc71';
            setTimeout(() => { this.errorEl.style.color = ''; }, 2000);
        });
    }

    onFEN() {
        const fen = this.game.toFEN();
        navigator.clipboard.writeText(fen).then(() => {
            this.showError('FEN kopiert!');
            this.errorEl.style.color = '#2ecc71';
            setTimeout(() => { this.errorEl.style.color = ''; }, 2000);
        });
    }

    showError(msg) { this.errorEl.textContent = msg; }
    clearError() { this.errorEl.textContent = ''; }

    render() {
        this.autoFlip();
        this.renderBoard();
        this.renderStatus();
        this.renderMoveList();
        this.tickClocks();
        if (this.analysis) this.analysis.onMainUpdated();
        if (this.theory) this.theory.refresh(this.game.toFEN());
    }

    tickClocks() {
        // Berlin clock
        const now = Date.now();
        const bd = document.getElementById('berlin-date');
        const bt = document.getElementById('berlin-time');
        const btz = document.getElementById('berlin-tz');
        const ut = document.getElementById('utc-time');
        if (bd && bt) {
            const d = new Date(now);
            const dateStr = new Intl.DateTimeFormat('de-DE', {
                timeZone: 'Europe/Berlin', weekday: 'long',
                year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(d);
            const timeStr = new Intl.DateTimeFormat('de-DE', {
                timeZone: 'Europe/Berlin',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
            }).format(d);
            bd.textContent = dateStr;
            bt.textContent = timeStr;
            const tz = berlinParts(d).tz;
            btz.textContent = 'Zeitzone: Europe/Berlin (' + tz + ')';
            ut.textContent = 'UTC ' + new Intl.DateTimeFormat('de-DE', {
                timeZone: 'UTC',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
            }).format(d);
        }
        // Chess clock
        const gs = document.getElementById('game-start');
        const lm = document.getElementById('last-move-time');
        const dl = document.getElementById('deadline-time');
        const cd = document.getElementById('countdown');
        const cdl = document.getElementById('countdown-label');
        if (!gs || !lm || !dl || !cd || !cdl) return;

        gs.textContent = this.startTime ? fmtBerlinFull(this.startTime) : '—';
        const lastTs = this.moveTs.length ? this.moveTs[this.moveTs.length - 1] : this.startTime;
        lm.textContent = lastTs ? fmtBerlinFull(lastTs) : '—';

        if (lastTs) {
            const deadline = addBerlinDays(lastTs, this.moveDurationDays);
            dl.textContent = fmtBerlinFull(deadline);
            const remain = deadline - now;
            cd.textContent = fmtDuration(remain);
            cd.classList.toggle('expired', remain < 0);
            cd.classList.toggle('urgent', remain >= 0 && remain < 24 * 3600 * 1000);
        } else {
            dl.textContent = '—';
            cd.textContent = '—';
            cd.classList.remove('expired', 'urgent');
        }
        cdl.textContent = this.game.turn === 'white' ? 'Weiss am Zug' : 'Schwarz am Zug';

        const sel = document.getElementById('move-duration');
        if (sel && +sel.value !== this.moveDurationDays) {
            sel.value = String(this.moveDurationDays);
        }
    }

    renderBoard() {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const idx = this.toBoardIndex(r, c);
                const sq = this.squares[idx];
                const piece = this.game.at(r, c);

                sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');

                // Last move highlight
                if (this.game.lastMove) {
                    const lm = this.game.lastMove;
                    if (r === lm.fr && c === lm.fc) sq.classList.add('last-from');
                    if (r === lm.tr && c === lm.tc) sq.classList.add('last-to');
                }

                // Selection
                if (this.selectedSquare && this.selectedSquare[0] === r && this.selectedSquare[1] === c) {
                    sq.classList.add('selected');
                }

                // Valid move indicators
                const isValidTarget = this.validMoves.some(m => m.tr === r && m.tc === c);
                if (isValidTarget) {
                    if (piece) sq.classList.add('valid-capture');
                    else sq.classList.add('valid-move');
                }

                if (piece) {
                    sq.textContent = PIECES[piece.type][piece.color];
                    sq.classList.add('piece-' + piece.color);
                } else {
                    sq.textContent = '';
                }
            }
        }
    }

    renderStatus() {
        const check = this.game.inCheck(this.game.turn);
        this.statusEl.className = 'status';

        if (this.game.gameOver === 'checkmate') {
            const winner = this.game.turn === 'white' ? 'Schwarz' : 'Weiss';
            this.statusEl.textContent = `Schachmatt! ${winner} gewinnt!`;
            this.statusEl.classList.add('checkmate');
        } else if (this.game.gameOver === 'stalemate') {
            this.statusEl.textContent = 'Patt - Unentschieden!';
        } else if (check) {
            this.statusEl.textContent = (this.game.turn === 'white' ? 'Weiss' : 'Schwarz') + ' im Schach!';
            this.statusEl.classList.add('check');
        } else {
            this.statusEl.textContent = (this.game.turn === 'white' ? 'Weiss' : 'Schwarz') + ' am Zug';
            this.statusEl.classList.add(this.game.turn === 'white' ? 'white-turn' : 'black-turn');
        }
    }

    renderMoveList() {
        const history = this.game.moveHistory;
        if (history.length === 0) {
            this.movesListEl.innerHTML = '<div class="moves-placeholder">Noch keine Zuege</div>';
            return;
        }

        let html = '';
        for (let i = 0; i < history.length; i += 2) {
            const num = Math.floor(i / 2) + 1;
            const whiteMove = history[i];
            const blackMove = history[i + 1];

            html += '<div class="move-row">';
            html += `<span class="move-number">${num}.</span>`;
            html += `<span class="move-white">${whiteMove.notation}</span>`;
            if (blackMove) {
                html += `<span class="move-black">${blackMove.notation}</span>`;
            }
            html += '</div>';
        }

        this.movesListEl.innerHTML = html;
        this.movesListEl.scrollTop = this.movesListEl.scrollHeight;
    }

    saveToStorage() {
        const moves = this.game.moveHistory.map(m => ({
            fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc,
            special: m.special || null, notation: m.notation
        }));
        const payload = {
            moves, fen: this.game.toFEN(),
            startTime: this.startTime,
            moveTs: this.moveTs,
            moveDurationDays: this.moveDurationDays
        };
        try { localStorage.setItem('fernschach', JSON.stringify(payload)); } catch (e) {}
        if (this.sync) {
            this.sync.save(this.game.moveHistory, {
                startTime: this.startTime,
                moveTs: this.moveTs,
                moveDurationDays: this.moveDurationDays
            });
        }
    }

    loadFromStorage() {
        try {
            const raw = localStorage.getItem('fernschach');
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data.moves || data.moves.length === 0) {
                if (typeof data.moveDurationDays === 'number') this.moveDurationDays = data.moveDurationDays;
                return;
            }
            this.game.reset();
            for (const m of data.moves) {
                const result = this.game.makeMove(m.fr, m.fc, m.tr, m.tc, m.special);
                if (!result) break;
            }
            this.startTime = data.startTime || null;
            this.moveTs = Array.isArray(data.moveTs) ? data.moveTs : [];
            if (typeof data.moveDurationDays === 'number') this.moveDurationDays = data.moveDurationDays;
            this.render();
        } catch (e) { /* ignore */ }
    }

    onFirebaseUpdate(data) {
        if (!data || !data.moves) return;
        const moves = data.moves;

        // Always rebuild from scratch — DB is source of truth
        this.game.reset();
        for (const m of moves) {
            const result = this.game.makeMove(m.fr, m.fc, m.tr, m.tc, m.special || null);
            if (!result) break;
        }
        this.startTime = data.startTime || null;
        this.moveTs = Array.isArray(data.moveTs) ? data.moveTs : [];
        if (typeof data.moveDurationDays === 'number') this.moveDurationDays = data.moveDurationDays;

        this.selectedSquare = null;
        this.validMoves = [];
        this.render();

        try {
            localStorage.setItem('fernschach', JSON.stringify({
                moves, fen: this.game.toFEN(),
                startTime: this.startTime, moveTs: this.moveTs,
                moveDurationDays: this.moveDurationDays
            }));
        } catch (e) { /* ignore */ }
    }
}


// ─── Analyse-Brett ───────────────────────────────────────────────

class AnalysisUI {
    constructor(main) {
        this.main = main;
        this.game = new ChessGame();
        this.flipped = false;
        this.selected = null;
        this.validMoves = [];

        this.boardEl = document.getElementById('analysis-board');
        if (!this.boardEl) return;
        this.squares = [];
        for (let i = 0; i < 64; i++) {
            const sq = document.createElement('div');
            sq.className = 'square';
            sq.dataset.index = i;
            sq.addEventListener('click', () => this.onSquareClick(i));
            this.boardEl.appendChild(sq);
            this.squares.push(sq);
        }
        this.setupCoords();

        const resetBtn = document.getElementById('analysis-reset');
        const undoBtn = document.getElementById('analysis-undo');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetToMain());
        if (undoBtn) undoBtn.addEventListener('click', () => {
            if (this.game.undoMove()) { this.selected = null; this.validMoves = []; this.render(); }
        });

        this.resetToMain();
    }

    setupCoords() {
        const b = document.getElementById('analysis-coords-bottom');
        const l = document.getElementById('analysis-coords-left');
        if (!b || !l) return;
        b.innerHTML = ''; l.innerHTML = '';
        for (let i = 0; i < 8; i++) {
            const f = document.createElement('span');
            f.textContent = this.flipped ? FILES[7 - i] : FILES[i];
            b.appendChild(f);
        }
        for (let i = 0; i < 8; i++) {
            const r = document.createElement('span');
            r.textContent = this.flipped ? i + 1 : 8 - i;
            l.appendChild(r);
        }
    }

    toIdx(r, c) { return this.flipped ? (7 - r) * 8 + (7 - c) : r * 8 + c; }
    fromIdx(i) {
        let r = Math.floor(i / 8), c = i % 8;
        if (this.flipped) { r = 7 - r; c = 7 - c; }
        return [r, c];
    }

    onMainUpdated() {
        // Mirror main board flip so view matches side-on-move
        if (this.flipped !== this.main.flipped) {
            this.flipped = this.main.flipped;
            this.setupCoords();
        }
        // Auto-reset to match the real position (variant exploration restarts from current)
        this.resetToMain();
    }

    resetToMain() {
        if (!this.boardEl) return;
        const fen = this.main.game.toFEN();
        // Clone state via FEN-based reconstruction: replay all moves
        this.game.reset();
        for (const m of this.main.game.moveHistory) {
            const r = this.game.makeMove(m.fr, m.fc, m.tr, m.tc, m.special || null);
            if (!r) break;
        }
        this.selected = null;
        this.validMoves = [];
        this.render();
    }

    onSquareClick(i) {
        const [r, c] = this.fromIdx(i);
        const piece = this.game.at(r, c);
        if (this.selected) {
            const mv = this.validMoves.find(m => m.tr === r && m.tc === c);
            if (mv) {
                const special = mv.special?.promotion && mv.special.promotion !== 'Q'
                    ? this.validMoves.find(m => m.tr === r && m.tc === c && m.special?.promotion === 'Q')?.special
                    : mv.special;
                this.game.makeMove(mv.fr, mv.fc, mv.tr, mv.tc, special);
                this.selected = null; this.validMoves = [];
                this.render();
                return;
            }
            if (this.selected[0] === r && this.selected[1] === c) {
                this.selected = null; this.validMoves = []; this.render(); return;
            }
        }
        if (piece && piece.color === this.game.turn) {
            this.selected = [r, c];
            this.validMoves = this.game.getLegalMoves(r, c);
        } else {
            this.selected = null; this.validMoves = [];
        }
        this.render();
    }

    render() {
        if (!this.boardEl) return;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const idx = this.toIdx(r, c);
                const sq = this.squares[idx];
                const piece = this.game.at(r, c);
                sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');

                if (this.game.lastMove) {
                    const lm = this.game.lastMove;
                    if (r === lm.fr && c === lm.fc) sq.classList.add('last-from');
                    if (r === lm.tr && c === lm.tc) sq.classList.add('last-to');
                }
                if (this.selected && this.selected[0] === r && this.selected[1] === c) sq.classList.add('selected');
                const isValid = this.validMoves.some(m => m.tr === r && m.tc === c);
                if (isValid) {
                    if (piece) sq.classList.add('valid-capture');
                    else sq.classList.add('valid-move');
                }
                if (piece) {
                    sq.textContent = PIECES[piece.type][piece.color];
                    sq.classList.add('piece-' + piece.color);
                } else sq.textContent = '';
            }
        }
        const t = document.getElementById('analysis-turn');
        if (t) t.textContent = (this.game.turn === 'white' ? 'Weiss' : 'Schwarz') + ' am Zug';
    }
}


// ─── Theorie-Panel (Lichess Masters) ─────────────────────────────

class TheoryPanel {
    constructor(main) {
        this.main = main;
        this.listEl = document.getElementById('theory-list');
        this.openingEl = document.getElementById('theory-opening');
        this.subEl = document.getElementById('theory-sub');
        this.lastFen = null;
        this.inFlight = 0;
    }

    refresh(fen) {
        if (!this.listEl) return;
        if (fen === this.lastFen) return;
        this.lastFen = fen;
        const myReq = ++this.inFlight;
        this.listEl.innerHTML = '<div class="moves-placeholder">Lade Theorie...</div>';
        if (this.openingEl) this.openingEl.textContent = '';

        const url = 'https://explorer.lichess.ovh/masters?fen=' + encodeURIComponent(fen) + '&moves=5&topGames=0';
        fetch(url)
            .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
            .then(data => {
                if (myReq !== this.inFlight) return;
                this.renderMasters(data);
            })
            .catch(() => {
                if (myReq !== this.inFlight) return;
                // Fallback: Lichess player DB
                const url2 = 'https://explorer.lichess.ovh/lichess?fen=' + encodeURIComponent(fen)
                    + '&moves=5&topGames=0&speeds=blitz,rapid,classical&ratings=2000,2200,2500';
                fetch(url2)
                    .then(r => r.json())
                    .then(data => {
                        if (myReq !== this.inFlight) return;
                        if (this.subEl) this.subEl.textContent = 'Lichess Spieler-Datenbank (2000+)';
                        this.renderMasters(data);
                    })
                    .catch(() => {
                        if (myReq !== this.inFlight) return;
                        this.listEl.innerHTML = '<div class="moves-placeholder">Theorie derzeit nicht erreichbar.</div>';
                    });
            });
    }

    renderMasters(data) {
        if (this.subEl) this.subEl.textContent = 'Lichess Masters-Datenbank';
        if (this.openingEl) {
            this.openingEl.textContent = data && data.opening
                ? (data.opening.eco + ' — ' + data.opening.name)
                : '';
        }
        const moves = (data && data.moves) || [];
        if (!moves.length) {
            this.listEl.innerHTML = '<div class="moves-placeholder">Keine Theorie-Zuege gefunden.</div>';
            return;
        }
        const top = moves.slice(0, 5);
        const totalGames = top.reduce((s, m) => s + (m.white + m.draws + m.black), 0);
        this.listEl.innerHTML = '';
        for (const m of top) {
            const games = m.white + m.draws + m.black;
            const pct = n => games ? Math.round(n / games * 100) : 0;
            const row = document.createElement('div');
            row.className = 'theory-row';
            row.title = `${m.san}: ${games} Partien, Weiss ${pct(m.white)}% / Remis ${pct(m.draws)}% / Schwarz ${pct(m.black)}%`;
            row.innerHTML = `
                <div class="theory-san">${m.san}</div>
                <div class="theory-games">${games.toLocaleString('de-DE')} P.</div>
                <div class="theory-bar">
                    <div class="bw" style="width:${pct(m.white)}%"><span>${pct(m.white)}%</span></div>
                    <div class="bd" style="width:${pct(m.draws)}%"><span>${pct(m.draws)}%</span></div>
                    <div class="bb" style="width:${pct(m.black)}%"><span>${pct(m.black)}%</span></div>
                </div>
            `;
            row.addEventListener('click', () => {
                const inp = document.getElementById('move-input');
                if (inp) { inp.value = m.san; inp.focus(); }
            });
            this.listEl.appendChild(row);
        }
        if (this.subEl) {
            this.subEl.textContent += ` — ${totalGames.toLocaleString('de-DE')} Partien in Top ${top.length}`;
        }
    }
}

// Start
document.addEventListener('DOMContentLoaded', () => {
    window.chessUI = new ChessUI();
});
