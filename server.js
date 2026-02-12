const path = require('path');
const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 8080);
const databaseUrl = process.env.DATABASE_URL;
const forceHttps = process.env.FORCE_HTTPS === 'true';

if (!databaseUrl) {
  throw new Error('DATABASE_URL nao definido. Configure a variavel de ambiente.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.enable('trust proxy');
app.use(express.json({ limit: '1mb' }));

if (forceHttps) {
  app.use((req, res, next) => {
    const proto = req.header('x-forwarded-proto');
    if (req.secure || proto === 'https') {
      next();
      return;
    }

    const host = req.header('host');
    res.redirect(301, `https://${host}${req.originalUrl}`);
  });
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id BIGSERIAL PRIMARY KEY,
      game_type TEXT NOT NULL DEFAULT 'sinuca_brasileira',
      player_a TEXT NOT NULL,
      player_b TEXT NOT NULL,
      target_points INTEGER NOT NULL CHECK (target_points > 0),
      score_a INTEGER NOT NULL DEFAULT 0,
      score_b INTEGER NOT NULL DEFAULT 0,
      current_player INTEGER NOT NULL DEFAULT 0,
      current_ball INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'running',
      winner TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE matches
    ADD COLUMN IF NOT EXISTS game_type TEXT NOT NULL DEFAULT 'sinuca_brasileira';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_events (
      id BIGSERIAL PRIMARY KEY,
      match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON match_events(match_id, id DESC);');
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function parseMatchId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

app.get('/health', asyncHandler(async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true });
  } catch (_error) {
    res.status(500).json({ ok: false, db: false });
  }
}));

app.get('/api/matches', asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  const { rows } = await pool.query(
    `
      SELECT id, game_type, player_a, player_b, target_points, score_a, score_b, current_player, current_ball, status, winner, created_at, updated_at
      FROM matches
      ORDER BY id DESC
      LIMIT $1
    `,
    [limit],
  );
  res.json({ items: rows });
}));

app.post('/api/matches', asyncHandler(async (req, res) => {
  const allowedGameTypes = new Set(['sinuca_brasileira', 'bilhar', 'eight_ball']);
  const gameTypeRaw = String(req.body.gameType || 'sinuca_brasileira').trim();
  const gameType = allowedGameTypes.has(gameTypeRaw) ? gameTypeRaw : 'sinuca_brasileira';
  const playerA = String(req.body.playerA || '').trim() || 'Jogador 1';
  const playerB = String(req.body.playerB || '').trim() || 'Jogador 2';
  const targetPoints = Math.min(Math.max(Number(req.body.targetPoints) || 30, 1), 999);

  const result = await withTransaction(async (client) => {
    const insertedMatch = await client.query(
      `
        INSERT INTO matches (game_type, player_a, player_b, target_points, score_a, score_b, current_player, current_ball, status)
        VALUES ($1, $2, $3, $4, 0, 0, 0, 1, 'running')
        RETURNING *
      `,
      [gameType, playerA, playerB, targetPoints],
    );

    await client.query(
      `
        INSERT INTO match_events (match_id, event_type, message, payload)
        VALUES ($1, 'match_started', $2, $3::jsonb)
      `,
      [
        insertedMatch.rows[0].id,
        `Nova partida (${gameType}): ${playerA} x ${playerB} (meta ${targetPoints} pts).`,
        JSON.stringify({ gameType, playerA, playerB, targetPoints }),
      ],
    );

    return insertedMatch.rows[0];
  });

  res.status(201).json({ match: result });
}));

app.get('/api/matches/:id', asyncHandler(async (req, res) => {
  const matchId = parseMatchId(req.params.id);
  if (!matchId) {
    res.status(400).json({ error: 'match_id_invalido' });
    return;
  }

  const [matchResult, eventResult] = await Promise.all([
    pool.query(
      `
        SELECT id, game_type, player_a, player_b, target_points, score_a, score_b, current_player, current_ball, status, winner, created_at, updated_at
        FROM matches
        WHERE id = $1
      `,
      [matchId],
    ),
    pool.query(
      `
        SELECT id, match_id, event_type, message, payload, created_at
        FROM match_events
        WHERE match_id = $1
        ORDER BY id DESC
        LIMIT 100
      `,
      [matchId],
    ),
  ]);

  if (matchResult.rowCount === 0) {
    res.status(404).json({ error: 'partida_nao_encontrada' });
    return;
  }

  res.json({ match: matchResult.rows[0], events: eventResult.rows });
}));

app.post('/api/matches/:id/state', asyncHandler(async (req, res) => {
  const matchId = parseMatchId(req.params.id);
  if (!matchId) {
    res.status(400).json({ error: 'match_id_invalido' });
    return;
  }

  const scoreA = Math.max(0, Number(req.body.scoreA) || 0);
  const scoreB = Math.max(0, Number(req.body.scoreB) || 0);
  const currentPlayer = Number(req.body.currentPlayer) === 1 ? 1 : 0;
  const currentBall = Math.min(Math.max(Number(req.body.currentBall) || 1, 1), 15);
  const status = req.body.status === 'finished' ? 'finished' : 'running';
  const winner = req.body.winner ? String(req.body.winner) : null;

  const { rows, rowCount } = await pool.query(
    `
      UPDATE matches
      SET score_a = $2,
          score_b = $3,
          current_player = $4,
          current_ball = $5,
          status = $6,
          winner = $7,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [matchId, scoreA, scoreB, currentPlayer, currentBall, status, winner],
  );

  if (rowCount === 0) {
    res.status(404).json({ error: 'partida_nao_encontrada' });
    return;
  }

  res.json({ match: rows[0] });
}));

app.post('/api/matches/:id/events', asyncHandler(async (req, res) => {
  const matchId = parseMatchId(req.params.id);
  if (!matchId) {
    res.status(400).json({ error: 'match_id_invalido' });
    return;
  }

  const eventType = String(req.body.eventType || 'event').slice(0, 60);
  const message = String(req.body.message || '').trim();
  const payload = req.body.payload ?? null;

  if (!message) {
    res.status(400).json({ error: 'mensagem_obrigatoria' });
    return;
  }

  const { rows } = await pool.query(
    `
      INSERT INTO match_events (match_id, event_type, message, payload)
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING *
    `,
    [matchId, eventType, message, JSON.stringify(payload)],
  );

  res.status(201).json({ event: rows[0] });
}));

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'erro_interno' });
});

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`GenSnooker rodando na porta ${port}`);
    });
  })
  .catch((error) => {
    console.error('Falha ao iniciar banco:', error);
    process.exit(1);
  });
