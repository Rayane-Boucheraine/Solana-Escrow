use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
        TransferChecked,
    },
};

use crate::{constants::ESCROW_SEED, state::Escrow};

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    pub mint_a: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint          = mint_a,
        associated_token::authority     = maker,
        associated_token::token_program = token_program,
    )]
    pub maker_ata_a: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        close  = maker,          // send rent lamports back to maker when closed
        has_one = maker,         // escrow.maker must equal the signer
        has_one = mint_a,        // escrow.mint_a must match the mint passed in
        seeds  = [ESCROW_SEED, maker.key().as_ref(), escrow.seed.to_le_bytes().as_ref()],
        bump   = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        associated_token::mint          = mint_a,
        associated_token::authority     = escrow,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Refund>) -> Result<()> {
    // PDA signer seeds — how the program "signs" on behalf of the escrow PDA
    let signer_seeds: &[&[&[u8]]] = &[&[
        ESCROW_SEED,
        ctx.accounts.maker.key.as_ref(),
        &ctx.accounts.escrow.seed.to_le_bytes(),
        &[ctx.accounts.escrow.bump],
    ]];

    // Transfer tokens from vault → maker
    let cpi_accounts = TransferChecked {
        from:      ctx.accounts.vault.to_account_info(),
        mint:      ctx.accounts.mint_a.to_account_info(),
        to:        ctx.accounts.maker_ata_a.to_account_info(),
        authority: ctx.accounts.escrow.to_account_info(), // PDA is authority
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds, // ← PDA signs here
    );
    transfer_checked(cpi_ctx, ctx.accounts.vault.amount, ctx.accounts.mint_a.decimals)?;

    // Close the vault account, rent goes back to maker
    let cpi_accounts = CloseAccount {
        account:     ctx.accounts.vault.to_account_info(),
        destination: ctx.accounts.maker.to_account_info(),
        authority:   ctx.accounts.escrow.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    close_account(cpi_ctx)
}