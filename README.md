# Train Times NYC - Backend

## Overview

`subway_data_puller` is a backend application designed to process and provide real-time subway arrival data for the NYC Metropolitan Transportation Authority (MTA). This system fetches and processes live GTFS (General Transit Feed Specification) data, providing up-to-date train arrival times to support the Train Times NYC frontend application.

## Technologies

- **AWS Lambda**: Serverless compute to run the backend logic without managing servers.
- **Node.js**: Used for the Lambda functions.
- **Protobuf**: Protocol Buffers, Google's language-neutral, platform-neutral, extensible mechanism for serializing structured data.
- **Neon Free-Tier Serverless Database**: Serverless Postgres database for storing train arrival data.

## File Structure

```bash
.
├── gtfs
│   └── feed.json # Sample GTFS feed data
├── lambda
│   ├── compiled.js # Compiled TypeScript code for GTFS feed processing
│   ├── TrainMap.ts # Defines the TrainMap class containing train data
│   ├── directionNames.json # JSON file containing train direction names
│   ├── index.ts # Main Lambda function for processing GTFS feed data
│   ├── stops.csv # CSV file containing train stop data
│   └── trainHelpers.ts # Helper functions for processing train data
└── lib
    └── subway_data_puller-stack.ts # CDK stack for deploying the backend
```

### Feed Scanning

The backend regularly scans multiple GTFS feeds provided by the MTA. These feeds include real-time updates about train arrivals, which are processed using Protocol Buffers to decode the data into a usable format.

### Database Insertion

Due to the constraints of the free tier on Neon, the backend employs a dual-database strategy to ensure availability and consistency:

- **Primary Database**: Acts as the main data receiver from feed scanning.
- **Secondary Database**: Serves as a backup during the commit phase of the primary database to avoid read delays.
  
The application fetches and writes to `arrivals_secondary` database first and then does the same for the `arrivals`. Reads attempt to fetch from the primary database first; if the data is being updated (during transaction), it falls back to the secondary database after a slight delay, ensuring the freshest data is always fetched first.

## Setup and Installation

### Prerequisites

- **Node.js**: Ensure Node.js is installed on your machine.
- **Docker**: Install Docker to run the Postgres database locally.
- **Bun**: Install Bun to run the TS code.

### How to Run

- Clone the repository.
- Run `npm install` to install the necessary dependencies.
- Add the necessary environment variables to a `.env` file, if the `docker-compose.yml` file is unchanged the environment variables should be:

    ```bash
    POSTGRES_CONNECTION_STRING="postgresql://postgres:yourpassword@localhost:5432/mydatabase"
    ```

- To create the databases `npm run db-up`
- To run the lambda locally run `npm run dev`
- To stop the databases run `npm run db-down`
