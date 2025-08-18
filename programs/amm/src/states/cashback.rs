use crate::{constants::cashback::*, errors::AmmError};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Clock;
use num_enum::{IntoPrimitive, TryFromPrimitive};

#[repr(u8)]
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    IntoPrimitive,
    TryFromPrimitive,
    AnchorDeserialize,
    AnchorSerialize,
)]
pub enum CashbackTier {
    Wood,
    Bronze,
    Silver,
    Gold,
    Platinum,
    Diamond,
    Champion,
}

impl CashbackTier {
    /// Get the cashback basis points for this tier
    pub fn get_cashback_bps(&self) -> u16 {
        match self {
            CashbackTier::Wood => CASHBACK_WOOD_BPS,
            CashbackTier::Bronze => CASHBACK_BRONZE_BPS,
            CashbackTier::Silver => CASHBACK_SILVER_BPS,
            CashbackTier::Gold => CASHBACK_GOLD_BPS,
            CashbackTier::Platinum => CASHBACK_PLATINUM_BPS,
            CashbackTier::Diamond => CASHBACK_DIAMOND_BPS,
            CashbackTier::Champion => CASHBACK_CHAMPION_BPS,
        }
    }
}

impl Default for CashbackTier {
    fn default() -> Self {
        CashbackTier::Wood
    }
}

#[account(zero_copy)]
#[derive(InitSpace, Debug, Default)]
pub struct CashbackAccount {
    /// owner of the cashback account
    pub owner: Pubkey,
    /// current cashback tier - updated by admin off-chain based on trading volume
    pub current_tier: u8,
    pub _padding: [u8; 7], // padding to align the struct size to 64 bytes
    /// unix timestamp of last claim
    pub last_claim_timestamp: i64,
}

impl CashbackAccount {
    /// Initialize a cashback account if it hasn't been initialized yet
    pub fn init(&mut self, owner: Pubkey) -> Result<()> {
        let clock = Clock::get()?;

        self.owner = owner;
        self.current_tier = CashbackTier::default().into();
        self.last_claim_timestamp = clock.unix_timestamp; // Set to current time to enforce 7-day wait

        Ok(())
    }

    /// Update the tier (admin only)
    pub fn update_tier(&mut self, new_tier: u8) -> Result<()> {
        self.current_tier = new_tier;
        Ok(())
    }

    /// Update last claim timestamp
    pub fn update_claim_timestamp(&mut self) -> Result<()> {
        let clock = Clock::get()?;
        self.last_claim_timestamp = clock.unix_timestamp;
        Ok(())
    }

    /// Get the current tier as an enum
    pub fn get_tier(&self) -> Result<CashbackTier> {
        // If tier is above 6 (Champion), treat it as Champion tier
        let tier_value = if self.current_tier > 6 {
            6 // Champion tier
        } else {
            self.current_tier
        };

        CashbackTier::try_from(tier_value).map_err(|_| error!(AmmError::InvalidCashbackTier))
    }
}
