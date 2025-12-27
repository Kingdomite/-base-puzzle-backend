require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase client (uses REST API instead of direct PostgreSQL)
const supabase = createClient(
  'https://pbiigclgmipjbptwjorn.supabase.co',
  process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaWlnY2xnbWlwamJwdHdqb3JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUxNzY5NzAsImV4cCI6MjA1MDc1Mjk3MH0.0MlRo7wjZdNQU2Gc1Uf2Xr6JZZFzQqZNjKWZiNnJ8vk'
);

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Setup database tables (call this once after deployment)
app.get('/setup-db', async (req, res) => {
  const { setupDatabase } = require('./database');
  try {
    await setupDatabase();
    res.json({ success: true, message: 'Database tables created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ GAME ENDPOINTS ============

// Submit game score (using Supabase REST API)
app.post('/api/games/submit', async (req, res) => {
  const { playerAddress, score, linesCleared, duration, isTournament, tournamentId } = req.body;
  const address = playerAddress.toLowerCase();

  try {
    // Check if player exists
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('*')
      .eq('address', address)
      .single();

    if (existingPlayer) {
      // Update existing player
      await supabase
        .from('players')
        .update({
          total_games: existingPlayer.total_games + 1,
          best_score: Math.max(existingPlayer.best_score, score),
          total_lines_cleared: existingPlayer.total_lines_cleared + linesCleared
        })
        .eq('address', address);
    } else {
      // Insert new player
      await supabase
        .from('players')
        .insert({
          address,
          total_games: 1,
          best_score: score,
          total_lines_cleared: linesCleared
        });
    }

    // Insert game record
    const { data: gameData, error: gameError } = await supabase
      .from('games')
      .insert({
        player_address: address,
        score,
        lines_cleared: linesCleared,
        duration,
        is_tournament: isTournament,
        tournament_id: tournamentId
      })
      .select()
      .single();

    if (gameError) throw gameError;

    res.json({ 
      success: true, 
      gameId: gameData.id,
      message: 'Score recorded successfully'
    });
  } catch (error) {
    console.error('Error submitting score:', error);
    res.status(500).json({ error: 'Failed to submit score', details: error.message });
  }
});

// Get player stats (using Supabase REST API)
app.get('/api/players/:address', async (req, res) => {
  const { address } = req.params;
  const lowerAddress = address.toLowerCase();

  try {
    // Get player data
    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('address', lowerAddress)
      .single();

    if (playerError && playerError.code !== 'PGRST116') throw playerError;

    // Get achievements
    const { data: achievementsData, error: achievementsError } = await supabase
      .from('achievements')
      .select('achievement_id, earned_at, minted')
      .eq('player_address', lowerAddress);

    if (achievementsError) throw achievementsError;

    if (!playerData) {
      return res.json({ exists: false });
    }

    res.json({
      exists: true,
      player: playerData,
      achievements: achievementsData || []
    });
  } catch (error) {
    console.error('Error fetching player:', error);
    res.status(500).json({ error: 'Failed to fetch player data', details: error.message });
  }
});

// ============ ACHIEVEMENT ENDPOINTS ============

const { ethers } = require('ethers');

// Generate achievement signature (using Supabase REST API)
app.post('/api/achievements/signature', async (req, res) => {
  const { playerAddress, achievementId } = req.body;
  const lowerAddress = playerAddress.toLowerCase();

  try {
    // Check if player has earned this achievement
    const { data, error } = await supabase
      .from('achievements')
      .select('*')
      .eq('player_address', lowerAddress)
      .eq('achievement_id', achievementId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (!data) {
      return res.status(403).json({ error: 'Achievement not earned' });
    }

    // Generate signature
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    const messageHash = ethers.solidityPackedKeccak256(
      ['address', 'uint256'],
      [playerAddress, achievementId]
    );
    const signature = await wallet.signMessage(ethers.getBytes(messageHash));

    res.json({ signature });
  } catch (error) {
    console.error('Error generating signature:', error);
    res.status(500).json({ error: 'Failed to generate signature', details: error.message });
  }
});

// ============ TOURNAMENT ENDPOINTS ============

// Global leaderboard (using Supabase REST API)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('players')
      .select('address, best_score, total_games')
      .order('best_score', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Format response to match frontend expectations
    const leaderboard = data.map(player => ({
      player_address: player.address,
      best_score: player.best_score,
      games_played: player.total_games
    }));

    res.json({ leaderboard });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard', details: error.message });
  }
});

// Get leaderboard for tournament (using Supabase REST API)
app.get('/api/tournaments/:tournamentId/leaderboard', async (req, res) => {
  const { tournamentId } = req.params;

  try {
    const { data, error } = await supabase
      .from('players')
      .select('address, best_score, total_games')
      .order('best_score', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Format response to match frontend expectations
    const leaderboard = data.map(player => ({
      player_address: player.address,
      best_score: player.best_score,
      games_played: player.total_games
    }));

    res.json({ leaderboard });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard', details: error.message });
  }
});

// ============ HELPER FUNCTIONS ============

async function checkAchievements(client, playerAddress, score, linesCleared) {
  const achievements = [];

  // Achievement 1: First game
  const gamesResult = await client.query(
    'SELECT total_games FROM players WHERE address = $1',
    [playerAddress]
  );
  if (gamesResult.rows[0].total_games === 1) {
    achievements.push(1); // First Block
  }

  // Achievement 2: Score 100+
  if (score >= 100) {
    achievements.push(3); // Century
  }

  // Achievement 3: Clear 10+ lines in one game
  if (linesCleared >= 10) {
    achievements.push(2); // Hot Streak
  }

  // Achievement 4: Play 10 games
  if (gamesResult.rows[0].total_games >= 10) {
    achievements.push(4); // Champion
  }

  // Insert achievements (ignore duplicates)
  for (const achievementId of achievements) {
    await client.query(`
      INSERT INTO achievements (player_address, achievement_id)
      VALUES ($1, $2)
      ON CONFLICT (player_address, achievement_id) DO NOTHING
    `, [playerAddress, achievementId]);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Base-Puzzle Backend running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});
