# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/qienzdork/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/qienzdork/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar (radar-2): a web dashboard that ranks the pre-token protocols in a sealed DefiLlama snapshot by what their launch would be worth, each with the steps to farm it. It covers the whole 40-protocol watchlist and adds every other rankable pre-token protocol below and above the floor — 198 rows in all — scored by one formula from the snapshot's own figures (TVL, seven-day growth, age with no token, and chain breadth). Exchanges, bridges, liquid staking and restaking, wrapped or staked products and versioned pools are ranked out, and live-token protocols are set aside with their market caps shown.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```
