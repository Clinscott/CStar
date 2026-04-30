import Database from 'better-sqlite3';
const dbPath = '/home/morderith/Corvus/CStar/.stats/pennyone.db';
const beadId = 'bead:chant-session:f7a0bcca-6a4f-4045-a30b-6b18290d8531:create_zero_touch_js';
const db = new Database(dbPath);
const bead = db.prepare("SELECT * FROM hall_beads WHERE bead_id = ?").get(beadId);
console.log(JSON.stringify(bead, null, 2));
db.close();
