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
│   ├── TrainMap.ts #
│   ├── compiled.d.ts
│   ├── compiled.js
│   ├── directionNames.json
│   ├── index.ts
│   ├── stops.csv
│   └── trainHelpers.ts
└── lib
    └── subway_data_puller-stack.ts
```




## Key Components

### Feed Scanning

The backend regularly scans multiple GTFS feeds provided by the MTA. These feeds include real-time updates about train arrivals, which are processed using Protocol Buffers to decode the data into a usable format.

### Database Insertion

Due to the constraints of the free tier on AWS, the backend employs a dual-database strategy to ensure availability and consistency:

- **Primary Database**: Acts as the main data receiver from feed scanning.
- **Secondary Database**: Serves as a backup during the commit phase of the primary database to avoid read delays.
  
The application writes to the primary database and then replicates to the secondary. Reads attempt to fetch from the primary database first; if the data is being updated (during transaction), it falls back to the secondary database after a slight delay, ensuring seamless availability.

## Setup and Installation

### Prerequisites

- AWS Account
- Node.js installed
- AWS CLI configured

### Deployment Steps

1. **Clone the repository**:

   ```bash
   git clone [repository_url]
   cd [project_folder]
