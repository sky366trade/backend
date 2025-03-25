require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
require("dotenv").config();
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: process.env.BASE_URL, // Allow requests from frontend
    credentials: true,
  })
);

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
  reward: { type: String, required: true }, // Reward stored as percentage string (e.g., "2%")
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
  wallet: { type: Number, default: 0 }, // Stores user's wallet balance
  tasks: { type: [taskSchema], default: [] }, // Array of tasks assigned to user
});
const User = mongoose.model("User", userSchema);

const SECRET_KEY = process.env.SECRET_KEY;; // JWT Secret Key

// ✅ User Registration
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser)
      return res.status(400).json({ msg: "Username already exists" });

    const hashedPassword = await bcrypt.hash(password, 12); 
    const user = new User({ username, password: hashedPassword });
    await user.save();

    res.json({ msg: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server Error" });
  }
});

// ✅ User Login
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

// ✅ Middleware for Authentication
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

// ✅ Fetch Tasks for User
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
//Update the wallet
app.post("/update-wallet", authenticateToken, async (req, res) => {
  try {
    const { username } = req.user;
    let { amount } = req.body;

  

    // ✅ Convert amount to Number and validate
    amount = Number(amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ msg: "Invalid amount" });
    }

    // ✅ Find user
    const userDetails = await User.findOne({ username });
    
    if (!userDetails) {
      return res.status(404).json({ msg: "User not found" });
    }
    
    // ✅ Update wallet
    userDetails.wallet += amount;
    console.log(userDetails);
    console.log("Received amount:", amount);
    await User.findOneAndUpdate({ username }, { wallet: userDetails.wallet });
    res.json({ msg: "Wallet updated successfully", wallet: userDetails.wallet });
  } catch (error) {
    console.error("Error updating wallet:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
});

// ✅ Fetch User Profile
app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const userDetails = await User.findOne({ username: req.user.username });
    if (!userDetails) return res.status(404).json({ msg: "User not found" });

    res.json({ username: userDetails.username, wallet: userDetails.wallet });
  } catch (error) {
    res.status(500).json({ msg: "Internal server error" });
  }
});

// ✅ Complete Task and Update Wallet
app.get("/completeTask/:taskId", authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { username } = req.user;

    const userDetails = await User.findOne({ username });
    if (!userDetails) return res.status(404).json({ error: "User not found" });

    const taskIndex = userDetails.tasks.findIndex((t) => t._id.toString() === taskId);
    if (taskIndex === -1) return res.status(404).json({ error: "Task not found" });

    userDetails.tasks[taskIndex].status = "completed";
    const rewardPercentage = parseFloat(userDetails.tasks[taskIndex].reward) || 0;
    userDetails.wallet += (rewardPercentage / 100) * userDetails.wallet;
    await userDetails.save();

    return res.json({ wallet: userDetails.wallet });
  } catch (error) {
    res.status(500).json({ msg: "Internal server error" });
  }
});

// ✅ Submit a New Task
app.post("/submit-task", async (req, res) => {
  try {
    const savedTask = await Task.create(req.body);
    res.status(201).json({ msg: "Task submitted successfully", data: savedTask });
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

// ✅ Middleware

app.use("/payment", paymentRoutes);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
