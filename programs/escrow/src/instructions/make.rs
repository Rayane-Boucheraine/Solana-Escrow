use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{constants::ESCROW_SEED, error::EscrowError, state::Escrow};

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct Make<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    pub mint_a: InterfaceAccount<'info, Mint>,
    pub mint_b: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint          = mint_a,
        associated_token::authority     = maker,
        associated_token::token_program = token_program,
    )]
    pub maker_ata_a: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer  = maker,
        space  = 8 + Escrow::INIT_SPACE,
        seeds  = [ESCROW_SEED, maker.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        init,
        payer = maker,
        associated_token::mint          = mint_a,
        associated_token::authority     = escrow,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Make>, seed: u64, receive: u64, deposit: u64) -> Result<()> {
    require!(deposit > 0, EscrowError::InvalidAmount);
    require!(receive > 0, EscrowError::InvalidAmount);

    let escrow = &mut ctx.accounts.escrow;
    escrow.seed    = seed;
    escrow.maker   = ctx.accounts.maker.key();
    escrow.mint_a  = ctx.accounts.mint_a.key();
    escrow.mint_b  = ctx.accounts.mint_b.key();
    escrow.receive = receive;
    escrow.bump    = ctx.bumps.escrow;

    let cpi_accounts = TransferChecked {
        from:      ctx.accounts.maker_ata_a.to_account_info(),
        mint:      ctx.accounts.mint_a.to_account_info(),
        to:        ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.maker.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    transfer_checked(cpi_ctx, deposit, ctx.accounts.mint_a.decimals)?;

    Ok(())
}