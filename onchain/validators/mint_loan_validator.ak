use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{ScriptHash}
use cardano/address.{Address, Script}
use cardano/assets.{PolicyId, Value, from_asset, from_lovelace}
use cardano/transaction.{InlineDatum, Input, Output, Transaction, placeholder}
use halalend/datums.{CollateralDatum, CollateralValidatorDatum}
use mocktail/virgin_key_hash.{mock_policy_id, mock_script_hash}
use mocktail/virgin_output_reference.{mock_utxo_ref}

pub type MintLoanRedeemer {
  GetLoan
  RepayLoan
  PartialRepay
  // To be removed. Just for testing and creating oracle utxo
  GetStables
}

validator mint_loan_validator(collateral_validator_hash: ScriptHash) {
  mint(redeemer: MintLoanRedeemer, policy_id: PolicyId, self: Transaction) {
    let Transaction { inputs, outputs, mint, .. } = self

    when redeemer is {
      GetLoan ->
        validate_get_loan(collateral_validator_hash, outputs, mint, policy_id)
      RepayLoan | PartialRepay ->
        validate_repay_and_partial_repay_loan(collateral_validator_hash, inputs, outputs, mint, policy_id, redeemer)
      GetStables -> True
    }
  }

  else(_) {
    fail
  }
}

fn validate_get_loan(
  collateral_validator_hash: ScriptHash,
  outputs: List<Output>,
  mint: Value,
  policy_id: PolicyId,
) {
  expect Some(collateral_output) =
    list.find(
      outputs,
      fn(output) {
        and {
          (output.address.payment_credential == Script(
            collateral_validator_hash,
          ))?,
          when output.datum is {
            InlineDatum(output_datum) ->
              if output_datum is CollateralDatum { .. }: CollateralValidatorDatum {
                True
              } else {
                False
              }
            _ -> False
          },
        }
      },
    )

  expect InlineDatum(collateral_output_datum) = collateral_output.datum

  expect CollateralDatum {
    tusd_pool_hash,
    tusd_policy_id,
    tusd_asset_name,
    tusd_borrowed,
    ..
  } = collateral_output_datum

  expect [Pair(name, quantity)] =
    mint |> assets.tokens(policy_id) |> dict.to_pairs

  let is_loan_pool_and_pid_valid = and {
      policy_id == tusd_pool_hash,
      policy_id == tusd_policy_id,
    }
  let is_loan_asset_name_valid = and {
      name == tusd_asset_name,
      name == "tUSD",
    }
  let is_loan_mint_quantity_valid = quantity == tusd_borrowed

  and {
    is_loan_pool_and_pid_valid?,
    is_loan_asset_name_valid?,
    is_loan_mint_quantity_valid?,
  }
}

fn validate_repay_and_partial_repay_loan(
  collateral_validator_hash: ScriptHash,
  inputs: List<Input>,
  outputs: List<Output>,
  mint: Value,
  policy_id: PolicyId,
  redeemer: MintLoanRedeemer,
) {
  expect Some(collateral_input) =
    list.find(
      inputs,
      fn(input) {
        and {
          (input.output.address.payment_credential == Script(
            collateral_validator_hash,
          ))?,
          when input.output.datum is {
            InlineDatum(input_datum) ->
              if input_datum is CollateralDatum { .. }: CollateralValidatorDatum {
                True
              } else {
                False
              }
            _ -> False
          },
        }
      },
    )
  expect InlineDatum(collateral_input_datum) = collateral_input.output.datum
  expect CollateralDatum { tusd_borrowed, .. } = collateral_input_datum

  expect [Pair(_, quantity)] = mint |> assets.tokens(policy_id) |> dict.to_pairs

  when redeemer is {
    RepayLoan -> (quantity == -tusd_borrowed)?
    PartialRepay -> {
        expect Some(collateral_output) =
          list.find(
            outputs,
            fn(output) {
              and {
                output.address.payment_credential == Script(collateral_validator_hash),
                when output.datum is {
                  InlineDatum(output_datum) ->
                    if output_datum
                    is CollateralDatum { .. }: CollateralValidatorDatum {
                      True
                    } else {
                      False
                    }
                  _ -> False
                },
              }
            },
          )
        expect InlineDatum(collateral_output_datum) = collateral_output.datum
        expect CollateralDatum {
          tusd_borrowed: output_tusd_borrowed,
          ..
        } = collateral_output_datum

      (output_tusd_borrowed == (tusd_borrowed - (-1 * quantity)))?
    }
    _ -> False
  }
}

// Tests
test test_mint_loan_tokens() {
  let loan_nft_policy_id = mock_policy_id(1)
  let collateral_validator_script_hash = mock_script_hash(2)
  let test_usd_pool_hash = mock_script_hash(3)
  let test_usd_policy_id = mock_script_hash(3)
  // mock_policy_id(x)
  let test_usd_asset_name = "tUSD"
  let collateral_amount_in_lovelace = 15000000
  let loan_nft_name = "BorrowNFT1"
  let collateral_validator_output =
    Output {
      address: Address {
        payment_credential: Script(collateral_validator_script_hash),
        stake_credential: None,
      },
      value: from_lovelace(collateral_amount_in_lovelace),
      datum: InlineDatum(
        CollateralDatum {
          tusd_pool_hash: test_usd_pool_hash,
          tusd_policy_id: test_usd_policy_id,
          tusd_asset_name: test_usd_asset_name,
          tusd_borrowed: 12,
          loan_nft_pid: loan_nft_policy_id,
          loan_nft_asset_name: loan_nft_name,
          // $1.2 (per ADA)
          collateral_rate_in_lovelace: 1200000,
          collateral_asset: "ada",
          collateral_amount_in_lovelace,
        },
      ),
      reference_script: None,
    }

  let mint = from_asset(test_usd_policy_id, "tUSD", 12)

  let tx =
    Transaction {
      ..placeholder,
      outputs: [collateral_validator_output],
      mint: mint,
    }

  mint_loan_validator.mint(
    collateral_validator_script_hash,
    GetLoan,
    test_usd_policy_id,
    tx,
  )
}

test test_burn_loan_tokens() {
  let loan_nft_policy_id = mock_policy_id(1)
  let collateral_validator_script_hash = mock_script_hash(2)
  let test_usd_pool_hash = mock_script_hash(3)
  let test_usd_policy_id = mock_script_hash(3)
  // mock_policy_id(x)
  let test_usd_asset_name = "tUSD"
  let collateral_amount_in_lovelace = 15000000
  let loan_nft_name = "BorrowNFT1"
  let collateral_validator_input =
    Input {
      output_reference: mock_utxo_ref(0, 0),
      output: Output {
        address: Address {
          payment_credential: Script(collateral_validator_script_hash),
          stake_credential: None,
        },
        value: from_lovelace(collateral_amount_in_lovelace),
        datum: InlineDatum(
          CollateralDatum {
            tusd_pool_hash: test_usd_pool_hash,
            tusd_policy_id: test_usd_policy_id,
            tusd_asset_name: test_usd_asset_name,
            tusd_borrowed: 12,
            loan_nft_pid: loan_nft_policy_id,
            loan_nft_asset_name: loan_nft_name,
            // $1.2 (per ADA)
            collateral_rate_in_lovelace: 1200000,
            collateral_asset: "ada",
            collateral_amount_in_lovelace,
          },
        ),
        reference_script: None,
      },
    }

  let mint = from_asset(test_usd_policy_id, "tUSD", -12)

  let tx =
    Transaction {
      ..placeholder,
      inputs: [collateral_validator_input],
      mint: mint,
    }

  mint_loan_validator.mint(
    collateral_validator_script_hash,
    RepayLoan,
    test_usd_policy_id,
    tx,
  )
}

test test_partial_repay_burn() {
  let loan_token_burn_amount = 6

  let loan_nft_policy_id = mock_policy_id(1)
  let collateral_validator_script_hash = mock_script_hash(2)
  let test_usd_pool_hash = mock_script_hash(3)
  let test_usd_policy_id = mock_script_hash(3)
  // mock_policy_id(x)
  let test_usd_asset_name = "tUSD"
  let collateral_amount_in_lovelace = 15000000
  let loan_nft_name = "BorrowNFT1"
  let collateral_validator_input =
    Input {
      output_reference: mock_utxo_ref(0, 0),
      output: Output {
        address: Address {
          payment_credential: Script(collateral_validator_script_hash),
          stake_credential: None,
        },
        value: from_lovelace(collateral_amount_in_lovelace),
        datum: InlineDatum(
          CollateralDatum {
            tusd_pool_hash: test_usd_pool_hash,
            tusd_policy_id: test_usd_policy_id,
            tusd_asset_name: test_usd_asset_name,
            tusd_borrowed: 12,
            loan_nft_pid: loan_nft_policy_id,
            loan_nft_asset_name: loan_nft_name,
            // $1.2 (per ADA)
            collateral_rate_in_lovelace: 1200000,
            collateral_asset: "ada",
            collateral_amount_in_lovelace,
          },
        ),
        reference_script: None,
      },
    }

  let output_collateral_datum =
    CollateralDatum {
      tusd_pool_hash: test_usd_pool_hash,
      tusd_policy_id: test_usd_policy_id,
      tusd_asset_name: test_usd_asset_name,
      tusd_borrowed: 12 - loan_token_burn_amount,
      loan_nft_pid: loan_nft_policy_id,
      loan_nft_asset_name: loan_nft_name,
      // $1.2 (per ADA)
      collateral_rate_in_lovelace: 1200000,
      collateral_asset: "ada",
      collateral_amount_in_lovelace,
    }
  let collateral_output =
    Output {
      address: Address {
        payment_credential: Script(collateral_validator_script_hash),
        stake_credential: None,
      },
      value: from_lovelace(collateral_amount_in_lovelace),
      datum: InlineDatum(output_collateral_datum),
      reference_script: None,
    }

  let mint = from_asset(test_usd_policy_id, "tUSD", -(loan_token_burn_amount))

  let tx =
    Transaction {
      ..placeholder,
      inputs: [collateral_validator_input],
      outputs: [collateral_output],
      mint: mint,
    }

  mint_loan_validator.mint(
    collateral_validator_script_hash,
    PartialRepay,
    test_usd_policy_id,
    tx,
  )
}
