# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/qienzdork/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/qienzdork/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar (radar-2): a web dashboard that ranks the pre-token protocols in a sealed DefiLlama snapshot by what their launch would be worth, each with the steps to farm it. It covers the whole 40-protocol watchlist and adds every other rankable pre-token protocol below and above the floor — 198 rows in all — scored by one formula from the snapshot's own figures (TVL, seven-day growth, age with no token, and chain breadth). Exchanges, bridges, liquid staking and restaking, wrapped or staked products and versioned pools are ranked out, and live-token protocols are set aside with their market caps shown.

## The model

One formula scores every row, no protocol special-cased by name:

```
implied = round(TVL × 0.30
  × (1 + clamp(change_7d, −60, 120) / 100 × 0.6)
  × (0.55 + min(age_days, 1095) / 1095 × 0.45)
  × (1 + min(chains − 1, 8) × 0.02))
```

Age is days since DefiLlama first listed the protocol (unknown counts as 365 days); a missing seven-day change counts as flat. The top of the board on this snapshot is Steakhouse Financial at about $731M, then Sentora Curator at about $638M; the 198 rows come to about $5.00B combined.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

That writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` into `out/`. The run is deterministic: two runs write the same bytes. Serve the output directory and open `dashboard/index.html` to use the page.

## The dashboard

A static page, no framework and no network: dark slate with lime accents, built to be read at a glance and to agree with the board behind it.

- **Top-5 bar strip** and four stat cards, including the combined implied value and the watchlist coverage (40/40).
- **Search, category and chain filters**, a watchlist-only toggle, and Pre-token / Live tabs — the live tab lists the largest tokened protocols by market cap, never ranked.
- **Sortable columns** and a **detail view** for every protocol: the full model breakdown (TVL, growth, age and chain factors) plus a six-step farm plan with its capital, gas and hold in dollars and days.
- **In-page recompute check**: the page re-runs the model over all 198 rows and reports how many match the board.

Screenshot scenes are driven by the query string, so a plain browser capture shows the same views: `?shot=detail&slug=steakhouse-financial` opens the detail dialog, `?shot=filter&category=Risk%20Curators` applies a filter, `?shot=live` opens the live tab.

## Layout

- `main.ts` — the entrypoint: reads the snapshot, writes the board, the dashboard data, the dossier.
- `lib/model.ts` — the radar-2 model, the farm plans, the board's self-check.
- `vendor/makefun-board.ts` — the kit's dossier library, copied unchanged.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the page the judge reads.
- `screenshots/` — the board, a detail view and a filtered view, rendered from this page.
