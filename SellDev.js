import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

dotenv.config();

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_ENDPOINT;
const PRIVATE_KEY = process.env.NEXT_PUBLIC_PRIVATE_KEY;

if (!RPC_ENDPOINT || !PRIVATE_KEY) {
    throw new Error('RPC_ENDPOINT or PRIVATE_KEY is missing. Check your .env file.');
}

const web3Connection = new Connection(RPC_ENDPOINT, 'confirmed');

export async function sellToken(mintAddress) {
    const signerKeyPair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));

    // Derive the associated token address for the wallet and mint
    const tokenAccount = await getAssociatedTokenAddress(
        new PublicKey(mintAddress),
        signerKeyPair.publicKey
    );

    // Fetch the account information to get the token balance
    let accountInfo;
    try {
        accountInfo = await getAccount(web3Connection, tokenAccount);
    } catch (err) {
        console.error("Failed to fetch token account info:", err);
        return;
    }

    const tokenBalance = accountInfo.amount; // Balance in smallest units (e.g., lamports for SOL)

    if (tokenBalance <= 0) {
        console.error("No tokens available to sell.");
        return;
    }

    console.log(`Selling ${tokenBalance} units of token with mint address ${mintAddress}`);

    // Sell transaction
    const response = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            publicKey: signerKeyPair.publicKey.toBase58(),
            action: "sell",
            mint: mintAddress,
            amount: tokenBalance, // Use the entire available balance
            denominatedInSol: "true",
            slippage: 10,
            priorityFee: 0.0005,
            pool: "pump",
        }),
    });

    if (response.status === 200) {
        const data = await response.arrayBuffer();
        const tx = VersionedTransaction.deserialize(new Uint8Array(data));
        tx.sign([signerKeyPair]);

        const signature = await web3Connection.sendTransaction(tx);
        console.log("Token Sold: https://solscan.io/tx/" + signature);
    } else {
        console.error("Error selling token:", await response.text());
    }
}