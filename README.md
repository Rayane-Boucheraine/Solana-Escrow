# Solana Escrow

A trustless token swap program built on Solana using the Anchor framework. Two parties can exchange SPL tokens without needing to trust each other — the program acts as a neutral intermediary.

## How it works

1. **Maker** creates an escrow, deposits token A into a vault, and specifies how much token B they want in return
2. **Taker** fulfils the deal by sending token B to the maker and receiving token A from the vault
3. **Maker** can cancel at any time and get their tokens back via a refund

## Instructions

| Instruction | Signer | Description |
|---|---|---|
| `make` | Maker | Creates the escrow PDA, creates vault, deposits token A |
| `take` | Taker | Sends token B to maker, receives token A from vault, closes escrow |
| `refund` | Maker | Cancels the escrow, returns token A, closes all accounts |

## Project structure

```
programs/escrow/src/
├── lib.rs                  ← entry point
├── constants.rs            ← PDA seeds
├── error.rs                ← custom errors
├── state/
│   ├── mod.rs
│   └── escrow.rs           ← Escrow account struct
└── instructions/
    ├── mod.rs
    ├── make.rs             ← make instruction
    ├── take.rs             ← take instruction
    └── refund.rs           ← refund instruction
```

## Security practices

- PDA-owned vault — no human controls the locked tokens
- `has_one` constraints prevent token substitution attacks
- `TransferChecked` used for all transfers — prevents decimal manipulation
- Bump stored on-chain — prevents bump substitution attacks
- `overflow-checks = true` in release profile — prevents integer overflow
- Anchor discriminators — prevent account type confusion

## Getting started

```bash
anchor build
anchor test
```

## Stack

- [Anchor](https://www.anchor-lang.com/) 0.32.1
- [anchor-spl](https://crates.io/crates/anchor-spl) 0.32.0
- Solana Token Interface (supports both Token and Token-2022)

