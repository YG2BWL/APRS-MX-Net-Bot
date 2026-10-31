const Database = require('better-sqlite3');
const db = new Database('aprs_net.db');

// Inisialisasi tabel log check-in
db.exec(`
  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    callsign TEXT NOT NULL,
    comment TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    qsl_code TEXT UNIQUE
  )
`);

function saveCheckin(callsign, comment) {
  const qslCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  const stmt = db.prepare('INSERT INTO checkins (callsign, comment, qsl_code) VALUES (?, ?, ?)');
  const info = stmt.run(callsign, comment, qslCode);
  return { id: info.lastInsertRowid, callsign, comment, qsl_code: qslCode };
}

function getCheckins() {
  return db.prepare('SELECT * FROM checkins ORDER BY timestamp DESC').all();
}

function getCheckinByCode(code) {
  return db.prepare('SELECT * FROM checkins WHERE qsl_code = ?').get(code);
}

module.exports = { saveCheckin, getCheckins, getCheckinByCode };