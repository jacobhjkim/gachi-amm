use anchor_lang::prelude::*;

#[cfg(not(any(feature = "devnet", feature = "local")))]
pub mod admin {
    use anchor_lang::{prelude::Pubkey, solana_program::pubkey};

    pub const ADMINS: [Pubkey; 1] = [
        pubkey!("DkCvjcNS8ErL4X5xzwAn7Zx1jo9cwuynGyBFxYy1E8Kk"),
    ];
}

#[cfg(feature = "devnet")]
pub mod admin {
    use anchor_lang::{prelude::Pubkey, solana_program::pubkey};

    pub const ADMINS: [Pubkey; 1] = [pubkey!("DkCvjcNS8ErL4X5xzwAn7Zx1jo9cwuynGyBFxYy1E8Kk")];
}

#[cfg(feature = "local")]
pub mod admin {
    use anchor_lang::{prelude::Pubkey, solana_program::pubkey};

    pub const ADMINS: [Pubkey; 1] = [pubkey!("DkCvjcNS8ErL4X5xzwAn7Zx1jo9cwuynGyBFxYy1E8Kk")];
}

pub fn assert_eq_admin(admin: Pubkey) -> bool {
    admin::ADMINS
        .iter()
        .any(|predefined_admin| predefined_admin.eq(&admin))
}
