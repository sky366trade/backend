const axios = require("axios");
require("dotenv").config();

const testAPI = async () => {
  try {
    const response = await axios.get("https://api.binance.com/api/v3/time", {
      headers: { "X-MBX-APIKEY": process.env.BINANCE_API_KEY },
    });

    console.log("Binance API Connection Successful:", response.data);
  } catch (error) {
    console.error("Error connecting to Binance API:", error.message);
  }
};

testAPI();
