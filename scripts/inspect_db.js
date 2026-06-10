const pg = require('pg');

async function main() {
  const connectionString = 'postgresql://postgres:SuprNewPass2026!@34.71.246.184/supr';
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');
    
    // Inspect settings table
    const settings = await client.query('SELECT * FROM settings');
    console.log('Settings:', settings.rows);

    // Inspect agents
    const agents = await client.query('SELECT * FROM agents');
    console.log('Agents:', agents.rows);

    // Inspect missions
    const missions = await client.query('SELECT * FROM missions');
    console.log('Missions:', missions.rows);

    // Check if there are other relevant tables like projects or repositories
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tableNames = tables.rows.map(r => r.table_name);
    console.log('Available Tables:', tableNames);
  } catch (err) {
    console.error('Error connecting to database:', err);
  } finally {
    await client.end();
  }
}

main();
