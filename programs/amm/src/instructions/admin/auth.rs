use anchor_lang::prelude::*;

#[cfg(not(any(feature = "devnet", feature = "local")))]
pub mod admin {
    use anchor_lang::{prelude::Pubkey, solana_program::pubkey};

    pub const ADMINS: [Pubkey; 1] = [pubkey!("DkCvjcNS8ErL4X5xzwAn7Zx1jo9cwuynGyBFxYy1E8Kk")];
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

#[cfg(not(any(feature = "devnet", feature = "local")))]
pub mod fee_type_admin {
    use anchor_lang::{prelude::Pubkey, solana_program::pubkey};

    pub const ADMINS: [Pubkey; 2] = [
        pubkey!("6272xdgsJ9EmzoxgagJ6GifdfQXczorfENKiHYzUxEX6"),
        pubkey!("DkCvjcNS8ErL4X5xzwAn7Zx1jo9cwuynGyBFxYy1E8Kk"),
    ];
}

#[cfg(feature = "devnet")]
pub mod fee_type_admin {
    use anchor_lang::{prelude::Pubkey, solana_program::pubkey};

    pub const ADMINS: [Pubkey; 2] = [
        pubkey!("6272xdgsJ9EmzoxgagJ6GifdfQXczorfENKiHYzUxEX6"),
        pubkey!("DkCvjcNS8ErL4X5xzwAn7Zx1jo9cwuynGyBFxYy1E8Kk"),
    ];
}

#[cfg(feature = "local")]
pub mod fee_type_admin {
    use anchor_lang::{prelude::Pubkey, solana_program::pubkey};

    pub const ADMINS: [Pubkey; 2] = [
        pubkey!("6272xdgsJ9EmzoxgagJ6GifdfQXczorfENKiHYzUxEX6"),
        pubkey!("DkCvjcNS8ErL4X5xzwAn7Zx1jo9cwuynGyBFxYy1E8Kk"),
    ];
}

pub fn assert_eq_fee_type_admin(fee_type_admin: Pubkey) -> bool {
    fee_type_admin::ADMINS
        .iter()
        .any(|predefined_fee_type_admin| predefined_fee_type_admin.eq(&fee_type_admin))
}
