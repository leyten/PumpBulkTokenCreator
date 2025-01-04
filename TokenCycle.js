import { createToken } from './TokenCreation.js';
import { sellToken } from './SellDev.js';

const WAIT_TIME_MS = 10000; // 1 minute in milliseconds
const CYCLES = 1; // Number of tokens to create and sell

async function cycleTokens() {
    for (let i = 0; i < CYCLES; i++) {
        console.log(`Cycle ${i + 1} of ${CYCLES}`);

        // Create Token
        const mintAddress = await createToken();
        if (!mintAddress) {
            console.error("Failed to create token. Skipping this cycle.");
            continue;
        }

        // Wait for 1 minute
        console.log(`Waiting ${WAIT_TIME_MS / 1000} seconds before selling...`);
        await new Promise((resolve) => setTimeout(resolve, WAIT_TIME_MS));

        // Sell Token
        await sellToken(mintAddress);
    }
    console.log("All cycles completed.");
}

cycleTokens()