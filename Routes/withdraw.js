require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const router = express.Router();

const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_SECRET_KEY = process.env.BINANCE_SECRET_KEY;
const BINANCE_BASE_URL = process.env.BINANCE_BASE_URL;

// 🔹 Binance Withdraw Route
router.post("/withdraw", async (req, res) => {
  try {
    const { asset, amount, address, network } = req.body;

    if (!asset || !amount || !address || !network) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const timestamp = Date.now();
    const queryString = `asset=${asset}&amount=${amount}&address=${address}&network=${network}&timestamp=${timestamp}`;
    const signature = crypto.createHmac("sha256", BINANCE_SECRET_KEY).update(queryString).digest("hex");

    const response = await axios.post(`${BINANCE_BASE_URL}/sapi/v1/capital/withdraw/apply`, null, {
      params: { asset, amount, address, network, timestamp, signature },
      headers: { "X-MBX-APIKEY": BINANCE_API_KEY },
    });

    res.json({ success: true, response: response.data });
  } catch (error) {
    console.error("Withdrawal Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Withdrawal failed", details: error.response?.data || error.message });
  }
});

module.exports = router;
