import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, getMint } from '@solana/spl-token';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import readline from 'readline';
import { FormData, File } from 'formdata-node';
import { fileFromPath } from 'formdata-node/file-from-path';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const promptUser = (question) => new Promise((resolve) => rl.question(question, resolve));

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_ENDPOINT;
const PRIVATE_KEY = process.env.NEXT_PUBLIC_PRIVATE_KEY;

if (!RPC_ENDPOINT || !PRIVATE_KEY) {
    throw new Error('RPC_ENDPOINT or PRIVATE_KEY is missing. Check your .env file.');
}

const web3Connection = new Connection(RPC_ENDPOINT, 'confirmed');

const WALLET_STORAGE_FILE = 'stored_wallets.json';

async function loadStoredWallets() {
    try {
        const data = await fsPromises.readFile(WALLET_STORAGE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

async function saveStoredWallets(wallets) {
    await fsPromises.writeFile(WALLET_STORAGE_FILE, JSON.stringify(wallets, null, 2), 'utf8');
}

async function generateNewWallet() {
    const newWallet = Keypair.generate();
    const publicKey = newWallet.publicKey.toString();
    const privateKey = bs58.encode(newWallet.secretKey);
    
    console.log(`New wallet generated:`);
    console.log(`Public Key: ${publicKey}`);
    console.log(`Private Key: ${privateKey}`);
    
    const name = await promptUser("Enter a name for this wallet: ");
    
    const storedWallets = await loadStoredWallets();
    storedWallets[name] = { publicKey, privateKey };
    await saveStoredWallets(storedWallets);
    
    console.log(`Wallet "${name}" has been stored.`);
    
    return { name, publicKey, privateKey };
}

async function getWalletBalance(publicKey) {
    const balance = await web3Connection.getBalance(new PublicKey(publicKey));
    return balance / LAMPORTS_PER_SOL;
}

async function waitForSufficientBalance(publicKey) {
    while (true) {
        const balance = await getWalletBalance(publicKey);
        console.log(`Current balance: ${balance} SOL`);
        
        if (balance >= 0.01) {
            console.log("Sufficient balance detected. Proceeding with token creation.");
            return;
        }
        
        const response = await promptUser("Insufficient balance. Please send SOL to the wallet. Enter 'r' to refresh balance or 'q' to quit: ");
        
        if (response.toLowerCase() === 'q') {
            console.log("Quitting the program.");
            process.exit(0);
        }
        
        if (response.toLowerCase() !== 'r') {
            console.log("Invalid input. Please enter 'r' to refresh or 'q' to quit.");
        }
    }
}

async function selectWallet() {
    const storedWallets = await loadStoredWallets();
    const walletNames = Object.keys(storedWallets);

    if (walletNames.length === 0) {
        console.log("No stored wallets found. Creating a new one.");
        return await generateNewWallet();
    }

    console.log("Stored wallets:");
    walletNames.forEach((name, index) => {
        console.log(`${index + 1}. ${name}`);
    });
    console.log(`${walletNames.length + 1}. Create a new wallet`);
    console.log(`${walletNames.length + 2}. Delete a wallet`);

    const choice = parseInt(await promptUser("Select an option: "));

    if (choice === walletNames.length + 1) {
        return await generateNewWallet();
    } else if (choice === walletNames.length + 2) {
        await deleteWallet();
        return await selectWallet();
    } else if (choice > 0 && choice <= walletNames.length) {
        const selectedName = walletNames[choice - 1];
        return { name: selectedName, ...storedWallets[selectedName] };
    } else {
        console.log("Invalid choice. Please try again.");
        return await selectWallet();
    }
}

async function deleteWallet() {
    const storedWallets = await loadStoredWallets();
    const walletNames = Object.keys(storedWallets);

    if (walletNames.length === 0) {
        console.log("No stored wallets to delete.");
        return;
    }

    console.log("Select a wallet to delete:");
    walletNames.forEach((name, index) => {
        console.log(`${index + 1}. ${name}`);
    });

    const choice = parseInt(await promptUser("Enter the number of the wallet to delete (or 0 to cancel): "));

    if (choice === 0) {
        return;
    } else if (choice > 0 && choice <= walletNames.length) {
        const nameToDelete = walletNames[choice - 1];
        delete storedWallets[nameToDelete];
        await saveStoredWallets(storedWallets);
        console.log(`Wallet "${nameToDelete}" has been deleted.`);
    } else {
        console.log("Invalid choice. No wallet deleted.");
    }
}

async function getUserInput() {
    const selectedWallet = await selectWallet();
    console.log(`Using wallet: ${selectedWallet.name}`);
    
    await waitForSufficientBalance(selectedWallet.publicKey);

    const tokenName = await promptUser("Enter token name: ");
    const tokenSymbol = await promptUser("Enter token symbol: ");
    const tokenDescription = await promptUser("Enter token description (optional): ");
    const twitterUrl = await promptUser("Enter Twitter URL (optional): ");
    const telegramUrl = await promptUser("Enter Telegram URL (optional): ");
    const websiteUrl = await promptUser("Enter website URL (optional): ");
    const logoPath = await promptUser("Enter path to logo image (default: ./logo.png): ");
    const initialAmount = parseFloat(await promptUser("Enter initial amount in SOL (default: 0.3): "));
    const slippage = parseInt(await promptUser("Enter slippage percentage (default: 10): "));
    const priorityFee = parseFloat(await promptUser("Enter priority fee (default: 0.000005): "));
    const waitTimeMs = parseInt(await promptUser("Enter wait time in milliseconds (default: 120000): "));
    const cycles = parseInt(await promptUser("Enter number of cycles (default: 30): "));

    return {
        walletToUse: selectedWallet.privateKey,
        publicKeyToUse: selectedWallet.publicKey,
        tokenName: tokenName || "Zephyr AI",
        tokenSymbol: tokenSymbol || "ZPHR",
        tokenDescription: tokenDescription || "",
        twitterUrl: twitterUrl || "https://x.com/Zephyraisol",
        telegramUrl: telegramUrl || "",
        websiteUrl: websiteUrl || "https://www.zephyrai.dev/",
        logoPath: logoPath || "./logo.png",
        initialAmount: isNaN(initialAmount) ? 0.3 : initialAmount,
        slippage: isNaN(slippage) ? 10 : slippage,
        priorityFee: isNaN(priorityFee) ? 0.000005 : priorityFee,
        waitTimeMs: isNaN(waitTimeMs) ? 120000 : waitTimeMs,
        cycles: isNaN(cycles) ? 30 : cycles
    };
}

async function createToken(config) {
    const signerKeyPair = Keypair.fromSecretKey(bs58.decode(config.walletToUse));
    const mintKeypair = Keypair.generate();

    const formData = new FormData();
    const file = await fileFromPath(config.logoPath);
    formData.append("file", file, "logo.png");
    formData.append("name", config.tokenName);
    formData.append("symbol", config.tokenSymbol);
    formData.append("description", config.tokenDescription);
    formData.append("twitter", config.twitterUrl);
    formData.append("telegram", config.telegramUrl);
    formData.append("website", config.websiteUrl);
    formData.append("showName", "true");

    try {
        const metadataResponse = await fetch("https://pump.fun/api/ipfs", {
            method: "POST",
            body: formData,
        });
        const metadataResponseJSON = await metadataResponse.json();

        const response = await fetch("https://pumpportal.fun/api/trade-local", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
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
                amount: config.initialAmount,
                slippage: config.slippage,
                priorityFee: config.priorityFee,
                pool: "pump",
            }),
        });

        if (response.status === 200) {
            const data = await response.arrayBuffer();
            const tx = VersionedTransaction.deserialize(new Uint8Array(data));
            tx.sign([mintKeypair, signerKeyPair]);

            const signature = await web3Connection.sendTransaction(tx);
            console.log("Token Created: https://solscan.io/tx/" + signature);

            await fsPromises.writeFile('./mint.json', JSON.stringify({ mint: mintKeypair.publicKey.toBase58() }, null, 2), 'utf8');
            console.log("Mint Address Saved: " + mintKeypair.publicKey.toBase58());
            return mintKeypair.publicKey.toBase58();
        } else {
            throw new Error(await response.text());
        }
    } catch (error) {
        console.error("Error in token creation:", error);
        return null;
    }
}

async function sellToken(mintAddress, config) {
    const signerKeyPair = Keypair.fromSecretKey(bs58.decode(config.walletToUse));

    try {
        const tokenAccount = await getAssociatedTokenAddress(
            new PublicKey(mintAddress),
            signerKeyPair.publicKey
        );

        const [accountInfo, mintInfo] = await Promise.all([
            getAccount(web3Connection, tokenAccount),
            getMint(web3Connection, new PublicKey(mintAddress))
        ]);

        const tokenBalance = accountInfo.amount;
        const decimals = mintInfo.decimals;

        if (tokenBalance <= 0n) {
            throw new Error("No tokens available to sell.");
        }

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
                amount: amountToSell,
                denominatedInSol: "false",
                slippage: config.slippage,
                priorityFee: config.priorityFee,
                pool: "pump",
            }),
        });

        if (response.status === 200) {
            const data = await response.arrayBuffer();
            const tx = VersionedTransaction.deserialize(new Uint8Array(data));
            tx.sign([signerKeyPair]);

            const signature = await web3Connection.sendTransaction(tx);
            console.log("Token Sold: https://solscan.io/tx/" + signature);
            return signature;
        } else {
            throw new Error(await response.text());
        }
    } catch (error) {
        console.error("Error in selling token:", error);
        throw error;
    }
}

class TokenAutomation {
    constructor(config) {
        this.config = config;
        this.currentCycle = 0;
        this.successfulCycles = 0;
        this.failedCycles = 0;
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    logStatus() {
        console.log(`
Status Report:
------------
Current Cycle: ${this.currentCycle + 1}/${this.config.cycles}
Successful: ${this.successfulCycles}
Failed: ${this.failedCycles}
Remaining: ${this.config.cycles - (this.currentCycle + 1)}
------------
`);
    }

    async runCycle() {
        try {
            console.log(`\nStarting cycle ${this.currentCycle + 1} of ${this.config.cycles}`);
            
            console.log('Creating token...');
            const mintAddress = await createToken(this.config);
            
            if (!mintAddress) {
                throw new Error('Token creation failed');
            }
            
            console.log(`Token created successfully: ${mintAddress}`);
            console.log(`Waiting ${this.config.waitTimeMs / 1000} seconds before selling...`);
            
            const startWait = Date.now();
            while (Date.now() - startWait < this.config.waitTimeMs) {
                const remaining = Math.ceil((this.config.waitTimeMs - (Date.now() - startWait)) / 1000);
                process.stdout.write(`\rTime remaining: ${remaining}s `);
                await this.sleep(1000);
            }
            console.log('\n');

            console.log('Selling token...');
            await sellToken(mintAddress, this.config);
            
            this.successfulCycles++;
            console.log('Cycle completed successfully');
            
        } catch (error) {
            this.failedCycles++;
            console.error(`Cycle failed: ${error.message}`);
        }
    }

    async start() {
        console.log(`Starting token automation with ${this.config.cycles} cycles`);
        console.log(`Wait time between creation and sell: ${this.config.waitTimeMs / 1000}s`);

        for (this.currentCycle = 0; this.currentCycle < this.config.cycles; this.currentCycle++) {
            await this.runCycle();
            this.logStatus();
            
            if (this.currentCycle < this.config.cycles - 1) {
                console.log('Waiting 5 seconds before next cycle...');
                await this.sleep(5000);
            }
        }

        console.log(`
Automation Completed
-------------------
Total Cycles: ${this.config.cycles}
Successful: ${this.successfulCycles}
Failed: ${this.failedCycles}
Success Rate: ${((this.successfulCycles / this.config.cycles) * 100).toFixed(2)}%
-------------------
`);
        rl.close();
    }
}

async function main() {
    const config = await getUserInput();
    const automation = new TokenAutomation(config);
    await automation.start();
}

main().catch(console.error);