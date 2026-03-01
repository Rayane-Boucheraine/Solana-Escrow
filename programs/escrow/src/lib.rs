use anchor_lang::prelude::*;

declare_id!("A3oUnLSsLg2fAnfYUnwpuD8kVKwXm1TqKcNbrXSbdxR5");

#[program]
pub mod escrow {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
