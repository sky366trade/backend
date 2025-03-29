const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_SECRET_KEY = process.env.BINANCE_SECRET_KEY;
const BINANCE_BASE_URL = process.env.BINANCE_BASE_URL;

/**
 * Generate a secure Binance API signature
 */
function generateSignature(queryString) {
  return crypto.createHmac("sha256", BINANCE_SECRET_KEY).update(queryString).digest("hex");
}

/**
 * Withdraw Crypto from Binance
 * @param {string} coin - Crypto symbol (e.g., "USDT", "BTC")
 * @param {string} address - Recipient wallet address
 * @param {number} amount - Amount to send
 */
async function withdrawCrypto(coin, address, amount) {
  try {
    const timestamp = Date.now();
    const queryString = `coin=${coin}&address=${address}&amount=${amount}&timestamp=${timestamp}`;
    const signature = generateSignature(queryString);

    const response = await axios.post(
      `${BINANCE_BASE_URL}/sapi/v1/capital/withdraw/apply?${queryString}&signature=${signature}`,
      {},
      { headers: { "X-MBX-APIKEY": BINANCE_API_KEY } }
    );

    return response.data;
  } catch (error) {
    console.error("Withdrawal Error:", error.response?.data || error.message);
    throw error;
  }
}

module.exports = { withdrawCrypto };
