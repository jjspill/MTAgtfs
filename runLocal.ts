// File: runLocal.js
const { handler } = require('./lambda/index');

const run = async () => {
  try {
    await handler(); // Call the handler function
    console.log('Handler executed successfully.');
  } catch (error) {
    console.error('Failed to execute handler:', error);
  }
};

run();
