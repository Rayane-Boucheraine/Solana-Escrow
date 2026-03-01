use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("The amount must be greater than zero")]
    InvalidAmount,
}