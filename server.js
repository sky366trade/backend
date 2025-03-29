require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const axios = require("axios");
const path = require("path");

const binanceRoutes = require("./Routes/binanceRoutes");
const PORT = process.env.PORT || 3000;
const app = express();
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const NOWPAYMENTS_URL = "https://api.nowpayments.io/v1/payment";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB Successfully"))
  .catch((err) => console.error("Error Connecting to MongoDB:", err));
// Task Schema
const taskSchema = new mongoose.Schema({
  reward: { type: String, required: true },
  title: { type: String, required: true },
  type: { type: String },
  status: { type: String, default: "pending" },
  date: {
    type: Date,
    default: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    },
  },
});
const Task = mongoose.model("Task", taskSchema);
// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  phone: { type: String, sparse: true },
  wallet: { type: Number, default: 0 },
  joinDate: { type: Date, default: Date.now },
  emailVerified: { type: Boolean, default: false },
  otp: { type: String },
  otpExpiry: { type: Date },
  tasks: { type: [taskSchema], default: [] },
  team: { type: String },
  referralCode: { type: String },
  parent: {
    type: String,
    default: null,
  },
});
const User = mongoose.model("User", userSchema);
//Team Schema
const TeamSchema = new mongoose.Schema({
  team: {
    type: String,
  },
  teamCount: {
    type: Number,
    default:1,
  },
  teamWallet: {
    type: Number ,
      default: 0,
  },
});
const Team = mongoose.model("Team", TeamSchema);
//Transaction Schema to save the successful transactions
const transactionSchema = new mongoose.Schema({
  orderId: { type: String, required: true, uniwue: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  status: { type: String, required: true },
  paymentUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
});
const Transaction = mongoose.model("Transaction", transactionSchema);

const {
  SECRET_KEY,
  MONGO_URL,
  CRYPTOMUS_MERCHANT_ID,
  CRYPTOMUS_CALLBACK_URL,
  CRYPTOMUS_PAYMENT_URL,
  CRYPTOMUS_API_KEY,
} = process.env;

app.post("/create-team", async (req, res) => {
  try {
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);

    const { username } = req.body;
    console.log("Username:", username);

    if (!username) {
      return res.status(400).json({ msg: "User is required" });
    }

    const team = username;
  

    // ✅ Debug database operation
    const newTeam = await Team.create({ team });

    console.log("Created Team:", newTeam); // Debugging  

    res.send("created");
  } catch (error) {
    console.error("Error creating team:", error);
    res.status(500).json({ msg: "Internal Server Error", error: error.message });
  }
});






// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "Access Denied" });
  try {
    const user = jwt.verify(token, SECRET_KEY);
    req.user = user;
    next();
  } catch (err) {
    res.status(403).json({ msg: "Invalid Token" });
  }
};

// User Registration
app.post("/register", async (req, res) => {
  try {
    const { username, password, email, phone } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser)
      return res.status(400).json({ msg: "Username already exists" });

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({
      username,
      password: hashedPassword,
      email,
      phone,
      joinDate: new Date(),
    });
    await user.save();

    res.status(200).json({ msg: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server Error" });
  }
});
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: path.join(__dirname, "public") });
});
// User Login
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ msg: "Invalid Credentials" });
    }

    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: "1h" });
    return res.json({ token, tasks: user.tasks });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// Fetch User Profile
app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const userDetails = await User.findOne({ username: req.user.username });
    if (!userDetails) return res.status(404).json({ msg: "User not found" });

    res.json({
      username: userDetails.username,
      email: userDetails.email,
      phone: userDetails.phone,
      wallet: userDetails.wallet,
      joinDate: userDetails.joinDate,
      parent:userDetails.parent
    });
  } catch (error) {
    res.status(500).json({ msg: "Internal server error" });
  }
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send OTP
app.post("/send-otp", async (req, res) => {
  try {
    const { email, password, username, phone } = req.body;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60000);

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ msg: "E-mail already exists" });
    }
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ msg: "Username already exists" });
    }

    const user = await User.create({
      username,
      password,
      email,
      phone,
      otp,
      otpExpiry,
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP is ${otp}. It expires in 5 minutes.`,
    });

    // console.log(user);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp, username, password, phone } = req.body;
    const user = await User.findOne({ email });
    if (!user || user.otp !== otp || user.otpExpiry < Date.now()) {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    user.username = username;
    user.password = await bcrypt.hash(password, 12);
    user.phone = phone;
    user.emailVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({ msg: "User registered successfully" });
  } catch (error) {
    User.findOneAndDelete({ email });
    res.status(500).json({ error: "Server error" });
  }
});

// Update Profile
app.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { email, phone } = req.body;
    const userDetails = await User.findOneAndUpdate(
      { username: req.user.username },
      { email, phone },
      { new: true }
    );

    if (!userDetails) return res.status(404).json({ msg: "User not found" });

    res.json({
      username: userDetails.username,
      email: userDetails.email,
      phone: userDetails.phone,
      wallet: userDetails.wallet,
      joinDate: userDetails.joinDate,
    });
  } catch (error) {
    res.status(500).json({ msg: "Internal server error" });
  }
});

// Fetch Tasks
app.get("/view-task", authenticateToken, async (req, res) => {
  try {
    const { username } = req.user;
    const userDetails = await User.findOne({ username });

    if (!userDetails) return res.status(404).json({ msg: "User not found" });

    if (!userDetails.tasks || userDetails.tasks.length === 0) {
      const tasks = await Task.find();
      await User.findOneAndUpdate({ username }, { tasks }, { new: true });
      return res.json({ tasks });
    }

    return res.json({ tasks: userDetails.tasks });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
});

// Complete Task
app.get("/completeTask/:taskId", authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { username } = req.user;

    const userDetails = await User.findOne({ username });
    if (!userDetails) return res.status(404).json({ error: "User not found" });

    const taskIndex = userDetails.tasks.findIndex(
      (t) => t._id.toString() === taskId
    );
    if (taskIndex === -1)
      return res.status(404).json({ error: "Task not found" });

    userDetails.tasks[taskIndex].status = "completed";
    const rewardPercentage =
      parseFloat(userDetails.tasks[taskIndex].reward) || 0;
    userDetails.wallet += (rewardPercentage / 100) * userDetails.wallet;
    await userDetails.save();

    return res.json({ wallet: userDetails.wallet });
  } catch (error) {
    res.status(500).json({ msg: "Internal server error" });
  }
});

// Update Wallet
app.post("/update-wallet", authenticateToken, async (req, res) => {
  try {
    const { username } = req.user;
    let { amount } = req.body;

    amount = Number(amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ msg: "Invalid amount" });
    }

    const userDetails = await User.findOne({ username });
    if (!userDetails) {
      return res.status(404).json({ msg: "User not found" });
    }

    userDetails.wallet += amount;
    await User.findOneAndUpdate({ username }, { wallet: userDetails.wallet });
    res.json({
      msg: "Wallet updated successfully",
      wallet: userDetails.wallet,
    });
  } catch (error) {
    console.error("Error updating wallet:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
});
app.post("/submit-task", async (req, res) => {
  try {
    const savedTask = await Task.create(req.body);
    res
      .status(201)
      .json({ msg: "Task submitted successfully", data: savedTask });
  } catch (error) {
    res.status(500).json({ msg: "Internal server error" });
  }
});

// ✅ Fetch All Tasks
app.get("/get-tasks", async (req, res) => {
  try {
    const task = await Task.find();
    res.json(task);
  } catch (error) {
    res.status(500).json({ msg: "Internal server error" });
  }
});
// Import Models & Routes
const paymentModel = require("./models/payment");
const paymentRoutes = require("./Routes/payment");
const { render } = require("ejs");
const { type } = require("os");

// ✅ Middleware
app.post("/crypto-payment", async (req, res) => {
  try {
    const { amount, currency } = req.body;
    const orderId = `ORDER_${Date.now()}`;
    const response = await fetch(CRYPTOMUS_PAYMENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        merchant: CRYPTOMUS_MERCHANT_ID,
        sign: CRYPTOMUS_API_KEY,
      },
      body: JSON.stringify({
        merchant_id: CRYPTOMUS_MERCHANT_ID,
        amount,
        currency,
        orderId,
        callbackUrl: CRYPTOMUS_CALLBACK_URL,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new error(`Cryptomous Error: ${data.message}`);
    }
    //Now if the transaction is done successfully, we will save the transaction details in our database
    const transaction = new Transaction({
      orderId,
      amount,
      currency,
      status: "pending",
      paymentUrl: data.paymentUrl,
    });
    await transaction.save();
    res.json({ paymentUrl: data.paymentUrl, success: true });
  } catch (error) {
    console.error("Crypto Payment Error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
});
//Now the transactions is created successfully and we have got the payment URL, now we will create a route to handle the callback URL
// ✅ Callback URL
app.post("/crypto-payment/callback", async (req, res) => {
  try {
    const { order_id, status } = req.body;
    const transaction = await Transaction.findOneAndUpdate(
      { orderId: order_id },
      { status },
      { new: true }
    );
    if (!transaction) {
      return res.status(404).json({ msg: "Transaction not found" });
    }
    console.log("Transaction Updated Successfully");
    res.json({ success: true });
  } catch (error) {
    console.error("Crypto Payment Callback Error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
});
// ✅ Payment Success
app.get("/payment-success", (req, res) => {
  res.send("Payment Successful");
});
// ✅ Payment Failure
app.get("/payment-failure", (req, res) => {
  res.send("Payment Failed");
});
// ✅ Payment Cancelled
app.get("/payment-cancelled", (req, res) => {
  res.send("Payment Cancelled");
});

// const COINBASE_API_URL = "https://api.commerce.coinbase.com";
// const API_KEY = process.env.COINBASE_API_KEY; // Store API Key in .env
//Make invoice
app.post("/create-invoice", async (req, res) => {
  try {
    const response = await axios.post(
      "https://api.nowpayments.io/v1/invoice",
      {
        price_amount: 1,
        price_currency: "usd",
        order_id: "RGDBP-21314",
        order_description: "Apple Macbook Pro 2019 x 1",
        ipn_callback_url: "https://nowpayments.io",
        success_url: "https://nowpayments.io",
        cancel_url: "https://nowpayments.io",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": NOWPAYMENTS_API_KEY,
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error("Error creating invoice:", error.response?.data || error);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

// Create a new payment charge

app.post("/create-payment", async (req, res) => {
  try {
    const { amount, order_id } = req.body;

    const paymentData = {
      price_amount: amount,
      price_currency: "usd",
      pay_currency: "usdterc20",

      order_id: order_id,
      ipn_callback_url: WEBHOOK_URL,
      order_description: "Apple Macbook Pro 2019 x 1",
    };

    const response = await axios.post(NOWPAYMENTS_URL, paymentData, {
      headers: { "x-api-key": NOWPAYMENTS_API_KEY },
    });

    return res.json(response.data);
  } catch (error) {
    console.error("Error creating payment:", error.response?.data || error);
    res.status(500).json({ error: "Failed to create payment" });
  }
});

/**
 * 🟡 Check Payment Status
 */
app.get("/payment-status/:payment_id", async (req, res) => {
  try {
    const { payment_id } = req.params;

    const response = await axios.get(`${NOWPAYMENTS_URL}/${payment_id}`, {
      headers: { "x-api-key": NOWPAYMENTS_API_KEY },
    });

    return res.json(response.data);
  } catch (error) {
    console.error(
      "Error fetching payment status:",
      error.response?.data || error
    );
    res.status(500).json({ error: "Failed to fetch payment status" });
  }
});

/**
 * 🔴 Handle Webhook Updates
 */
app.post("/payment-webhook", async (req, res) => {
  console.log("Received webhook:", req.body);

  if (req.body.payment_status === "finished") {
    console.log(`✅ Payment ${req.body.payment_id} completed successfully.`);
  }

  res.status(200).send("Webhook received");
});
// Admin Login
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Add your admin credentials validation here
    // For example, check against admin users in the database

    const token = jwt.sign({ username, role: "admin" }, SECRET_KEY, {
      expiresIn: "1d",
    });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ msg: "Internal server error" });
  }
});

// Delete Task
app.delete("/api/tasks/:taskId", authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    await Task.findByIdAndDelete(taskId);
    res.json({ msg: "Task deleted successfully" });
  } catch (error) {
    res.status(500).json({ msg: "Internal server error" });
  }
});
//write Refferal Code and get joined in the team:
app.post("/getReward", async (req, res) => {
  try {
    const { username, user } = req.body;
    const parent = await User.findOne({ username: user });

    if (!parent) return res.status(404).json({ msg: "No reward found" });
    let root = parent.username;
    let level = 2;
    while (root != null) {
      const parent = await User.findOne({ username: root });
      root = parent.parent;
      level++;
      if (level > 7) {
        Team.create(
          {
            team: username,
          },
          { member: 1 }
        );
        return res.status(404).json({ msg: "No reward found" });
      }
    }

    const bonus = (parent.wallet / 100) * 10;
    await User.findOneAndUpdate(
      { username: parent.username },
      { $inc: { wallet: bonus } },
      { new: true }
    );
    await User.findOneAndUpdate(
      { username },
      { team: parent.team, parent: parent.username },
      { new: true }
    );
    await Team.findOneAndUpdate(
      { team: parent.team },
      {
        $inc: { teamCount: 1,teamWallet: bonus },
      },
      {
        new: true,
      }
    );
    return res.json({ msg: "Added to the Team Successfully" });
  } catch (error) {
    res.status(500).json({ msg: "Internal server error" });
  }
});
//

app.use("/api/binance", binanceRoutes);
app.use("/payment", paymentRoutes);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
