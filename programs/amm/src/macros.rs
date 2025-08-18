//! Macro functions
macro_rules! curve_authority_seeds {
    ($bump:expr) => {
        &[b"curve_authority".as_ref(), &[$bump]]
    };
}
