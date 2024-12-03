import { post } from 'axios';

// Environment Variables
const ORTTO_API_KEY = process.env.ORTTO_API_KEY;

// Function to Update User in Ortto
const updateOrttoUser = async (userData) => {
  try {
    const response = await post(
      'https://api.ortto.com/v1/users',
      {
        email: userData.email,
        first_name: userData.first_name,
        last_name: userData.last_name,
        phone: userData.phone_number,
      },
      {
        headers: {
          Authorization: `Bearer ${ORTTO_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('Ortto user updated:', response.data);
  } catch (error) {
    console.error('Error updating Ortto user:', error.response?.data || error.message);
  }
};

// Function to Update Enrollment in Ortto
const updateOrttoEnrollment = async (enrollmentData) => {
  try {
    const response = await post(
      'https://api.ortto.com/v1/enrollments',
      {
        email: enrollmentData.user_email,
        course_name: enrollmentData.course_name,
        progress: enrollmentData.progress, // Example: Pass progress if available
      },
      {
        headers: {
          Authorization: `Bearer ${ORTTO_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('Ortto enrollment updated:', response.data);
  } catch (error) {
    console.error('Error updating Ortto enrollment:', error.response?.data || error.message);
  }
};

export default { updateOrttoUser, updateOrttoEnrollment };
