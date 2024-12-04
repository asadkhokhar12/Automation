import express from "express";
import bodyParser from "body-parser";
import { createHmac } from "crypto";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Environment Variables
const THINKIFIC_API_KEY = process.env.THINKIFIC_API_KEY;
const THINKIFIC_SUBDOMAIN = process.env.THINKIFIC_SUBDOMAIN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const ORTTO_API_KEY = process.env.ORTTO_API_KEY;

// Function to create Thinkific Webhooks
// const createWebhook = async (topic) => {
//   try {
//     const response = await axios.post(
//       `https://api.thinkific.com/api/v2/webhooks`,
//       {
//         topic,
//         target_url: WEBHOOK_URL,
//         secret: WEBHOOK_SECRET,
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${THINKIFIC_API_KEY}`,
//           "Content-Type": "application/json",
//         },
//       }
//     );
//     console.log(`${topic} Webhook Created:`, response.data);
//   } catch (error) {
//     console.error(
//       `Error creating ${topic} webhook:`,
//       error.response?.data || error.message
//     );
//   }
// };

// createWebhook("user.signin");
// createWebhook("enrollment.created");

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

// Handle Incoming Webhooks
app.post("/webhook/ortto", async (req, res) => {
  const data = req.body;

  console.log("Webhook received:", data);

  try {
    if (data.action === "user.signup") {
      await updateOrttoUser(data.payload);
    } else if (data.action === "enrollments.created") {
      await updateOrttoEnrollment(data.payload);
    } else if (data.action === "signin") {
      await updateOrttoUser(data.payload);
    }
    res.status(200).send("Webhook processed");
  } catch (error) {
    console.error("Error processing webhook:", error.message);
    res.status(500).send("Internal Server Error");
  }
});


// Function to Update User in Ortto
const updateOrttoUser = async (userData) => {
  try {
    const data = {
      people: [
        {
          fields: {
            "str::email": userData.email,
            "str::first": userData.first_name,
            "str::last": userData.last_name,
          },
          location: {
            source_ip: userData.ip_address || "Unknown",
          },
        },
      ],
      async: true,
      merge_by: ["str::email"],
      merge_strategy: 2,
      find_strategy: 0,
    };

    const response = await axios.post(
      "https://api.eu.ap3api.com/v1/person/merge",
      data,
      {
        headers: {
          "X-Api-Key": `${ORTTO_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Ortto user updated:", response.data);
  } catch (error) {
    console.error(
      "Error updating Ortto user:",
      error.response?.data || error.message
    );
  }
};

// Function to Update Enrollment in Ortto
// const updateOrttoEnrollment = async (enrollmentData) => {
//   try {
//     const response = await axios.post(
//       "https://api.ortto.com/v1/enrollments",
//       {
//         email: enrollmentData.user_email,
//         course_name: enrollmentData.course_name,
//         progress: enrollmentData.progress || 0,
//       },
//       {
//         headers: {
//           "X-Api-Key": `${ORTTO_API_KEY}`,
//           "Content-Type": "application/json",
//         },
//       }
//     );
//     console.log("Ortto enrollment updated:", response.data);
//   } catch (error) {
//     console.error(
//       "Error updating Ortto enrollment:",
//       error.response?.data || error.message
//     );
//   }
// };

// Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
