// Middleware to Verify Webhook Signature
// const verifyWebhook = (req, res, next) => {
//   const signature = req.headers["X-Thinkific-Hmac-Sha256"];
//   const payload = JSON.stringify(req.body);

//   console.log("Verifying signature", payload);

//   // Function to validate the HMAC signature
//   const computedHash = createHmac("sha256", WEBHOOK_SECRET)
//     .update(payload, "utf8")
//     .digest("hex");

//   if (computedHash !== signature) {
//     console.error("Invalid webhook signature");
//     return res.status(400).send("Invalid signature");
//   }

//   console.log("Signature verified");

//   next();
// };

