import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Environment Variables
const THINKIFIC_API_KEY = process.env.THINKIFIC_API_KEY;
const THINKIFIC_SUBDOMAIN = process.env.THINKIFIC_SUBDOMAIN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const ORTTO_API_KEY = process.env.ORTTO_API_KEY;

// Utility: Centralized Error Handling
const handleError = (res, error, message = "Internal Server Error") => {
  console.error(message, error.response?.data || error.message || error);
  res.status(500).send({ error: message });
};

// Function to Create Webhook for Thinkific Events
const createWebhook = async (topic) => {
  try {
    const response = await axios.post(
      `https://api.thinkific.com/api/v2/webhooks`,
      { topic, target_url: WEBHOOK_URL },
      {
        headers: {
          Authorization: `Bearer ${THINKIFIC_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(`${topic} Webhook Created:`, response.data);
  } catch (error) {
    console.error(
      `Error creating ${topic} webhook:`,
      error.response?.data || error.message
    );
  }
};

// Helper: Prepare Payload for Ortto User Creation/Update
const prepareOrttoUserPayload = (userData) => {
  const phoneField = userData.custom_profile_fields?.find(
    (field) => field.label === "Phone"
  );

  return {
    people: [
      {
        fields: {
          "str::email": userData.email,
          "str::first": userData.first_name,
          "str::last": userData.last_name,
          "phn::phone": phoneField
            ? { phone: phoneField.value, parse_with_country_code: true }
            : null,
        },
      },
    ],
    async: true,
    merge_by: ["str::email"],
    merge_strategy: 2,
    find_strategy: 0,
  };
};

// Function to Ensure Custom Field Exists in Ortto
const ensureCustomFieldExists = async (fieldName) => {
  try {
    const response = await axios.post(
      "https://api.au.ap3api.com/v1/person/custom-field/get",
      {},
      {
        headers: {
          "X-Api-Key": ORTTO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    const fields = response.data?.fields || [];
    const exists = fields.some((field) => field.field.name === fieldName);
    
    if (!exists) {
      await createOrttoCustomField(fieldName);
    }
  } catch (error) {
    console.error(
      `Error ensuring custom field "${fieldName}" exists:`,
      error.response?.data || error.message
    );
  }
};

// Function to Create Custom Field in Ortto
const createOrttoCustomField = async (fieldName) => {
  try {
    const payload = {
      name: fieldName,
      type: "text",
      track_changes: false,
    };

    const response = await axios.post(
      "https://api.au.ap3api.com/v1/person/custom-field/create",
      payload,
      {
        headers: {
          "X-Api-Key": ORTTO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`Custom field created:`, response.data);
  } catch (error) {
    if (error.response?.status === 409) {
      console.log(`Custom field "${fieldName}" already exists.`);
    } else {
      console.error(
        "Error creating custom field:",
        error.response?.data || error.message
      );
    }
  }
};

// Function to Create/Update User in Ortto
const updateOrttoUser = async (userData) => {
  try {
    const payload = prepareOrttoUserPayload(userData);
    const response = await axios.post(
      "https://api.au.ap3api.com/v1/person/merge",
      payload,
      {
        headers: {
          "X-Api-Key": ORTTO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Ortto user created/updated:", response.data);
  } catch (error) {
    console.error(
      "Error creating/updating Ortto user:",
      error.response?.data || error.message
    );
  }
};

// Function to Update Course Progress in Ortto
const updateCourseProgress = async (progressData) => {
  try {
    const sanitizedCourseName = progressData.course.name
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "")
      .toLowerCase();

    const percentageCompleted =
      Math.round(parseFloat(progressData.percentage_completed) * 100) + "%";

    const courseKey = `str:cm:${sanitizedCourseName}${progressData.course.id}`;

    const generateKey = `${progressData.course.name}(${progressData.course.id})`;

    await ensureCustomFieldExists(generateKey);

    const payload = {
      people: [
        {
          fields: {
            "str::email": progressData.user.email,
            [courseKey]: percentageCompleted,
          },
        },
      ],
      async: true,
      merge_by: ["str::email"],
      merge_strategy: 2,
      find_strategy: 1,
    };

    const response = await axios.post(
      "https://api.au.ap3api.com/v1/person/merge",
      payload,
      {
        headers: {
          "X-Api-Key": ORTTO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Course progress updated:", response.data);
  } catch (error) {
    console.error(
      "Error updating course progress:",
      error.response?.data || error.message
    );
  }
};

// Function for Enrollment
const createEnrollment = async (progressData) => {
  console.log("Enrollment updated:", progressData);

  try {
    const sanitizedCourseName = progressData.course.name
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "")
      .toLowerCase();

    const percentageCompleted =
      Math.round(parseFloat(progressData.percentage_completed) * 100) + "%";

    const courseKey = `str:cm:${sanitizedCourseName}(${progressData.course.id})`;
    
    const generateKey = `${progressData.course.name}${progressData.course.id}`;

    await ensureCustomFieldExists(generateKey);

    const payload = {
      people: [
        {
          fields: {
            "str::email": progressData.user.email,
            "str::first": progressData.first_name,
            "str::last": progressData.last_name,
            [courseKey]: percentageCompleted,
          },
        },
      ],
      async: true,
      merge_by: ["str::email"],
      merge_strategy: 2,
      find_strategy: 1,
    };

    const response = await axios.post(
      "https://api.au.ap3api.com/v1/person/merge",
      payload,
      {
        headers: {
          "X-Api-Key": ORTTO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Course progress updated:", response.data);
  } catch (error) {
    console.error(
      "Error updating course progress:",
      error.response?.data || error.message
    );
  }
};

// Function for Order Created
const orderCreated = async (progressData) => {
  try {
    const payload = {
      people: [
        {
          fields: {
            "str::email": progressData.user.email,
            "str::first": progressData.first_name,
            "str::last": progressData.last_name,
            "str:cm:bundle-name": progressData.product_name,
          },
        },
      ],
      async: true,
      merge_by: ["str::email"],
      merge_strategy: 2,
      find_strategy: 1,
    };

    const response = await axios.post(
      "https://api.au.ap3api.com/v1/person/merge",
      payload,
      {
        headers: {
          "X-Api-Key": ORTTO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Order created updated:", response.data);
  } catch (error) {
    console.error(
      "Error updating order created:",
      error.response?.data || error.message
    );
  }
};

// Webhook Handlers Mapping
const actionHandlers = {
  "user:signup": updateOrttoUser,
  "user:signin": updateOrttoUser,
  "user:updated": updateOrttoUser,
  "enrollment:created": createEnrollment,
  "enrollment:progress": updateCourseProgress,
  "enrollment:completed": updateCourseProgress,
  "order:created": orderCreated,
};

// Handle Incoming Webhooks
app.post("/api/ortto/webhook", async (req, res) => {
  try {
    const { resource, action, payload } = req.body;
    const handlerKey = `${resource}:${action}`;
    const handler = actionHandlers[handlerKey];

    if (!handler) {
      console.log(`No handler found for ${handlerKey}`);
      return res.status(200).send("No action required");
    }

    await handler(payload);
    console.log("Payload: " ,payload);
    
    res.status(200).send("Webhook processed");
  } catch (error) {
    handleError(res, error, "Error processing webhook");
  }
});

// // Setup Thinkific Webhooks
// const setupThinkificWebhooks = async () => {
//   const topics = [
//     "user:signup",
//     "user:signin",
//     "user:updated",
//     "enrollment:created",
//     "enrollment:progress",
//     "enrollment:completed",
//     "order:created",
//   ];

//   for (const topic of topics) {
//     await createWebhook(topic);
//   }
// };

// Start the Server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
//   setupThinkificWebhooks();
});
