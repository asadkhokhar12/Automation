import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Environment Variables
const THINKIFIC_API_KEY = process.env.THINKIFIC_API_KEY;
const THINKIFIC_SUBDOMAIN = process.env.THINKIFIC_SUBDOMAIN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const ORTTO_API_KEY = process.env.ORTTO_API_KEY;
const ORTTO_API_URL = process.env.ORTTO_API_URL;

// Utility: Centralized Error Handling
const handleError = (res, error, message = "Internal Server Error") => {
  console.error(message, error.response?.data || error.message || error);
  res.status(500).send({ error: message });
};

// JSON file for user data
const USER_DATA_FILE = "user_data.json";

// Utility: Load JSON file
const loadUserData = () => {
  if (!fs.existsSync(USER_DATA_FILE)) {
    fs.writeFileSync(USER_DATA_FILE, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(USER_DATA_FILE));
};

// Utility: Save JSON file
const saveUserData = (data) => {
  fs.writeFileSync(USER_DATA_FILE, JSON.stringify(data, null, 2));
};

// Helper: Prepare Payload for Ortto User Creation/Update
const prepareOrttoUserPayload = (userData, userDataStore) => {
  const phoneField = userData.custom_profile_fields?.find(
    (field) => field.label === "Phone"
  );

  const yearOfBirthField = userData.custom_profile_fields?.find(
    (field) => field.label === "Year of Birth"
  );

  const signInCount = userDataStore[userData.email]?.sign_in_count || 0;

  return {
    people: [
      {
        fields: {
          "str::email": userData.email,
          "str::first": userData.first_name,
          "str::last": userData.last_name,
          "str:cm:year-of-birth-2": yearOfBirthField
            ? yearOfBirthField.value
            : null,
          "phn::phone": phoneField
            ? { phone: phoneField.value, parse_with_country_code: true }
            : null,
          "int:cm:sign-in-count": signInCount,
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
    // Check if the field already exists
    const response = await axios.post(
      `${ORTTO_API_URL}/person/custom-field/get`,
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

    if (exists) {
      console.log(`Custom field "${fieldName}" already exists.`);
    } else {
      // If not exists, create it
      await createOrttoCustomField(fieldName);
    }
  } catch (error) {
    console.error(
      `Error checking or creating custom field "${fieldName}":`,
      error.response?.data || error.message
    );
  }
};

// Function to create a custom field
const createOrttoCustomField = async (fieldName) => {
  try {
    const payload = {
      name: fieldName,
      type: "text",
      track_changes: false,
    };

    const response = await axios.post(
      `${ORTTO_API_URL}/person/custom-field/create`,
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
    console.error(
      "Error creating custom field:",
      error.response?.data || error.message
    );
  }
};


// Function to Create/Update User in Ortto
const updateOrttoUser = async (userData, userDataStore) => {
  try {
    const payload = prepareOrttoUserPayload(userData, userDataStore);
    const response = await axios.post(
      `${ORTTO_API_URL}/person/merge`,
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
      `${ORTTO_API_URL}/person/merge`,
      payload,
      {
        headers: {
          "X-Api-Key": ORTTO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Course Progress Updated:", response.data);
  } catch (error) {
    console.error(
      "Error updating course progress:",
      error.response?.data || error.message
    );
  }
};

// Function for Enrollment
// const createEnrollment = async (progressData) => {
//   try {
//     const sanitizedCourseName = progressData.course.name
//       .replace(/\s+/g, "-")
//       .replace(/[^\w-]/g, "")
//       .toLowerCase();

//     const percentageCompleted =
//       Math.round(parseFloat(progressData.percentage_completed) * 100) + "%";

//     const courseKey = `str:cm:${sanitizedCourseName}${progressData.course.id}`;
//     const generateKey = `${progressData.course.name}(${progressData.course.id})`;

//     // Load user data
//     const userDataStore = await loadUserData(); // Make sure this is async if necessary
//     const userEmail = progressData.user.email;

//     // If user does not exist in the store, initialize their data
//     if (!userDataStore[userEmail]) {
//       userDataStore[userEmail] = {
//         sign_in_count: 0,
//         old_bundles: [],
//         enrollment_count: 0,  // Initialize the enrollment count field as 0
//         enrolled_courses: [],  // Track course enrollments
//       };
//     }

//     const userRecord = userDataStore[userEmail];

//     // Ensure enrolled_courses is an array
//     if (!Array.isArray(userRecord.enrolled_courses)) {
//       console.log(`Initializing enrolled_courses array for ${userEmail}`);
//       userRecord.enrolled_courses = [];
//     }

//     // Ensure enrollment_count is a valid number
//     // if (isNaN(userRecord.enrollment_count)) {
//     //   console.log(`Invalid enrollment count for ${userEmail}, initializing to 0`);
//     //   userRecord.enrollment_count = 0;
//     // }

//     // Check if the course has already been enrolled in by this user
//     const isAlreadyEnrolled = userRecord.enrolled_courses.includes(progressData.course.id);

//     if (!isAlreadyEnrolled) {
//       // If the course isn't already enrolled, increase the enrollment count
//       userRecord.enrollment_count += 1;
//       userRecord.enrolled_courses.push(progressData.course.id); // Add course to list of enrolled courses
//     }

//     console.log(`Updated enrollment count for ${userEmail}:`, userRecord.enrollment_count);

//     // Ensure custom field exists for the course
//     // await ensureCustomFieldExists(generateKey);

//     const payload = {
//       people: [
//         {
//           fields: {
//             "str::email": progressData.user.email,
//             "str::first": progressData.first_name,
//             "str::last": progressData.last_name,
//             // [courseKey]: percentageCompleted,
//             "int:cm:enrolment-count": userRecord.enrollment_count,  // Add enrollment count field
//           },
//         },
//       ],
//       async: true,
//       merge_by: ["str::email"],
//       merge_strategy: 2,
//       find_strategy: 1,
//     };

//     // Make the request to Ortto API
//     const response = await axios.post(
//       `${ORTTO_API_URL}/person/merge`,
//       payload,
//       {
//         headers: {
//           "X-Api-Key": ORTTO_API_KEY,
//           "Content-Type": "application/json",
//         },
//       }
//     );
//     console.log("Enrollment Created:", response.data);

//     // Save the updated user data (including enrollment count and courses)
//     await saveUserData(userDataStore);  // Ensure saveUserData is async if necessary

//   } catch (error) {
//     console.error("Error updating course progress:", error.response?.data || error.message);
//   }
// };

const userApiStatus = {}; // Object to track the pending API call status for each user

const createEnrollment = async (progressData) => {
  try {
    const userEmail = progressData.user.email;
    const userDataStore = loadUserData();

    // If user does not exist in the store, initialize their data
    if (!userDataStore[userEmail]) {
      userDataStore[userEmail] = {
        sign_in_count: 0,
        enrolled_courses: [],
        total_enrollment_count: 0
      };
    }

    const userRecord = userDataStore[userEmail];
    userRecord.enrolled_courses = userRecord.enrolled_courses || [];
    userRecord.total_enrollment_count = userRecord.total_enrollment_count || 0;

    const courseAlreadyEnrolled = userRecord.enrolled_courses.some(
      course => course.course_id === progressData.course.id
    );

    if (!courseAlreadyEnrolled) {
      // Add the new course
      userRecord.enrolled_courses.push({
        course_id: progressData.course.id,
        course_name: progressData.course.name,
        enrollment_id: progressData.id,
      });

      // Increment total enrollment count
      userRecord.total_enrollment_count += 1;
      saveUserData(userDataStore);

      console.log(`Enrolled in new course: ${progressData.course.name}`);
      console.log(`Total enrollment count: ${userRecord.total_enrollment_count}`);

      // Check if API call is already pending for this user
      if (!userApiStatus[userEmail]?.pending) {
        // Initialize status if not present
        if (!userApiStatus[userEmail]) userApiStatus[userEmail] = { queue: [], pending: false };

        // Add the enrollment to the queue
        userApiStatus[userEmail].queue.push(progressData);

        // Set the flag to indicate an API call is pending
        userApiStatus[userEmail].pending = true;

        // Set a timeout for 5 minutes to process the enrollments for this user
        setTimeout(async () => {
          await processEnrollments(userEmail);
        }, 300000); // 5 minutes
      }
    } else {
      console.log(`Course already enrolled: ${progressData.course.name}`);
    }
  } catch (error) {
    console.error("Error tracking course enrollment:", error.response?.data || error.message);
  }
};

const processEnrollments = async (userEmail) => {
  try {
    const userDataStore = loadUserData();
    const userRecord = userDataStore[userEmail];

    // Prepare the payload with enrollments for this user
    const enrollmentsToProcess = userApiStatus[userEmail].queue;

    // Construct the payload for Ortto
    const payload = {
      people: enrollmentsToProcess.map(progressData => ({
        fields: {
          "str::email": userEmail,
          "str::first": progressData.user.first_name,
          "str::last": progressData.user.last_name,
          "int:cm:enrolment-count": userRecord.total_enrollment_count,
        },
      })),
      async: true,
      merge_by: ["str::email"],
      merge_strategy: 2,
      find_strategy: 1,
    };

    // Send the data to Ortto
    const response = await axios.post(
      `${ORTTO_API_URL}/person/merge`,
      payload,
      {
        headers: {
          "X-Api-Key": ORTTO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Enrollment Created and Tracked:", response.data);

    // After processing, reset the status and clear the queue
    userApiStatus[userEmail].pending = false;
    userApiStatus[userEmail].queue = [];
  } catch (error) {
    console.error("Error processing enrollments:", error.response?.data || error.message);
  }
};


// Unified handler for signup and signin
const handleSignupOrSignin = async (userData) => {
  const userDataStore = loadUserData();
  const userEmail = userData.email;

  if (!userDataStore[userEmail]) {
    userDataStore[userEmail] = { sign_in_count: 1, old_bundles: [], enrolled_courses: [], total_enrollment_count: 0 };
    console.log(`New user: ${userEmail} with sign-in count: 1`);
  } else {
    // If the user exists (signin), increment the sign_in_count
    userDataStore[userEmail].sign_in_count += 1;
    console.log(`Existing user: ${userEmail}, sign-in count: ${userDataStore[userEmail].sign_in_count}`);
  }

  saveUserData(userDataStore);

  // Now, update Ortto with the user data
  await updateOrttoUser(userData, userDataStore);
};


// Order created handler with old bundle management
const handleOrderCreated = async (progressData) => {

  const userDataStore = loadUserData();
  const userEmail = progressData.user.email;
  const newBundle = progressData.product_name;

  if (!userDataStore[userEmail]) {
    userDataStore[userEmail] = { sign_in_count: 0, old_bundles: [] };
  }

  const userRecord = userDataStore[userEmail];
  const oldBundles = userRecord.old_bundles;

  // If the old bundles are empty, fill it with the new bundle and set it as the current bundle.
  if (oldBundles.length === 0) {
    console.log(`Old bundles were empty, setting it to new bundle:`, [newBundle]);
    userRecord.old_bundles = [newBundle];  // Add new bundle to old_bundles
    console.log(`Updated old bundles for ${userEmail}:`, userRecord.old_bundles);
    saveUserData(userDataStore);

    // Update Ortto with the new bundle as the current bundle
    await updateOrtto(userEmail, newBundle, null);  // Only new bundle, no old bundles
    return;
  }

  // Check if the new bundle already exists in old bundles
  if (oldBundles.includes(newBundle)) {
    console.log(`New bundle matches old bundle for ${userEmail}, no update needed.`);
    return;
  }

  // Add new bundle to old_bundles, but exclude it from bundle-name.
  const updatedOldBundles = [...oldBundles, newBundle];
  const latestBundle = newBundle;  // Set the current bundle as the latest
  const oldBundlesField = updatedOldBundles.join(", ");  // Join old bundles into a string

  userRecord.old_bundles = updatedOldBundles;

  // Save the updated user data
  saveUserData(userDataStore);

  // Create a filtered version of old_bundles, excluding the latest bundle for the payload
  const filteredOldBundles = updatedOldBundles.filter(bundle => bundle !== latestBundle);
  const oldBundlesFieldForPayload = filteredOldBundles.join(", ");  // Create a string without the latest bundle

  console.log(`Updating Ortto for ${userEmail} with latest bundle: ${latestBundle}`);
  console.log(`Old bundles for payload: ${oldBundlesFieldForPayload}`);

  // Now update Ortto with the current bundle and the filtered old bundles
  await updateOrtto(userEmail, latestBundle, oldBundlesFieldForPayload);
};

const updateOrtto = async (userEmail, latestBundle, oldBundlesField) => {
  const payload = {
    people: [
      {
        fields: {
          "str::email": userEmail,
          "str:cm:bundle-name": latestBundle,  // Only latest bundle in the `bundle-name`
          "txt:cm:old-bundles": oldBundlesField || null,  // Set old bundles if they exist (excluding the latest one)
        },
      },
    ],
    async: true,
    merge_by: ["str::email"],
    merge_strategy: 2,
    find_strategy: 1,
  };

  try {
    const response = await axios.post(`${ORTTO_API_URL}/person/merge`, payload, {
      headers: {
        "X-Api-Key": ORTTO_API_KEY,
        "Content-Type": "application/json",
      },
    });
    console.log("Order created updated:", response.data);
  } catch (error) {
    console.error("Error updating order created:", error.response?.data || error.message);
  }
};

const actionHandlers = {
  "user:signup": handleSignupOrSignin,
  "user:signin": handleSignupOrSignin,
  "user:updated": updateOrttoUser,
  "enrollment:created": createEnrollment,
  "enrollment:progress": updateCourseProgress,
  "order:created": handleOrderCreated,
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
    console.log("Payload: ", payload);

    res.status(200).send("Webhook processed");
  } catch (error) {
    handleError(res, error, "Error processing webhook");
  }
});

// Function to Create Webhook for Thinkific Events
// const createWebhook = async (topic) => {
//   try {
//     const response = await axios.post(
//       `https://api.thinkific.com/api/v2/webhooks`,
//       { topic, target_url: WEBHOOK_URL },
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

// Setup Thinkific Webhooks
// const setupThinkificWebhooks = async () => {
//   const topics = [
//     "user.signup",
//     "user.signin",
//     "user.updated",
//     "enrollment.created",
//     "enrollment.progress",
//     "order.created",
//   ];

//   for (const topic of topics) {
//     await createWebhook(topic);
//   }
// };

// Start the Server
const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
