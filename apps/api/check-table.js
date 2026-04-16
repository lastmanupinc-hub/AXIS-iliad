import { getDb } from "@axis/snapshots";

const db = getDb('./axis.db');
try {
  const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='oauth_clients'").get();
  console.log('Table exists:', result);
} catch (e) {
  console.log('Table does not exist:', e.message);
}
db.close();