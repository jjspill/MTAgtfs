import { handler } from '../lambda/index';

async function start() {
  try {
    await handler();
    console.log('Data processing complete.');
  } catch (error) {
    console.error('Failed to process data:', error);
  }
}

start();
