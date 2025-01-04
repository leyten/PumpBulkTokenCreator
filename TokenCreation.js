import { VersionedTransaction, Connection, Keypair } from '@solana/web3.js';
import bs58 from "bs58";
import dotenv from 'dotenv';
import * as fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

dotenv.config();

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_ENDPOINT;
const PRIVATE_KEY = process.env.NEXT_PUBLIC_PRIVATE_KEY;

if (!RPC_ENDPOINT || !PRIVATE_KEY) {
    throw new Error('RPC_ENDPOINT or PRIVATE_KEY is missing. Check your .env file.');
}

const web3Connection = new Connection(
    RPC_ENDPOINT,
    'confirmed',
);

export async function createToken() {
    const signerKeyPair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
    const mintKeypair = Keypair.generate();

    // Prepare token metadata
    const formData = new FormData();
    formData.append("file", fs.createReadStream("./logo.png"), "logo.png"); // Use readable stream
    formData.append("name", "Zephyr AI");
    formData.append("symbol", "ZPHR");
    formData.append("description", "");
    formData.append("twitter", "https://x.com/Zephyraisol");
    formData.append("telegram", "");
    formData.append("website", "https://www.zephyrai.dev/");
    formData.append("showName", "true");

    // Create IPFS metadata
    const metadataResponse = await fetch("https://pump.fun/api/ipfs", {
        method: "POST",
        body: formData,
    });
    const metadataResponseJSON = await metadataResponse.json();

    // Generate transaction
    const response = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            publicKey: signerKeyPair.publicKey.toBase58(),
            action: "create",
            tokenMetadata: {
                name: metadataResponseJSON.metadata.name,
                symbol: metadataResponseJSON.metadata.symbol,
                uri: metadataResponseJSON.metadataUri,
            },
            mint: mintKeypair.publicKey.toBase58(),
            denominatedInSol: "true",
            amount: 0.1,
            slippage: 10,
            priorityFee: 0.0005,
            pool: "pump",
        }),
    });

    if (response.status === 200) {
        const data = await response.arrayBuffer();
        const tx = VersionedTransaction.deserialize(new Uint8Array(data));
        tx.sign([mintKeypair, signerKeyPair]);
        const signature = await web3Connection.sendTransaction(tx);
        await fs.writeFile('./mint.json', JSON.stringify({ mint: mintKeypair.publicKey.toBase58() }, null, 2));

        console.log("Transaction: https://solscan.io/tx/" + signature);
        console.log("Token Mint Address saved to mint.json");
    } else {
        console.error("Error:", await response.text());
    }
}
