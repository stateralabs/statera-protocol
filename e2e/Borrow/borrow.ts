import { BuiltinByteString, ConStr0, DatumSource, Integer, mConStr0, SLOT_CONFIG_NETWORK, stringToHex, unixTimeToEnclosingSlot } from "@meshsdk/core";
import { blockchainProvider, txBuilder, wallet1, wallet1Address, wallet1Collateral, wallet1Passphrase, wallet1Utxos } from "../setup.js";
// import { blockchainProvider, maestroKey, txBuilder, wallet1, wallet1Address, wallet1Collateral, wallet1Passphrase, wallet1Utxos } from "../setup.js";
import { aBorrowInput, collateralValidatorAddress, collateralValidatorScriptHash, loanNftPolicyId, loanNftValidatorCode, loanNftValidatorScript, oracleAddress, oracleUtxo, protocolParametersAddress, protocolParametersScriptHash, protocolParametersUtxo, mintLoanAssetNameHex, mintLoanPolicyId, mintLoanUnit, mintLoanValidatorScript } from "./setup.js";
import { calculateLoanAmount } from "./util.js";
// import { applyDoubleCborEncoding, applyParamsToScript, Constr, Data, fromText, Lucid, Maestro, MintingPolicy, SpendingValidator } from "@lucid-evolution/lucid";

if (!oracleUtxo) {
    throw new Error('Oracle UTxO not found!');
}
if (!protocolParametersUtxo) {
    throw new Error('Protocol Parameters UTxO not found!');
}

// const loanNftName = "HB-New-Model";
const loanNftName = "HB-New-Model-Liquidation";
const loanNftNameHex = stringToHex(loanNftName);
const loanNftUnit = loanNftPolicyId + loanNftNameHex;

const collateralAmmountInLovelaces = "300000000"; // 300 ADA
const [oracleRate, loanAmount] = calculateLoanAmount(
    oracleUtxo?.output.amount,
    protocolParametersUtxo.output.plutusData,
    collateralAmmountInLovelaces,
);

console.log('loanAmount:', loanAmount);

const collateralDatum = mConStr0([
    mintLoanPolicyId,
    mintLoanPolicyId,
    mintLoanAssetNameHex,
    loanAmount,
    loanNftPolicyId,
    (oracleRate * 1000000), // USD multiplied by ADA lovelaces bcs no decimals in blockhain
    "ada",
    Number(collateralAmmountInLovelaces),
]);

const unsignedTx = await txBuilder
    .txIn(
        aBorrowInput.input.txHash,
        aBorrowInput.input.outputIndex,
        aBorrowInput.output.amount,
        aBorrowInput.output.address,
    )
    .mintPlutusScriptV3()
    .mint("1", loanNftPolicyId, loanNftNameHex)
    .mintingScript(loanNftValidatorScript)
    .mintRedeemerValue(mConStr0([]))
    .mintPlutusScriptV3()
    .mint(String(loanAmount), mintLoanPolicyId, mintLoanAssetNameHex)
    .mintingScript(mintLoanValidatorScript)
    .mintRedeemerValue(mConStr0([]))
    .txOut(collateralValidatorAddress, [ { unit: "lovelace", quantity: collateralAmmountInLovelaces } ])
    .txOutInlineDatumValue(collateralDatum)
    .txOut(wallet1Address, [ { unit: loanNftUnit, quantity: "1" }, { unit: mintLoanUnit, quantity: String(loanAmount) }])
    .readOnlyTxInReference(oracleUtxo.input.txHash, oracleUtxo.input.outputIndex)
    .readOnlyTxInReference(protocolParametersUtxo.input.txHash, protocolParametersUtxo.input.outputIndex)
    .txInCollateral(
        wallet1Collateral.input.txHash,
        wallet1Collateral.input.outputIndex,
        wallet1Collateral.output.amount,
        wallet1Collateral.output.address,
    )
    .changeAddress(wallet1Address)
    .selectUtxosFrom(wallet1Utxos)
    .complete()

const signedTx = await wallet1.signTx(unsignedTx);
const txHash = await wallet1.submitTx(signedTx);

console.log('New Halalend Model Borrow tx Hash:', txHash);

// Trying out lucid tx
// if (!maestroKey) {
//     throw new Error('maestro key not found!');
// }
// const lucid = await Lucid(
//     new Maestro({
//         network: "Preprod",
//         apiKey: maestroKey,
//         turboSubmit: false,
//     }),
//     "Preprod"
// );

// if (!wallet1Passphrase) {
//     throw new Error('wallet 1 passphrase not found!');
// }
// lucid.selectWallet.fromSeed(wallet1Passphrase);

// const borrowInputsLucid = await lucid.utxosAt(wallet1Address);
// const borrowInputLucid = borrowInputsLucid[4];
// // console.log('borrowInputLucid:', borrowInputLucid);

// const liquidtyUtxosLucid = await lucid.utxosAt(liquidityPoolValidatorAddress);
// // console.log(liquidtyUtxosLucid);

// const oracleAddressUtxosLucid = await lucid.utxosAt(oracleAddress);
// // console.log(oracleAddressUtxosLucid);
// const oracleUtxoLucid = oracleAddressUtxosLucid.find((utxo) => (
//     utxo.assets[tUSDUnit] == 24n
// ));
// if (!oracleUtxoLucid) {
//     throw new Error('oracle utxo lucid does not exist!');
// }
// // console.log(oracleUtxoLucid);

// const protocolParametersUtxoLucid = (await lucid.utxosAt(protocolParametersAddress))[0];
// // console.log(protocolParametersUtxoLucid);

// const redeemer = Data.void();

// const liquidityPoolValLucid: SpendingValidator = {
//     type: "PlutusV3",
//     script: applyParamsToScript(
//         applyDoubleCborEncoding(liquidityPoolValidatorCode[0].compiledCode),
//         [collateralValidatorScriptHash],
//     )
// }

// const loanNftValLucid: MintingPolicy = {
//     type: "PlutusV3",
//     script: applyDoubleCborEncoding(loanNftValidatorCode[0].compiledCode)
// }

// const mintedAssets = { [loanNftUnit]: 1n };
// const mintRedeemer = Data.to(new Constr(0, []));

// const DatumSchema = Data.Object({
//     tusd_pool_hash: Data.Bytes(),
//     tusd_policy_id: Data.Bytes(),
//     tusd_asset_name: Data.Bytes(),
//     tusd_borrowed: Data.Integer(),
//     loan_nft_pid: Data.Bytes(),
//     collateral_rate_in_lovelace: Data.Integer(),
//     collateral_asset: Data.Bytes(),
//     collateral_amount_in_lovelace: Data.Integer(),
//     loan_term: Data.Integer(),
// });
// type Datum = Data.Static<typeof DatumSchema>;
// const Datum = DatumSchema as unknown as Datum;

// const datum = Data.to<Datum>({
//     tusd_pool_hash: liquidityPoolScriptHash,
//     tusd_policy_id: tUsdPolicyId,
//     tusd_asset_name: tUsdAssetNameHex,
//     tusd_borrowed: BigInt(loanAmount),
//     loan_nft_pid: loanNftPolicyId,
//     collateral_rate_in_lovelace: BigInt(oracleRate * 1000000),
//     collateral_asset: "ada",
//     collateral_amount_in_lovelace: BigInt(collateralAmmountInLovelaces),
//     loan_term: BigInt(currentDateTime + loan_term),
// });

// const lucidTx = await lucid
//     .newTx()
//     .collectFrom([borrowInputLucid], redeemer)
//     .collectFrom([liquidtyUtxosLucid[0]], redeemer)
//     .attach.SpendingValidator(liquidityPoolValLucid)
//     .mintAssets(mintedAssets, mintRedeemer)
//     .attach.MintingPolicy(loanNftValLucid)
//     .pay.ToAddressWithData(
//         collateralValidatorAddress,
//         { kind: "inline", value: Data.to(datum) },
//         { lovelace: BigInt(collateralAmmountInLovelaces) },
//     )
//     .pay.ToAddress(wallet1Address, { [loanNftUnit]: 1n, [tUSDUnit]: BigInt(loanAmount) })
//     .pay.ToAddress(liquidityPoolValidatorAddress, { [tUSDUnit]: BigInt(liquidtyBalance) })
//     .readFrom([oracleUtxoLucid]) // change
//     .readFrom([protocolParametersUtxoLucid]) //change
//     .validFrom(currentDateTime)
//     .complete({ localUPLCEval: false })
