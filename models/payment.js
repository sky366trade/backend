const { Schema, default: mongoose } = require("mongoose");

const paymentSchema=new Schema({
    razorpay_order_id:{
        type:String,
        required:true
    },
    razorpay_payment_id:{
        type:String,
        required:true
    },
    razorpay_signature:{
        type:String,
        required:true
    },
    date:{
        type:Date,
        default:Date.now
    }
})
const paymentModel=mongoose.model("payment",paymentSchema);
module.exports=paymentModel
