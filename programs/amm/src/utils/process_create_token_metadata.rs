use anchor_lang::prelude::*;
use mpl_token_metadata::types::DataV2;

pub struct ProcessCreateTokenMetadataParams<'a, 'info> {
    pub system_program: AccountInfo<'info>,
    pub payer: AccountInfo<'info>,
    pub curve_authority: AccountInfo<'info>,
    pub mint: AccountInfo<'info>,
    pub metadata_program: AccountInfo<'info>,
    pub mint_metadata: AccountInfo<'info>,
    pub creator: AccountInfo<'info>,
    pub name: &'a str,
    pub symbol: &'a str,
    pub uri: &'a str,
    pub curve_authority_bump: u8,
    pub partner: Pubkey,
}

pub fn process_create_token_metadata(params: ProcessCreateTokenMetadataParams) -> Result<()> {
    let seeds = curve_authority_seeds!(params.curve_authority_bump);
    let mut builder = mpl_token_metadata::instructions::CreateMetadataAccountV3CpiBuilder::new(
        &params.metadata_program,
    );

    builder.mint(&params.mint);
    builder.update_authority(&params.curve_authority, false);
    builder.mint_authority(&params.curve_authority);
    builder.metadata(&params.mint_metadata);
    builder.is_mutable(true); // cam update metadata
    builder.payer(&params.payer);
    builder.system_program(&params.system_program);
    let data = DataV2 {
        collection: None,
        creators: None,
        name: params.name.to_string(),
        symbol: params.symbol.to_string(),
        seller_fee_basis_points: 0,
        uses: None,
        uri: params.uri.to_string(),
    };
    builder.data(data);

    builder.invoke_signed(&[&seeds[..]])?;

    let mut update_authority_builder =
        mpl_token_metadata::instructions::UpdateMetadataAccountV2CpiBuilder::new(
            &params.metadata_program,
        );
    update_authority_builder.metadata(&params.mint_metadata);
    update_authority_builder.update_authority(&params.curve_authority);
    update_authority_builder.new_update_authority(params.system_program.key());
    update_authority_builder.invoke_signed(&[&seeds[..]])?;

    Ok(())
}
