import { IWallet, mConStr0, mConStr1, mConStr2, MeshTxBuilder, stringToHex, UTxO } from "@meshsdk/core";
import { calculateLoanAmount } from "./util";

export const borrow = async (
    txBuilder: MeshTxBuilder,
    wallet: IWallet,
    walletAddress: string,
    walletCollateral: UTxO,
    walletUtxos: UTxO[],
    walletVK: string,
    collateralValidatorAddress: string,
    collateralValidatorScript: string,
    userDepositUtxos: UTxO[],
    loanNftPolicyId: string,
    loanNftValidatorScript: string,
    oracleUtxo: UTxO | undefined,
    protocolParametersUtxo: UTxO | undefined,
    mintLoanAssetNameHex: string,
    mintLoanPolicyId: string,
    mintLoanUnit: string,
    mintLoanValidatorScript: string,
    collateralAmmountInLovelaces: string,
) => {
    if (!oracleUtxo) {
        throw new Error('Oracle UTxO not found!');
    }
    if (!protocolParametersUtxo) {
        throw new Error('Protocol Parameters UTxO not found!');
    }
    
    const loanNftName = "statera-borrow";
    const loanNftNameHex = stringToHex(loanNftName);
    const loanNftUnit = loanNftPolicyId + loanNftNameHex;
    
    const [oracleRate, loanAmount] = calculateLoanAmount(
        oracleUtxo?.output.amount,
        protocolParametersUtxo.output.plutusData,
        collateralAmmountInLovelaces,
    );
    
    console.log('loanAmount:', loanAmount);
    
    const changeAmount = Number(userDepositUtxos[0].output.amount[0].quantity) - Number(collateralAmmountInLovelaces);
    
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
    
    const depositDatum = mConStr1([
        walletVK
    ]);
    
    const unsignedTx = await txBuilder
        // spend deposit utxo by user
        .spendingPlutusScriptV3()
        .txIn(
            userDepositUtxos[0].input.txHash,
            userDepositUtxos[0].input.outputIndex,
            userDepositUtxos[0].output.amount,
            userDepositUtxos[0].output.address,
        )
        .txInScript(collateralValidatorScript)
        .spendingReferenceTxInInlineDatumPresent()
        .spendingReferenceTxInRedeemerValue(mConStr2([]))
        // mint loan NFT
        .mintPlutusScriptV3()
        .mint("1", loanNftPolicyId, loanNftNameHex)
        .mintingScript(loanNftValidatorScript)
        .mintRedeemerValue(mConStr0([]))
        // mint loan tokens
        .mintPlutusScriptV3()
        .mint(String(loanAmount), mintLoanPolicyId, mintLoanAssetNameHex)
        .mintingScript(mintLoanValidatorScript)
        .mintRedeemerValue(mConStr0([]))
        // send collateral to collateral validator address
        .txOut(collateralValidatorAddress, [ { unit: "lovelace", quantity: collateralAmmountInLovelaces } ])
        .txOutInlineDatumValue(collateralDatum)
        // send change as deposit to collateral validator address
        .txOut(collateralValidatorAddress, [ { unit: "lovelace", quantity: String(changeAmount) } ])
        .txOutInlineDatumValue(depositDatum)
        // send loan NFT and loan tokens to borrower
        .txOut(walletAddress, [ { unit: loanNftUnit, quantity: "1" }, { unit: mintLoanUnit, quantity: String(loanAmount) }])
        .readOnlyTxInReference(oracleUtxo.input.txHash, oracleUtxo.input.outputIndex)
        .readOnlyTxInReference(protocolParametersUtxo.input.txHash, protocolParametersUtxo.input.outputIndex)
        // use collateral ADA for failed transactions from user's wallet address
        .txInCollateral(
            walletCollateral.input.txHash,
            walletCollateral.input.outputIndex,
            walletCollateral.output.amount,
            walletCollateral.output.address,
        )
        .changeAddress(walletAddress)
        .requiredSignerHash(walletVK)
        .selectUtxosFrom(walletUtxos)
        .complete()
    
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    
    console.log('Statera Borrow tx Hash:', txHash);
}
