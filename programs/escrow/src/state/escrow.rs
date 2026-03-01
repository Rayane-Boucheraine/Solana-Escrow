use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub seed: u64,       // lets maker create multiple escrows
    pub maker: Pubkey,   // who created this escrow
    pub mint_a: Pubkey,  // token the maker is offering
    pub mint_b: Pubkey,  // token the maker wants in return
    pub receive: u64,    // how much of mint_b maker wants
    pub bump: u8,        // PDA bump, stored for cheap re-use
}