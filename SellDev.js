import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { getMint } from '@solana/spl-token';

dotenv.config();

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_ENDPOINT;
const PRIVATE_KEY = process.env.NEXT_PUBLIC_PRIVATE_KEY;

if (!RPC_ENDPOINT || !PRIVATE_KEY) {
    throw new Error('RPC_ENDPOINT or PRIVATE_KEY is missing. Check your .env file.');
}

const web3Connection = new Connection(RPC_ENDPOINT, 'confirmed');

export async function sellToken(mintAddress) {
    const signerKeyPair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));

    const tokenAccount = await getAssociatedTokenAddress(
        new PublicKey(mintAddress),
        signerKeyPair.publicKey
    );

    let accountInfo, mintInfo;
    try {
        accountInfo = await getAccount(web3Connection, tokenAccount);
        mintInfo = await getMint(web3Connection, new PublicKey(mintAddress));
    } catch (err) {
        console.error("Failed to fetch token account or mint info:", err);
        return;
    }

    const tokenBalance = accountInfo.amount;
    const decimals = mintInfo.decimals;

    if (tokenBalance <= 0n) {
        console.error("No tokens available to sell.");
        return;
    }

    // Convert balance to human-readable format and round to nearest whole number
    const amountToSell = (Number(tokenBalance) / 10 ** decimals).toFixed(0);

    console.log(`Selling ${amountToSell} tokens with mint address ${mintAddress}`);

    const response = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            publicKey: signerKeyPair.publicKey.toBase58(),
            action: "sell",
            mint: mintAddress,
            amount: amountToSell, // Ensure this is a valid integer
            denominatedInSol: "false",
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
