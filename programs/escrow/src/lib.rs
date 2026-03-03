use anchor_lang::prelude::*;

mod constants;
mod error;
mod instructions;
mod state;

use instructions::*;

declare_id!("A3oUnLSsLg2fAnfYUnwpuD8kVKwXm1TqKcNbrXSbdxR5");

#[program]
pub mod escrow {
    use super::*;

    pub fn make(ctx: Context<Make>, seed: u64, receive: u64, deposit: u64) -> Result<()> {
        instructions::make::handler(ctx, seed, receive, deposit)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handler(ctx)
    }

    pub fn take(ctx: Context<Take>) -> Result<()> {
        instructions::take::handler(ctx)
    }
}