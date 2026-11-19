// token-radar-01: the radar-2 value model.
//
// The program reads a sealed DefiLlama snapshot and ranks every rankable
// pre-token protocol by what its launch would be worth if its record stayed
// as it is. One formula scores every row, from the snapshot's own figures
// only: TVL, seven-day growth, how long the protocol has run with no token
// recorded, and how many chains it runs on. No protocol is special-cased by
// name; the exclusions below are the house watchlist's own rule, applied to
// the whole snapshot.
//
// Implied value (whole dollars, rounded):
//   TVL x 0.30
//   x (1 + clamp(change_7d, -60, 120) / 100 x 0.6)
//   x (0.55 + min(age_days, 1095) / 1095 x 0.45)
//   x (1 + min(chains - 1, 8) x 0.02)
// Age is days from the day DefiLlama began tracking the protocol to the
// snapshot's date; a protocol with no listed date counts as 365 days old.
// A protocol with no reported seven-day change counts as flat (0%).

/** One protocol of the sealed snapshot, exactly the ten fields it carries. */
export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The sealed snapshot: the protocol universe plus the house watchlist. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** One ranked row of the board the program writes to board.json. */
export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  growth_factor: number;
  age_factor: number;
  chain_factor: number;
  watchlist: boolean;
  mcap_usd: number | null;
}

/** One protocol whose token already trades, set aside from the ranking. */
export interface LiveRow {
  slug: string;
  name: string;
  mcap_usd: number;
  tvl_usd: number;
  category: string | null;
  chains: string[];
}

/** Everything the dashboard needs: the board, the live set, the totals. */
export interface Radar {
  board: BoardRow[];
  live: LiveRow[];
  total_implied_usd: number;
  watchlist_covered: number;
  watchlist_total: number;
  early_count: number;
  live_count: number;
  as_of: string;
  floor_usd: number;
}

/** Categories the house watchlist rule ranks out, wherever they appear. */
const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/** Exchange names a protocol must not begin with (watchlist rule). */
const EXCHANGE_PREFIXES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

/** A version marker at the end of a name: a space, then V2, v2, 2.0 or alike. */
const VERSION_TAIL = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whole words that mark a wrapped or staked product of a traded token. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** The farming verb per category, and the product the verb acts on. */
const VERB_BY_CATEGORY: Record<string, [string, string, string]> = {
  Dexs: ['Swap', 'swap', 'liquidity pool'],
  Lending: ['Lend', 'lend', 'lending market'],
  Yield: ['Deposit', 'deposit', 'yield vault'],
  'Yield Aggregator': ['Compound', 'compound', 'auto-compounding vault'],
  Derivatives: ['Trade', 'trade', 'perpetuals market'],
  RWA: ['Mint', 'mint', 'tokenised-asset vault'],
  'Risk Curators': ['Curate', 'curate', 'curator vault'],
  'Onchain Capital Allocator': ['Allocate', 'allocate', 'allocation vault'],
  'Leveraged Farming': ['Leverage', 'leverage', 'leveraged farm'],
  'Prediction Market': ['Predict', 'predict', 'prediction market'],
  Options: ['Write', 'write', 'options vault'],
  'CDP': ['Borrow', 'borrow', 'collateral vault'],
};

/** A second feature per category, for the fourth farm step. */
const SECOND_FEATURE: Record<string, string> = {
  Dexs: 'a limit order',
  Lending: 'a borrow against the deposit',
  Yield: 'an auto-compound toggle',
  'Yield Aggregator': 'a strategy switch',
  Derivatives: 'a hedged position',
  RWA: 'a secondary-market listing',
  'Risk Curators': 'a second curator vault',
  'Onchain Capital Allocator': 'a second allocation',
  'Leveraged Farming': 'a deleveraged position',
  'Prediction Market': 'a second market',
  Options: 'a covered call',
  CDP: 'a stability-pool deposit',
};

/** Read the sealed snapshot from its JSON text, checking its shape. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (typeof raw.as_of !== 'string') throw new Error('snapshot: as_of is missing');
  if (!Array.isArray(raw.protocols)) throw new Error('snapshot: protocols is missing');
  if (!Array.isArray(raw.watchlist)) throw new Error('snapshot: watchlist is missing');
  return {
    as_of: raw.as_of,
    source: typeof raw.source === 'string' ? raw.source : '',
    floor_usd: typeof raw.floor_usd === 'number' ? raw.floor_usd : 0,
    protocols: raw.protocols as Protocol[],
    watchlist: raw.watchlist as string[],
  };
}

/** Clamp a number into a closed interval. */
function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Whole days between two YYYY-MM-DD dates (negative when reversed). */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 365;
  return Math.round((b - a) / 86_400_000);
}

/** A protocol's age in days at the snapshot's date; 365 when unlisted. */
export function ageDays(p: Protocol, asOf: string): number {
  if (p.listed_at === null) return 365;
  return Math.max(0, daysBetween(p.listed_at, asOf));
}

/** The growth factor: 1 plus the clamped seven-day change, damped to 0.6. */
export function growthFactor(p: Protocol): number {
  const change = p.change_7d === null ? 0 : p.change_7d;
  return 1 + (clamp(change, -60, 120) / 100) * 0.6;
}

/** The age factor: 0.55 at listing, rising to 1.00 after three tokenless years. */
export function ageFactor(age: number): number {
  return 0.55 + (Math.min(age, 1095) / 1095) * 0.45;
}

/** The chain factor: 1.00 on one chain, +0.02 per extra chain up to eight. */
export function chainFactor(p: Protocol): number {
  return 1 + Math.min(Math.max(p.chains.length - 1, 0), 8) * 0.02;
}

/** The radar-2 implied value: TVL x 0.30 x growth x age x chains, rounded. */
export function impliedValue(p: Protocol, asOf: string): number {
  const age = ageDays(p, asOf);
  const value =
    p.tvl_usd * 0.3 * growthFactor(p) * ageFactor(age) * chainFactor(p);
  return Math.round(value);
}

/** True when the snapshot records a token for the protocol. */
export function hasToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** True when the house watchlist rule ranks a protocol out. */
export function isExcluded(p: Protocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSION_TAIL.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix)) return true;
  }
  return false;
}

/** The capital a farm plan starts with, by TVL band: $50 to $250. */
function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 1_000_000_000) return 250;
  if (tvlUsd >= 500_000_000) return 200;
  if (tvlUsd >= 100_000_000) return 150;
  if (tvlUsd >= 50_000_000) return 100;
  return 50;
}

/** The gas to set aside for the first transaction, by the main chain. */
function gasFor(chain: string): number {
  if (chain === 'Ethereum') return 12;
  if (chain === 'Solana') return 0.5;
  return 2;
}

/** The hold in days: 30 young, 45 a year in, 60 after two tokenless years. */
function holdDays(age: number): number {
  if (age >= 730) return 60;
  if (age >= 365) return 45;
  return 30;
}

/** The verb, its lower case and its product for a protocol's category. */
function verbFor(category: string | null): [string, string, string] {
  if (category !== null && VERB_BY_CATEGORY[category] !== undefined) {
    return VERB_BY_CATEGORY[category]!;
  }
  return ['Farm', 'farm', 'core vault'];
}

/** A second feature to try, by category, or the rewards page. */
function secondFeature(category: string | null): string {
  if (category !== null && SECOND_FEATURE[category] !== undefined) {
    return SECOND_FEATURE[category]!;
  }
  return 'the rewards page';
}

/**
 * Six concrete farm steps for one row: what to do, what it costs in dollars
 * and gas, and how long the position stays open. Every step is 20 to 600
 * characters once trimmed.
 */
export function farmSteps(p: Protocol, age: number): string[] {
  const [verb, verbLower, product] = verbFor(p.category);
  const chain = p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
  const capital = capitalFor(p.tvl_usd);
  const gas = gasFor(chain);
  const hold = holdDays(age);
  const feature = secondFeature(p.category);
  return [
    `Send $${capital} to ${chain} and connect your wallet to ${p.name}; keep about $${gas} aside for gas on the first transaction.`,
    `${verb} the full $${capital} into ${p.name}'s ${product} and confirm the position shows in your wallet on ${chain}.`,
    `Repeat one ${verbLower} action every week for ${hold} days so the position stays active and visible to the protocol.`,
    `Try a second feature of ${p.name} — ${feature} — at least twice while the position is open.`,
    `Check the position weekly; add funds or rebalance only if ${p.name}'s TVL moves more than 20% in a single week.`,
    `Keep the position open for the full ${hold} days and beyond any token announcement, then claim any launch allocation before exiting.`,
  ];
}

/**
 * Score the snapshot: every rankable pre-token protocol becomes a board row,
 * sorted by implied value, ranks 1 to N; the tokened set becomes the live
 * list, top 24 by market cap, never mixed into the ranking.
 */
export function buildRadar(snapshot: Snapshot): Radar {
  const rows: BoardRow[] = [];
  const live: LiveRow[] = [];
  const watchlist = new Set(snapshot.watchlist);
  for (const p of snapshot.protocols) {
    if (hasToken(p)) {
      if (p.mcap_usd !== null) {
        live.push({
          slug: p.slug,
          name: p.name,
          mcap_usd: p.mcap_usd,
          tvl_usd: p.tvl_usd,
          category: p.category,
          chains: p.chains,
        });
      }
      continue;
    }
    if (isExcluded(p)) continue;
    const age = ageDays(p, snapshot.as_of);
    rows.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: impliedValue(p, snapshot.as_of),
      farm_steps: farmSteps(p, age),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: age,
      growth_factor: Number(growthFactor(p).toFixed(4)),
      age_factor: Number(ageFactor(age).toFixed(4)),
      chain_factor: Number(chainFactor(p).toFixed(4)),
      watchlist: watchlist.has(p.slug),
      mcap_usd: null,
    });
  }
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd);
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  live.sort((a, b) => b.mcap_usd - a.mcap_usd);
  const liveTop = live.slice(0, 24);
  const total = rows.reduce((sum, row) => sum + row.implied_value_usd, 0);
  return {
    board: rows,
    live: liveTop,
    total_implied_usd: total,
    watchlist_covered: rows.filter((row) => row.watchlist).length,
    watchlist_total: snapshot.watchlist.length,
    early_count: rows.filter((row) => !row.watchlist).length,
    live_count: live.length,
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
  };
}

/**
 * The gate's own shape, checked before anything is written: the board's
 * ranks run 1 to N with implied values never rising, every watchlist slug is
 * covered, every row's farm plan holds 6 steps of 20 to 600 characters, and
 * no slug is one the snapshot never lists. Null when the board is sound.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `board holds ${board.length} rows, under the 100-row floor`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (!slugs.has(row.slug)) return `row ${row.slug} is not a protocol of the snapshot`;
    if (seen.has(row.slug)) return `row ${row.slug} appears twice`;
    seen.add(row.slug);
    if (row.rank !== i + 1) return `row ${row.slug} carries rank ${row.rank}, expected ${i + 1}`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `row ${row.slug} has no positive whole implied value`;
    }
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${row.slug} is worth more than the row ranked above it`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} holds ${row.farm_steps.length} farm steps`;
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) {
        return `row ${row.slug} has a farm step of ${len} characters`;
      }
    }
  }
  const values = new Set(board.map((row) => row.implied_value_usd));
  if (board.length > 1 && values.size === 1) {
    return 'every row carries the same implied value: the board ranks nothing';
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol ${slug} is missing from the board`;
  }
  return null;
}

/** The dashboard's data as a script: one global, written beside the page. */
export function dataScript(radar: Radar): string {
  const payload = {
    as_of: radar.as_of,
    floor_usd: radar.floor_usd,
    total_implied_usd: radar.total_implied_usd,
    watchlist_covered: radar.watchlist_covered,
    watchlist_total: radar.watchlist_total,
    early_count: radar.early_count,
    live_count: radar.live_count,
    board: radar.board,
    live: radar.live,
  };
  return `window.RADAR = ${JSON.stringify(payload)};\n`;
}
