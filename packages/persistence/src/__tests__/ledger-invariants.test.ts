import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(path.resolve(here, '../../../../migrations/0001_ledger.sql'), 'utf8');

function fresh() {
  const db = new Database(':memory:');
  db.exec(MIGRATION);
  db.exec(`INSERT INTO accounts(id,type,owner,asset) VALUES
    ('cash','ASSET','inv','USDC'),('clr','LIABILITY','iss','USDC'),
    ('pos','ASSET','inv','USTBL'),('clrsh','LIABILITY','iss','USTBL');`);
  return db;
}
function post(db: Database.Database, eid: string, lines: [string,string,string,bigint][]) {
  db.transaction(() => {
    db.prepare(`INSERT INTO journal_entries(id,event_id,effective_date) VALUES(?,?,?)`).run(eid, eid, '2026-11-20');
    const ins = db.prepare(`INSERT INTO journal_lines(id,entry_id,account_id,asset,direction,amount_minor) VALUES(?,?,?,?,?,?)`);
    lines.forEach(([a,asset,d,amt], i) => ins.run(`${eid}-${i}`, eid, a, asset, d, amt));
    db.prepare(`UPDATE journal_entries SET posted=1 WHERE id=?`).run(eid);
  })();
}

describe('ledger invariants (crown-jewel schema)', () => {
  let db: Database.Database;
  beforeEach(() => { db = fresh(); });
  it('T1 balanced posts', () => expect(() => post(db,'e1',[['cash','USDC','DEBIT',1000n],['clr','USDC','CREDIT',1000n]])).not.toThrow());
  it('T2 unbalanced rejected', () => expect(() => post(db,'e2',[['cash','USDC','DEBIT',1000n],['clr','USDC','CREDIT',999n]])).toThrow());
  it('T3 multi-asset balanced', () => expect(() => post(db,'e3',[['cash','USDC','DEBIT',1000n],['clr','USDC','CREDIT',1000n],['pos','USTBL','DEBIT',999n],['clrsh','USTBL','CREDIT',999n]])).not.toThrow());
  it('T4 one-asset imbalance rejected', () => expect(() => post(db,'e4',[['cash','USDC','DEBIT',1000n],['clr','USDC','CREDIT',1000n],['pos','USTBL','DEBIT',999n],['clrsh','USTBL','CREDIT',998n]])).toThrow());
  it('T5 line UPDATE blocked', () => { post(db,'e5',[['cash','USDC','DEBIT',10n],['clr','USDC','CREDIT',10n]]); expect(() => db.prepare(`UPDATE journal_lines SET amount_minor=20 WHERE entry_id='e5'`).run()).toThrow(); });
  it('T6 line DELETE blocked', () => { post(db,'e6',[['cash','USDC','DEBIT',10n],['clr','USDC','CREDIT',10n]]); expect(() => db.prepare(`DELETE FROM journal_lines WHERE entry_id='e6'`).run()).toThrow(); });
  it('T7 posted entry immutable', () => { post(db,'e7',[['cash','USDC','DEBIT',10n],['clr','USDC','CREDIT',10n]]); expect(() => db.prepare(`UPDATE journal_entries SET ref='x' WHERE id='e7'`).run()).toThrow(); });
  it('T8 duplicate line blocked', () => { post(db,'e8',[['cash','USDC','DEBIT',10n],['clr','USDC','CREDIT',10n]]); expect(() => db.prepare(`INSERT INTO journal_lines(id,entry_id,account_id,asset,direction,amount_minor) VALUES('x','e8','cash','USDC','DEBIT',10n)`).run()).toThrow(); });
  it('T9 empty entry rejected', () => { db.prepare(`INSERT INTO journal_entries(id,event_id,effective_date) VALUES('e9','e9','2026-11-20')`).run(); expect(() => db.prepare(`UPDATE journal_entries SET posted=1 WHERE id='e9'`).run()).toThrow(); });
});
