require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const axios = require("axios");
const path = require("path");
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
  flag: { type: Boolean, default: false },
  otp: { type: String },
  otpExpiry: { type: Date },
  tasks: { type: [taskSchema], default: [] },
  team: { type: String },
  referralCode: { type: String },
  parent: {
    type: String,
    default: null,
  },
  level1Bonus: {
    type: Boolean,
    default: false,
  },
  level2Bonus: {
    type: Boolean,
    default: false,
  },
  level3Bonus: {
    type: Boolean,
    default: false,
  },
  level4Bonus: {
    type: Boolean,
    default: false,
  },
  level5Bonus: {
    type: Boolean,
    default: false,
  },
  level6Bonus: {
    type: Boolean,
    default: false,
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
    default: 1,
  },
  teamWallet: {
    type: Number,
    default: 0,
  },
});
const Team = mongoose.model("Team", TeamSchema);

//Accept the Withdrawl request
const TransactionSchema = new mongoose.Schema({
  username: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: "pending" },
  usdttrc20Address: { type: String, requires: true },
  bep20Address: { type: String, requires: true },
});
const Transaction = mongoose.model("Transaction", TransactionSchema);

const {
  SECRET_KEY,
  MONGO_URL,
  CRYPTOMUS_MERCHANT_ID,
  CRYPTOMUS_CALLBACK_URL,
  CRYPTOMUS_PAYMENT_URL,
  CRYPTOMUS_API_KEY,
} = process.env;
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
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
    res
      .status(500)
      .json({ msg: "Internal Server Error", error: error.message });
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

// Check for Register Eligibility
app.post("/check-register", async (req, res) => {
  try {
    const { username, email } = req.body;

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ msg: "Email already exists" });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ msg: "Username already exists" });
    }

    res.status(200).json({ success: "Username and Email are available" });
  } catch (error) {
    console.error("Check-register error:", error);
    res.status(500).json({ msg: "Server Error" });
  }
});

app.use(express.static("public"));

// User Login
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({
      $or: [{ username }, { email: username }],
    });
    if (!user) {
      return res.status(401).json({ msg: "Invalid Credentials" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ msg: "Invalid Credentials" });
    }
    const token = jwt.sign({ username: user.username }, SECRET_KEY, {
      expiresIn: "1h",
    });
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
      parent: userDetails.parent,
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
      subject: "Your One-Time Password (OTP) for Secure Access – Sky366Trade",
      text: `Dear ${username},

We have received a request to verify your identity for secure access to your TradeFly Hub account. Please use the following One-Time Password (OTP) to proceed:

🔐 OTP: ${otp}

This OTP is valid for 5 Minutes and should not be shared with anyone for security reasons.

If you did not request this OTP, please ignore this email or contact our support team immediately.

For assistance, reach out to us.

Best regards,
Sky366Trade Team`,
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
    user.team = username;
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
    const tasks = await Task.find();
    const currentTaskDate = new Date(tasks[0].date).toISOString().split("T")[0];
    const userTasks = userDetails.tasks;
    // console.log({task:currentTaskDate});
    // console.log(new Date(userTasks[0].date).toISOString().split("T")[0]);
    // const today = new Date().toISOString().split("T")[0];
    let taskDate = null;
    if (userTasks.length !== 0) {
      taskDate = new Date(userTasks[0].date).toISOString().split("T")[0];
    }
    if (userDetails.tasks.length === 0) {
      await User.findOneAndUpdate({ username }, { tasks }, { new: true });
      return res.json({ tasks });
    } else if (userDetails.tasks.length > 0 && currentTaskDate !== taskDate) {
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

    // Mark task as completed
    userDetails.tasks[taskIndex].status = "completed";

    // Correct reward calculation
    let rewardPercentage = parseFloat(userDetails.tasks[taskIndex].reward);
    if (isNaN(rewardPercentage)) rewardPercentage = 0;

    // Assuming base reward calculation is from a predefined amount (e.g., 100)
    const rewardAmount = (rewardPercentage * userDetails.wallet) / 100;

    userDetails.wallet += rewardAmount; // Add fixed reward to wallet
    await userDetails.save();

    return res.json({ wallet: userDetails.wallet });
  } catch (error) {
    console.error(error);
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

// Import Models & Routes
const paymentModel = require("./models/payment");

const { render } = require("ejs");
const { type, userInfo } = require("os");

// ✅ Middleware

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
  const { username, amount, order_id } = req.body;

  if (typeof amount !== "number" || isNaN(amount)) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  try {
    const response = await axios.post(
      "https://api.nowpayments.io/v1/invoice",
      {
        price_amount: amount,
        price_currency: "usd",
        order_id: order_id,
        order_description: "Deposit",
        success_url: `${process.env.FRONT_END}/success/${username}/${amount}`,
        cancel_url: `${process.env.FRONT_END}/cancel`,
        // Remove ipn_callback_url unless you're handling IPNs
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.NOWPAYMENTS_API_KEY,
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error("Error creating invoice:", {
      status: error.response?.status,
      data: error.response?.data,
    });
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
      order_description: "",
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
// app.post("/api/admin/login", async (req, res) => {
//   try {
//     const { username, password } = req.body;

//     // Add your admin credentials validation here
//     // For example, check against admin users in the database

//     const token = jwt.sign({ username, role: "admin" }, SECRET_KEY, {
//       expiresIn: "1d",
//     });
//     res.json({ token });
//   } catch (error) {
//     res.status(500).json({ msg: "Internal server error" });
//   }
// });

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
//setting the parent
app.post("/setParent", async (req, res) => {
  try {
    const { username, user } = req.body; // Existing user (parent) and new user (child)

    // Fetch Parent Details
    const parentDetails = await User.findOne({ username: user });
    if (!parentDetails) {
      return res.status(404).json({ msg: "No rewarding member" });
    }

    let root = user;
    let level = 2;

    // Create a new team for the user
    await Team.create({ team: username, member: 1 });

    // Traverse up to 7 levels
    while (root !== null) {
      const rootDetails = await User.findOne({ username: root }, { parent: 1 });
      if (!rootDetails) break;

      root = rootDetails.parent;
      level++;

      if (level > 7) {
        return res
          .status(200)
          .json({ msg: "Added, but no rewarding member found" });
      }
    }

    // Update the current user's parent
    const userUpdate = await User.findOneAndUpdate(
      { username },
      { parent: user },
      { new: true }
    );

    if (!userUpdate) {
      return res.status(404).json({ msg: "User not found for parent update" });
    }

    // Increment the parent team's count
    let parentTeam = userUpdate.parent;
    while (parentTeam) {
      await Team.findOneAndUpdate(
        { team: parentTeam },
        { $inc: { teamCount: 1 } },
        { new: true }
      );

      // Fetch the next parent
      const parentData = await User.findOne(
        { username: parentTeam },
        { parent: 1 }
      );
      parentTeam = parentData ? parentData.parent : null;
    }

    return res.json({ msg: "Added to the Team Successfully" });
  } catch (error) {
    console.error("Error in /setParent:", error);
    return res.status(500).json({ msg: error.message });
  }
});

//write Refferal Code and get joined in the team:
app.post("/getReward", async (req, res) => {
  try {
    const { username, amount } = req.body;
    const userDetails = await User.findOne({ username });
    if (!userDetails) {
      return res.status(404).json({ msg: "User not found" });
    }
    console.log(userDetails)
    const parent = userDetails.parent;
    const flag = userDetails.flag;
    if (parent === null || flag === true) {
      return res.status(404).json({ msg: "No rewarding member found" });
    } else {
      const bonus1 = (amount / 100) * 10;
      const bonus2 = (amount / 100) * 5;
      const bonus3 = (amount / 100) * 3;
      // Update both user's parent wallet and team wallet in parallel

      const parent01 = await User.findOneAndUpdate(
        { username: parent },
        { $inc: { wallet: bonus1 } },
        { new: true }
      );
      
      console.log("parent01:", parent01);
      if (parent01.parent !== null) {
        const parent02 = await User.findOneAndUpdate(
          { username: parent01.parent },
          { $inc: { wallet: bonus2 } },
          { new: true }
        );
        console.log("parent02:", parent02);
        if (parent02.parent !== null) {
          const parent03 = await User.findOneAndUpdate(
            { username: parent02.parent },
            { $inc: { wallet: bonus3 } },
            { new: true }
          );
          console.log("parent03:", parent03);
        }
      }
    }
 
    const userUpdate = await User.findOneAndUpdate(
      { username },
      { flag: true },
      { new: true }
    );

    await Promise.all([userUpdate]);

    return res.json({ msg: "Reward successfully distributed" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Internal server error" });
  }
});
//

//To withdraw using the nowpayments...
const API_KEY = process.env.NOWPAYMENTS_API_KEY;
//
app.post("/showDetails", async (req, res) => {
  try {
    const { username } = req.body;

    // Find user by username
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // Find team by ID or name (modify according to schema)
    const teamData = await Team.findOne({ team: user.team }); // Use findOne if it's stored differently
    if (teamData === "") {
      await Team.create({ team: user.team, teamCount: 1 });
      teamData = await Team.findOne({ team: user.team });
    }

    res.json(teamData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: "Internal Server Error" });
  }
});
//
app.post("/withdrawalRequest", authenticateToken, async (req, res) => {
  const { username } = req.user;
  const { amount, usdttrc20Address, bep20Address } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }
    const transactions = await Transaction.find({ username });
    for (let i = 0; i < transactions.length; i++) {
      if (transactions[i].status === "pending") {
        return res
          .status(400)
          .json({ msg: "Pending withdrawal request exists" });
      }
    }
    if (amount > user.wallet) {
      return res.status(400).json({ msg: "Insufficient balance" });
    }
    const transaction = new Transaction({
      username,
      amount,
      usdttrc20Address,
      bep20Address,
    });
    await transaction.save();
    res.json({ msg: "Withdrawal request created successfully" });
  } catch (error) {
    console.error("Error processing withdrawal request:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
});
app.get("/withdrawalInfo", authenticateToken, async (req, res) => {
  const { username } = req.user;
  try {
    const transactions = await Transaction.find({ username });
    if (!transactions) {
      return res.status(404).json({ msg: "No transactions found" });
    }
    return res.json({ transactions });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
});
//Showing the teams Info
app.get("/showTeamInfo", authenticateToken, async (req, res) => {
  const { username } = req.user;
  try {
    const teams = await User.find({ parent: username });
    if (!teams) {
      return res.status(404).json({ msg: "No teams found" });
    }
    return res.json({ teams });
  } catch (error) {
    console.error("Error fetching teams:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
});
app.delete("/delete-unverified-users", async (req, res) => {
  try {
    const deleted_users = await User.deleteMany({ emailVerified: false });
    if (deleted_users.deletedCount === 0) {
      return res.status(404).json({ msg: "No verified users exists" });
    }
    res.status(200).json({
      msg: "Users deleted successfully",
      count: deleted_users.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting users:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
});
//Finding the total teams
app.post("/total-teams-details", async (req, res) => {
  const { username } = req.body;
  const teams = {
    level1: [],
    level2: [],
    level3: [],
    level4: [],
    level5: [],
    level6: [],
  };
  teams.level1.push(await User.find({ parent: username }));
  teams.level1 = teams.level1.flat(2);
  for (let i = 0; i < teams.level1.length; i++) {
    teams.level2.push(await User.find({ parent: teams.level1[i].username }));
  }
  teams.level2 = teams.level2.flat(2);
  for (let j = 0; j < teams.level2.length; j++) {
    teams.level3.push(await User.find({ parent: teams.level2[j].username }));
  }

  teams.level3 = teams.level3.flat(2);
  for (let k = 0; k < teams.level3.length; k++) {
    teams.level4.push(await User.find({ parent: teams.level3[k].username }));
  }
  teams.level4 = teams.level4.flat(2);
  for (let l = 0; l < teams.level4.length; l++) {
    teams.level5.push(await User.find({ parent: teams.level4[l].username }));
  }
  teams.level5 = teams.level5.flat(2);
  for (let m = 0; m < teams.level5.length; m++) {
    teams.level6.push(await User.find({ parent: teams.level5[m].username }));
  }
  teams.level6 = teams.level6.flat(2);
  if (!teams) {
    return res.status(404).json({ msg: "No teams found" });
  }
  return res.json({ teams });
});
//Assign Bonus
app.post("/assign-bonus", async (req, res) => {
  const { username, level, bonus } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }
    if (level === 1 && !user.level1Bonus) {
      user.level1Bonus = true;
      user.wallet += bonus;
    } else if (level === 2 && !user.level2Bonus) {
      user.level2Bonus = true;
      user.wallet += bonus;
    } else if (level === 3 && !user.level3Bonus) {
      user.level3Bonus = true;
      user.wallet += bonus;
    } else if (level === 4 && !user.level4Bonus) {
      user.level4Bonus = true;
      user.wallet += bonus;
    } else if (level === 5 && !user.level5Bonus) {
      user.level5Bonus = true;
      user.wallet += bonus;
    } else if (level === 6 && !user.level6Bonus) {
      user.level6Bonus = true;
      user.wallet += bonus;
    }
    await user.save();
    res.json({ msg: true });
  } catch (error) {
    console.error("Error assigning bonus:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
});
// Serve static files from the React app

//Admin Panel APIs

//1. Get all users
app.get("/totalUsers", async (req, res) => {
  try {
    const users = await User.find({});
    res.json({ users });
  } catch (error) {
    console.error("Error fetching total users:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
});
//2.Update the users
app.post("/update-user", async (req, res) => {
  try {
    const { username, email, phone, wallet } = req.body;
    const user = await User.findOne({ username });
    user.email = email;
    user.phone = phone;
    user.wallet = wallet;
    await user.save();
    res.send({ msg: "Success" });
  } catch (error) {
    res.send(error);
  }
});
//3.Get All Tasks
app.get("/get-tasks", async (req, res) => {
  try {
    const task = await Task.find();
    res.json(task);
  } catch (error) {
    res.status(500).json({ msg: "Internal server error" });
  }
});
//4.Edit any task
app.post("/edit-task", async (req, res) => {
  try {
    const { _id, title, reward, type, date } = req.body;
    const task = await Task.findOne({ _id });
    task.title = title;
    task.reward = reward;
    task.type = type;
    task.date = date;
    await task.save();
    res.send({ msg: "Success" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Internal server error" });
  }
});
//Create Admin Model
const adminSchema = new mongoose.Schema({
  username: { type: String },
  password: { type: String },
});
const Admin = mongoose.model("Admin", adminSchema);
//5.Register the Admin
app.post("/register-admin", async (req, res) => {
  try {
    const { username, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 12);

    const admin = await Admin.create({ username, password: hashedPassword });

    res.json(admin);
  } catch (error) {
    console.error(error);
    res.status(500).json("Not Created");
  }
});
//6.Login the Admin
app.post("/login-admin", async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ msg: "Invalid Credentials" });
    }
    const isMatch = bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ msg: "Invalid Credentials" });
    }
    const token = jwt.sign({ username: admin.username }, SECRET_KEY, {
      expiresIn: "1h",
    });
    return res.json({ token });
  } catch (error) {
    console.error(error);
    res.status(500).json("Internal Server Error");
  }
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
