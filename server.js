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
  res.status(500).send(message);
};

// Utility: Validate Webhook Payload
const validateWebhookPayload = (data) => {
  if (!data.resource || !data.action || !data.payload) {
    throw new Error("Invalid webhook payload");
  }
};

// Function to Create Webhook for Thinkific Events (User Sign-Up, Enrollment Created)
const createWebhook = async (topic) => {
  try {
    const response = await axios.post(
      `https://api.thinkific.com/api/v2/webhooks`,
      {
        topic,
        target_url: WEBHOOK_URL,
      },
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
const prepareOrttoPayload = (userData) => {
  let phone = null;

  if (Array.isArray(userData.custom_profile_fields)) {
    const phoneField = userData.custom_profile_fields.find(
      (field) => field.label === "Phone"
    );
    phone = phoneField ? phoneField.value : null;
  }

  return {
    people: [
      {
        fields: {
          "str::email": userData.email,
          "str::first": userData.first_name,
          "str::last": userData.last_name,
          "phn::phone": phone
            ? {
                phone: phone,
                parse_with_country_code: true,
              }
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

// Create Thinkific Webhooks
// createWebhook("user.signup");
// createWebhook("enrollment.created");

// Function to Create/Update User in Ortto
const updateOrttoUser = async (userData) => {
  try {
    const payload = prepareOrttoPayload(userData);
    const response = await axios.post(
      "https://api.eu.ap3api.com/v1/person/merge",
      payload,
      {
        headers: {
          "X-Api-Key": `${ORTTO_API_KEY}`,
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

// Function to Create Custom Field in Ortto (Based on the documentation)
const createOrttoCustomField = async (fieldName, fieldId) => {
  try {
    const payload = {
      "name": fieldName, // The display name for the custom field
    //   field_id: fieldId, // The unique field identifier
      "type": "text", // The type of the custom field, you can use "text" for course names
      "track_changes": true, // Optionally track changes to this field
    };

    const response = await axios.post(
      "https://api.eu.ap3api.com/v1/person/custom-field/create",
      payload,
      {
        headers: {
          "X-Api-Key": `${ORTTO_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`Custom field created:`, response.data);
    return response.data;
  } catch (error) {
    console.error(
      "Error creating custom field:",
      error.response?.data || error.message
    );
  }
};

// Function to Create/Update Enrollment in Ortto with Dynamic Custom Fields
const prepareOrttoBundlePayload = (enrollmentData) => {
  const { user, course } = enrollmentData; // Assuming `course` is an object, not an array.

  // Ensure course is wrapped in an array if it's a single object
  const courses = Array.isArray(course) ? course : [course]; // Wrap course in an array if it's not already an array

  // Create dynamic custom fields for each course
  const customFields = {};

  // Loop through the courses and create a custom field for each one
  courses.forEach(async (course) => {
    const customFieldName = `${course.name}`; // You can change this based on your requirements
    const customFieldId = `str:cm:course_${course.id}`; // Unique field ID for each course

    // Create custom field for each course if it doesn't exist
    await createOrttoCustomField(customFieldName, customFieldId);

    customFields[customFieldId] = course.name; // Map the custom field with course name
  });

  return {
    people: [
      {
        fields: {
          "str::email": user.email,
          ...customFields, // Add dynamic custom fields for each course
        },
      },
    ],
    async: true,
    merge_by: ["str::email"],
    merge_strategy: 2,
    find_strategy: 1,
  };
};

// Handle the incoming webhook for enrollment data
const createOrttoEnrollment = async (enrollmentData) => {
  try {
    const payload = prepareOrttoBundlePayload(enrollmentData);

    const response = await axios.post(
      "https://api.eu.ap3api.com/v1/person/merge",
      payload,
      {
        headers: {
          "X-Api-Key": `${ORTTO_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Ortto bundlename and courses updated:", response.data);
  } catch (error) {
    console.error(
      "Error updating Ortto bundlename and courses:",
      error.response?.data || error.message
    );
  }
};

// Webhook Handlers Mapping
const actionHandlers = {
  "user:signup": updateOrttoUser,
  "user:signin": updateOrttoUser,
  "user:updated": updateOrttoUser,
  "enrollment:created": createOrttoEnrollment,
  "enrollment:progress": createOrttoEnrollment,
};

// Handle Incoming Webhooks
app.post("/api/ortto", async (req, res) => {
  try {
    validateWebhookPayload(req.body);

    const { resource, action, payload } = req.body;
    const handlerKey = `${resource}:${action}`;

    const handler = actionHandlers[handlerKey];
    if (!handler) {
      console.log(`No handler found for ${handlerKey}`);
      return res.status(200).send("No action required");
    }

    await handler(payload);
    console.log("payload: ", payload);

    res.status(200).send("Webhook processed");
  } catch (error) {
    handleError(res, error, "Error processing webhook");
  }
});

// Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
});
