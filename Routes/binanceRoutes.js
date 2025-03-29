const express = require("express");
const router = express.Router();
const { withdrawCrypto } = require("../services/binanceService");

/**
 * @route POST /api/binance/withdraw
 * @desc Withdraw crypto from Binance
 * @param {string} coin - Crypto symbol (e.g., "USDT", "BTC")
 * @param {string} address - Recipient wallet address
 * @param {number} amount - Amount to send
 */
router.post("/withdraw", async (req, res) => {
  const { coin, address, amount } = req.body;

  if (!coin || !address || !amount) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const response = await withdrawCrypto(coin, address, amount);
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: "Withdrawal failed", details: error.message });
  }
});

module.exports = router;
