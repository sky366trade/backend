const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto"); // ✅ Import crypto
require("dotenv").config();

const router = express.Router();

// 🔹 Initialize Razorpay instance
const instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET
});

// ✅ Route 1: Create an order in USD
router.post("/create-order", async (req, res) => {
    try {
        const options = {
            amount: req.body.amount * 100, // Convert to cents
            currency: "USD",
            receipt: "order_rcptid_" + Date.now(),
        };
        const order = await instance.orders.create(options);
        res.json(order);
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error" }); // ✅ Fixed res.send(500)
    }
});

// ✅ Route 2: Verify Payment Signature
router.post("/verify-payment", async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        // Generate HMAC SHA256 signature
        const generated_signature = crypto
            .createHmac("sha256", process.env.RAZORPAY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest("hex");

        if (generated_signature === razorpay_signature) {
            res.json({ success: true, message: "Payment verified successfully" });
        } else {
            res.status(400).json({ success: false, message: "Payment verification failed" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
