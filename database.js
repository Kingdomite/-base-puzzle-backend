require('dotenv').config();
const { Pool } = require('pg');

// Direct connection using environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Create tables
async function setupDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Setting up database tables...');

    // Players table
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        address VARCHAR(42) PRIMARY KEY,
        total_games INTEGER DEFAULT 0,
        best_score INTEGER DEFAULT 0,
        total_lines_cleared INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Games table
    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        player_address VARCHAR(42) REFERENCES players(address),
        tournament_id INTEGER,
        score INTEGER NOT NULL,
        lines_cleared INTEGER DEFAULT 0,
        duration INTEGER,
        is_tournament BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Achievements table
    await client.query(`
      CREATE TABLE IF NOT EXISTS achievements (
        player_address VARCHAR(42),
        achievement_id INTEGER,
        earned_at TIMESTAMP DEFAULT NOW(),
        minted BOOLEAN DEFAULT false,
        PRIMARY KEY (player_address, achievement_id)
      )
    `);

    // Tournament stats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tournament_stats (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER UNIQUE NOT NULL,
        total_participants INTEGER DEFAULT 0,
        prize_pool DECIMAL(18, 8) DEFAULT 0,
        winner1 VARCHAR(42),
        winner2 VARCHAR(42),
        winner3 VARCHAR(42),
        finalized BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Database tables created successfully!');
  } catch (error) {
    console.error('❌ Error setting up database:', error);
  } finally {
    client.release();
  }
}

// Run setup if called directly
if (require.main === module) {
  setupDatabase()
    .then(() => {
      console.log('Database setup complete!');
      process.exit(0);
    })
    .catch(err => {
      console.error('Setup failed:', err);
      process.exit(1);
    });
}

module.exports = { pool, setupDatabase };
