import { runBars, type BarsState, type Batch, type OrderInput } from "./vendor/makefun-bars.ts";

const SYM = "CBBTC";
const TREND_BARS = 120;
const MOM_BARS = 30;
const BUY_TREND_BPS = 20n;
const SELL_TREND_BPS = -50n;
const STOP_BPS = 400n;
const LAST_ENTRY_SEQ = 1380;
const COOLDOWN_BARS = 10;
const SLIP_BPS = 100;
const MIN_BUY_UNITS = 1000000n;

const closes: bigint[] = [];
let lastBarT = -1;
let lastSellSeq = -1000;

function retBps(now: bigint, ago: bigint): bigint {
  if (ago <= 0n) return 0n;
  return ((now - ago) * 10000n) / ago;
}

const bot = {
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const bar = batch.bars.find((b) => b.symbol === SYM);
    if (bar === undefined) return [];
    if (bar.t === lastBarT) return [];
    lastBarT = bar.t;
    const close = BigInt(bar.c);
    closes.push(close);
    const seq = state.seq;
    const pos = state.positions.get(SYM);
    const qty = pos === undefined ? 0n : pos.qty;
    const cost = pos === undefined ? 0n : pos.cost;
    const n = closes.length;

    if (qty > 0n) {
      const trend = n > TREND_BARS ? retBps(close, closes[n - 1 - TREND_BARS]) : 0n;
      const val = state.value(SYM, qty, close);
      const stopHit = cost > 0n && val * 10000n < cost * (10000n - STOP_BPS);
      if (trend <= SELL_TREND_BPS || stopHit) {
        lastSellSeq = seq;
        return [{ side: "sell", symbol: SYM, qty, max_slippage_bps: SLIP_BPS }];
      }
      return [];
    }

    if (seq < TREND_BARS || seq >= LAST_ENTRY_SEQ) return [];
    if (seq - lastSellSeq < COOLDOWN_BARS) return [];
    const trend = retBps(close, closes[n - 1 - TREND_BARS]);
    const mom = retBps(close, closes[n - 1 - MOM_BARS]);
    if (trend > BUY_TREND_BPS && mom > 0n) {
      const cash = state.cash;
      if (cash < MIN_BUY_UNITS) return [];
      return [{ side: "buy", symbol: SYM, notional_quote_units: cash, max_slippage_bps: SLIP_BPS }];
    }
    return [];
  },
};

await runBars(bot);
